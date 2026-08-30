// BidSure deterministic statutory validators.
// Pure TypeScript: no DB, no network, no LLM. Every function is replayable.
// The LLM/OCR layer is intentionally absent — inputs are structured claims
// submitted by sellers; verdicts are computed ONLY by this code.

export type DocStatus =
  | 'VERIFIED'
  | 'WARNING'
  | 'NON_COMPLIANT'
  | 'UNVERIFIED'
  | 'NEEDS_REVIEW'
  | 'NOT_APPLICABLE'

export interface ValidatorResult {
  ok: boolean
  status: DocStatus
  note: string
  extracted?: Record<string, unknown>
}

const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * GSTIN: 15 chars — [2-digit state][10-char PAN][entity code][Z][checksum].
 * 15th char validated with the Base-36 Luhn (mod 36 weighted alternating) algorithm.
 */
export function validateGstin(gstin: string): ValidatorResult {
  const g = (gstin || '').trim().toUpperCase()
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(g)) {
    return { ok: false, status: 'NON_COMPLIANT', note: 'GSTIN structure invalid (expected 2-digit state + PAN + entity code + Z + checksum)' }
  }
  const extractedPan = g.slice(2, 12)
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const factor = i % 2 === 0 ? 2 : 1
    const val = BASE36.indexOf(g[i])
    if (val < 0) return { ok: false, status: 'NON_COMPLIANT', note: 'GSTIN contains invalid characters' }
    const product = val * factor
    sum += Math.floor(product / 36) + (product % 36)
  }
  const check = BASE36[(36 - (sum % 36)) % 36]
  if (check !== g[14]) {
    return { ok: false, status: 'NON_COMPLIANT', note: `GSTIN check digit mismatch (expected ${check})` }
  }
  return { ok: true, status: 'VERIFIED', note: 'GSTIN checksum valid (Base-36 Luhn)', extracted: { pan: extractedPan, stateCode: g.slice(0, 2) } }
}

/** PAN: [A-Z]{5}[0-9]{4}[A-Z]; 4th char classifies entity type. */
export function validatePan(pan: string): ValidatorResult {
  const p = (pan || '').trim().toUpperCase()
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p)) {
    return { ok: false, status: 'NON_COMPLIANT', note: 'PAN structure invalid (5 letters, 4 digits, 1 letter)' }
  }
  const classes: Record<string, string> = {
    C: 'Company', P: 'Individual/Proprietor', F: 'Firm/LLP', H: 'HUF', A: 'AOP', T: 'Trust',
  }
  const entityClass = classes[p[3]]
  if (!entityClass) {
    return { ok: false, status: 'NON_COMPLIANT', note: `PAN 4th character '${p[3]}' is not a recognised entity class` }
  }
  return { ok: true, status: 'VERIFIED', note: `PAN valid — entity class: ${entityClass}`, extracted: { entityClass: p[3] } }
}

/**
 * ICAI UDIN: 18 chars matching ^[0-9]{2}[0-9]{6}[A-Z0-9]{10}$ where the first two digits
 * are the certification year. Year must match the certificate date within ±15 days.
 */
