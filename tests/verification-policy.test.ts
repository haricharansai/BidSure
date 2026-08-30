// Verification policy tests (plan §14, §19-§26, §37 rules).
// Pure functions only — no DB, no NODE_ENV mutation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classificationMismatchCheck, identityChecksFor, type RegistryRecord } from '../lib/engine/registry.ts'
import { evaluateSubmission, type CompanyProfile, type TenderContext, type SubmittedDocClaim } from '../lib/engine/index.ts'
import { productionMockCap } from '../lib/server/registry/provider.ts'

function tender(minTurnoverCr: number): TenderContext {
  return {
    id: 'GOV/TEST/2026/T02',
    bidOpeningDate: new Date('2026-09-01T10:00:00Z'),
    bidValidityDays: 30,
    emdRequired: false,
    valueCr: 2,
    albThresholdPct: 25,
    requirements: {
      eligibility: [{ key: 'minTurnoverCr', label: 'Min turnover', value: minTurnoverCr }],
      requiredDocs: [
        { name: 'turnover', label: 'CA turnover certificate', classification: 'MANDATORY' },
      ],
    },
  }
}

function company(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    id: 'com-test',
    name: 'Test Seller',
    legalName: 'Test Seller Private Limited',
    gstin: '07AAECN1234E1ZP',
    pan: 'AAECN1234E',
    turnoverCr: 30,
    yearsExperience: 10,
    msme: false,
    iso: false,
    isReseller: false,
    isStartup: false,
    directorDins: [],
    ...overrides,
  } as CompanyProfile
}

function turnoverDoc(turnoverCr: number, overrides: Partial<SubmittedDocClaim> = {}): SubmittedDocClaim {
  return {
    docName: 'turnover',
    provided: true,
    fileName: 'Test Seller Private Limited.pdf',
    extracted: { udin: '261234567890123456', certDate: '2026-08-28', turnoverCr },
    ...overrides,
  }
}

// --- Three-way identity chain (plan §20-§21) ---

test('identity: matching GSTIN → VERIFIED, mismatching → NEEDS_REVIEW (never auto-fail)', () => {
  const ok = identityChecksFor('gstin', { gstin: '07AAECN1234E1ZP' }, { gstin: '07AAECN1234E1ZP' })
  const row = ok.find(c => c.checkId === 'IDENTITY_GSTIN')
  assert.ok(row)
  assert.equal(row.status, 'VERIFIED')
  assert.equal(row.mock, false, 'company profile is not the authoritative registry')
  assert.equal(row.stage, 'CROSS_DOC')

  const bad = identityChecksFor('gstin', { gstin: '07AAAAA0000A1Z5' }, { gstin: '07AAECN1234E1ZP' })
  const badRow = bad.find(c => c.checkId === 'IDENTITY_GSTIN')
  assert.ok(badRow)
  assert.equal(badRow.status, 'NEEDS_REVIEW')
})

test('identity: legal name similarity < 85% → NEEDS_REVIEW with similarity evidence', () => {
  const rows = identityChecksFor(
    'gstin',
    { gstin: '07AAECN1234E1ZP', legalName: 'Completely Different Enterprises LLP' },
    { gstin: '07AAECN1234E1ZP', legalName: 'Test Seller Private Limited' },
  )
  const nameRow = rows.find(c => c.checkId === 'IDENTITY_LEGAL_NAME')
  assert.ok(nameRow)
  assert.equal(nameRow.status, 'NEEDS_REVIEW')
  const found = JSON.parse(nameRow.foundJson) as { similarity: number }
  assert.ok(found.similarity < 85)
})

test('identity: PAN match/mismatch; one-sided data produces no check (no guessing)', () => {
  assert.equal(identityChecksFor('pan', { pan: 'AAECN1234E' }, { pan: 'AAECN1234E' })[0]?.status, 'VERIFIED')
  assert.equal(identityChecksFor('pan', { pan: 'AABCA5678F' }, { pan: 'AAECN1234E' })[0]?.status, 'NEEDS_REVIEW')
  // company profile lacks PAN → no fabricated check
  assert.equal(identityChecksFor('pan', { pan: 'AAECN1234E' }, {}).length, 0)
})

// --- Turnover verification (plan §22-§25) ---

test('turnover: 24.2 >= 20 → TURNOVER_ELIGIBILITY VERIFIED, qualified', () => {
  const out = evaluateSubmission(tender(20), company({ turnoverCr: 24.2 }), [turnoverDoc(24.2)], {}, 1.5)
  const c = out.verificationChecks.find(x => x.checkId === 'TURNOVER_ELIGIBILITY')
  assert.ok(c)
  assert.equal(c.status, 'VERIFIED')
  assert.equal(c.mock, false)
  assert.equal(out.status, 'qualified')
})

