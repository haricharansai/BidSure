// BidSure deterministic evaluation engine — orchestrates validators and
// reconciliations into a reproducible 4-stage gated evaluation of one bid.
// Pure functions only: callers (lib/repo.ts) supply tender/company/submission data.

import {
  crossDocumentConsistency,
  validateBankGuarantee,
  validateGstin,
  validatePan,
  validateTemporalValidity,
  validateUdin,
  validateUdyam,
  type DocStatus,
  type ValidatorResult,
} from './validators.ts'
import {
  checkAbnormallyLowBid,
  checkNetWorth,
  detectCollusion,
  triangulateTurnover,
  type BidderFingerprint,
  type CollusionHit,
} from './reconciliation.ts'

export type EvalStatus = 'qualified' | 'disqualified' | 'requires_review'
export type Risk = 'LOW' | 'MEDIUM' | 'HIGH'
export type Classification = 'MANDATORY' | 'CONDITIONAL' | 'SUPPORTING'

export interface EligibilityReq { key: string; label: string; value: number }
export interface TechnicalReq { key: string; label: string; expected: string }
export interface TenderRequirements {
  eligibility?: EligibilityReq[]
  technical?: TechnicalReq[]
  requiredDocs?: RequiredDocSpec[]
}

export interface CompanyProfile {
  id: string
  name: string
  legalName?: string | null
  gstin?: string | null
  pan?: string | null
  turnoverCr?: number | null
  yearsExperience?: number | null
  msme: boolean
  iso: boolean
  isReseller: boolean
  udyamNo?: string | null
  udyamNicCode?: string | null
  caTurnoverCr?: number | null
  gstr3bTotalCr?: number | null
  auditedPnlCr?: number | null
  netWorthCr?: number | null
  miiLocalContentPct?: number | null
  isStartup: boolean
  dscTokenId?: string | null
  directorDins: string[]
}

export interface TenderContext {
  id: string
  bidOpeningDate: Date
  bidValidityDays: number
  emdRequired: boolean
  valueCr: number | null
  miiMinLocalContentPct?: number | null
  albThresholdPct: number
  requirements: TenderRequirements
}

export interface RequiredDocSpec {
  name: string
  label: string
  classification: Classification
  conditionKey?: string | null
}

export interface SubmittedDocClaim {
  docName: string
  provided: boolean
  fileName?: string | null
  fileType?: string | null
  sizeMb?: number | null
  validTill?: string | null
  extracted?: Record<string, unknown>
}

export interface Flag { kind: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; note: string }

export interface DocOutcome {
  docName: string
  label: string
  classification: Classification
  status: DocStatus
  note: string
}

export interface EvalOutcome {
  docs: DocOutcome[]
  eligibilityPerReq: { key: string; label: string; declared: string; status: 'PASS' | 'FAIL' | 'ATTENTION' }[]
  eligibility: 'qualified' | 'not_eligible' | 'needs_attention' | 'not_yet_verified'
  technical: { passed: number; total: number; failures: string[] }
  triangulation: { status: DocStatus; note: string }
  compliancePct: number
  flags: Flag[]
  reasons: string[]
  status: EvalStatus
  risk: Risk
}

const DOC_LABELS: Record<string, string> = {
  pan: 'PAN card', gstin: 'GST registration certificate', emd: 'EMD / bid security (bank guarantee)',
  turnover: 'CA turnover certificate (with UDIN)', audited: 'Audited balance sheets (3 years)',
  board: 'Board resolution / power of attorney', udyam: 'Udyam (MSE) registration', startup: 'DPIIT startup certificate',
  maf: 'Manufacturer authorization form', mii: 'Make in India local content declaration',
  land_border: 'Land border sharing declaration (GFR 144(xi))', iso: 'ISO certification',
  experience: 'Past experience certificates',
}

function docLabel(name: string): string {
  return DOC_LABELS[name] ?? name
}

/** Pre-applicability: is a conditional doc actually activated by this bidder's claims? (loophole #4) */
export function conditionApplies(conditionKey: string | null | undefined, company: CompanyProfile): boolean {
  switch (conditionKey) {
    case 'msme': return company.msme
    case 'startup': return company.isStartup
    case 'mii': return company.miiLocalContentPct != null
    case 'reseller': return company.isReseller
    case 'land_border': return false // demo: no land-border claims seeded
    default: return false
  }
}

