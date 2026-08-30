// Cloud extraction adapter (plan §4/§30) — env-gated HTTP skeleton behind the
// same ExtractionProvider interface. Selected only when
// BIDSURE_EXTRACTION_PROVIDER=cloud AND credentials exist; otherwise the
// caller falls back to the OCR provider. Implemented against a Google
// Vision-style annotate endpoint (OCR_PROVIDER=google-vision + API key);
// the response mapping is deliberately thin — swap `mapResponse` per vendor.

import type { ExtractInput, ExtractOutcome } from './types.ts'
import { harvestFields } from './harvest.ts'

export function cloudCredentialsPresent(): boolean {
  const provider = (process.env.OCR_PROVIDER ?? 'google-vision').toLowerCase()
  if (provider !== 'google-vision') return false
  return Boolean(process.env.GOOGLE_VISION_API_KEY)
}

function visionResponseToPages(payload: unknown): { text: string; confidence: number } | null {
  // Minimal mapping of a Document-AI/Vision-style JSON response:
  // { responses: [{ fullTextAnnotation: { text }, confidence? }] }
  const p = payload as { responses?: Array<{ fullTextAnnotation?: { text?: string }; confidence?: number }> } | null
  const first = p?.responses?.[0]
  const text = first?.fullTextAnnotation?.text
  if (typeof text !== 'string' || !text.trim()) return null
  const confidence = typeof first?.confidence === 'number'
    ? first.confidence <= 1 ? first.confidence : first.confidence / 100
    : 0.8
  return { text, confidence }
}

/** CloudExtractionProvider — env-gated remote OCR adapter (plan §30). */
export async function cloudExtract(input: ExtractInput): Promise<ExtractOutcome> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY
  const endpoint = process.env.OCR_ENDPOINT // optional: full endpoint override
  void endpoint
  let pages: { page: number; text: string }[] = []
  let ocrFactor = 1
  if (!apiKey && !process.env.OCR_ENDPOINT) {
    return { status: 'FAILED', confidence: null, fields: {}, error: 'Cloud OCR not configured (OCR_PROVIDER/GOOGLE_VISION_API_KEY missing)' }
  }
  try {
    const base = process.env.OCR_PROVIDER === 'azure'
      ? `${process.env.OCR_ENDPOINT ?? ''}` // vendor-specific adapter stub
      : `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey ?? '')}`
    const res = await fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: input.buffer.toString('base64') },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        }],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      return { status: 'FAILED', confidence: null, fields: {}, error: `Cloud OCR unavailable (HTTP ${res.status}) — manual review required` }
    }
    const json = await res.json() as unknown
    const mapped = visionResponseToPages(json)
    if (!mapped) {
      return { status: 'FAILED', confidence: null, fields: {}, error: 'Cloud OCR returned no readable text — manual review required' }
    }
    pages = [{ page: 1, text: mapped.text }]
    ocrFactor = Math.min(1, Math.max(0.3, mapped.confidence))
  } catch {
    return { status: 'FAILED', confidence: null, fields: {}, error: 'Cloud OCR request failed — manual review required' }
  }

  const harvested = harvestFields(input.docType, pages, ocrFactor)
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
