// ExtractionService dispatch (plan §5). The engine never depends on a specific
// provider; register future providers here (e.g. OcrExtractionProvider).
import type { DocTypeName } from './types.ts'
import { mockExtract, type ExtractInput, type ExtractOutcome } from './mock-extractor.ts'

export type { ExtractInput, ExtractOutcome } from './mock-extractor.ts'
export type { DocTypeName, ExtractedDocumentData } from './types.ts'

export function isDocTypeName(v: string): v is DocTypeName {
  return ['gstin', 'pan', 'udyam', 'turnover', 'audited', 'emd', 'mii', 'iso', 'experience', 'startup', 'maf', 'board', 'mca', 'generic'].includes(v)
}

export interface ExtractionProvider {
  name: string
  extract(input: ExtractInput): Promise<ExtractOutcome>
}

const mockProvider: ExtractionProvider = { name: 'MOCK', extract: mockExtract }

// Provider registry — the active provider is chosen here. Replacing MOCK with
// a real OCR provider later touches only this file.
const ACTIVE_PROVIDER: ExtractionProvider = mockProvider

export function activeProviderName(): string {
  return ACTIVE_PROVIDER.name
}

export async function extractDocument(input: ExtractInput): Promise<ExtractOutcome & { provider: string }> {
  const outcome = await ACTIVE_PROVIDER.extract(input)
  return { ...outcome, provider: ACTIVE_PROVIDER.name }
}

export { mockExtract }
