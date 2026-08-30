// Evaluation pipeline — sequential deterministic gates per the GeM blueprint.
// Bridges Prisma rows into the pure engine (lib/engine) and persists verdicts.
// PHASE 8: authoritative verification — files are re-read from disk, extraction
// is re-run, mock registries are re-loaded, and VerificationCheck rows are
// persisted. Preliminary results are never read here (plan §8).
import { prisma } from '@/lib/prisma'
import { evaluateSubmission, runCartelRadar, type CompanyProfile, type TenderRequirements } from '@/lib/engine'
import type { EngineCheck } from '@/lib/engine/registry.ts'
import { recordAudit } from '@/lib/server/audit'
import { readStoredFile, fileSha256 } from '@/lib/server/storage'
import { verifyDocument } from '@/lib/server/verify'

export { mseMatchOptions, MSE_MATCH_MAX } from '@/lib/engine'

export function parseRequirements(tender: { requirementsJson: string }): TenderRequirements {
  try {
    return JSON.parse(tender.requirementsJson) as TenderRequirements
  } catch {
    return {}
  }
}

export function toCompanyProfile(c: {
  id: string; name: string; legalName: string | null; gstin: string | null; pan: string | null
  turnoverCr: number | null; yearsExperience: number | null; msme: boolean; iso: boolean
  isReseller: boolean; udyamNo: string | null; udyamNicCode: string | null
  caTurnoverCr: number | null; gstr3bTotalCr: number | null; auditedPnlCr: number | null
  netWorthCr: number | null; miiLocalContentPct: number | null; isStartup: boolean
  dscTokenId: string | null; directorDins: string
}): CompanyProfile {
  let dins: string[] = []
  try { dins = JSON.parse(c.directorDins) as string[] } catch {}
  return { ...c, directorDins: dins }
}