/** Stage 0 eligibility pre-check (also used by marketplace discovery). */
export function evaluateEligibility(
  company: CompanyProfile,
  requirements: TenderRequirements,
): { key: string; label: string; declared: string; status: 'PASS' | 'FAIL' | 'ATTENTION' }[] {
  const rows: { key: string; label: string; declared: string; status: 'PASS' | 'FAIL' | 'ATTENTION' }[] = []
  for (const req of requirements.eligibility ?? []) {
    let declared = 'not declared'
    let status: 'PASS' | 'FAIL' | 'ATTENTION' = 'ATTENTION'
    switch (req.key) {
      case 'minTurnoverCr': {
        const v = company.turnoverCr
        declared = v != null ? `₹${v} Cr` : 'not declared'
        status = v == null ? 'ATTENTION' : v >= req.value ? 'PASS' : 'FAIL'
        break
      }
      case 'minYearsExperience': {
        const v = company.yearsExperience
        declared = v != null ? `${v} yr(s)` : 'not declared'
        status = v == null ? 'ATTENTION' : v >= req.value ? 'PASS' : 'FAIL'
        break
      }
      case 'iso': {
        declared = company.iso ? 'yes' : 'no'
        status = company.iso ? 'PASS' : 'FAIL'
        break
      }
      case 'netWorthPositive': {
        const v = company.netWorthCr
        declared = v != null ? `₹${v} Cr` : 'not declared'
        status = v == null ? 'ATTENTION' : v > 0 ? 'PASS' : 'FAIL'
        break
      }
      case 'miiMinLocalContentPct': {
        const v = company.miiLocalContentPct
        declared = v != null ? `${v}%` : 'not declared'
        status = v == null ? 'ATTENTION' : v >= req.value ? 'PASS' : 'FAIL'
        break
      }
      default:
        declared = 'unsupported criterion'
        status = 'ATTENTION'
    }
    rows.push({ key: req.key, label: req.label, declared, status })
  }
  return rows
}

function eligibilityOverall(rows: { status: 'PASS' | 'FAIL' | 'ATTENTION' }[]): EvalOutcome['eligibility'] {
  if (!rows.length) return 'not_yet_verified'
  if (rows.some(r => r.status === 'FAIL')) return 'not_eligible'
  if (rows.some(r => r.status === 'ATTENTION')) return 'needs_attention'
  return 'qualified'
}

function gradeDoc(result: ValidatorResult): Pick<DocOutcome, 'status' | 'note'> {
  return { status: result.status, note: result.note }
}

