// Engine unit tests (pure functions, no DB). Run: npm test
import test from 'node:test'
import assert from 'node:assert/strict'

import { validateGstin, validatePan, validateUdin, validateUdyam, validateBankGuarantee, crossDocumentConsistency } from '../lib/engine/validators.ts'
import { triangulateTurnover, checkNetWorth, detectCollusion, checkAbnormallyLowBid } from '../lib/engine/reconciliation.ts'
import { evaluateSubmission, evaluateEligibility, conditionApplies, mseMatchOptions } from '../lib/engine/index.ts'

// Seed's base-36 Luhn GSTIN builder (checksum-valid).
const B36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
function gstinFor(stateCode: string, pan: string, entityCode = '1'): string {
  const body = `${stateCode}${pan}${entityCode}Z`
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const factor = i % 2 === 0 ? 2 : 1
    const product = B36.indexOf(body[i]) * factor
    sum += Math.floor(product / 36) + (product % 36)
  }
  return body + B36[(36 - (sum % 36)) % 36]
}

test('GSTIN: checksum-valid GSTIN passes and extracts PAN', () => {
  const g = gstinFor('07', 'AAECN1234E')
  const r = validateGstin(g)
  assert.equal(r.ok, true, r.note)
  assert.equal(r.status, 'VERIFIED')
  assert.equal((r.extracted as { pan?: string }).pan ?? '', 'AAECN1234E')
})

test('GSTIN: bad check digit fails', () => {
  const g = gstinFor('07', 'AAECN1234E')
  const bad = g.slice(0, 14) + (g[14] === 'P' ? 'Q' : 'P')
  assert.equal(validateGstin(bad).ok, false)
})

test('PAN: structure + recognised entity class', () => {
  assert.equal(validatePan('AAECN1234E').ok, true) // 4th char C = Company
  assert.equal(validatePan('AAECN1234').ok, false) // structure invalid
  const bad = validatePan('AAEXN1234E') // X is not a recognised entity class
  assert.equal(bad.ok, false)
})

test('UDIN: 18 digits, cert-year must match document date', () => {
  const ok = validateUdin('261234567890123456', '2026-04-10', new Date('2026-06-01T00:00:00Z'))
  assert.equal(ok.status, 'NEEDS_REVIEW', ok.note) // >15 days window is reviewable, not auto-pass
  const badYear = validateUdin('251234567890123456', '2026-04-10', new Date('2026-06-01T00:00:00Z'))
  assert.equal(badYear.ok, false)
})

test('Udyam: trader trap — NIC 45/46/47 ineligible for MSME EMD exemption', () => {
  const r = validateUdyam('UDYAM-07-00-0098765', '46', true)
  assert.equal(r.ok, false)
  assert.match(r.note, /trader|trade/i)
  const fine = validateUdyam('UDYAM-07-00-0012345', '26', true)
  assert.equal(fine.ok, true)
})

test('Bank guarantee: must cover bid validity + claim period >= 45 days', () => {
  const bidOpening = new Date('2026-09-01T00:00:00Z')
  // requiredUntil = 2026-10-01; claimDays = validTill - requiredUntil
  const good = validateBankGuarantee({ validTillISO: '2027-06-01T00:00:00Z', bidOpeningDate: bidOpening, bidValidityDays: 30 })
  assert.equal(good.ok, true, good.note)
  const shortClaim = validateBankGuarantee({ validTillISO: '2026-10-15T00:00:00Z', bidOpeningDate: bidOpening, bidValidityDays: 30 }) // 14-day claim period
  assert.equal(shortClaim.ok, false)
  assert.match(shortClaim.note, /claim period/)
  const expired = validateBankGuarantee({ validTillISO: '2026-08-01T00:00:00Z', bidOpeningDate: bidOpening, bidValidityDays: 30 })
  assert.equal(expired.ok, false)
})

test('Cross-doc: GSTIN[3..12] must equal PAN; names fuzzy-match >= 85%', () => {
  const ok = crossDocumentConsistency({ gstin: gstinFor('07', 'AAECN1234E'), pan: 'AAECN1234E', legalName: 'Nexora Systems Private Limited', declaredNames: ['Nexora Systems Pvt Ltd'] })
  assert.notEqual(ok.status, 'NON_COMPLIANT')
  const mismatch = crossDocumentConsistency({ gstin: gstinFor('07', 'AAECN1234E'), pan: 'AAGCA5678F', legalName: 'Nexora Systems Private Limited', declaredNames: ['Nexora Systems Private Limited'] })
  assert.equal(mismatch.status, 'NON_COMPLIANT')
})

