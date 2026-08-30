// Deterministic MOCK extraction tests (plan §18: extraction + failure).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mockExtract } from '../lib/server/extraction/mock-extractor.ts'

function doc(text: string): Buffer {
  return Buffer.from(text, 'utf-8')
}

test('mock extractor: parses a well-formed GST demo document deterministically', async () => {
  const file = doc('== SIMULATED GOVERNMENT DOCUMENT ==\nGSTIN: 07AAECN1234E1ZP\nBIDSURE-MOCK-EXTRACT {"gstin":"07aaecn1234e1zp","legalName":"Nexora Systems Private Limited","tradeName":"Nexora"}\n-- end --')
  const out = await mockExtract({ docType: 'gstin', buffer: file, mimeType: 'text/plain', fileName: 'gst.txt' })
  assert.equal(out.status, 'DONE')
  assert.equal(out.confidence, 1)
  assert.equal(out.fields.gstin, '07AAECN1234E1ZP') // uppercased
  assert.equal(out.fields.legalName, 'Nexora Systems Private Limited')
  // Determinism: identical input → identical output
  const again = await mockExtract({ docType: 'gstin', buffer: file, mimeType: 'text/plain', fileName: 'gst.txt' })
  assert.deepEqual(again, out)
})

test('mock extractor: missing required field fails with a stable error', async () => {
  const out = await mockExtract({ docType: 'gstin', buffer: Buffer.from('BIDSURE-MOCK-EXTRACT {"legalName":"No GSTIN"}'), mimeType: 'text/plain', fileName: 'x.txt' })
  assert.equal(out.status, 'FAILED')
  assert.match(String(out.error), /missing required field/)
  assert.equal(out.confidence, null)
})

test('mock extractor: unparseable document (no marker) fails for manual review', async () => {
  const out = await mockExtract({ docType: 'board', buffer: Buffer.from('some scanned page'), mimeType: 'text/plain', fileName: 'scan.txt' })
  assert.equal(out.status, 'FAILED')
  assert.match(String(out.error), /Unrecognized/)
})

test('mock extractor: invalid JSON block fails deterministically', async () => {
  const out = await mockExtract({ docType: 'pan', buffer: Buffer.from('BIDSURE-MOCK-EXTRACT {not-json}'), mimeType: 'text/plain', fileName: 'x.txt' })
  assert.equal(out.status, 'FAILED')
  assert.match(String(out.error), /not valid JSON/)
})

test('mock extractor: audited fields normalize numbers', async () => {
  const out = await mockExtract({ docType: 'audited', buffer: Buffer.from('BIDSURE-MOCK-EXTRACT {"fy":"2025-26","auditedPnlCr":"23.5","netWorthCr":6.5}'), mimeType: 'text/plain', fileName: 'a.txt' })
  assert.equal(out.status, 'DONE')
  assert.equal(out.fields.auditedPnlCr, 23.5)
  assert.equal(out.fields.netWorthCr, 6.5)
})
