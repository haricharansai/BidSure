// BidSure deterministic reconciliation & forensic detectors.
// Pure TypeScript: no DB, no network, no LLM.

import type { DocStatus } from './validators'

export interface ReconciliationResult {
  ok: boolean
  status: DocStatus
  note: string
  variancePct?: number
}

/**
 * Loophole #12 — 3-way turnover triangulation:
 * |CA certified − Σ GSTR-3B| / CA certified ≤ 10% tolerance.
 * Conflict between sources routes to human review, never a silent pass.
 */
export function triangulateTurnover(caCr: number | null | undefined, gstr3bCr: number | null | undefined, auditedPnlCr?: number | null, tolerancePct = 10): ReconciliationResult {
  if (caCr == null && gstr3bCr == null) {
    return { ok: true, status: 'UNVERIFIED', note: 'No turnover figures declared — triangulation not possible' }
  }
  if (caCr == null || gstr3bCr == null) {
    return { ok: false, status: 'NEEDS_REVIEW', note: 'Only one turnover source declared (CA certificate or GSTR-3B) — cross-verification impossible' }
  }
  if (caCr <= 0) {
    return { ok: false, status: 'NON_COMPLIANT', note: 'CA-certified turnover must be positive' }
  }
  const variancePct = (Math.abs(caCr - gstr3bCr) / caCr) * 100
  const pnlNote = auditedPnlCr != null ? ` (audited P&L ₹${auditedPnlCr} Cr)` : ''
  if (variancePct > tolerancePct) {
    return {
      ok: false,
      status: 'NON_COMPLIANT',
      note: `Critical financial anomaly: turnover variance ${variancePct.toFixed(1)}% exceeds ${tolerancePct}% tolerance (CA ₹${caCr} Cr vs GSTR-3B ₹${gstr3bCr} Cr)${pnlNote}`,
      variancePct,
    }
  }
  return {
    ok: true,
    status: 'VERIFIED',
    note: `Turnover triangulation within tolerance: ${variancePct.toFixed(1)}% variance across CA / GSTR-3B${pnlNote}`,
    variancePct,
  }
}

/** Loophole #14 — negative net worth masking. */
export function checkNetWorth(netWorthCr: number | null | undefined, insolvencyFlag = false): ReconciliationResult {
  if (netWorthCr == null) return { ok: true, status: 'UNVERIFIED', note: 'Net worth not declared' }
  if (insolvencyFlag) return { ok: false, status: 'NON_COMPLIANT', note: 'Active IBC/NCLT insolvency proceedings declared' }
  if (netWorthCr <= 0) {
    return { ok: false, status: 'NON_COMPLIANT', note: `Net worth ₹${netWorthCr} Cr is not positive (capital + reserves − accumulated losses)` }
  }
  return { ok: true, status: 'VERIFIED', note: `Positive net worth ₹${netWorthCr} Cr` }
}

export interface BidderFingerprint {
  companyId: string
  companyName: string
  directorDins: string[]
  dscTokenId?: string | null
  submittedAt?: string | null
}

export interface CollusionHit {
  kind: 'SHARED_DIN' | 'SHARED_DSC' | 'SYNCED_TIMESTAMPS'
  companies: [string, string]
  detail: string
}

/**
 * Loophole #19 — Cartel Radar: shared director DINs, identical DSC token
 * serials, or submission timestamps within 2 minutes across competing bidders.
 */
export function detectCollusion(bidders: BidderFingerprint[], timestampWindowMs = 2 * 60 * 1000): CollusionHit[] {
  const hits: CollusionHit[] = []
  for (let i = 0; i < bidders.length; i++) {
    for (let j = i + 1; j < bidders.length; j++) {
      const a = bidders[i]
      const b = bidders[j]
      const sharedDins = a.directorDins.filter(d => d && b.directorDins.includes(d))
      if (sharedDins.length) {
        hits.push({ kind: 'SHARED_DIN', companies: [a.companyName, b.companyName], detail: `Shared director DIN ${sharedDins.join(', ')}` })
      }
      if (a.dscTokenId && b.dscTokenId && a.dscTokenId === b.dscTokenId) {
        hits.push({ kind: 'SHARED_DSC', companies: [a.companyName, b.companyName], detail: `Identical DSC digital token (${a.dscTokenId})` })
      }
      if (a.submittedAt && b.submittedAt) {
        const delta = Math.abs(new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime())
        if (delta <= timestampWindowMs) {
          hits.push({ kind: 'SYNCED_TIMESTAMPS', companies: [a.companyName, b.companyName], detail: `Submissions ${Math.round(delta / 1000)}s apart (≤2 min window)` })
        }
      }
    }
  }
  return hits
}

/**
 * Loophole #16 — Abnormally Low Bidding: flag bids more than
 * `thresholdPct` (default 25%) below the engineering estimate.
 */
export function checkAbnormallyLowBid(amountCr: number, estimateCr: number | null, thresholdPct = 25): ReconciliationResult {
  if (estimateCr == null || estimateCr <= 0) return { ok: true, status: 'UNVERIFIED', note: 'No engineering estimate to benchmark ALB' }
  const belowPct = ((estimateCr - amountCr) / estimateCr) * 100
  if (belowPct > thresholdPct) {
    return {
      ok: false,
      status: 'WARNING',
      note: `Abnormally low bid: ${belowPct.toFixed(1)}% below estimate ₹${estimateCr} Cr (threshold ${thresholdPct}%) — price justification required`,
    }
  }
  return { ok: true, status: 'VERIFIED', note: `Bid within ALB band (${belowPct.toFixed(1)}% below estimate)` }
}

/** Rule 7 — normalize Crores / Lakhs / absolute INR into Crores. */
export function normalizeToCr(value: number, unit: 'CR' | 'LAKH' | 'INR'): number {
  if (unit === 'CR') return value
  if (unit === 'LAKH') return value / 100
  return value / 1e7
}
