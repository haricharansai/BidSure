// Real-document OCR extraction provider (plan §5-§8).
// - application/pdf: text-layer extraction via unpdf. Scanned PDFs (no usable
//   text layer) are rasterized to PNG via pdf2pic + GraphicsMagick/ImageMagick,
//   then OCR'd with tesseract.js (plan §6 fallback). If rasterization fails
//   (native tools unavailable), routes to officer review.
// - image/png, image/jpeg: tesseract.js OCR (eng). OCR is extraction only,
//   never authoritative verification (plan §7).
// - text/plain: UTF-8 passthrough into the shared harvest pipeline (plan §8).
// Every harvested field retains source evidence (plan §11).

import { extractText, getDocumentProxy } from 'unpdf'
import type { ExtractInput, ExtractOutcome } from './types.ts'
import { harvestFields, type HarvestPage } from './harvest.ts'
import { REQUIRED_FIELDS } from './normalize.ts'

export const MIN_TEXT_LENGTH = 60
/** Maximum input buffer size (25 MB). Larger files are rejected to prevent
 * excessive memory usage during OCR processing. */
const MAX_INPUT_SIZE_BYTES = 25 * 1024 * 1024
/** Below this share of printable chars a "text layer" is considered noise. */
const PRINTABLE_RATIO_MIN = 0.85
/** Maximum number of pages to rasterize (avoids runaway memory on huge PDFs). */
const MAX_RASTERIZE_PAGES = 10
/** DPI for rasterization — 150 balances quality vs speed for OCR. */
const RASTERIZE_DPI = 150
/** Max width in pixels for rasterized pages — prevents huge images. */
const RASTERIZE_MAX_WIDTH = 1200

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

/**
 * Rasterize scanned PDF pages to PNG buffers using pdf2pic (GraphicsMagick).
 * Returns page-by-page image buffers for OCR, or null if rasterization fails
 * (GraphicsMagick not installed, corrupt PDF, etc.).
 * Never throws — all failures are caught and surfaced as null.
 */
async function rasterizePdfPages(buffer: Buffer): Promise<Buffer[] | null> {
  try {
    // Dynamic import so the module loads even when pdf2pic/GraphicsMagick is
    // not installed — the error only surfaces when we actually try to use it.
    const { fromBuffer } = await import('pdf2pic')
    const converter = fromBuffer(buffer, {
      density: RASTERIZE_DPI,
      format: 'png',
      width: RASTERIZE_MAX_WIDTH,
      height: RASTERIZE_MAX_WIDTH, // max bound; pdf2pic preserves aspect ratio
      saveFilename: 'page',
      savePath: '', // in-memory only when using fromBuffer
    })
    // Discover total page count via unpdf
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const pageCount = Math.min(pdf.numPages, MAX_RASTERIZE_PAGES)
    const images: Buffer[] = []
    for (let i = 1; i <= pageCount; i++) {
      const result = await converter(i) as { buffer?: Buffer; path?: string }
      if (result?.buffer && result.buffer.length > 0) {
        images.push(result.buffer)
      }
    }
    return images.length > 0 ? images : null
  } catch {
    // GraphicsMagick/ImageMagick not installed, pdf2pic not available,
    // or PDF is corrupt — return null so caller falls back to FAILED.
    return null
  }
}

