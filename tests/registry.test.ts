// Mock registry cross-check tests (plan §18: lookup / match / mismatch).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crossCheckGst, crossCheckPan, crossCheckUdyam, type RegistryRecord } from '../lib/engine/registry.ts'

const GST_ENTRY: RegistryRecord = {
  registry: 'GSTN',
  key: '07AAECN1234E1ZP',
  status: 'ACTIVE',
  data: { legalName: 'Nexora Systems Private Limited', tradeName: 'Nexora Systems', isMock: true },
}

const FRAUD_ENTRY: RegistryRecord = {
  registry: 'GSTN',
  key: '07AAFCX9012G1ZQ',
  status: 'CANCELLED',
  data: { legalName: 'XYZ Traders Fraud Enterprises', isMock: true },
}

test('GST registry: clean extracted data matches everything', () => {
  const checks = crossCheckGst('gstin', { gstin: '07AAECN1234E1ZP', legalName: 'Nexora Systems Private Limited' }, GST_ENTRY)
  const byId = Object.fromEntries(checks.map(c => [c.checkId, c]))
  assert.equal(byId.GSTIN_REGISTRY_FOUND.status, 'VERIFIED')
  assert.equal(byId.GSTIN_REGISTRY_STATUS.status, 'VERIFIED')
  assert.equal(byId.GSTIN_REGISTRY_LEGAL_NAME.status, 'VERIFIED')
  assert.ok(checks.every(c => c.mock === true))
})

test('GST registry: legal name MISMATCH is NON_COMPLIANT with note', () => {
  const checks = crossCheckGst('gstin', { gstin: FRAUD_ENTRY.key, legalName: 'XYZ Trading Company' }, FRAUD_ENTRY)
  const byId = Object.fromEntries(checks.map(c => [c.checkId, c]))
  assert.equal(byId.GSTIN_REGISTRY_STATUS.status, 'NON_COMPLIANT')
  assert.equal(byId.GSTIN_REGISTRY_LEGAL_NAME.status, 'NON_COMPLIANT')
  assert.match(byId.GSTIN_REGISTRY_LEGAL_NAME.note, /MISMATCH/)
})

test('GST registry: not found routes to NEEDS_REVIEW (never auto-pass)', () => {
  const checks = crossCheckGst('gstin', { gstin: '07UNKNOWN0000Z1Z9' }, null)
  assert.equal(checks[0].checkId, 'GSTIN_REGISTRY_FOUND')
  assert.equal(checks[0].status, 'NEEDS_REVIEW')
})

test('PAN registry: income-tax status mismatch fails the bid', () => {
  const checks = crossCheckPan('pan', { pan: 'AAFCX9012G', name: 'XYZ Trading' },
    { registry: 'PAN', key: 'AAFCX9012G', status: 'CANCELLED', data: { name: 'XYZ Traders Fraud Enterprises' } },
    { registry: 'INCOME_TAX', key: 'AAFCX9012G', status: 'NON_FILER', data: { filedReturns3y: false } })
  const byId = Object.fromEntries(checks.map(c => [c.checkId, c]))
  assert.equal(byId.PAN_REGISTRY_STATUS.status, 'NON_COMPLIANT')
  assert.equal(byId.INCOME_TAX_RETURN_STATUS.status, 'NON_COMPLIANT')
})

test('Udyam registry: NIC mismatch routes to review, not silent pass', () => {
  const checks = crossCheckUdyam('udyam', { udyamNo: 'UDYAM-07-00-0012345', enterpriseName: 'ABC Technologies Private Limited', nicCode: '26' },
    { registry: 'UDYAM', key: 'UDYAM-07-00-0012345', status: 'ACTIVE', data: { enterpriseName: 'ABC Technologies Private Limited', nicCode: '27' } })
  const byId = Object.fromEntries(checks.map(c => [c.checkId, c]))
  assert.equal(byId.UDYAM_REGISTRY_FOUND.status, 'VERIFIED')
  assert.equal(byId.UDYAM_REGISTRY_NIC.status, 'NEEDS_REVIEW')
})


