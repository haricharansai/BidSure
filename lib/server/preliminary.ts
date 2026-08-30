// PRELIMINARY verification (non-authoritative) — called by the upload route
// (plan §8). Extracts + runs checks for one uploaded document and persists
// them with run='PRELIMINARY'. These results are never used for scoring.
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/server/audit'
import { verifyDocument } from '@/lib/server/verify.ts'

export interface PreliminaryInput {
  submittedDocId: string
  submissionId: string
  documentFileId: string
  docName: string
  buffer: Buffer
  mimeType: string
  originalName: string
  tenderId: string
  actor: { id: string; role: string }
}

export interface PreliminaryResult {
  extractionStatus: 'DONE' | 'FAILED'
  confidence: number | null
  fields: Record<string, unknown>
  error: string | null
  checks: Array<{ checkId: string; stage: string; status: string; note: string; mock: boolean }>
}

const STATUS_ORDER = ['VERIFIED', 'WARNING', 'UNVERIFIED', 'NEEDS_REVIEW', 'NON_COMPLIANT', 'NOT_APPLICABLE']

function worstCheckStatus(checks: Array<{ status: string }>): string | null {
  let worst: string | null = null
  for (const c of checks) {
    const idx = STATUS_ORDER.indexOf(c.status)
    if (idx < 0) continue
    if (worst === null || idx > STATUS_ORDER.indexOf(worst)) worst = c.status
  }
  return worst
}

export async function runPreliminaryVerification(input: PreliminaryInput): Promise<PreliminaryResult> {
  const outcome = await verifyDocument({ ...input, actorId: input.actor.id, phase: 'PRELIMINARY' })

  if (outcome.checks.length) {
    await prisma.verificationCheck.deleteMany({ where: { submittedDocId: input.submittedDocId, run: 'PRELIMINARY' } })
    await prisma.verificationCheck.createMany({
      data: outcome.checks.map(c => ({
        submissionId: input.submissionId,
        submittedDocId: input.submittedDocId,
        docName: input.docName,
        checkId: c.checkId,
        stage: c.stage,
        inputJson: c.inputJson,
        expectedJson: c.expectedJson,
        foundJson: c.foundJson,
        status: c.status,
        note: c.note,
        run: 'PRELIMINARY',
        mock: c.mock,
      })),
    })
  }

  // Preliminary doc-level flag for the seller UI (never authoritative).
  const worst = worstCheckStatus(outcome.checks)
  await prisma.submittedDoc.update({
    where: { id: input.submittedDocId },
    data: {
      status: worst ?? 'UNVERIFIED',
      note: outcome.error ?? (outcome.checks.length ? 'Preliminary verification complete — final verdict pending bid evaluation' : 'Uploaded — awaiting final verification'),
    },
  })
  await recordAudit({
    actorId: input.actor.id, actorRole: 'SYSTEM',
    action: worst === 'NON_COMPLIANT' ? 'DOC_FLAGGED' : 'DOC_VERIFIED',
    tenderId: input.tenderId,
    meta: { submittedDocId: input.submittedDocId, docName: input.docName, status: worst ?? 'UNVERIFIED', phase: 'PRELIMINARY', preliminary: true },
  })

  return {
    extractionStatus: outcome.extractionStatus,
    confidence: outcome.confidence,
    fields: outcome.fields,
    error: outcome.error,
    checks: outcome.checks.map(c => ({ checkId: c.checkId, stage: c.stage, status: c.status, note: c.note, mock: c.mock })),
  }
}