/** OCR provider — real uploaded PDFs/images → structured fields + evidence. */
export async function ocrExtract(input: ExtractInput): Promise<ExtractOutcome> {
  // File size guard: reject excessively large buffers to prevent memory issues
  if (input.buffer.length > MAX_INPUT_SIZE_BYTES) {
    return {
      status: 'FAILED',
      confidence: null,
      fields: {},
      error: `Input file is too large (${Math.round(input.buffer.length / (1024 * 1024))} MB) — maximum allowed is ${MAX_INPUT_SIZE_BYTES / (1024 * 1024)} MB; officer review required`,
      classification: null,
    }
  }
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
      // Scanned PDF (no usable text layer). Rasterize pages to images via
      // pdf2pic + GraphicsMagick, then run tesseract.js OCR on each image.
      // If rasterization fails (GraphicsMagick not installed), route to
      // officer review — never fraud (plan §6).
      const rasterImages = await rasterizePdfPages(input.buffer)
      if (!rasterImages || rasterImages.length === 0) {
        return {
          status: 'FAILED',
          confidence: null,
          fields: {},
          error: 'PDF has no usable text layer (likely a scanned image) — rasterization unavailable (install GraphicsMagick/ImageMagick for scanned PDF OCR support); officer review required',
          classification: null,
        }
      }
      // OCR each rasterized page image via tesseract.js
      let worker: {
        recognize(image: Buffer): Promise<{ data: { text?: string; confidence?: number } }>
        terminate(): Promise<unknown>
      } | null = null
      try {
        const { createWorker } = await import('tesseract.js')
        worker = await createWorker('eng', 1, { errorHandler: () => {} })
        const ocrPages: HarvestPage[] = []
        let totalConfidence = 0
        for (let i = 0; i < rasterImages.length; i++) {
          try {
            const { data } = await worker.recognize(rasterImages[i])
            const text = data.text ?? ''
            ocrPages.push({ page: i + 1, text: text.replace(/\u0000/g, '') })
            totalConfidence += (data.confidence ?? 0)
          } catch {
            // Single page OCR failure — skip that page, continue with others
            ocrPages.push({ page: i + 1, text: '' })
          }
        }
        pages = ocrPages
        ocrFactor = Math.min(1, Math.max(0.3, (totalConfidence / rasterImages.length) / 100))
      } catch {
        return {
          status: 'FAILED',
          confidence: null,
          fields: {},
          error: 'PDF rasterized successfully but OCR engine failed — officer review required',
          classification: null,
        }
      } finally {
        await worker?.terminate().catch(() => {})
      }
      // Check if OCR produced usable text from the rasterized pages
      const rasterText = pages.map(p => p.text).join('')
      if (rasterText.replace(/\s+/g, '').length < MIN_TEXT_LENGTH) {
        return {
          status: 'FAILED',
          confidence: null,
          fields: {},
          error: 'PDF was rasterized and OCR ran but produced no readable text — the scan may be too low quality, rotated, or not a document; officer review required',
          classification: null,
        }
      }
    }
  } else if (input.mimeType === 'text/plain') {
    pages = [{ page: 1, text: input.buffer.toString('utf-8') }]
  } else if (input.mimeType === 'image/png' || input.mimeType === 'image/jpeg') {
    // The entire image-OCR path (dynamic import + worker bootstrap + recognize)
    // must never propagate a failure: a crashed request used to take the whole
    // dev server down, blanking every open tab. Any failure here is a clean
    // FAILED outcome routed to officer review (plan §6/§18).
    let worker: {
      recognize(image: Buffer): Promise<{ data: { text?: string; confidence?: number } }>
      terminate(): Promise<unknown>
    } | null = null
    try {
      const { createWorker } = await import('tesseract.js')
      // tesseract.js downloads the eng model from a CDN on first use; without
      // internet (or a warm cache) bootstrap fails — surfaced as insufficient
      // extraction, never a crash and never a fake result.
      // errorHandler is REQUIRED: without it tesseract's worker-emitted job
      // errors (unreadable image, CDN failure) `throw` inside the message
      // handler and crash the whole Node process.
      worker = await createWorker('eng', 1, { errorHandler: () => {} })
      const { data } = await worker.recognize(input.buffer)
      pages = [{ page: 1, text: data.text ?? '' }]
      // OCR quality scales every harvested field's confidence (plan §12).
      ocrFactor = Math.min(1, Math.max(0.3, (data.confidence ?? 0) / 100))
    } catch {
      return {
        status: 'FAILED',
        confidence: null,
        fields: {},
        error: 'OCR could not process this image (unreadable, or the OCR engine/model is unavailable offline on first run) — officer review required',
        classification: null,
      }
    } finally {
      await worker?.terminate().catch(() => {})
    }
    if (!pages[0].text || pages[0].text.replace(/\s+/g, '').length < MIN_TEXT_LENGTH) {
      return { status: 'FAILED', confidence: null, fields: {}, error: 'OCR produced no readable text — manual review required' }
    }
  } else {
    return { status: 'FAILED', confidence: null, fields: {}, error: `Unsupported MIME type for OCR extraction: ${input.mimeType}` }
  }

  const harvested = harvestFields(input.docType, pages, ocrFactor)

  // Zero-yield guard: when OCR ran but extracted NONE of the doc type's
  // required fields, the extraction is insufficient — route to officer review
  // with a clear error instead of a hollow DONE with empty fields (plan §6/§12).
  const required = REQUIRED_FIELDS[input.docType] ?? []
  if (required.length > 0 && required.every(f => harvested.fields[f] == null)) {
    return {
      status: 'FAILED',
      confidence: null,
      fields: {},
      error: `OCR completed but could not extract the required fields (${required.join(', ')}) from this ${input.mimeType} document — it may be low-quality, rotated, handwritten, or not a ${input.docType} certificate; officer review required`,
      classification: harvested.classification,
    }
  }

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
