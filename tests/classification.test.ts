// Real-document classification + field-harvesting tests (plan §10/§13).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyDocType, harvestFields, UNCERTAIN_THRESHOLD } from '../lib/server/extraction/harvest.ts'

const GST_TEXT = `GOVERNMENT OF INDIA\nGoods and Services Tax Registration Certificate\nGSTIN: 07AAECN1234E1ZP\nLegal Name: Nexora Systems Private Limited\nTrade Name: Nexora\nDate of registration: 12/04/2019\nStatus: Active`

const PAN_TEXT = `INCOME TAX DEPARTMENT\nPermanent Account Number Card\nName: Nexora Systems Private Limited\nPAN: AAECN1234E\nEntity type: Company`

const UDYAM_TEXT = `UDYAM REGISTRATION CERTIFICATE\nUdyam Registration Number: UDYAM-07-00-0098765\nName of enterprise: Nexora Systems Private Limited\nType of enterprise: Small\nNIC code: 26201\nDate of registration: 2021-06-15`

const TURNOVER_TEXT = `CHARTERED ACCOUNTANT CERTIFICATE\nUDIN: 261234567890123456\nMembership number: 012345\nDate of certification: 2026-04-10\nTurnover (audited as per books): Rs. 24.20 Cr\nFY: 2025-26`

test('classification: GST certificate text → gstin with evidence', () => {
  const c = classifyDocType(GST_TEXT)
  assert.equal(c.docType, 'gstin')
  assert.ok(c.confidence >= 0.9, `confidence ${c.confidence}`)
  assert.ok(c.evidence.length > 0)
  assert.ok(c.evidence.some(e => e.pattern.includes('GSTIN')))
  assert.ok(c.evidence[0].excerpt.length > 0)
})

test('classification: PAN card text → pan', () => {
  const c = classifyDocType(PAN_TEXT)
  assert.equal(c.docType, 'pan')
  assert.ok(c.confidence > 0)
})

test('classification: Udyam certificate → udyam', () => {
  const c = classifyDocType(UDYAM_TEXT)
  assert.equal(c.docType, 'udyam')
  assert.ok(c.confidence >= 0.9)
})

test('classification: CA turnover certificate → turnover', () => {
  const c = classifyDocType(TURNOVER_TEXT)
  assert.equal(c.docType, 'turnover')
  assert.ok(c.confidence >= 0.9)
})

test('classification: unrelated text → generic (mismatch check must not fire)', () => {
  const c = classifyDocType('Dear sir, please find attached our quotation for laptops.')
  assert.equal(c.docType, 'generic')
  assert.equal(c.confidence, 0)
  assert.equal(c.evidence.length, 0)
})

test('harvest: GST text yields GSTIN + legal name with per-field evidence', () => {
  const h = harvestFields('gstin', [{ page: 1, text: GST_TEXT }])
  assert.equal(h.fields.gstin, '07AAECN1234E1ZP')
  assert.equal(h.fields.legalName, 'Nexora Systems Private Limited')
  assert.equal(h.fields.stateCode, '07')
  const gstinEv = h.evidence.find(e => e.field === 'gstin')
  assert.ok(gstinEv, 'gstin evidence missing')
  assert.ok(gstinEv.excerpt.includes('07AAECN1234E1ZP'))
  assert.equal(gstinEv.page, 1)
  assert.ok(gstinEv.confidence >= UNCERTAIN_THRESHOLD)
  assert.equal(h.missing.length, 0)
})

test('harvest: turnover text yields UDIN + turnover figure + FY', () => {
  const h = harvestFields('turnover', [{ page: 1, text: TURNOVER_TEXT }])
  assert.equal(h.fields.udin, '261234567890123456')
  assert.equal(h.fields.turnoverCr, 24.2)
  assert.equal(h.fields.fy, '2025-26')
  const ev = h.evidence.find(e => e.field === 'turnoverCr')
  assert.ok(ev, 'turnover evidence missing')
  assert.ok(ev.excerpt.toLowerCase().includes('cr'))
})

test('harvest: missing required fields are reported, never guessed', () => {
  const h = harvestFields('gstin', [{ page: 1, text: 'Some random scanned garbage with no identifiers' }])
  assert.equal(h.fields.gstin, undefined)
  assert.ok(h.missing.includes('gstin'))
  assert.ok(h.missing.includes('legalName'))
})

test('harvest: page numbers preserved from multi-page input', () => {
  const h = harvestFields('gstin', [
    { page: 1, text: 'Annexure A — unrelated content' },
    { page: 2, text: 'Certificate page GSTIN: 07AAECN1234E1ZP Legal Name: Nexora Systems Private Limited' },
  ])
  const ev = h.evidence.find(e => e.field === 'gstin')
  assert.equal(ev?.page, 2)
})
