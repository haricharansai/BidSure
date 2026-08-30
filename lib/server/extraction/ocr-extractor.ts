// Real-document OCR extraction provider (plan §5-§8).
// - application/pdf: text-layer extraction via unpdf. A PDF without a usable
//   text layer (scan) is an INSUFFICIENT-EXTRACTION case → FAILED with a
//   manual-review error; it is never labelled fraudulent (plan §6). The
//   structure leaves room for a rasterize-OCR path behind the same interface.
// - image/png, image/jpeg: tesseract.js OCR (eng). OCR is extraction only,
//   never authoritative verification (plan §7).
// - text/plain: UTF-8 passthrough into the shared harvest pipeline (plan §8).
// Every harvested field retains source evidence (plan §11).

import { extractText, getDocumentProxy } from 'unpdf'
import type { ExtractInput, ExtractOutcome } from './types.ts'
import { harvestFields, type HarvestPage } from './harvest.ts'

export const MIN_TEXT_LENGTH = 40
/** Below this share of printable chars a "text layer" is considered noise. */
const PRINTABLE_RATIO_MIN = 0.85

function printableRatio(text: string): number {
  const sample = text.replace(/\s+/g, '')
  if (!sample.length) return 0
  const printable = (sample.match(/[\x20-\x7E\u00A0-\u024F\u2000-\uFFFF]/g) ?? []).length
  return printable / sample.length
}

async function extractPdfPages(buffer: Buffer): Promise<HarvestPage[]> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: false })
  return (Array.isArray(text) ? text : [String(text)])
    .map((t, i) => ({ page: i + 1, text: (t ?? '').replace(/\u0000/g, '') }))
}

function usableText(pages: HarvestPage[]): string {
  return pages.map(p => p.text).join('')
}

/** OCR provider — real uploaded PDFs/images → structured fields + evidence. */
export async function ocrExtract(input: ExtractInput): Promise<ExtractOutcome> {
  let pages: HarvestPage[] = []
  let ocrFactor = 1

  if (input.mimeType === 'application/pdf') {
    try {
      pages = await extractPdfPages(input.buffer)
    } catch {
      pages = []
    }
    const joined = pages.map(p => p.text).join('')
    if (joined.replace(/\s+/g, '').length < MIN_TEXT_LENGTH || printableRatio(joined) < PRINTABLE_RATIO_MIN) {
      // Scanned PDF (no usable text layer). Node rasterization would need a
      // native canvas backend; unavailable here → insufficient extraction,
      // routed to officer review, never fraud (plan §6).
      return {
        status: 'FAILED',
        confidence: null,
        fields: {},
        error: 'PDF has no usable text layer (likely a scanned image) — automated extraction insufficient; officer review required',
        classification: null,
      }
    }
  } else if (input.mimeType === 'text/plain') {
    pages = [{ page: 1, text: input.buffer.toString('utf-8') }]
  } else if (input.mimeType === 'image/png' || input.mimeType === 'image/jpeg') {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('eng')
    try {
      const { data } = await worker.recognize(input.buffer)
      pages = [{ page: 1, text: data.text ?? '' }]
      // OCR quality scales every harvested field's confidence (plan §12).
      ocrFactor = Math.min(1, Math.max(0.3, (data.confidence ?? 0) / 100))
    } finally {
      await worker.terminate()
    }
    if (!pages[0].text || pages[0].text.replace(/\s+/g, '').length < MIN_TEXT_LENGTH) {
      return { status: 'FAILED', confidence: null, fields: {}, error: 'OCR produced no readable text — manual review required' }
    }
  } else {
    return { status: 'FAILED', confidence: null, fields: {}, error: `Unsupported MIME type for OCR extraction: ${input.mimeType}` }
  }

  const harvested = harvestFields(input.docType, pages, ocrFactor)

  // Partial-extraction policy (plan §12): missing OR uncertain required fields
  // do NOT fail the document — verification continues for what was extracted
  // and the gaps surface as NEEDS_REVIEW rows in the verify stage.
  return {
    status: 'DONE',
    confidence: harvested.evidence.length
      ? Math.round((harvested.evidence.reduce((s, e) => s + e.confidence, 0) / harvested.evidence.length) * 100) / 100
      : 0,
    fields: harvested.fields,
    error: null,
    evidence: harvested.evidence,
    pageTexts: pages.map(p => p.text),
    classification: harvested.classification,
    missing: harvested.missing,
    uncertain: harvested.uncertain,
  }
}
