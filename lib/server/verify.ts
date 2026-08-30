// Shared document-verification orchestrator (plan §7/§8).
// PRELIMINARY (upload): extract → structural checks → registry checks → preview.
// AUTHORITATIVE (evaluate.ts): same functions re-run from stored bytes after
// the deadline; never reads preliminary results.
// Structural validators are reused from the existing deterministic engine.
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/server/audit'
import { extractDocument, isDocTypeName } from '@/lib/server/extraction/index.ts'
import { loadRegistryForDoc } from '@/lib/server/registry.ts'
import {
  crossCheckDpiit, crossCheckGst, crossCheckIncomeTax, crossCheckMca, crossCheckPan, crossCheckUdyam,
  type EngineCheck, type RegistryRecord,
} from '@/lib/engine/registry.ts'
import {
  validateGstin, validatePan, validateUdin, validateUdyam,
} from '@/lib/engine/validators.ts'

export interface DocVerifyInput {
  submittedDocId: string
  documentFileId: string
  docName: string
  buffer: Buffer
  mimeType: string
  originalName: string
  tenderId: string
  /** Audit actor id — the tender creator, per the existing SYSTEM-event convention. */
  actorId: string
  phase: 'PRELIMINARY' | 'AUTHORITATIVE'
  bidOpeningDate?: Date | null
}

export interface DocVerifyOutcome {
  extractionStatus: 'DONE' | 'FAILED'
  provider: string
  confidence: number | null
  fields: Record<string, unknown>
  error: string | null
  checks: EngineCheck[]
}

function structuralChecksFor(docName: string, fields: Record<string, unknown>): EngineCheck[] {
  const input = { docName }
  switch (docName) {
    case 'gstin':
      return typeof fields.gstin === 'string'
        ? [pureCheck('GSTIN_FORMAT', input, validateGstin(fields.gstin))]
        : []
    case 'pan':
      return typeof fields.pan === 'string'
        ? [pureCheck('PAN_FORMAT', input, validatePan(fields.pan))]
        : []
    case 'udyam':
      return typeof fields.udyamNo === 'string'
        ? [pureCheck('UDYAM_FORMAT', input, validateUdyam(fields.udyamNo, typeof fields.nicCode === 'string' ? fields.nicCode : null, false))]
        : []
    case 'turnover':
      return typeof fields.udin === 'string'
        ? [pureCheck('UDIN_FORMAT', input, validateUdin(fields.udin, typeof fields.certDate === 'string' ? fields.certDate : null, undefined))]
        : []
    default:
      return []
  }
}

function pureCheck(checkId: string, input: Record<string, unknown>, result: { status: string; note: string }): EngineCheck {
  return {
    checkId, stage: 'STRUCTURAL', docName: String(input.docName),
    inputJson: JSON.stringify(input), expectedJson: '{}', foundJson: JSON.stringify(input),
    status: result.status as EngineCheck['status'], note: result.note, mock: false,
  }
}

/** Registry (Stage 4) checks from pure cross-check functions. */
export function registryChecksFor(docName: string, fields: Record<string, unknown>, entries: RegistryRecord[]): EngineCheck[] {
  const get = (registry: string) => entries.find(e => e.registry === registry) ?? null
  switch (docName) {
    case 'gstin':
      return crossCheckGst(docName, fields, get('GSTN'))
    case 'pan':
      return crossCheckPan(docName, fields, get('PAN'), get('INCOME_TAX'))
    case 'udyam':
      return crossCheckUdyam(docName, fields, get('UDYAM'))
    case 'startup':
      return crossCheckDpiit(docName, fields, get('DPIIT'))
    case 'mca':
      return crossCheckMca(docName, fields, get('MCA'))
    case 'experience':
    case 'iso':
      return crossCheckIncomeTax(docName, null) // no registry: metadata/completeness only
    default:
      return []
  }
}

/**
 * Verify one document: extract → persist ExtractionResult → structural checks →
 * registry lookup + field comparison. The caller persists VerificationCheck
 * rows (or this function does when `persistChecks` is set).
 */
export async function verifyDocument(input: DocVerifyInput): Promise<DocVerifyOutcome> {
  const startedAt = Date.now()
  await recordAudit({
    actorId: input.actorId, actorRole: 'SYSTEM', action: 'EXTRACTION_STARTED', tenderId: input.tenderId,
    meta: { submittedDocId: input.submittedDocId, docName: input.docName, phase: input.phase },
  })

  const docType = isDocTypeName(input.docName) ? input.docName : 'generic'
  const outcome = await extractDocument({
    docType, buffer: input.buffer, mimeType: input.mimeType, fileName: input.originalName,
  })
  const durationMs = Date.now() - startedAt

  await prisma.extractionResult.upsert({
    where: { documentFileId: input.documentFileId },
    update: {
      submittedDocId: input.submittedDocId,
      docType,
      provider: outcome.provider,
      status: outcome.status,
      confidence: outcome.confidence,
      rawJson: JSON.stringify(outcome.fields),
      normalizedJson: JSON.stringify(outcome.fields),
      error: outcome.error,
      durationMs,
    },
    create: {
      documentFileId: input.documentFileId,
      submittedDocId: input.submittedDocId,
      docType,
      provider: outcome.provider,
      status: outcome.status,
      confidence: outcome.confidence,
      rawJson: JSON.stringify(outcome.fields),
      normalizedJson: JSON.stringify(outcome.fields),
      error: outcome.error,
      durationMs,
    },
  })

  await prisma.submittedDoc.update({
    where: { id: input.submittedDocId },
    data: {
      extractedJson: JSON.stringify(outcome.fields),
      extractionStatus: outcome.status,
    },
  })

  await recordAudit({
    actorId: input.actorId, actorRole: 'SYSTEM',
    action: outcome.status === 'DONE' ? 'EXTRACTION_COMPLETED' : 'EXTRACTION_FAILED',
    tenderId: input.tenderId,
    meta: { submittedDocId: input.submittedDocId, docName: input.docName, provider: outcome.provider, confidence: outcome.confidence, error: outcome.error, phase: input.phase },
  })

  const checks: EngineCheck[] = []
  if (outcome.status === 'DONE' && Object.keys(outcome.fields).length > 0) {
    checks.push(...structuralChecksFor(docType, outcome.fields))
    const entries = await loadRegistryForDoc(docType, outcome.fields)
    checks.push(...registryChecksFor(docType, outcome.fields, entries))
    if (input.phase === 'AUTHORITATIVE') {
      for (const c of checks.filter(c => c.stage === 'REGISTRY')) {
        await recordAudit({
          actorId: input.actorId, actorRole: 'SYSTEM',
          action: c.status === 'NON_COMPLIANT' ? 'REGISTRY_MISMATCH' : 'REGISTRY_MATCH',
          tenderId: input.tenderId,
          meta: { submittedDocId: input.submittedDocId, docName: input.docName, checkId: c.checkId, status: c.status, note: c.note, mock: true, phase: 'AUTHORITATIVE' },
        })
      }
    }
  }

  return {
    extractionStatus: outcome.status,
    provider: outcome.provider,
    confidence: outcome.confidence,
    fields: outcome.fields,
    error: outcome.error,
    checks,
  }
}

