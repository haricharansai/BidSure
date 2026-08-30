// Server-side MOCK registry loader (plan §6). All DB access for registry data
// lives here; the pure cross-check functions in lib/engine/registry.ts stay
// DB-free and receive plain records.
import { prisma } from '@/lib/prisma'
import type { RegistryRecord } from '@/lib/engine/registry.ts'

export async function loadRegistryEntry(registry: string, key: string): Promise<RegistryRecord | null> {
  const row = await prisma.mockRegistryEntry.findUnique({
    where: { registry_key: { registry, key: key.trim().toUpperCase() } },
  })
  if (!row) return null
  let data: Record<string, unknown> = {}
  try { data = JSON.parse(row.dataJson) as Record<string, unknown> } catch {}
  return { registry: row.registry, key: row.key, status: row.status, data }
}

/**
 * Load every registry record relevant to one document's extracted fields.
 * Deterministic: keys are derived from the extracted fields only.
 */
export async function loadRegistryForDoc(docName: string, fields: Record<string, unknown>): Promise<RegistryRecord[]> {
  const upper = (v: unknown) => (typeof v === 'string' ? v.trim().toUpperCase() : '')
  switch (docName) {
    case 'gstin': {
      const gstin = upper(fields.gstin)
      if (!gstin) return []
      const gstn = await loadRegistryEntry('GSTN', gstin)
      return gstn ? [gstn] : []
    }
    case 'pan': {
      const pan = upper(fields.pan)
      if (!pan) return []
      const [panRec, itRec] = await Promise.all([loadRegistryEntry('PAN', pan), loadRegistryEntry('INCOME_TAX', pan)])
      return [panRec, itRec].filter((r): r is RegistryRecord => r != null)
    }
    case 'udyam': {
      const udyamNo = upper(fields.udyamNo)
      if (!udyamNo) return []
      const rec = await loadRegistryEntry('UDYAM', udyamNo)
      return rec ? [rec] : []
    }
    case 'startup': {
      const dpiitNumber = upper(fields.dpiitNumber)
      if (!dpiitNumber) return []
      const rec = await loadRegistryEntry('DPIIT', dpiitNumber)
      return rec ? [rec] : []
    }
    case 'mca': {
      const cin = upper(fields.cin)
      if (!cin) return []
      const rec = await loadRegistryEntry('MCA', cin)
      return rec ? [rec] : []
    }
    default:
      return []
  }
}
