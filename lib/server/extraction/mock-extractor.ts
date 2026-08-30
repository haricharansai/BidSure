// Deterministic MOCK extraction provider (plan §5).
// Convention: prototype demo documents embed a machine-readable header line
//   BIDSURE-MOCK-EXTRACT {json}
// The provider parses that block deterministically — no randomness, no
// timestamps, no AI. Files without the block (or with an unparseable block)
// fail extraction with a stable error so the NEEDS_REVIEW path is reproducible.
// A future OcrExtractionProvider implements the same interface without any
// change to the verification engine.

import type { DocTypeName } from './types.ts'

export interface ExtractInput {
  docType: DocTypeName
  buffer: Buffer
  mimeType: string
  fileName: string
}

export interface ExtractOutcome {
  status: 'DONE' | 'FAILED'
  confidence: number | null
  fields: Record<string, unknown>
  error: string | null
}

const MARKER = 'BIDSURE-MOCK-EXTRACT '

function normalizeString(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined
}

function normalizeNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

/**
 * Deterministic normalization per doc type. Uppercasing identifiers mirrors
 * what the statutory validators expect; missing required fields make the
 * extraction FAILED (never silently partial).
 */
function normalizeFields(docType: DocTypeName, raw: Record<string, unknown>): { fields: Record<string, unknown>; missing: string[] } {
  const fields: Record<string, unknown> = {}
  const missing: string[] = []
  const req = (key: string) => {
    const v = normalizeString(raw[key])
    if (!v) missing.push(key)
    return v
  }
  const optStr = (k: string) => {
    const v = normalizeString(raw[k])
    if (v !== undefined) fields[k] = v
  }
  const optNum = (k: string) => {
    const n = typeof raw[k] === 'number' ? (raw[k] as number) : (normalizeNumber(raw[k]) ?? undefined)
    if (n != null) fields[k] = n
  }
  switch (docType) {
    case 'gstin': {
      const gstin = req('gstin')
      if (gstin) fields.gstin = gstin.toUpperCase()
      const legalName = req('legalName')
      if (legalName) fields.legalName = legalName
      for (const k of ['tradeName', 'registrationDate', 'status', 'stateCode']) optStr(k)
      break
    }
    case 'pan': {
      const pan = req('pan')
      if (pan) fields.pan = pan.toUpperCase()
      const name = req('name')
      if (name) fields.name = name
      for (const k of ['entityType']) optStr(k)
      break
    }
    case 'udyam': {
      const udyamNo = req('udyamNo')
      if (udyamNo) fields.udyamNo = udyamNo.toUpperCase()
      const enterpriseName = req('enterpriseName')
      if (enterpriseName) fields.enterpriseName = enterpriseName
      for (const k of ['orgType', 'nicCode', 'registrationDate', 'status']) optStr(k)
      break
    }
    case 'turnover': {
      const udin = req('udin')
      if (udin) fields.udin = udin.toUpperCase()
      for (const k of ['certDate', 'caName', 'membershipNo', 'fy']) optStr(k)
      optNum('turnoverCr')
      break
    }
    case 'audited':
      for (const k of ['fy', 'auditorName']) optStr(k)
      optNum('auditedPnlCr')
      optNum('netWorthCr')
      break
    case 'emd':
      for (const k of ['bgNumber', 'issuingBank', 'validTill']) optStr(k)
      optNum('amountCr')
      optNum('claimPeriodDays')
      break
    case 'mii':
      optNum('localContentPct')
      for (const k of ['declaredBy']) optStr(k)
      break
    case 'iso':
    case 'experience':
      for (const k of ['issuer', 'issuedOn', 'validTill', 'certNumber']) optStr(k)
      break
    case 'startup':
      for (const k of ['dpiitNumber', 'recognitionDate', 'validTill']) optStr(k)
      break
    case 'maf':
      for (const k of ['oemName', 'resellerName', 'validTill']) optStr(k)
      break
    case 'board':
      for (const k of ['signerName', 'designation', 'date']) optStr(k)
      break
    case 'mca': {
      const cin = req('cin')
      if (cin) fields.cin = cin.toUpperCase()
      for (const k of ['companyName', 'status', 'incorporationDate']) optStr(k)
      if (Array.isArray(raw.directors)) fields.directors = raw.directors.map(d => String(d))
      break
    }
    default:
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) fields[k] = v
      }
  }
  return { fields, missing }
}

/** MockExtractionProvider — deterministic BIDSURE-MOCK-EXTRACT block parser. */
export async function mockExtract(input: ExtractInput): Promise<ExtractOutcome> {
  const text = input.buffer.toString('utf-8')
  const line = text.split(/\r?\n/).find(l => l.startsWith(MARKER))
  if (!line) {
    return {
      status: 'FAILED',
      confidence: null,
      fields: {},
      error: `Unrecognized ${input.docType} document — no machine-readable MOCK extract block found (expected 'BIDSURE-MOCK-EXTRACT {…}'); route to manual review`,
    }
  }
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(line.slice(MARKER.length)) as Record<string, unknown>
  } catch {
    return { status: 'FAILED', confidence: null, fields: {}, error: 'MOCK extract block is not valid JSON — manual review required' }
  }
  const { fields, missing } = normalizeFields(input.docType, raw)
  if (missing.length) {
    return {
      status: 'FAILED',
      confidence: null,
      fields: {},
      error: `MOCK extract missing required field(s): ${missing.join(', ')} — manual review required`,
    }
  }
  return { status: 'DONE', confidence: 1, fields, error: null }
}

export function isMockExtractLine(text: string): boolean {
  return text.includes(MARKER)
}
