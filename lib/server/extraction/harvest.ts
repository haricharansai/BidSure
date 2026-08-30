// Real-document field harvesting + doc-type classification (plan §10/§13).
// Deterministic regex/pattern extraction from OCR or PDF text-layer output.
// Never invents missing fields: anything below the confidence threshold or
// absent is reported as missing/uncertain so verification can route it to
// NEEDS_REVIEW instead of guessing (plan §12, Rule 7).

import type { ClassificationEvidence, ClassificationResult, DocTypeName, FieldEvidence } from './types.ts'
import { normalizeFields, REQUIRED_FIELDS } from './normalize.ts'

/** Fields below this confidence are treated as uncertain (never guessed). */
export const UNCERTAIN_THRESHOLD = 0.6

export interface HarvestPage { page: number; text: string }

export interface HarvestOutcome {
  fields: Record<string, unknown>
  evidence: FieldEvidence[]
  missing: string[]
  uncertain: string[]
  classification: ClassificationResult
}

export interface LabelledMatch {
  field: string
  value: string
  excerpt: string
  confidence: number
}

const excerptAround = (text: string, index: number, length: number): string => {
  const start = Math.max(0, index - 30)
  const end = Math.min(text.length, index + length + 30)
  return text.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 100)
}

// Statutory identifier patterns (validated formats — a match is a real ID shape).
const GSTIN_RE = /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]/g
const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g
const UDYAM_RE = /UDYAM-[0-9]{2}-[0-9]{2}-[0-9]{7}/g
const UDIN_RE = /\b[0-9]{2}[0-9]{6}[A-Z0-9]{10}\b/g
const CIN_RE = /\b[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}\b/g
const AMOUNT_CR_RE = /(?:₹|Rs\.?|INR)?\s*([0-9]+(?:[.,][0-9]{3})*(?:\.[0-9]{1,4})?)\s*(crore|crs?|crores)\b/gi
const DATE_RE = /\b([0-3][0-9][\/\-.][01][0-9][\/\-.][0-9]{4}|[0-9]{4}-[01][0-9]-[0-3][0-9])\b/g
const FY_RE = /\bFY\s*[:\-]?\s*([0-9]{4}\s*[-–]\s*[0-9]{2,4})\b/gi

const confidenceFor = (labelled: boolean, ocrFactor = 1): number =>
  Math.min(0.99, (labelled ? 0.9 : 0.75) * ocrFactor)

/**
 * Labelled line harvesting: `Label : value` / `Label value` pairs for a set of
 * known statutory labels. Deterministic, no AI.
 */