export function validateUdin(udin: string, certDateISO?: string | null, refDate?: Date): ValidatorResult {
  const u = (udin || '').trim().toUpperCase()
  if (!/^[0-9]{2}[0-9]{6}[A-Z0-9]{10}$/.test(u)) {
    return { ok: false, status: 'NON_COMPLIANT', note: 'UDIN structure invalid (expected 18-character ICAI format)' }
  }
  if (!certDateISO) {
    return { ok: false, status: 'NEEDS_REVIEW', note: 'UDIN present but certificate date not declared — year match unverifiable' }
  }
  const cert = new Date(certDateISO)
  if (Number.isNaN(cert.getTime())) {
    return { ok: false, status: 'NEEDS_REVIEW', note: 'Certificate date unparseable' }
  }
  const yy = u.slice(0, 2)
  const fyStart = new Date(Date.UTC(2000 + Number(yy), 3, 1)) // Indian FY starts April
  const fyEnd = new Date(Date.UTC(2000 + Number(yy) + 1, 2, 31))
  const inFy = cert >= fyStart && cert <= fyEnd
  const ref = refDate ?? cert
  const windowMs = 15 * 24 * 3600 * 1000
  const nearCert = Math.abs(ref.getTime() - cert.getTime()) <= windowMs
  if (!inFy) {
    return { ok: false, status: 'NON_COMPLIANT', note: `UDIN year (FY 20${yy}) does not match certificate date` }
  }
  if (!nearCert) {
    return { ok: false, status: 'NEEDS_REVIEW', note: 'UDIN year matches FY but certificate date is >15 days from reference — verify with ICAI' }
  }
  return { ok: true, status: 'VERIFIED', note: 'UDIN structure and certification-year match verified' }
}

/**
 * Udyam: format UDYAM-XX-00-0000000. The trader trap: NIC codes 45/46/47
 * (wholesale/retail trade) are statutorily ineligible for MSME EMD exemption
 * in goods tenders (OM F.9/4/2020-PPD).
 */
export function validateUdyam(udyamNo: string, nicCode?: string | null, claimingEmdExemption = false): ValidatorResult {
  const u = (udyamNo || '').trim().toUpperCase()
  if (!/^UDYAM-[0-9]{2}-[0-9]{2}-[0-9]{7}$/.test(u)) {
    return { ok: false, status: 'NON_COMPLIANT', note: 'Udyam registration number format invalid' }
  }
  const nic = (nicCode || '').trim()
  const nic2 = nic.slice(0, 2)
  if (claimingEmdExemption && ['45', '46', '47'].includes(nic2)) {
    return {
      ok: false,
      status: 'NON_COMPLIANT',
      note: `Trader MSME trap: Udyam NIC ${nic2}xx (wholesale/retail trade) is statutorily ineligible for MSME EMD exemption in goods tenders (OM F.9/4/2020-PPD)`,
      extracted: { nic, trader: true },
    }
  }
  return { ok: true, status: 'VERIFIED', note: 'Udyam format valid' + (nic ? ` (NIC ${nic})` : ''), extracted: { nic, trader: ['45', '46', '47'].includes(nic2) } }
}

export interface BgInput {
  validTillISO?: string | null
  claimPeriodDays?: number | null
  bidOpeningDate: Date
  bidValidityDays: number
}

/**
 * Bank Guarantee / EMD: validity must cover bid opening + bid validity,
 * and include a mandatory claim period of at least 45 days beyond that.
 */
export function validateBankGuarantee(bg: BgInput): ValidatorResult {
  if (!bg.validTillISO) {
    return { ok: false, status: 'NON_COMPLIANT', note: 'Bank guarantee validity date not declared' }
  }
  const validTill = new Date(bg.validTillISO)
  if (Number.isNaN(validTill.getTime())) {
    return { ok: false, status: 'NON_COMPLIANT', note: 'Bank guarantee validity date unparseable' }
  }
  const requiredUntil = new Date(bg.bidOpeningDate.getTime() + bg.bidValidityDays * 24 * 3600 * 1000)
  const claimDays = Math.floor((validTill.getTime() - requiredUntil.getTime()) / (24 * 3600 * 1000))
  if (validTill < bg.bidOpeningDate) {
    return { ok: false, status: 'NON_COMPLIANT', note: 'Bank guarantee expires before bid opening date' }
  }
  if (validTill < requiredUntil) {
    return {
      ok: false,
      status: 'NON_COMPLIANT',
      note: `Bank guarantee validity does not cover bid validity (${Math.max(claimDays, 0)} days short)`,
    }
  }
  if (claimDays < 45) {
    return {
      ok: false,
      status: 'NON_COMPLIANT',
      note: `Bank guarantee claim period trap: only ${claimDays} days beyond bid validity — minimum 45 days required to keep the buyer legally protected`,
    }
  }
  return { ok: true, status: 'VERIFIED', note: `Bank guarantee covers bid validity + ${claimDays}-day claim period` }
}

