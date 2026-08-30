// Shared deterministic field normalization (moved out of mock-extractor so the
// real OCR harvester reuses the exact same normalizers — plan §10).
// Uppercasing identifiers mirrors what the statutory validators expect.

import type { DocTypeName } from './types.ts'

export function normalizeString(v: unknown): string | undefined {
  return typeof v === 'string' ? v.trim() : undefined
}

export function normalizeNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

/**
 * Deterministic normalization per doc type. Uppercasing identifiers mirrors
 * what the statutory validators expect; missing required fields are reported
 * (never silently partial).
 */
export function normalizeFields(docType: DocTypeName, raw: Record<string, unknown>): { fields: Record<string, unknown>; missing: string[] } {
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

/**
 * Required fields per doc type for OCR harvesting. A document that is missing
 * these after extraction is not failed outright — the missing fields are
 * reported so verification can continue for what was extracted and the rest
 * routes to NEEDS_REVIEW (plan §12: never guess an uncertain value).
 */
export const REQUIRED_FIELDS: Partial<Record<DocTypeName, string[]>> = {
  gstin: ['gstin', 'legalName'],
  pan: ['pan', 'name'],
  udyam: ['udyamNo', 'enterpriseName'],
  turnover: ['udin'],
  mca: ['cin'],
}