test('turnover: 24.2 < 30 → TURNOVER_ELIGIBILITY NON_COMPLIANT, disqualified (deterministic)', () => {
  const out = evaluateSubmission(tender(30), company({ turnoverCr: 24.2 }), [turnoverDoc(24.2)], {}, 1.5)
  const c = out.verificationChecks.find(x => x.checkId === 'TURNOVER_ELIGIBILITY')
  assert.ok(c)
  assert.equal(c.status, 'NON_COMPLIANT')
  assert.equal(out.status, 'disqualified')
  assert.equal(out.risk, 'HIGH')
})

test('turnover: document ≠ company declaration → TURNOVER_DECLARATION_MATCH NEEDS_REVIEW (review, not rejection)', () => {
  const out = evaluateSubmission(tender(20), company({ turnoverCr: 30 }), [turnoverDoc(24.2)], {}, 1.5)
  const c = out.verificationChecks.find(x => x.checkId === 'TURNOVER_DECLARATION_MATCH')
  assert.ok(c)
  assert.equal(c.status, 'NEEDS_REVIEW')
  const found = JSON.parse(c.foundJson) as { extractedTurnoverCr: number; companyTurnoverCr: number }
  assert.equal(found.extractedTurnoverCr, 24.2)
  assert.equal(found.companyTurnoverCr, 30)
  assert.equal(out.status, 'requires_review')
})

test('turnover precedence: extracted figure overrides declared for eligibility (plan §25)', () => {
  // Declared 10 Cr (would FAIL a 12 Cr minimum), document shows 24.2 Cr → PASS.
  const out = evaluateSubmission(tender(12), company({ turnoverCr: 10 }), [turnoverDoc(24.2)], {}, 1.5)
  const row = out.eligibilityPerReq.find(r => r.key === 'minTurnoverCr')
  assert.ok(row)
  assert.equal(row.status, 'PASS')
  assert.match(row.declared, /24\.2/)
  // Declaration conflict is still surfaced for the officer.
  assert.ok(out.verificationChecks.some(c => c.checkId === 'TURNOVER_DECLARATION_MATCH' && c.status === 'NEEDS_REVIEW'))
  assert.equal(out.status, 'requires_review')
})

// --- Extraction-failure safety (plan §26) ---

test('extraction FAILED on a provided doc → NEEDS_REVIEW, never automatic rejection', () => {
  const out = evaluateSubmission(tender(20), company(), [turnoverDoc(0, { extracted: {}, extractionStatus: 'FAILED' })], {}, 1.5)
  const doc = out.docs.find(d => d.docName === 'turnover')
  assert.ok(doc)
  assert.equal(doc.status, 'NEEDS_REVIEW')
  assert.match(doc.note, /extraction could not read/)
  assert.equal(out.status, 'requires_review')
})

// --- Classification mismatch (plan §14) ---

test('DOC_TYPE_MISMATCH: mismatch → NEEDS_REVIEW; same type/generic → no check', () => {
  const row = classificationMismatchCheck('gstin', {
    docType: 'pan',
    confidence: 0.9,
    evidence: [{ pattern: 'PAN', excerpt: 'PAN: AAECN1234E' }],
  })
  assert.ok(row)
  assert.equal(row.checkId, 'DOC_TYPE_MISMATCH')
  assert.equal(row.status, 'NEEDS_REVIEW')
  assert.equal(row.mock, false)
  assert.equal(classificationMismatchCheck('gstin', { docType: 'gstin', confidence: 0.9, evidence: [] }), null)
  assert.equal(classificationMismatchCheck('gstin', { docType: 'generic', confidence: 0, evidence: [] }), null)
})

// --- Production mock safety (plan §19) ---

test('mock registry cap: production → capped; dev/override/authoritative → untouched', () => {
  const mock = { name: 'MOCK_REGISTRY', authoritative: false }
  assert.equal(productionMockCap(mock, { NODE_ENV: 'production' }), true)
  assert.equal(productionMockCap(mock, { NODE_ENV: 'production', BIDSURE_ALLOW_MOCK_REGISTRY: '1' }), false)
  assert.equal(productionMockCap(mock, { NODE_ENV: 'development' }), false)
  const agg = { name: 'AGGREGATOR', authoritative: true }
  assert.equal(productionMockCap(agg, { NODE_ENV: 'production' }), false)
})