test('Triangulation: |CA - GSTR3B|/CA <= 10%', () => {
  assert.equal(triangulateTurnover(24.2, 23.8, 23.5).ok, true)
  const bad = triangulateTurnover(9.8, 6.1, 7.2)
  assert.equal(bad.ok, false)
  assert.equal(bad.status, 'NON_COMPLIANT')
})

test('Net worth must be positive', () => {
  assert.equal(checkNetWorth(6.5).ok, true)
  assert.equal(checkNetWorth(-0.4).status, 'NON_COMPLIANT')
})

test('Cartel radar: shared DIN, identical DSC, synced timestamps', () => {
  const hits = detectCollusion([
    { companyId: 'a', companyName: 'A', directorDins: ['DIN1', 'DIN2'], dscTokenId: 'T1', submittedAt: '2026-01-01T00:00:00Z' },
    { companyId: 'b', companyName: 'B', directorDins: ['DIN2'], dscTokenId: 'T1', submittedAt: '2026-01-01T00:00:30Z' },
    { companyId: 'c', companyName: 'C', directorDins: ['DIN3'], dscTokenId: 'T3', submittedAt: '2026-01-01T05:00:00Z' },
  ])
  const kinds = hits.map(h => h.kind).sort()
  assert.deepEqual(kinds, ['SHARED_DIN', 'SHARED_DSC', 'SYNCED_TIMESTAMPS'])
  assert.ok(!hits.some(h => h.companies.includes('C') && (h.companies.includes('A') || h.companies.includes('B'))))
})

test('ALB: flag bids beyond threshold below estimate', () => {
  assert.equal(checkAbnormallyLowBid(1.2, 1.5, 25).ok, true)
  const alb = checkAbnormallyLowBid(0.9, 1.5, 25)
  assert.equal(alb.status, 'WARNING')
})

test('MSE match options: L1+15% band, max 5', () => {
  const rows = [
    { companyId: 'l1', companyName: 'L1', financialCr: 1.0, company: { msme: false, isStartup: false } },
    { companyId: 'm1', companyName: 'M1', financialCr: 1.10, company: { msme: true, isStartup: false } },
    { companyId: 'm2', companyName: 'M2', financialCr: 1.16, company: { msme: true, isStartup: false } },
    { companyId: 'm3', companyName: 'M3', financialCr: 1.05, company: { msme: true, isStartup: false } },
    { companyId: 'm4', companyName: 'M4', financialCr: 1.08, company: { msme: true, isStartup: false } },
    { companyId: 'm5', companyName: 'M5', financialCr: 1.12, company: { msme: true, isStartup: false } },
    { companyId: 'm6', companyName: 'M6', financialCr: 1.14, company: { msme: true, isStartup: false } },
  ]
  const opts = mseMatchOptions(rows, 1.0)
  assert.equal(opts.length, 5) // capped at 5
  assert.ok(!opts.some(o => o.companyId === 'm2')) // 1.16 > 1.15 band
  assert.ok(!opts.some(o => o.companyId === 'l1')) // L1 itself excluded
})

test('conditionApplies: claim-driven pre-applicability (loophole #4)', () => {
  const company = { id: 'x', name: 'X', msme: true, iso: false, isReseller: false, isStartup: false, directorDins: [] }
  assert.equal(conditionApplies('msme', company), true)
  assert.equal(conditionApplies('reseller', company), false)
  assert.equal(conditionApplies('startup', company), false)
})

function mkCompany(over: Partial<Parameters<typeof evaluateSubmission>[1]> = {}) {
  return {
    id: 'c1', name: 'TestCo', legalName: 'TestCo',
    gstin: gstinFor('07', 'AAECN1234E'), pan: 'AAECN1234E',
    turnoverCr: 24, yearsExperience: 10, msme: false, iso: true, isReseller: false,
    caTurnoverCr: 24.2, gstr3bTotalCr: 23.8, auditedPnlCr: 23.5, netWorthCr: 6.5,
    miiLocalContentPct: 62, isStartup: false, dscTokenId: 'DSC-1', directorDins: ['DIN1'],
    ...over,
  } as Parameters<typeof evaluateSubmission>[1]
}

const REQ = {
  eligibility: [{ key: 'minTurnoverCr', label: 'Min turnover', value: 2 }],
  technical: [{ key: 'spec1', label: 'RAM', expected: '16 GB' }],
  requiredDocs: [
    { name: 'pan', label: 'PAN card', classification: 'MANDATORY' as const },
    { name: 'gstin', label: 'GST certificate', classification: 'MANDATORY' as const },
    { name: 'emd', label: 'EMD BG', classification: 'CONDITIONAL' as const, conditionKey: 'emd' },
    { name: 'udyam', label: 'Udyam', classification: 'CONDITIONAL' as const, conditionKey: 'msme' },
  ],
}