/** Rule 5 temporal validity: judged against bid opening date, not the wall clock. */
export function validateTemporalValidity(validTillISO: string | null | undefined, bidOpeningDate: Date, docName: string): ValidatorResult {
  if (!validTillISO) {
    return { ok: true, status: 'UNVERIFIED', note: `${docName}: no expiry declared — cannot confirm validity at bid opening` }
  }
  const till = new Date(validTillISO)
  if (Number.isNaN(till.getTime())) {
    return { ok: false, status: 'NEEDS_REVIEW', note: `${docName}: expiry date unparseable` }
  }
  if (till < bidOpeningDate) {
    return { ok: false, status: 'NON_COMPLIANT', note: `${docName} expires before the bid opening date` }
  }
  const daysLeft = Math.floor((till.getTime() - bidOpeningDate.getTime()) / (24 * 3600 * 1000))
  if (daysLeft <= 30) {
    return { ok: true, status: 'WARNING', note: `${docName} valid but expiring in ${daysLeft} day(s) of bid opening` }
  }
  return { ok: true, status: 'VERIFIED', note: `${docName} valid at bid opening (${daysLeft} days margin)` }
}

/** Levenshtein-based similarity ratio in [0,1]. */
export function nameSimilarity(a: string, b: string): number {
  const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)])
  for (let j = 0; j <= y.length; j++) d[0][j] = j
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
  }
  return 1 - d[x.length][y.length] / Math.max(x.length, y.length)
}

export interface CrossDocInput {
  gstin?: string | null
  pan?: string | null
  legalName?: string | null
  declaredNames?: string[] // names appearing on documents
}

/** Rule 6 cross-document consistency: GSTIN embeds PAN; legal names fuzzy-match ≥85%. */
export function crossDocumentConsistency(input: CrossDocInput): ValidatorResult {
  const notes: string[] = []
  let worst: DocStatus = 'VERIFIED'
  const grade = (s: DocStatus) => {
    const order: DocStatus[] = ['VERIFIED', 'WARNING', 'UNVERIFIED', 'NEEDS_REVIEW', 'NON_COMPLIANT', 'NOT_APPLICABLE']
    if (order.indexOf(s) > order.indexOf(worst) && s !== 'NOT_APPLICABLE') worst = s
  }
  if (input.gstin && input.pan) {
    const g = validateGstin(input.gstin)
    const embedded = g.extracted?.pan as string | undefined
    if (embedded && embedded !== input.pan.trim().toUpperCase()) {
      notes.push(`GSTIN embeds PAN ${embedded} but declared PAN is ${input.pan.toUpperCase()}`)
      grade('NON_COMPLIANT')
    } else if (embedded) {
      notes.push('PAN cross-matched from GSTIN (chars 3–12)')
      grade('VERIFIED')
    }
  }
  if (input.legalName && input.declaredNames?.length) {
    for (const n of input.declaredNames) {
      const sim = nameSimilarity(input.legalName, n)
      if (sim < 0.85) {
        notes.push(`Legal name "${input.legalName}" vs document name "${n}" similarity ${(sim * 100).toFixed(0)}% (<85%)`)
        grade('NEEDS_REVIEW')
      }
    }
    if (!notes.some(n => n.includes('similarity'))) {
      notes.push('Legal name consistent across declared documents (≥85%)')
      grade('VERIFIED')
    }
  }
  if (!notes.length) return { ok: true, status: 'UNVERIFIED', note: 'Insufficient identifiers for cross-document consistency' }
  return { ok: worst === 'VERIFIED' || worst === 'WARNING', status: worst, note: notes.join('; ') }
}