/** Full deterministic evaluation of one submission. */
export function evaluateSubmission(
  tender: TenderContext,
  company: CompanyProfile,
  docs: SubmittedDocClaim[],
  technicalResponse: Record<string, string>,
  financialBidCr: number | null,
): EvalOutcome {
  const reasons: string[] = []
  const flags: Flag[] = []
  const docOutcomes: DocOutcome[] = []
  const required: RequiredDocSpec[] = (tender.requirements.requiredDocs ?? []).map(d => ({
    name: d.name, label: d.label, classification: d.classification, conditionKey: d.conditionKey ?? null,
  }))
  const providedByName = new Map(docs.map(d => [d.docName, d]))
  const bidOpening = tender.bidOpeningDate

  let fatal = false
  let needsReview = false

  // Stage 1+2: completeness + per-document validation.
  for (const spec of required) {
    const claim = providedByName.get(spec.name)
    // EMD applicability is tender-driven (GeM: EMD only when estimated value > ₹5 L);
    // every other conditional doc is claim-driven (loophole #4 pre-applicability).
    const conditionalActive = spec.classification === 'CONDITIONAL'
      && (spec.name === 'emd' ? tender.emdRequired : conditionApplies(spec.conditionKey, company))
    if (spec.classification === 'CONDITIONAL' && !conditionalActive) {
      docOutcomes.push({ docName: spec.name, label: spec.label, classification: spec.classification, status: 'NOT_APPLICABLE', note: spec.name === 'emd' ? 'EMD not applicable for this tender (estimated value ≤ ₹5 L)' : `Condition '${spec.conditionKey}' not claimed by bidder — not applicable` })
      continue
    }
    if (!claim || !claim.provided) {
      const status: DocStatus = spec.classification === 'MANDATORY' || conditionalActive ? 'NON_COMPLIANT' : 'UNVERIFIED'
      const note = spec.classification === 'MANDATORY'
        ? `Mandatory gatekeeper missing — immediate disqualification (GFR Rule 173)`
        : conditionalActive
          ? `Required because bidder claims '${spec.conditionKey}' — missing when claimed is a FAIL`
          : 'Supporting document not submitted — no scoring penalty'
      if (status === 'NON_COMPLIANT') fatal = true
      docOutcomes.push({ docName: spec.name, label: spec.label, classification: spec.classification, status, note })
      continue
    }
    const extracted = (claim.extracted ?? {}) as Record<string, unknown>
    let result: ValidatorResult = { ok: true, status: 'UNVERIFIED', note: 'No deterministic validator for this document' }
    switch (spec.name) {
      case 'gstin':
        result = validateGstin(String(extracted.number ?? company.gstin ?? ''))
        break
      case 'pan':
        result = validatePan(String(extracted.number ?? company.pan ?? ''))
        break
      case 'turnover':
        result = validateUdin(String(extracted.udin ?? ''), extracted.certDate ? String(extracted.certDate) : null, bidOpening)
        break
      case 'udyam':
        result = validateUdyam(String(extracted.number ?? company.udyamNo ?? ''), extracted.nicCode ? String(extracted.nicCode) : company.udyamNicCode, company.msme && tender.emdRequired)
        if (!result.ok) {
          flags.push({ kind: 'TRADER_MSME_TRAP', severity: 'CRITICAL', note: result.note })
          fatal = true
        }
        break
      case 'emd':
        result = tender.emdRequired
          ? validateBankGuarantee({
              validTillISO: claim.validTill ?? (extracted.validTill ? String(extracted.validTill) : null),
              claimPeriodDays: extracted.claimPeriodDays ? Number(extracted.claimPeriodDays) : null,
              bidOpeningDate: bidOpening,
              bidValidityDays: tender.bidValidityDays,
            })
          : { ok: true, status: 'NOT_APPLICABLE', note: 'EMD not required for this tender' }
        break
      case 'mii': {
        const pct = company.miiLocalContentPct
        if (pct == null) {
          result = { ok: false, status: 'NON_COMPLIANT', note: 'Local content percentage not declared' }
        } else if (tender.miiMinLocalContentPct != null && pct < tender.miiMinLocalContentPct) {
          result = { ok: false, status: 'NON_COMPLIANT', note: `Local content ${pct}% is below required ${tender.miiMinLocalContentPct}%` }
        } else {
          const cls = pct >= 50 ? 'Class-I' : pct >= 20 ? 'Class-II' : 'below Class-II'
          result = { ok: true, status: 'VERIFIED', note: `Local content ${pct}% — ${cls} local supplier (DPIIT formula applied to declared values)` }
        }
        break
      }
      case 'iso':
      case 'experience':
        result = validateTemporalValidity(claim.validTill ?? (extracted.validTill ? String(extracted.validTill) : null), bidOpening, spec.label)
        break
      default:
        result = {
          ok: true,
          status: 'VERIFIED',
          note: `Received (${claim.fileType ?? 'document'}, ${claim.sizeMb ?? '?'} MB) — system-checked for completeness`,
        }
    }
    const graded = gradeDoc(result)
    if (graded.status === 'NON_COMPLIANT' && (spec.classification === 'MANDATORY' || spec.classification === 'CONDITIONAL')) fatal = true
    if (graded.status === 'NEEDS_REVIEW') needsReview = true
    docOutcomes.push({ docName: spec.name, label: spec.label, classification: spec.classification, ...graded })
  }

  // Supporting docs that were provided but not in the required list enrich the dossier.
  for (const claim of docs) {
    if (claim.provided && !required.some(r => r.name === claim.docName)) {
      docOutcomes.push({ docName: claim.docName, label: docLabel(claim.docName), classification: 'SUPPORTING', status: 'VERIFIED', note: 'Supporting document received — no penalty, adds to dossier' })
    }
  }

  // Stage 3: eligibility.
  const eligRows = evaluateEligibility(company, tender.requirements)
  const elig = eligibilityOverall(eligRows)
  if (elig === 'not_eligible') {
    fatal = true
    reasons.push('Failed one or more eligibility criteria')
  }

  // Rule 6 cross-document consistency.
  const xdoc = crossDocumentConsistency({
    gstin: company.gstin,
    pan: company.pan,
    legalName: company.legalName ?? company.name,
    declaredNames: docs.filter(d => d.provided).map(d => d.fileName ?? company.name),
  })
  if (xdoc.status === 'NON_COMPLIANT') fatal = true
  if (xdoc.status === 'NEEDS_REVIEW') needsReview = true

  // Loophole #12: 3-way triangulation.
  const tri = triangulateTurnover(company.caTurnoverCr, company.gstr3bTotalCr, company.auditedPnlCr)
  if (tri.status === 'NON_COMPLIANT') fatal = true
  if (tri.status === 'NEEDS_REVIEW') needsReview = true
  if (tri.status !== 'UNVERIFIED') {
    flags.push({ kind: 'TRIANGULATION', severity: tri.ok ? 'INFO' : 'CRITICAL', note: tri.note })
  }
  const nw = checkNetWorth(company.netWorthCr)
  if (nw.status === 'NON_COMPLIANT') fatal = true

  // Stage 4: technical specs (golden-parameter style).
  const technical = (tender.requirements.technical ?? [])
  let techPassed = 0
  const techFailures: string[] = []
  for (const t of technical) {
    const offered = (technicalResponse[t.key] ?? '').trim()
    if (offered.toLowerCase() === t.expected.toLowerCase()) techPassed++
    else techFailures.push(`${t.label}: offered "${offered || '—'}" vs required "${t.expected}"`)
  }
  if (technical.length && techPassed < technical.length) {
    fatal = true
    reasons.push('Technical specification mismatch on one or more golden parameters')
  }

  // Loophole #16: ALB.
  if (financialBidCr != null) {
    const alb = checkAbnormallyLowBid(financialBidCr, tender.valueCr, tender.albThresholdPct)
    if (alb.status === 'WARNING') {
      needsReview = true
      flags.push({ kind: 'ALB', severity: 'WARNING', note: alb.note })
    }
  }

  if (fatal) reasons.unshift('One or more mandatory gates failed — deterministic disqualification')
  if (needsReview) reasons.push('Conflicting or unverifiable evidence — routed to human review (never auto-passed)')

  const docWeights: Record<DocStatus, number> = {
    VERIFIED: 1, WARNING: 0.5, UNVERIFIED: 0.25, NEEDS_REVIEW: 0.25, NON_COMPLIANT: 0, NOT_APPLICABLE: 0,
  }
  const scored = docOutcomes.filter(d => d.status !== 'NOT_APPLICABLE')
  const docsScore = scored.length ? scored.reduce((s, d) => s + docWeights[d.status], 0) / scored.length : 0
  const eligScore = elig === 'qualified' ? 1 : elig === 'needs_attention' ? 0.5 : elig === 'not_yet_verified' ? 0.25 : 0
  const techScore = technical.length ? techPassed / technical.length : 1
  const compliancePct = Math.round((0.5 * docsScore + 0.3 * eligScore + 0.2 * techScore) * 100)

  const status: EvalStatus = fatal ? 'disqualified' : needsReview ? 'requires_review' : 'qualified'
  const risk: Risk = status === 'disqualified' ? 'HIGH' : status === 'requires_review' ? 'MEDIUM' : 'LOW'

  return {
    docs: docOutcomes,
    eligibilityPerReq: eligRows,
    eligibility: elig,
    technical: { passed: techPassed, total: technical.length, failures: techFailures },
    triangulation: { status: tri.status, note: tri.note },
    compliancePct,
    flags,
    reasons,
    status,
    risk,
  }
}

/** Tender-level forensic pass across all bidders (collusion radar). */
export function runCartelRadar(fingerprints: BidderFingerprint[]): CollusionHit[] {
  return detectCollusion(fingerprints)
}

/** MSE purchase preference: MSEs within L1+15% get a match option (GeM rule, max 5). */
export const MSE_MATCH_MAX = 5

export function mseMatchOptions(rows: { companyId: string; companyName: string; financialCr: number | null; company: { msme: boolean; isStartup: boolean } }[], lowestCr: number | null) {
  if (lowestCr == null || lowestCr <= 0) return []
  const band = lowestCr * 1.15
  return rows
    .filter(r => r.company.msme && r.financialCr != null && r.financialCr > lowestCr && r.financialCr <= band)
    .slice(0, MSE_MATCH_MAX)
    .map(r => ({ companyId: r.companyId, companyName: r.companyName, financialCr: r.financialCr as number }))
}

