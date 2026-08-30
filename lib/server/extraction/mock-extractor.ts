// Deterministic MOCK extraction provider (plan §5).
// Convention: prototype demo documents embed a machine-readable header line
//   BIDSURE-MOCK-EXTRACT {json}
// The provider parses that block deterministically — no randomness, no
// timestamps, no AI. Files without the block (or with an unparseable block)
// fail extraction with a stable error so the NEEDS_REVIEW path is reproducible.
// A future OcrExtractionProvider implements the same interface without any
// change to the verification engine.

import type { DocTypeName, ExtractInput, ExtractOutcome } from './types.ts'
import { normalizeFields } from './normalize.ts'

export type { ExtractInput, ExtractOutcome } from './types.ts'

const MARKER = 'BIDSURE-MOCK-EXTRACT '

// Re-exported so existing import sites keep working (plan §10).
export { normalizeFields, normalizeNumber, normalizeString } from './normalize.ts'

/** MockExtractionProvider — deterministic BIDSURE-MOCK-EXTRACT block parser. */
export async function mockExtract(input: ExtractInput): Promise<ExtractOutcome> {
  const text = input.buffer.toString('utf-8')
  const line = text.split(/\r?\n/).find(l => l.startsWith(MARKER))
  if (!line) {
    return {
      status: 'FAILED',
      confidence: null,
      fields: {},
      error: `Unrecognized ${input.docType} document — no machine-readable MOCK extract block found (expected 'BIDSURE-MOCK-EXTRACT {…}'); route to manual review`,
    }
  }
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(line.slice(MARKER.length)) as Record<string, unknown>
  } catch {
    return { status: 'FAILED', confidence: null, fields: {}, error: 'MOCK extract block is not valid JSON — manual review required' }
  }
  const { fields, missing } = normalizeFields(input.docType, raw)
  if (missing.length) {
    return {
      status: 'FAILED',
      confidence: null,
      fields: {},
      error: `MOCK extract missing required field(s): ${missing.join(', ')} — manual review required`,
    }
  }
  return { status: 'DONE', confidence: 1, fields, error: null }
}

export function isMockExtractLine(text: string): boolean {
  return text.includes(MARKER)
}
