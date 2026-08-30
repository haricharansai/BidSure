// Server-side registry loading (plan §15-§18). All provider dispatch lives
// here; the pure cross-check functions in lib/engine/registry.ts stay DB-free
// and network-free, receiving plain records.
import { prisma } from '@/lib/prisma'
import type { RegistryRecord } from '@/lib/engine/registry.ts'
import { RegistryProviderUnavailableError, resolveRegistryProvider, type RegistryProvider } from './registry/provider.ts'

export async function loadRegistryEntry(registry: string, key: string): Promise<RegistryRecord | null> {
  const row = await prisma.mockRegistryEntry.findUnique({
    where: { registry_key: { registry, key: key.trim().toUpperCase() } },
  })
  if (!row) return null
  let data: Record<string, unknown> = {}
  try { data = JSON.parse(row.dataJson) as Record<string, unknown> } catch {}
  return { registry: row.registry, key: row.key, status: row.status, data }
}

export interface RegistryLookupResult {
  records: RegistryRecord[]
  /** Keys whose lookup failed because the provider was unreachable (plan §18). */
  unavailable: Array<{ registry: string; key: string }>
}

/**
 * Load every registry record relevant to one document's extracted fields.
 * Deterministic: keys are derived from the extracted fields only.
 * The provider defaults to the env-selected authoritative/mock provider.
 */
export async function loadRegistryForDoc(
  docName: string,
  fields: Record<string, unknown>,
  provider: RegistryProvider = resolveRegistryProvider(),
): Promise<RegistryLookupResult> {
  const upper = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : '')
  const wanted: Array<{ registry: string; key: string }> = []
  switch (docName) {
    case 'gstin': {
      const gstin = upper(fields.gstin)
      if (gstin) wanted.push({ registry: 'GSTN', key: gstin })
      break
    }
    case 'pan': {
      const pan = upper(fields.pan)
      if (pan) wanted.push({ registry: 'PAN', key: pan }, { registry: 'INCOME_TAX', key: pan })
      break
    }
    case 'udyam': {
      const udyamNo = upper(fields.udyamNo)
      if (udyamNo) wanted.push({ registry: 'UDYAM', key: udyamNo })
      break
    }
    case 'startup': {
      const dpiitNumber = upper(fields.dpiitNumber)
      if (dpiitNumber) wanted.push({ registry: 'DPIIT', key: dpiitNumber })
      break
    }
    case 'mca': {
      const cin = upper(fields.cin)
      if (cin) wanted.push({ registry: 'MCA', key: cin })
      break
    }
    default:
      break
  }

  const records: RegistryRecord[] = []
  const unavailable: Array<{ registry: string; key: string }> = []
  for (const { registry, key } of wanted) {
    try {
      const rec = await provider.lookup(registry, key)
      if (rec) records.push(rec)
    } catch (err) {
      if (err instanceof RegistryProviderUnavailableError) {
        unavailable.push({ registry, key })
      } else {
        unavailable.push({ registry, key })
      }
    }
  }
  return { records, unavailable }
}