/** Run the deterministic evaluation for every submission on a tender. */
export async function runAutomatedEvaluation(tenderId: string, actor: { id: string; role: string }): Promise<void> {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    include: {
      requiredDocs: true,
      submissions: { include: { company: true, docs: { include: { documentFile: { include: { extraction: true } } } }, clarifications: true } },
      evaluations: true,
    },
  })
  if (!tender) return

  const requirements = parseRequirements(tender)
  const bidOpening = tender.bidOpeningDate ?? tender.auctionStart ?? tender.submissionDeadline

  // Cartel radar across all bidders (loophole #19).
  const fingerprints = tender.submissions.map(s => ({
    companyId: s.companyId,
    companyName: s.company.name,
    directorDins: toCompanyProfile(s.company).directorDins,
    dscTokenId: s.company.dscTokenId,
    submittedAt: s.submittedAt.toISOString(),
  }))
  const collusionHits = runCartelRadar(fingerprints)
  if (collusionHits.length) {
    await recordAudit({
      actorId: actor.id, actorRole: 'SYSTEM', action: 'CARTEL_RADAR_ALERT', tenderId,
      meta: { hits: collusionHits },
    })
  }

  for (const submission of tender.submissions) {
    const company = toCompanyProfile(submission.company)
    const technicalResponse = (() => {
      try { return JSON.parse(submission.technicalResponse) as Record<string, string> } catch { return {} }
    })()

    // ---------------------------------------------------------------
    // AUTHORITATIVE document verification (plan §8): re-read bytes,
    // re-hash, re-extract, re-lookup registry. Never reads preliminary
    // VerificationCheck rows; prior AUTHORITATIVE rows are replaced.
    // ---------------------------------------------------------------
    const registryChecksByDoc = new Map<string, EngineCheck[]>()
    await prisma.verificationCheck.deleteMany({ where: { submissionId: submission.id, run: 'AUTHORITATIVE' } })
    for (const doc of submission.docs) {
      if (!doc.documentFile || doc.documentFile.deletedAt) continue
      let buffer: Buffer
      try {
        buffer = await readStoredFile(doc.documentFile.storageKey)
      } catch {
        await prisma.submittedDoc.update({ where: { id: doc.id }, data: { status: 'NEEDS_REVIEW', note: 'Stored file missing at evaluation time — manual review' } })
        continue
      }
      // Tamper check: file on disk must match the hash recorded at upload.
      if (fileSha256(buffer) !== doc.documentFile.sha256) {
        await recordAudit({ actorId: tender.createdById, actorRole: 'SYSTEM', action: 'DOC_FLAGGED', tenderId, meta: { submittedDocId: doc.id, docName: doc.docName, reason: 'sha256 mismatch — file changed after upload', phase: 'AUTHORITATIVE' } })
      }
      const outcome = await verifyDocument({
        submittedDocId: doc.id,
        documentFileId: doc.documentFile.id,
        docName: doc.docName,
        buffer,
        mimeType: doc.documentFile.mimeType,
        originalName: doc.documentFile.originalName,
        tenderId,
        actorId: tender.createdById,
        phase: 'AUTHORITATIVE',
        bidOpeningDate: bidOpening,
      })
      const checks: EngineCheck[] = [
        ...outcome.checks,
        ...(fileSha256(buffer) !== doc.documentFile.sha256
          ? [{ checkId: 'FILE_HASH_MISMATCH', stage: 'STRUCTURAL' as const, docName: doc.docName, inputJson: '{}', expectedJson: doc.documentFile.sha256, foundJson: fileSha256(buffer), status: 'NEEDS_REVIEW' as const, note: 'File bytes changed after upload (sha256 mismatch)', mock: false }]
          : []),
      ]
      if (checks.length) {
        await prisma.verificationCheck.deleteMany({ where: { submittedDocId: doc.id, run: 'AUTHORITATIVE' } })
        await prisma.verificationCheck.createMany({
          data: checks.map(c => ({
            submissionId: submission.id,
            submittedDocId: doc.id,
            docName: doc.docName,
            checkId: c.checkId,
            stage: c.stage,
            inputJson: c.inputJson,
            expectedJson: c.expectedJson,
            foundJson: c.foundJson,
            status: c.status,
            note: c.note,
            run: 'AUTHORITATIVE',
            mock: c.mock,
          })),
        })
      }
      registryChecksByDoc.set(doc.docName, checks)
    }

    const technicalProfile = (() => {
      try { return JSON.parse(submission.technicalResponse) as Record<string, string> } catch { return {} }
    })()

    const outcome = evaluateSubmission(
      {
        id: tender.id,
        bidOpeningDate: bidOpening,
        bidValidityDays: tender.bidValidityDays,
        emdRequired: tender.emdRequired,
        valueCr: tender.valueCr,
        miiMinLocalContentPct: tender.miiMinLocalContentPct,
        albThresholdPct: tender.albThresholdPct,
        requirements,
      },
      company,
      submission.docs.map(d => ({
        docName: d.docName,
        provided: d.provided,
        fileName: d.fileName,
        fileType: d.fileType,
        sizeMb: d.sizeMb,
        validTill: d.validTill?.toISOString() ?? null,
        extracted: (() => { try { return JSON.parse(d.extractedJson) as Record<string, unknown> } catch { return {} } })(),
        registryChecks: registryChecksByDoc.get(d.docName) ?? [],
      })),
      technicalProfile,
      submission.financialBidCr,
    )

    // Tech eval is blocked while any clarification on this submission is pending (GeM rule).
    const pendingClarifications = submission.clarifications.filter(c => c.status === 'PENDING')
    let status = outcome.status
    if (pendingClarifications.length && status === 'qualified') {
      status = 'requires_review'
      outcome.reasons.push(`Technical evaluation blocked: ${pendingClarifications.length} clarification(s) pending response`)
    }
    // Cartel radar hits attach to both implicated companies.
    const myHits = collusionHits.filter(h => h.companies.includes(submission.company.name))
    for (const hit of myHits) {
      outcome.flags.push({ kind: hit.kind, severity: 'CRITICAL', note: `Collusion radar: ${hit.detail} (with ${hit.companies.find(n => n !== submission.company.name) ?? 'another bidder'})` })
      if (status === 'qualified') status = 'requires_review'
    }

    // Persist per-doc 6-state statuses back onto SubmittedDoc + doc-level audit.
    for (const docOutcome of outcome.docs) {
      const submitted = submission.docs.find(d => d.docName === docOutcome.docName)
      if (!submitted) continue
      await prisma.submittedDoc.update({
        where: { id: submitted.id },
        data: { status: docOutcome.status, note: docOutcome.note },
      })
      if (docOutcome.status === 'NOT_APPLICABLE') continue
      await recordAudit({
        actorId: tender.createdById, actorRole: 'SYSTEM',
        action: docOutcome.status === 'NON_COMPLIANT' ? 'DOC_FLAGGED' : 'DOC_VERIFIED',
        tenderId,
        meta: { submittedDocId: submitted.id, docName: docOutcome.docName, docStatus: docOutcome.status, note: docOutcome.note, phase: 'AUTHORITATIVE' },
      })
    }

    // Persist submission-level CROSS_DOC checks (triangulation + forensic flags).
    const crossDocRows: Array<{ checkId: string; status: string; note: string }> = []
    if (outcome.triangulation.status !== 'UNVERIFIED') {
      crossDocRows.push({ checkId: 'TURNOVER_TRIANGULATION', status: outcome.triangulation.status, note: outcome.triangulation.note })
    }
    for (const flag of outcome.flags) {
      const checkStatus = flag.severity === 'CRITICAL' ? 'NON_COMPLIANT' : flag.severity === 'WARNING' ? 'WARNING' : 'VERIFIED'
      crossDocRows.push({ checkId: `FLAG_${flag.kind}`, status: checkStatus, note: flag.note })
    }
    if (crossDocRows.length) {
      await prisma.verificationCheck.createMany({
        data: crossDocRows.map(c => ({
          submissionId: submission.id,
          submittedDocId: null,
          docName: c.checkId,
          checkId: c.checkId,
          stage: 'CROSS_DOC',
          inputJson: '{}', expectedJson: '{}', foundJson: '{}',
          status: c.status, note: c.note, run: 'AUTHORITATIVE', mock: false,
        })),
      }).catch(() => {})
    }

    const existing = await prisma.evaluationResult.findUnique({
      where: { tenderId_companyId: { tenderId, companyId: submission.companyId } },
    })
    // Preserve human-in-the-loop decisions (GFR): if the officer already approved
    // this bid, a re-evaluation that lands on requires_review keeps qualified.
    const officerApproved = existing?.reviewedAt != null && existing.status === 'qualified'
    if (officerApproved && status === 'requires_review') {
      status = 'qualified'
      outcome.reasons.push('Officer-approved after human review — approval preserved on re-evaluation')
    }
    const data = {
      tenderId,
      companyId: submission.companyId,
      submissionId: submission.id,
      eligibility: outcome.status === 'disqualified' ? 'disqualified' : outcome.eligibility === 'qualified' ? 'qualified' : outcome.eligibility === 'not_eligible' ? 'disqualified' : 'requires_review',
      technical: JSON.stringify(outcome.technical),
      compliancePct: outcome.compliancePct,
      financialCr: submission.financialBidCr,
      risk: outcome.risk,
      status,
      reasonsJson: JSON.stringify(outcome.reasons),
      flagsJson: JSON.stringify(outcome.flags),
    }
    if (existing) {
      await prisma.evaluationResult.update({
        where: { id: existing.id },
        data: officerApproved
          ? data
          : { ...data, reviewedBy: null, reviewNote: null, reviewedAt: null },
      })
    } else {
      await prisma.evaluationResult.create({ data })
    }

    // Human review gate audit (GFR human-in-the-loop).
    if (status === 'requires_review') {
      await recordAudit({
        actorId: tender.createdById, actorRole: 'SYSTEM', action: 'MANUAL_REVIEW_REQUESTED', tenderId,
        meta: { submissionId: submission.id, companyId: submission.companyId, companyName: submission.company.name, reasons: outcome.reasons },
      })
    }

    await prisma.submission.update({
      where: { id: submission.id },
      data: { eligibilitySnapshot: JSON.stringify(outcome.eligibilityPerReq) },
    }).catch(() => {})
  }

  await computeRanks(tenderId)
}

/** Ranks computed on read — persisted only as the evaluation snapshot (ORDER BY amount). */
export async function computeRanks(tenderId: string): Promise<void> {
  const results = await prisma.evaluationResult.findMany({
    where: { tenderId, status: { in: ['qualified', 'awarded'] }, financialCr: { not: null } },
    orderBy: { financialCr: 'asc' },
  })
  for (let i = 0; i < results.length; i++) {
    await prisma.evaluationResult.update({ where: { id: results[i].id }, data: { rank: i + 1 } })
  }
}

