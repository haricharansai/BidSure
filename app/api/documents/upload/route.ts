// POST /api/documents/upload — multipart file upload tied to a DRAFT submission
// (plan §11). Seller-only; validates ownership, deadline, doc spec (allowed
// types / max size), stores bytes privately, creates DocumentFile, runs the
// PRELIMINARY extraction + checks (non-authoritative), and returns the
// read-only extraction preview.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api'
import { requireSeller } from '@/lib/server/auth'
import { recordAudit } from '@/lib/server/audit'
import { runPreliminaryVerification } from '@/lib/server/preliminary'
import { storeFile, validateFile } from '@/lib/server/storage'

export const runtime = 'nodejs'

const DEFAULT_ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain']

export async function POST(request: Request) {
  try {
    const user = await requireSeller(request)
    const form = await request.formData()
    const submissionId = String(form.get('submissionId') ?? '')
    const docName = String(form.get('docName') ?? '')
    const file = form.get('file')
    if (!submissionId || !docName) {
      return NextResponse.json({ error: 'submissionId and docName are required' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A file is required' }, { status: 400 })
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { tender: true, docs: true, company: true },
    })
    if (!submission || submission.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }
    if (submission.status !== 'DRAFT') {
      return NextResponse.json({ error: 'This bid is finalized — documents can no longer change' }, { status: 400 })
    }
    if (!['PUBLISHED', 'CORRIGENDUM'].includes(submission.tender.stage) || submission.tender.submissionDeadline.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Submissions are locked — the deadline has passed' }, { status: 410 })
    }

    const requiredDoc = await prisma.requiredDoc.findUnique({
      where: { id: `${submission.tenderId}:${docName}` },
    })
    if (!requiredDoc) {
      return NextResponse.json({ error: 'Unknown document for this tender' }, { status: 400 })
    }

    // Validate the doc spec (allowedTypes / maxSizeMb — enforced here for real).
    let allowedTypes: string[] = DEFAULT_ALLOWED
    try {
      const parsed = JSON.parse(requiredDoc.allowedTypes) as string[]
      if (Array.isArray(parsed) && parsed.length) allowedTypes = parsed
    } catch {}
    const buffer = Buffer.from(await file.arrayBuffer())
    validateFile({ buffer, type: file.type, name: file.name }, { allowedTypes, maxSizeMb: requiredDoc.maxSizeMb })

    // Supersede any previous file for this SubmittedDoc: soft-delete old record,
    // purge old PRELIMINARY checks + extraction so nothing stale stays authoritative.
    const submittedDoc = await prisma.submittedDoc.findFirst({ where: { submissionId, docName } })
    if (!submittedDoc) return NextResponse.json({ error: 'Unknown document for this tender' }, { status: 400 })
    const previous = await prisma.documentFile.findFirst({
      where: { submittedDocId: submittedDoc.id, deletedAt: null },
      include: { extraction: true },
    })
    if (previous) {
      await prisma.verificationCheck.deleteMany({ where: { submittedDocId: submittedDoc.id, run: 'PRELIMINARY' } })
      await prisma.extractionResult.deleteMany({ where: { submittedDocId: submittedDoc.id } })
      await prisma.documentFile.update({ where: { id: previous.id }, data: { deletedAt: new Date(), submittedDocId: null } })
    }

    const stored = await storeFile(buffer, file.name, file.type)
    const documentFile = await prisma.documentFile.create({
      data: {
        storageKey: stored.storageKey,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        sha256: stored.sha256,
        uploadedById: user.id,
        submittedDocId: submittedDoc.id,
      },
    })
    await prisma.submittedDoc.update({
      where: { id: submittedDoc.id },
      data: {
        provided: true,
        fileName: stored.originalName,
        fileType: stored.mimeType,
        sizeMb: Math.round((stored.sizeBytes / (1024 * 1024)) * 1000) / 1000,
        uploadedAt: new Date(),
        extractionStatus: 'RUNNING',
        status: 'UNVERIFIED',
        note: '',
      },
    })
    await recordAudit({
      actorId: user.id, actorRole: user.role, action: 'DOC_UPLOADED', tenderId: submission.tenderId,
      meta: { submissionId, docName, fileId: documentFile.id, sha256: stored.sha256, sizeBytes: stored.sizeBytes, phase: 'PRELIMINARY', replacedFileId: previous?.id ?? null },
    })

    // PRELIMINARY (non-authoritative) verification: extract + basic checks.
    // Company profile is passed for the three-way identity chain (declared
    // data, never authoritative).
    const preliminary = await runPreliminaryVerification({
      submittedDocId: submittedDoc.id,
      submissionId: submission.id,
      documentFileId: documentFile.id,
      docName,
      buffer,
      mimeType: stored.mimeType,
      originalName: stored.originalName,
      tenderId: submission.tenderId,
      actor: { id: user.id, role: user.role },
      company: {
        gstin: submission.company.gstin,
        pan: submission.company.pan,
        legalName: submission.company.legalName,
        name: submission.company.name,
      },
    })

    return NextResponse.json({
      ok: true,
      fileId: documentFile.id,
      sha256: stored.sha256,
      replacedFileId: previous?.id ?? null,
      extraction: {
        status: preliminary.extractionStatus,
        confidence: preliminary.confidence,
        fields: preliminary.fields,
        error: preliminary.error,
      },
      checks: preliminary.checks,
    })
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('document upload failed:', err)
    return NextResponse.json({ error: 'Document upload failed' }, { status: 500 })
  }
}
