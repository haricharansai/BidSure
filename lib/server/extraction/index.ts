// ExtractionService dispatch (plan §4/§9). The engine never depends on a
// specific provider; the active provider is resolved here:
//   BIDSURE_EXTRACTION_PROVIDER=mock|ocr|cloud
//   - mock: existing BIDSURE-MOCK-EXTRACT dev adapter (explicit opt-in)
//   - ocr:  real local extraction (default for real MIME types)
//   - cloud: cloud adapter when credentials exist, else fall back to OCR
// Default (no env): the mock marker activates the mock path in dev/test ONLY;
// in production a mock marker never silently creates extraction results.
import type { DocTypeName, ExtractInput, ExtractOutcome } from './types.ts'
import { mockExtract } from './mock-extractor.ts'
import { ocrExtract } from './ocr-extractor.ts'
import { cloudCredentialsPresent, cloudExtract } from './cloud-extractor.ts'

export type { ExtractInput, ExtractOutcome } from './types.ts'
export type { DocTypeName, ExtractedDocumentData, FieldEvidence, ClassificationResult } from './types.ts'

export function isDocTypeName(v: string): v is DocTypeName {
  return ['gstin', 'pan', 'udyam', 'turnover', 'audited', 'emd', 'mii', 'iso', 'experience', 'startup', 'maf', 'board', 'mca', 'generic'].includes(v)
}

export interface ExtractionProvider {
  name: string
  extract(input: ExtractInput): Promise<ExtractOutcome>
}

const mockProvider: ExtractionProvider = { name: 'MOCK', extract: mockExtract }
const ocrProvider: ExtractionProvider = { name: 'OCR', extract: ocrExtract }
const cloudProvider: ExtractionProvider = { name: 'CLOUD', extract: cloudExtract }

/** The BIDSURE-MOCK-EXTRACT demo marker (dev fixtures only). */
const MOCK_MARKER = 'BIDSURE-MOCK-EXTRACT '

export function hasMockMarker(buffer: Buffer): boolean {
  return buffer.subarray(0, Math.min(buffer.length, 8192)).toString('utf-8').includes(MOCK_MARKER)
}

/** Mock fixtures are permitted in dev/test, or with the explicit escape hatch. */
function mockAllowedIn(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV !== 'production' || env.BIDSURE_ALLOW_MOCK_EXTRACTION === '1'
}

export interface ProviderResolution {
  provider: ExtractionProvider
  reason: 'explicit-mock' | 'explicit-ocr' | 'explicit-cloud' | 'cloud-fallback-ocr' | 'mock-marker-dev' | 'default-ocr'
}

/**
 * Provider selection rules (plan §9). Pure in `env` so tests never mutate
 * NODE_ENV.
 */
export function resolveProvider(input: { buffer: Buffer }, env: Record<string, string | undefined> = process.env): ProviderResolution {
  const setting = (env.BIDSURE_EXTRACTION_PROVIDER ?? '').toLowerCase()
  if (setting === 'mock') return { provider: mockProvider, reason: 'explicit-mock' }
  if (setting === 'ocr') return { provider: ocrProvider, reason: 'explicit-ocr' }
  if (setting === 'cloud') {
    return cloudCredentialsPresent()
      ? { provider: cloudProvider, reason: 'explicit-cloud' }
      : { provider: ocrProvider, reason: 'cloud-fallback-ocr' }
  }
  if (hasMockMarker(input.buffer) && mockAllowedIn(env)) return { provider: mockProvider, reason: 'mock-marker-dev' }
  return { provider: ocrProvider, reason: 'default-ocr' }
}

export function activeProviderName(): string {
  return resolveProvider({ buffer: Buffer.alloc(0) }).provider.name
}

export async function extractDocument(input: ExtractInput, env: Record<string, string | undefined> = process.env): Promise<ExtractOutcome & { provider: string; providerReason: string }> {
  const { provider, reason } = resolveProvider(input, env)
  const outcome = await provider.extract(input)
  return { ...outcome, provider: provider.name, providerReason: reason }
}

export { mockExtract, ocrExtract, cloudExtract }