export function matchLabelled(text: string, labels: string[], ocrFactor = 1): LabelledMatch[] {
  const out: LabelledMatch[] = []
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-–]?\\s*([^\\n|]{2,120})`, 'gi')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const value = m[1].trim().replace(/\s{2,}/g, ' ')
      if (!value || /^[.,:;|]+$/.test(value)) continue
      out.push({ field: label, value, excerpt: excerptAround(text, m.index, m[0].length), confidence: confidenceFor(true, ocrFactor) })
    }
  }
  return out
}

/**
 * Classify document type from extracted text (plan §13). Returns `generic`
 * when nothing statutory matches — classification mismatch checks never fire
 * against `generic` (plan §14).
 */
export function classifyDocType(text: string): ClassificationResult {
  const t = (text || '').replace(/\u0000/g, '')
  const evidence: ClassificationEvidence[] = []
  const signals: Array<{ docType: DocTypeName; weight: number }> = []

  const addSignal = (docType: DocTypeName, weight: number, pattern: string, excerpt: string) => {
    signals.push({ docType, weight })
    evidence.push({ pattern, excerpt })
  }

  const gstinMatch = t.toUpperCase().match(GSTIN_RE)?.[0]
  if (gstinMatch && /gstin|gst\b|goods and services|taxpayer|tax payer/i.test(t)) {
    addSignal('gstin', 1.0, 'GSTIN', excerptAround(t, t.toUpperCase().indexOf(gstinMatch), 15))
  } else if (gstinMatch) {
    addSignal('gstin', 0.6, 'GSTIN-format', excerptAround(t, t.toUpperCase().indexOf(gstinMatch), 15))
  } else if (/goods and services tax|gstin|gst registration/i.test(t)) {
    addSignal('gstin', 0.4, 'GST-keyword', excerptAround(t, t.search(/goods and services tax|gstin|gst registration/i), 40))
  }

  const panMatch = t.toUpperCase().match(PAN_RE)?.[0]
  if (panMatch && /permanent account number|\bPAN\b|income[- ]?tax/i.test(t)) {
    addSignal('pan', 0.9, 'PAN', excerptAround(t, t.toUpperCase().indexOf(panMatch), 10))
  } else if (panMatch) {
    addSignal('pan', 0.5, 'PAN-format', excerptAround(t, t.toUpperCase().indexOf(panMatch), 10))
  }

  const udyamMatch = t.toUpperCase().match(UDYAM_RE)?.[0]
  if (udyamMatch) {
    addSignal('udyam', 1.0, 'UDYAM', excerptAround(t, t.toUpperCase().indexOf(udyamMatch), 23))
  } else if (/udyam|micro small medium enterprise|msme registration/i.test(t)) {
    addSignal('udyam', 0.45, 'UDYAM-keyword', excerptAround(t, t.search(/udyam|micro small medium enterprise|msme registration/i), 40))
  }

  const udinMatch = t.toUpperCase().match(UDIN_RE)?.[0]
  if (udinMatch && /turnover|chartered accountant|UDIN|ca certificate|audited/i.test(t)) {
    addSignal('turnover', 1.0, 'UDIN', excerptAround(t, t.toUpperCase().indexOf(udinMatch), 18))
  } else if (udinMatch) {
    addSignal('turnover', 0.5, 'UDIN-format', excerptAround(t, t.toUpperCase().indexOf(udinMatch), 18))
  } else if (/turnover certificate|chartered accountant.*turnover|UDIN/i.test(t)) {
    addSignal('turnover', 0.4, 'turnover-keyword', excerptAround(t, t.search(/turnover certificate|UDIN/i), 40))
  }

  if (!signals.length) {
    return { docType: 'generic', confidence: 0, evidence: [] }
  }
  // Deterministic pick: highest weight; ties resolved by the priority order
  // gstin > pan > udyam > turnover (signals pushed in that order, so >= keeps the first).
  let best = signals[0]
  let bestIdx = 0
  for (let i = 1; i < signals.length; i++) {
    if (signals[i].weight > best.weight) {
      best = signals[i]
      bestIdx = i
    }
  }
  return {
    docType: best.docType,
    confidence: Math.min(0.99, best.weight),
    evidence: [evidence[bestIdx], ...evidence.filter((_, i) => i !== bestIdx)].slice(0, 4),
  }
}

function parseAmountCr(raw: string): number | undefined {
  const n = Number(raw.replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function parseDate(raw: string): string | undefined {
  const dmy = raw.match(/^([0-3][0-9])[/\-.]([01][0-9])[/\-.]([0-9]{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  return raw.trim() || undefined
}

/**
 * Harvest structured fields from real OCR/text-layer output for the declared
 * doc type. Statutory identifiers (GSTIN/PAN/UDYAM/UDIN/CIN) are always
 * harvested regardless of the declared type so cross-type evidence survives a
 * mis-declared doc name (the DOC_TYPE_MISMATCH check handles that case).
 */
export function harvestFields(docType: DocTypeName, pages: HarvestPage[], ocrFactor = 1): HarvestOutcome {
  const fullText = pages.map(p => p.text).join('\n')
  const upper = fullText.toUpperCase()
  const evidence: FieldEvidence[] = []
  const raw: Record<string, unknown> = {}
  const uncertain: string[] = []

  const accept = (
    field: string,
    value: string | number,
    page: number,
    excerpt: string,
    confidence: number,
    transform?: (v: string) => string | number,
  ) => {
    const conf = Math.min(0.99, confidence * ocrFactor)
    if (conf < UNCERTAIN_THRESHOLD) {
      uncertain.push(field)
      return
    }
    const final = transform ? transform(String(value)) : value
    if (final === undefined || final === '' || final == null) return
    raw[field] = final
    evidence.push({ field, value: final as string | number, excerpt, page, confidence: conf })
  }

  // --- Statutory identifiers (always harvested, format-validated) ---
  const firstPageOf = (needle: string): number => {
    const idx = pages.findIndex(p => p.text.toUpperCase().includes(needle))
    return idx >= 0 ? pages[idx].page : 1
  }
  const gstin = upper.match(GSTIN_RE)?.[0]
  if (gstin) accept('gstin', gstin, firstPageOf(gstin), excerptAround(upper, upper.indexOf(gstin), 15), confidenceFor(false))
  const pan = upper.match(PAN_RE)?.[0]
  if (pan) accept('pan', pan, firstPageOf(pan), excerptAround(upper, upper.indexOf(pan), 10), confidenceFor(false))
  const udyam = upper.match(UDYAM_RE)?.[0]
  if (udyam) accept('udyamNo', udyam, firstPageOf(udyam), excerptAround(upper, upper.indexOf(udyam), 23), confidenceFor(false))
  const udin = upper.match(UDIN_RE)?.[0]
  if (udin) accept('udin', udin, firstPageOf(udin), excerptAround(upper, upper.indexOf(udin), 18), confidenceFor(false))
  const cin = upper.match(CIN_RE)?.[0]
  if (cin) accept('cin', cin, firstPageOf(cin), excerptAround(upper, upper.indexOf(cin), 21), confidenceFor(false))

  // --- Amounts + dates (doc-agnostic but doc-aware) ---
  let amountIdx = 0
  for (const m of fullText.matchAll(AMOUNT_CR_RE)) {
    const cr = parseAmountCr(m[1])
    if (cr == null) continue
    // First amount labelled as turnover wins for turnover figures; later
    // amounts may be net worth etc. — only claim when context mentions turnover.
    const before = fullText.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0)
    const isTurnover = /turnover/i.test(before)
    if (isTurnover && raw.turnoverCr == null) {
      accept('turnoverCr', cr, pages[0]?.page ?? 1, excerptAround(fullText, m.index ?? 0, m[0].length), confidenceFor(true))
    } else if (!isTurnover && amountIdx === 0) {
      amountIdx++
      // unlabeled amount kept out of fields — context too weak to assign (Rule 7)
    }
  }
  for (const m of fullText.matchAll(FY_RE)) {
    accept('fy', m[1].replace(/\s+/g, ''), pages[0]?.page ?? 1, excerptAround(fullText, m.index ?? 0, m[0].length), confidenceFor(true), v => v.toUpperCase())
    break
  }
  for (const [field, labels] of [
    ['certDate', ['Date of certification', 'Certification date', 'Certificate date', 'Date of issue', 'Issued on', 'Dated']],
    ['registrationDate', ['Date of registration', 'Registration date', 'Registered on']],
    ['validTill', ['Valid till', 'Valid up to', 'Valid upto', 'Valid until', 'Expiry date', 'Expires on']],
    ['issuedOn', ['Date of issue', 'Issue date']],
  ] as const) {
    if (raw[field] != null) continue
    for (const lm of matchLabelled(fullText, [labels[0], ...labels.slice(1)], ocrFactor)) {
      const d = parseDate(lm.value)
      if (d) accept(field, d, pages[0]?.page ?? 1, lm.excerpt, lm.confidence)
      break
    }
  }

  // --- Doc-type specific labelled fields ---
  const nameMatch = (labels: string[]): LabelledMatch | null => matchLabelled(fullText, labels, ocrFactor)[0] ?? null
  switch (docType) {
    case 'gstin': {
      const legal = nameMatch(['Legal name', 'Legal Name', 'Trade name', 'Name of business', 'Constitution of Business'])
      if (legal) accept('legalName', legal.value, pages[0]?.page ?? 1, legal.excerpt, legal.confidence)
      const trade = nameMatch(['Trade name'])
      if (trade) accept('tradeName', trade.value, pages[0]?.page ?? 1, trade.excerpt, trade.confidence)
      if (raw.gstin != null) raw.stateCode = String(raw.gstin).slice(0, 2)
      break
    }
    case 'pan': {
      const nm = nameMatch(['Name', 'Name of assessee'])
      if (nm) accept('name', nm.value, pages[0]?.page ?? 1, nm.excerpt, nm.confidence)
      const et = nameMatch(['Entity type', 'Status', 'Category'])
      if (et) accept('entityType', et.value, pages[0]?.page ?? 1, et.excerpt, et.confidence)
      break
    }
    case 'udyam': {
      const en = nameMatch(['Name of enterprise', 'Enterprise name', 'Name of the enterprise'])
      if (en) accept('enterpriseName', en.value, pages[0]?.page ?? 1, en.excerpt, en.confidence)
      const ot = nameMatch(['Type of enterprise', 'Enterprise type', 'Classification'])
      if (ot) accept('orgType', ot.value, pages[0]?.page ?? 1, ot.excerpt, ot.confidence)
      const nic = nameMatch(['NIC code', 'NIC 2 digit', 'National industrial classification'])
      if (nic) accept('nicCode', nic.value.split(/\s+/)[0], pages[0]?.page ?? 1, nic.excerpt, nic.confidence)
      break
    }
    case 'turnover': {
      const ca = nameMatch(['Name of chartered accountant', 'CA name', 'Chartered accountant'])
      if (ca) accept('caName', ca.value, pages[0]?.page ?? 1, ca.excerpt, ca.confidence)
      const mem = nameMatch(['Membership number', 'M\\. No', 'Membership no'])
      if (mem) accept('membershipNo', mem.value, pages[0]?.page ?? 1, mem.excerpt, mem.confidence)
      break
    }
    case 'mca': {
      const cn = nameMatch(['Company name', 'Name of company', 'CIN'])
      if (cn && raw.companyName == null) accept('companyName', cn.value, pages[0]?.page ?? 1, cn.excerpt, cn.confidence)
      break
    }
    case 'iso':
    case 'experience': {
      const issuer = nameMatch(['Issued by', 'Issuer', 'Certification body'])
      if (issuer) accept('issuer', issuer.value, pages[0]?.page ?? 1, issuer.excerpt, issuer.confidence)
      const certNo = nameMatch(['Certificate number', 'Certificate no', 'Cert no'])
      if (certNo) accept('certNumber', certNo.value, pages[0]?.page ?? 1, certNo.excerpt, certNo.confidence)
      break
    }
    case 'emd': {
      const bg = nameMatch(['BG number', 'Guarantee number', 'Bank guarantee no'])
      if (bg) accept('bgNumber', bg.value, pages[0]?.page ?? 1, bg.excerpt, bg.confidence)
      const bank = nameMatch(['Issuing bank', 'Bank'])
      if (bank) accept('issuingBank', bank.value, pages[0]?.page ?? 1, bank.excerpt, bank.confidence)
      break
    }
    case 'startup': {
      const dpiit = nameMatch(['DPIIT', 'Recognition number', 'Certificate number'])
      if (dpiit) accept('dpiitNumber', dpiit.value, pages[0]?.page ?? 1, dpiit.excerpt, dpiit.confidence)
      break
    }
    case 'board': {
      const signer = nameMatch(['Signed by', 'Name', 'Director'])
      if (signer) accept('signerName', signer.value, pages[0]?.page ?? 1, signer.excerpt, signer.confidence)
      const desig = nameMatch(['Designation'])
      if (desig) accept('designation', desig.value, pages[0]?.page ?? 1, desig.excerpt, desig.confidence)
      break
    }
    default:
      break
  }

  // --- Fallback: generic labelled key/value harvesting for unlisted fields ---
  if (!raw.legalName && docType === 'generic') {
    const nm = nameMatch(['Name', 'Legal name'])
    if (nm) accept('legalName', nm.value, pages[0]?.page ?? 1, nm.excerpt, nm.confidence)
  }

  // Normalize per the shared normalizers (uppercase IDs, typed numbers).
  const { fields, missing } = normalizeFields(docType, raw)
  // Statutory identifiers harvested from the text survive even when they do
  // not belong to the declared doc type — evidence for the DOC_TYPE_MISMATCH
  // check must survive a mis-declared doc name (plan §14).
  for (const [k, v] of Object.entries(raw)) {
    if (fields[k] == null && ['gstin', 'pan', 'udyamNo', 'udin', 'cin'].includes(k)) fields[k] = raw[k]
  }
  const required = REQUIRED_FIELDS[docType] ?? []
  const missingRequired = required.filter(f => fields[f] == null)
  const uncertainRequired = required.filter(f => fields[f] == null && uncertain.includes(f))
  return {
    fields,
    evidence,
    missing: missingRequired,
    uncertain: uncertainRequired,
    classification: classifyDocType(fullText),
  }
}
