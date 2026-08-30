// Registry provider architecture (plan §15-§19).
// The pure engine stays DB-free/network-free; providers live here in the
// server layer. MockRegistryProvider wraps the existing demo DB loader and is
// authoritative:false. AggregatorRegistryProvider is an env-gated HTTP adapter
// for a SurePass-style KYC aggregator. Provider outages return null (→
// NEEDS_REVIEW with an audit note) — never a fake PASS or fake FAIL (plan §18).

import type { RegistryRecord } from '@/lib/engine/registry.ts'

export interface RegistryProvider {
  name: string
  /** True only for providers backed by real authoritative data. */
  authoritative: boolean
  /** Resolve one registry record; null = not found OR provider unavailable. */
  lookup(registry: string, key: string): Promise<RegistryRecord | null>
}

/** Dev/test/demo provider over the seeded MockRegistryEntry DB rows.
 * The DB loader is imported lazily so pure consumers (tests, selection
 * helpers) never load the Prisma client. */
export const MockRegistryProvider: RegistryProvider = {
  name: 'MOCK_REGISTRY',
  authoritative: false,
  async lookup(registry, key) {
    const { loadRegistryEntry } = await import('../registry.ts')
    return loadRegistryEntry(registry, key)
  },
}

/** Provider outage signal — callers must route to NEEDS_REVIEW (plan §18). */
export class RegistryProviderUnavailableError extends Error {
  constructor(registry: string, key: string, cause?: unknown) {
    super(`Authoritative registry provider unavailable for ${registry}:${key} — verification could not be completed`)
    this.name = 'RegistryProviderUnavailableError'
  }
}

/**
 * Real aggregator adapter (plan §17). Env-gated:
 *   REGISTRY_AGGREGATOR_URL + REGISTRY_AGGREGATOR_API_KEY
 * Endpoint shape (SurePass-style):
 *   POST {URL}/gst/gstin-check   { gstin }        → { data: { legal_name, status, ... } }
 *   POST {URL}/pan/kyc           { pan_number }   → { data: { full_name, status } }
 *   POST {URL}/udyam/udyam-check { udyam_number } → { data: { enterprise_name, status, ... } }
 * Network/HTTP failure → throws RegistryProviderUnavailableError (never a fake
 * PASS or fake FAIL, plan §18). Vendor response mapping lives in mapRecord.
 */
export class AggregatorRegistryProvider implements RegistryProvider {
  readonly name = 'AGGREGATOR'
  readonly authoritative = true
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(baseUrl?: string, apiKey?: string) {
    this.baseUrl = (baseUrl ?? process.env.REGISTRY_AGGREGATOR_URL ?? '').replace(/\/$/, '')
    this.apiKey = apiKey ?? process.env.REGISTRY_AGGREGATOR_API_KEY ?? ''
  }

  static configured(): boolean {
    return Boolean(process.env.REGISTRY_AGGREGATOR_URL && process.env.REGISTRY_AGGREGATOR_API_KEY)
  }

  /** Maps aggregator JSON → internal RegistryRecord. Overridable per vendor. */
  protected mapRecord(registry: string, key: string, payload: Record<string, unknown>): RegistryRecord {
    const data = (payload.data ?? payload) as Record<string, unknown>
    const status = String(data.status ?? data.registration_status ?? 'UNKNOWN').toUpperCase()
    return { registry, key, status, data }
  }

  async lookup(registry: string, key: string): Promise<RegistryRecord | null> {
    if (!this.baseUrl || !this.apiKey) return null
    const path = registry === 'GSTN' ? 'gst/gstin-check'
      : registry === 'PAN' ? 'pan/kyc'
      : registry === 'UDYAM' ? 'udyam/udyam-check'
      : null
    if (!path) return null
    const body = registry === 'GSTN' ? { gstin: key }
      : registry === 'PAN' ? { pan_number: key }
      : { udyam_number: key }
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      })
    } catch (err) {
      throw new RegistryProviderUnavailableError(registry, key, err)
    }
    if (!res.ok) throw new RegistryProviderUnavailableError(registry, key, `HTTP ${res.status}`)
    const json = await res.json() as Record<string, unknown>
    return this.mapRecord(registry, key, json)
  }
}

/**
 * Active registry provider selection. Aggregator wins when configured;
 * otherwise the mock demo registry (authoritative:false) remains active.
 */
export function resolveRegistryProvider(): RegistryProvider {
  if (process.env.REGISTRY_AGGREGATOR_URL && process.env.REGISTRY_AGGREGATOR_API_KEY) {
    return new AggregatorRegistryProvider()
  }
  return MockRegistryProvider
}

/**
 * Production mock safety (plan §19): mock-backed check results must never
 * display an authoritative verdict. Pure in `env`/args so tests never mutate
 * NODE_ENV.
 */
export function productionMockCap(
  provider: { name: string; authoritative: boolean },
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (provider.authoritative) return false
  if (env.NODE_ENV !== 'production') return false
  return env.BIDSURE_ALLOW_MOCK_REGISTRY !== '1'
}
