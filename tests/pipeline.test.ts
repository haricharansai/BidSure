// Demo-scenario pipeline tests (plan §18 #13-15 + replacement semantics).
// Uses the pure engine with injected registry checks — the same shape the
// authoritative evaluation produces from seeded MOCK registry data.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateSubmission, type CompanyProfile, type TenderContext, type SubmittedDocClaim } from '../lib/engine/index.ts'
import { crossCheckGst, type RegistryRecord } from '../lib/engine/registry.ts'
import { mockExtract } from '../lib/server/extraction/mock-extractor.ts'

function tender(): TenderContext {
  return {
    id: 'GOV/TEST/2026/T01',
    bidOpeningDate: new Date('2026-09-01T10:00:00Z'),
    bidValidityDays: 30,
    emdRequired: false,
    valueCr: 2,
    miiMinLocalContentPct: 50,
    albThresholdPct: 25,
    requirements: {
      eligibility: [{ key: 'minTurnoverCr', label: 'Min turnover', value: 2 }],
      technical: [{ key: 'ram', label: 'RAM', expected: '16 GB DDR4' }],
      requiredDocs: [
        { name: 'pan', label: 'PAN card', classification: 'MANDATORY' },
        { name: 'gstin', label: 'GST certificate', classification: 'MANDATORY' },
        { name: 'iso', label: 'ISO certification', classification: 'SUPPORTING' },
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
    turnoverCr: 24,
    yearsExperience: 10,
    msme: false,
    iso: true,
    isReseller: false,
    isStartup: false,
    directorDins: [],
    ...overrides,
  } as CompanyProfile
}

const CLEAN_GST_ENTRY: RegistryRecord = {
  registry: 'GSTN', key: '07AAECN1234E1ZP', status: 'ACTIVE',
  data: { legalName: 'Test Seller Private Limited' },
}

function gstDoc(fields: Record<string, unknown>, entry: RegistryRecord | null): SubmittedDocClaim {
  return {
    docName: 'gstin',
    provided: true,
    fileName: 'gst-cert.txt',
    extracted: fields,
    registryChecks: crossCheckGst('gstin', fields, entry),
  }
}

test('SCENARIO 1 — CLEAN bid: all registry matches → QUALIFIED, LOW risk', () => {
  const docs: SubmittedDocClaim[] = [
    { docName: 'pan', provided: true, extracted: { pan: 'AAECN1234E', name: 'Test Seller Private Limited' }, fileName: 'Test Seller Private Limited.pdf' },
    { docName: 'gstin', provided: true, fileName: 'Test Seller Private Limited.pdf', extracted: { gstin: '07AAECN1234E1ZP', legalName: 'Test Seller Private Limited' },
      registryChecks: crossCheckGst('gstin', { gstin: '07AAECN1234E1ZP', legalName: 'Test Seller Private Limited' }, CLEAN_GST_ENTRY) },
  ]
  const out = evaluateSubmission(tender(), company(), docs, { ram: '16 GB DDR4' }, 1.8)
  assert.equal(out.status, 'qualified')
  assert.equal(out.risk, 'LOW')
  const gst = out.docs.find(d => d.docName === 'gstin')
  assert.equal(gst?.status, 'VERIFIED')
  assert.ok(out.verificationChecks.some(c => c.checkId === 'GSTIN_REGISTRY_STATUS' && c.status === 'VERIFIED' && c.mock))
})

test('SCENARIO 2 — NON-COMPLIANT bid: GSTIN exists but name MISMATCH + CANCELLED status → disqualified, HIGH risk', () => {
  const fraudEntry: RegistryRecord = { registry: 'GSTN', key: '07AAECN1234E1ZP', status: 'CANCELLED', data: { legalName: 'Fraud Enterprises' } }
  const fields = { gstin: '07AAECN1234E1ZP', legalName: 'Test Seller Private Limited' }
  const docs: SubmittedDocClaim[] = [
    { docName: 'pan', provided: true, extracted: { pan: 'AAECN1234E', name: 'Test Seller Private Limited' }, fileName: 'Test Seller Private Limited.pdf' },
    { docName: 'gstin', provided: true, fileName: 'gst-cert.txt', extracted: fields, registryChecks: crossCheckGst('gstin', fields, fraudEntry) },
  ]
  const out = evaluateSubmission(tender(), company(), docs, { ram: '16 GB DDR4' }, 1.8)
  assert.equal(out.status, 'disqualified')
  assert.equal(out.risk, 'HIGH')
  const gst = out.docs.find(d => d.docName === 'gstin')
  assert.equal(gst?.status, 'NON_COMPLIANT')
  assert.ok(gst?.checks.some(c => c.checkId === 'GSTIN_REGISTRY_LEGAL_NAME' && c.status === 'NON_COMPLIANT'))
  assert.ok(out.verificationChecks.some(c => c.checkId === 'GSTIN_REGISTRY_STATUS' && c.status === 'NON_COMPLIANT'))
})

test('SCENARIO 3 — NEEDS REVIEW: registry record missing → review, never auto-pass', () => {
  const fields = { gstin: '07UNMATCHED0000Z1Z9', legalName: 'Test Seller Private Limited' }
  const docs: SubmittedDocClaim[] = [
    { docName: 'pan', provided: true, extracted: { pan: 'AAECN1234E', name: 'Test Seller Private Limited' }, fileName: 'Test Seller Private Limited.pdf' },
    { docName: 'gstin', provided: true, fileName: 'gst-cert.txt', extracted: fields, registryChecks: crossCheckGst('gstin', fields, null) },
  ]
  const out = evaluateSubmission(tender(), company(), docs, { ram: '16 GB DDR4' }, 1.8)
  assert.equal(out.status, 'requires_review')
  assert.equal(out.risk, 'MEDIUM')
  assert.equal(out.docs.find(d => d.docName === 'gstin')?.status, 'NEEDS_REVIEW')
})

test('Replacement semantics: old checks are not carried over — fresh extraction replaces stale data', async () => {
  // Simulate: first upload extracts a stale GSTIN; replacement document extracts a new one.
  const stale = await mockExtract({ docType: 'gstin', buffer: Buffer.from('BIDSURE-MOCK-EXTRACT {"gstin":"07OLD0000000Z1Z0","legalName":"Old Name"}'), mimeType: 'text/plain', fileName: 'old.txt' })
  const fresh = await mockExtract({ docType: 'gstin', buffer: Buffer.from('BIDSURE-MOCK-EXTRACT {"gstin":"07AAECN1234E1ZP","legalName":"Test Seller Private Limited"}'), mimeType: 'text/plain', fileName: 'new.txt' })
  assert.equal(stale.fields.gstin, '07OLD0000000Z1Z0')
  assert.equal(fresh.fields.gstin, '07AAECN1234E1ZP')
  assert.notDeepEqual(stale.fields, fresh.fields)
})





