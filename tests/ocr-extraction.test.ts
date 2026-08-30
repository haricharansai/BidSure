// Real OCR extraction provider tests (plan §5-§8, §12).
// Digital PDFs use the text layer (deterministic, offline); scanned PDFs route
// to manual review; image OCR is gated behind BIDSURE_TEST_OCR=1.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ocrExtract } from '../lib/server/extraction/ocr-extractor.ts'
import { resolveProvider, hasMockMarker } from '../lib/server/extraction/index.ts'

/** Minimal single-page PDF with a text layer (built in-test, no fixture files). */
function minimalPdf(lines: string[]): Buffer {
  const content = lines
    .map((l, i) => `BT /F1 12 Tf 72 ${700 - i * 24} Td (${l.replace(/([()\\])/g, '\\$1')}) Tj ET`)
    .join('\n')
  const objects: string[] = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
  objects[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'
  objects[4] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  objects[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let i = 1; i <= 5; i++) {
    offsets[i] = pdf.length
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefPos = pdf.length
  pdf += 'xref\n0 6\n0000000000 65535 f \n'
  for (let i = 1; i <= 5; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

test('OCR provider: real text-layer PDF → GSTIN + legal name + evidence + classification', async () => {
  const pdf = minimalPdf([
    'GST REGISTRATION CERTIFICATE',
    'GSTIN: 07AAECN1234E1ZP',
    'Legal Name: Nexora Systems Private Limited',
    'Status: Active',
  ])
  const out = await ocrExtract({ docType: 'gstin', buffer: pdf, mimeType: 'application/pdf', fileName: 'gst.pdf' })
  assert.equal(out.status, 'DONE', out.error ?? '')
  assert.equal(out.fields.gstin, '07AAECN1234E1ZP')
  assert.equal(out.fields.legalName, 'Nexora Systems Private Limited')
  assert.ok(out.evidence?.some(e => e.field === 'gstin'))
  assert.equal(out.classification?.docType, 'gstin')
  assert.equal(out.missing?.length ?? 0, 0)
})

test('OCR provider name + partial extraction keeps verification alive (plan §12)', async () => {
  // PAN required fields: pan + name. Only PAN is present → DONE with missing
  // reported (verify stage turns that into NEEDS_REVIEW), never a guess.
  const pdf = minimalPdf(['INCOME TAX DEPARTMENT - PERMANENT ACCOUNT NUMBER CARD', 'PAN: AAECN1234E'])
  const out = await ocrExtract({ docType: 'pan', buffer: pdf, mimeType: 'application/pdf', fileName: 'pan.pdf' })
  assert.equal(out.status, 'DONE')
  assert.equal(out.fields.pan, 'AAECN1234E')
  assert.ok(out.missing?.includes('name'))
})

test('scanned PDF (no text layer) → insufficient extraction, manual review — never fraud', async () => {
  const pdf = minimalPdf([]) // image-only page: no extractable text
  const out = await ocrExtract({ docType: 'gstin', buffer: pdf, mimeType: 'application/pdf', fileName: 'scan.pdf' })
  assert.equal(out.status, 'FAILED')
  assert.match(String(out.error), /no usable text layer|officer review/)
})

test('provider selection (plan §9): explicit mock/ocr, cloud fallback, default', () => {
  const marker = Buffer.from('BIDSURE-MOCK-EXTRACT {"gstin":"07AAECN1234E1ZP","legalName":"X"}')
  assert.equal(resolveProvider({ buffer: Buffer.alloc(0) }, { BIDSURE_EXTRACTION_PROVIDER: 'mock' }).provider.name, 'MOCK')
  assert.equal(resolveProvider({ buffer: Buffer.alloc(0) }, { BIDSURE_EXTRACTION_PROVIDER: 'ocr' }).provider.name, 'OCR')
  // cloud without credentials falls back to OCR — never fails silently
  assert.equal(resolveProvider({ buffer: Buffer.alloc(0) }, { BIDSURE_EXTRACTION_PROVIDER: 'cloud' }).provider.name, 'OCR')
  // dev/test: mock marker activates the demo adapter
  assert.equal(resolveProvider({ buffer: marker }, {}).provider.name, 'MOCK')
  // production: mock marker must NOT silently activate the mock path
  assert.equal(resolveProvider({ buffer: marker }, { NODE_ENV: 'production' }).provider.name, 'OCR')
  assert.equal(hasMockMarker(marker), true)
})
