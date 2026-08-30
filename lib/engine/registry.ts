// BidSure pure mock-registry cross-check functions (plan §6).
// Pure TypeScript: no DB, no network, no randomness. The caller (lib/server/verify.ts)
// loads MockRegistryEntry rows and injects them here, keeping the engine DB-free.
// Every check result carries mock=true so the UI can label the registry as
// MOCK/DEMO data.

import type { DocStatus } from './validators.ts'
import { nameSimilarity } from './validators.ts'

export interface RegistryRecord {
  registry: string // GSTN | PAN | UDYAM | MCA | INCOME_TAX | DPIIT | NSIC
  key: string
  status: string // ACTIVE | CANCELLED | SUSPENDED | STRUCK_OFF | INACTIVE | ...
  data: Record<string, unknown>
}

export interface EngineCheck {
  checkId: string
  stage: 'STRUCTURAL' | 'REGISTRY' | 'CROSS_DOC'
  docName: string
  inputJson: string
  expectedJson: string
  foundJson: string
  status: DocStatus
  note: string
  mock: boolean
}

const ACTIVE_STATUSES = ['ACTIVE']
const DEAD_STATUSES = ['CANCELLED', 'SUSPENDED', 'STRUCK_OFF', 'INACTIVE', 'NON_FILER', 'STRIKE_OFF_PENDING']

function registryCheck(
  docName: string,
  checkId: string,
  input: Record<string, unknown>,
  expected: Record<string, unknown>,
  found: Record<string, unknown>,
  status: DocStatus,
  note: string,
): EngineCheck {
  return {
    checkId, stage: 'REGISTRY', docName,
    inputJson: JSON.stringify(input), expectedJson: JSON.stringify(expected), foundJson: JSON.stringify(found),
    status, note, mock: true,
  }
}

function foundEntry(docName: string, entry: RegistryRecord | null | undefined): EngineCheck {
  if (!entry) {
    return registryCheck(docName, `${docName.toUpperCase()}_REGISTRY_FOUND`, { key: 'not_found' }, {}, { found: false },
      'NEEDS_REVIEW', 'Not found in MOCK government registry — manual verification required')
  }
  return registryCheck(docName, `${docName.toUpperCase()}_REGISTRY_FOUND`, { key: entry.key }, { registry: entry.registry }, { found: true },
    'VERIFIED', `Record found in MOCK ${entry.registry} registry (${entry.status})`)
}

function statusCheck(docName: string, entry: RegistryRecord): EngineCheck {
  const ok = ACTIVE_STATUSES.includes(entry.status.toUpperCase())
  return registryCheck(
    docName, `${docName.toUpperCase()}_REGISTRY_STATUS`,
    { status: entry.status }, { status: 'ACTIVE' },
    { status: entry.status },
    ok ? 'VERIFIED' : 'NON_COMPLIANT',
    ok ? `Registry status: ${entry.status}` : `Registry status: ${entry.status} — record is not active in the MOCK ${entry.registry} database`,
  )
}

/** GST certificate vs MOCK GSTN registry. */
export function crossCheckGst(docName: string, extracted: Record<string, unknown>, entry: RegistryRecord | null): EngineCheck[] {
  const gstin = String(extracted.gstin ?? '').trim().toUpperCase()
  const checks: EngineCheck[] = []
  checks.push(foundEntry(docName, entry))
  if (!entry) return checks
  checks.push(statusCheck(docName, entry))
  const legalName = String(extracted.legalName ?? '').trim()
  if (legalName) {
    const registered = String(entry.data.legalName ?? '')
    const sim = nameSimilarity(legalName, registered)
    checks.push(registryCheck(
      docName, 'GSTIN_REGISTRY_LEGAL_NAME',
      { legalName }, { registeredLegalName: registered, minSimilarity: 0.85 },
      { legalName, registeredLegalName: registered, similarity: Math.round(sim * 100) },
      sim >= 0.85 ? 'VERIFIED' : 'NON_COMPLIANT',
      sim >= 0.85
        ? `Legal name matched with MOCK GSTN registry (${(sim * 100).toFixed(0)}%)`
        : `Legal name MISMATCH: extracted "${legalName}" vs MOCK GSTN "${registered}" (${(sim * 100).toFixed(0)}% similarity)`,
    ))
  }
  return checks
}

