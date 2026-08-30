// Shared document-verification orchestrator (plan §7/§8, §14, §19, §20).
// PRELIMINARY (upload): classify → extract → structural checks → registry
// checks → identity checks → preview.
// AUTHORITATIVE (evaluate.ts): same functions re-run from stored bytes after
// the deadline; never reads preliminary results.
// Structural validators are reused from the existing deterministic engine.
// Safety rules (plan §37): OCR success ≠ authenticity; provider failure →
// NEEDS_REVIEW, never a fake PASS/FAIL; mock providers are never authoritative
// in production; every result retains source evidence.
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/server/audit'
import { extractDocument, isDocTypeName } from '@/lib/server/extraction/index.ts'
import { loadRegistryForDoc } from '@/lib/server/registry.ts'
import { productionMockCap, resolveRegistryProvider } from '@/lib/server/registry/provider.ts'
import {
  classificationMismatchCheck,
  crossCheckDpiit, crossCheckGst, crossCheckIncomeTax, crossCheckMca, crossCheckPan, crossCheckUdyam,
  identityChecksFor, type CompanyIdentityRef, type EngineCheck, type RegistryRecord,
} from '@/lib/engine/registry.ts'

export type { CompanyIdentityRef } from '@/lib/engine/registry.ts'
export { classificationMismatchCheck } from '@/lib/engine/registry.ts'
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
  /**
   * Bidder company profile (registered/declared — NOT authoritative, Rule 3)
   * for the three-way identity chain (plan §20).
   */
  company?: CompanyIdentityRef
}

export interface DocVerifyOutcome {
  extractionStatus: 'DONE' | 'FAILED'
  provider: string
  confidence: number | null
  fields: Record<string, unknown>
  error: string | null
  checks: EngineCheck[]
  classification: { docType: string; confidence: number } | null
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
      return crossCheckIncomeTax(docName, entries.find(e => e.registry === 'INCOME_TAX') ?? null)
    default:
      return []
  }
}