function mkTender(over: Partial<Parameters<typeof evaluateSubmission>[0]> = {}) {
  return {
    id: 't1', bidOpeningDate: new Date(), bidValidityDays: 30, emdRequired: true,
    valueCr: 1.5, miiMinLocalContentPct: null, albThresholdPct: 25, requirements: REQ,
    ...over,
  } as Parameters<typeof evaluateSubmission>[0]
}

const CLEAN_DOCS = [
  { docName: 'pan', provided: true, extracted: { number: 'AAECN1234E' } },
  { docName: 'gstin', provided: true, extracted: { number: gstinFor('07', 'AAECN1234E') } },
  { docName: 'emd', provided: true, extracted: { validTill: '2030-06-01', claimPeriodDays: 60 } },
]

test('evaluateSubmission: clean bid qualifies', () => {
  const out = evaluateSubmission(mkTender(), mkCompany(), CLEAN_DOCS, { spec1: '16 GB' }, 1.4)
  assert.equal(out.status, 'qualified', out.reasons.join('; '))
  assert.equal(out.technical.passed, 1)
  assert.ok(out.compliancePct >= 90)
})

test('evaluateSubmission: missing mandatory doc disqualifies immediately', () => {
  const docs = CLEAN_DOCS.filter(d => d.docName !== 'pan')
  const out = evaluateSubmission(mkTender(), mkCompany(), docs, { spec1: '16 GB' }, 1.4)
  assert.equal(out.status, 'disqualified')
  const pan = out.docs.find(d => d.docName === 'pan')
  assert.equal(pan?.status, 'NON_COMPLIANT')
})

test('evaluateSubmission: trader-MSME EMD trap disqualifies', () => {
  const company = mkCompany({ msme: true, udyamNo: 'UDYAM-07-00-0098765', udyamNicCode: '46' })
  const docs = [...CLEAN_DOCS, { docName: 'udyam', provided: true, extracted: { number: 'UDYAM-07-00-0098765', nicCode: '46' } }]
  const out = evaluateSubmission(mkTender(), company, docs, { spec1: '16 GB' }, 1.4)
  assert.equal(out.status, 'disqualified')
  assert.ok(out.flags.some(f => f.kind === 'TRADER_MSME_TRAP'))
})

test('evaluateSubmission: technical mismatch disqualifies', () => {
  const out = evaluateSubmission(mkTender(), mkCompany(), CLEAN_DOCS, { spec1: '8 GB' }, 1.4)
  assert.equal(out.status, 'disqualified')
  assert.ok(out.reasons.some(r => /technical/i.test(r)))
})

test('evaluateSubmission: conflicting evidence routes to review, never auto-fail', () => {
  // UDIN cert date >15 days from bid opening -> NEEDS_REVIEW (not NON_COMPLIANT)
  const bidOpening = new Date(Date.now() - 60 * 24 * 3600 * 1000)
  const docs = [...CLEAN_DOCS, { docName: 'turnover', provided: true, extracted: { udin: '261234567890123456', certDate: new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10) } }]
  const reqs = { ...REQ, requiredDocs: [...REQ.requiredDocs, { name: 'turnover', label: 'CA cert', classification: 'MANDATORY' as const }] }
  const out = evaluateSubmission(mkTender({ requirements: reqs, bidOpeningDate: bidOpening }), mkCompany(), docs, { spec1: '16 GB' }, 1.4)
  const t = out.docs.find(d => d.docName === 'turnover')
  assert.equal(t?.status, 'NEEDS_REVIEW')
  assert.equal(out.status, 'requires_review')
})

test('evaluateSubmission: ALB flags abnormally low financial bid', () => {
  const out = evaluateSubmission(mkTender(), mkCompany(), CLEAN_DOCS, { spec1: '16 GB' }, 0.9)
  assert.ok(out.flags.some(f => f.kind === 'ALB'))
  assert.equal(out.status, 'requires_review')
})

test('evaluateEligibility: thresholds vs declared data', () => {
  const rows = evaluateEligibility(mkCompany({ turnoverCr: 1 }), REQ)
  assert.equal(rows[0].status, 'FAIL')
  const rows2 = evaluateEligibility(mkCompany(), REQ)
  assert.equal(rows2[0].status, 'PASS')
})