/** PAN card vs MOCK PAN registry (+ optional INCOME_TAX status). */
export function crossCheckPan(docName: string, extracted: Record<string, unknown>, panEntry: RegistryRecord | null, incomeTaxEntry: RegistryRecord | null): EngineCheck[] {
  const checks: EngineCheck[] = []
  checks.push(foundEntry(docName, panEntry))
  if (!panEntry) return checks
  checks.push(statusCheck(docName, panEntry))
  const name = String(extracted.name ?? '').trim()
  if (name) {
    const registered = String(panEntry.data.name ?? '')
    const sim = nameSimilarity(name, registered)
    checks.push(registryCheck(
      docName, 'PAN_REGISTRY_NAME',
      { name }, { registeredName: registered, minSimilarity: 0.85 }, { similarity: Math.round(sim * 100) },
      sim >= 0.85 ? 'VERIFIED' : 'NON_COMPLIANT',
      sim >= 0.85 ? `Name matched with MOCK PAN registry (${(sim * 100).toFixed(0)}%)` : `Name MISMATCH vs MOCK PAN registry`,
    ))
  }
  if (incomeTaxEntry) {
    const ok = ACTIVE_STATUSES.includes(incomeTaxEntry.status.toUpperCase())
    checks.push(registryCheck(
      docName, 'INCOME_TAX_RETURN_STATUS',
      { pan: incomeTaxEntry.key }, { status: 'ACTIVE' }, { status: incomeTaxEntry.status, filedReturns3y: incomeTaxEntry.data.filedReturns3y ?? null },
      ok ? 'VERIFIED' : 'NON_COMPLIANT',
      ok ? `Income-tax record active in MOCK INCOME_TAX registry (3-year return filing verified)` : `Income-tax record not active in MOCK INCOME_TAX registry (status ${incomeTaxEntry.status})`,
    ))
  }
  return checks
}

/** Udyam certificate vs MOCK UDYAM registry. */
export function crossCheckUdyam(docName: string, extracted: Record<string, unknown>, entry: RegistryRecord | null): EngineCheck[] {
  const checks: EngineCheck[] = []
  checks.push(foundEntry(docName, entry))
  if (!entry) return checks
  checks.push(statusCheck(docName, entry))
  const enterpriseName = String(extracted.enterpriseName ?? '').trim()
  if (enterpriseNameNonEmpty(extracted)) {
    const registered = String(entry.data.enterpriseName ?? '')
    const sim = nameSimilarity(enterpriseNameNonEmpty(extracted) as string, registered)
    checks.push(registryCheck(
      docName, 'UDYAM_REGISTRY_ENTERPRISE',
      { enterpriseName: extracted.enterpriseName }, { registeredEnterpriseName: registered }, { similarity: Math.round(sim * 100) },
      sim >= 0.85 ? 'VERIFIED' : 'NON_COMPLIANT',
      sim >= 0.85 ? `Enterprise name matched with MOCK UDYAM registry (${(sim * 100).toFixed(0)}%)` : `Enterprise name MISMATCH vs MOCK UDYAM record "${registered}"`,
    ))
  }
  const nic = String(extracted.nicCode ?? '').trim()
  const registeredNic = String(entry.data.nicCode ?? '').trim()
  if (nic && registeredNic) {
    const match = nic.slice(0, 2) === registeredNic.slice(0, 2)
    checks.push(registryCheck(
      docName, 'UDYAM_REGISTRY_NIC',
      { nicCode: nic }, { registeredNicCode: registeredNic }, { nicCode: registeredNic },
      match ? 'VERIFIED' : 'NEEDS_REVIEW',
      match ? `NIC activity ${nic} consistent with MOCK UDYAM record` : `NIC code MISMATCH: extracted ${nic} vs MOCK UDYAM ${registeredNic} — verify activity`,
    ))
  }
  return checks
}

function enterpriseNameNonEmpty(extracted: Record<string, unknown>): string | null {
  const v = String(extracted.enterpriseName ?? '').trim()
  return v || null
}

/** MCA extract (CIN document) vs MOCK MCA registry. */
export function crossCheckMca(docName: string, extracted: Record<string, unknown>, entry: RegistryRecord | null): EngineCheck[] {
  const checks: EngineCheck[] = []
  checks.push(foundEntry(docName, entry))
  if (!entry) return checks
  checks.push(statusCheck(docName, entry))
  const companyName = String(extracted.companyName ?? '').trim()
  if (companyName) {
    const registered = String(entry.data.companyName ?? '')
    const sim = nameSimilarity(companyName, registered)
    checks.push(registryCheck(
      docName, 'MCA_REGISTRY_COMPANY_NAME',
      { companyName }, { registeredCompanyName: registered }, { similarity: Math.round(sim * 100) },
      sim >= 0.85 ? 'VERIFIED' : 'NON_COMPLIANT',
      sim >= 0.85 ? `Company name matched with MOCK MCA registry` : `Company name MISMATCH vs MOCK MCA record "${registered}"`,
    ))
  }
  return checks
}

/** DPIIT startup recognition vs MOCK DPIIT registry. */
export function crossCheckDpiit(docName: string, extracted: Record<string, unknown>, entry: RegistryRecord | null): EngineCheck[] {
  const checks: EngineCheck[] = []
  checks.push(foundEntry(docName, entry))
  if (!entry) return checks
  checks.push(statusCheck(docName, entry))
  return checks
}

/** PAN-backed INCOME_TAX cross-check (returns-filing status). */
export function crossCheckIncomeTax(docName: string, entry: RegistryRecord | null): EngineCheck[] {
  if (!entry) return []
  return [statusCheck(docName, entry)]
}

export function isDeadStatus(status: string): boolean {
  return DEAD_STATUSES.includes(status.toUpperCase())
}