/**
 * Verify one document: classify → extract → persist ExtractionResult (with
 * evidence) → structural checks → classification check → registry lookup +
 * field comparison → identity chain. The caller persists VerificationCheck
 * rows (or this function does when the caller is the preliminary path).
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

  // Evidence retention (plan §11): rawJson keeps fields + per-field evidence +
  // page texts + classification; normalizedJson keeps normalized fields only.
  const rawPayload = {
    fields: outcome.fields,
    evidence: outcome.evidence ?? [],
    pageTexts: outcome.pageTexts ?? [],
    classification: outcome.classification ?? null,
  }

  await prisma.extractionResult.upsert({
    where: { documentFileId: input.documentFileId },
    update: {
      submittedDocId: input.submittedDocId,
      docType,
      provider: outcome.provider,
      status: outcome.status,
      confidence: outcome.confidence,
      rawJson: JSON.stringify(rawPayload),
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
      rawJson: JSON.stringify(rawPayload),
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
    meta: {
      submittedDocId: input.submittedDocId, docName: input.docName, provider: outcome.provider,
      providerAuthoritative: false, // extraction is never authoritative (Rule 1)
      confidence: outcome.confidence, error: outcome.error, phase: input.phase,
      classification: outcome.classification ? { docType: outcome.classification.docType, confidence: outcome.classification.confidence } : null,
      missingFields: outcome.missing ?? [], uncertainFields: outcome.uncertain ?? [],
    },
  })

  const checks: EngineCheck[] = []
  if (outcome.status === 'DONE') {
    // Classification vs required doc type (plan §14). Fires even when no
    // fields were harvested for the declared type — that is exactly the
    // mis-declared-document case. The MOCK dev adapter does not classify, so
    // dev fixtures keep their historical behavior.
    if (outcome.classification && outcome.classification.confidence > 0) {
      const mismatch = classificationMismatchCheck(input.docName, {
        docType: outcome.classification.docType,
        confidence: outcome.classification.confidence,
        evidence: outcome.classification.evidence,
      })
      if (mismatch) checks.push(mismatch)
    }

    // Missing/uncertain required fields → NEEDS_REVIEW (plan §12, Rule 7).
    if (outcome.missing?.length || outcome.uncertain?.length) {
      checks.push({
        checkId: 'EXTRACT_FIELDS_INCOMPLETE',
        stage: 'STRUCTURAL',
        docName: input.docName,
        inputJson: JSON.stringify({ docType }),
        expectedJson: JSON.stringify({ missing: [], uncertain: [] }),
        foundJson: JSON.stringify({ missing: outcome.missing ?? [], uncertain: outcome.uncertain ?? [] }),
        status: 'NEEDS_REVIEW',
        note: `Extraction incomplete: ${[
          outcome.missing?.length ? `missing field(s): ${outcome.missing.join(', ')}` : null,
          outcome.uncertain?.length ? `uncertain (low OCR confidence): ${outcome.uncertain.join(', ')}` : null,
        ].filter(Boolean).join('; ')} — officer review required; values were not guessed`,
        mock: false,
      })
    }
  }

  if (outcome.status === 'DONE' && Object.keys(outcome.fields).length > 0) {
    checks.push(...structuralChecksFor(docType, outcome.fields))

    // Registry (Stage 4/5) checks from pure cross-check functions, via the
    // active RegistryProvider (mock dev adapter or authoritative aggregator).
    const provider = resolveRegistryProvider()
    const lookup = await loadRegistryForDoc(docType, outcome.fields, provider)
    let registryChecks = registryChecksFor(docType, outcome.fields, lookup.records)
    // Production mock safety (plan §19): mock-backed results never display an
    // authoritative verdict. Capped at NEEDS_REVIEW (Rule 4).
    if (productionMockCap(provider)) {
      for (const c of registryChecks) {
        if (c.stage === 'REGISTRY' && (c.status === 'VERIFIED' || c.status === 'NON_COMPLIANT')) {
          c.status = 'NEEDS_REVIEW'
          c.note = `${c.note} — MOCK registry is not authoritative in production; officer verification required`
        }
      }
    }
    // Provider outage (plan §18): never a fake PASS or FAIL.
    for (const u of lookup.unavailable) {
      checks.push({
        checkId: `${u.registry}_SOURCE_UNAVAILABLE`,
        stage: 'REGISTRY',
        docName: input.docName,
        inputJson: JSON.stringify({ key: u.key }),
        expectedJson: JSON.stringify({ registry: u.registry }),
        foundJson: JSON.stringify({ queried: u.key, available: false }),
        status: 'NEEDS_REVIEW',
        note: `Authoritative verification could not be completed: ${u.registry} provider unavailable for ${u.key} — manual verification required`,
        mock: false,
      })
    }
    checks.push(...registryChecks)
    if (provider.authoritative) {
      for (const c of registryChecks) c.mock = false
      await recordAudit({
        actorId: input.actorId, actorRole: 'SYSTEM',
        action: 'REGISTRY_LOOKUP',
        tenderId: input.tenderId,
        meta: { submittedDocId: input.submittedDocId, docName: input.docName, provider: provider.name, authoritative: true, phase: input.phase },
      })
    }

    // Three-way identity chain vs the bidder company profile (plan §20-§21).
    checks.push(...identityChecksFor(docType, outcome.fields, input.company ?? {}))

    if (input.phase === 'AUTHORITATIVE') {
      for (const c of checks.filter(c => c.stage === 'REGISTRY')) {
        await recordAudit({
          actorId: input.actorId, actorRole: 'SYSTEM',
          action: c.status === 'NON_COMPLIANT' ? 'REGISTRY_MISMATCH' : 'REGISTRY_MATCH',
          tenderId: input.tenderId,
          meta: { submittedDocId: input.submittedDocId, docName: input.docName, checkId: c.checkId, status: c.status, note: c.note, mock: c.mock, provider: provider.name, authoritative: provider.authoritative, phase: input.phase },
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
    classification: outcome.classification ? { docType: outcome.classification.docType, confidence: outcome.classification.confidence } : null,
  }
}
