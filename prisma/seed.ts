// BidSure seed (idempotent): demo officer + seller (com-nexora) with a real
// company profile, MOCK government-registry entries, and demo fixture
// documents under .data/uploads/seed/com-nexora/.
// Run with: npm run db:seed  (Node 24+ native TS stripping)
import { createHash } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Checksum-valid per the base-36 Luhn rule in lib/engine/validators.ts.
const NEXORA_GSTIN = '07AAECN1234E1ZP'
const NEXORA_PAN = 'AAECN1234E'
const NEXORA_LEGAL_NAME = 'Nexora Systems Private Limited'
const NEXORA_TURNOVER_CR = 24.2
// Fraud demo company (checksum-valid GSTIN via the base-36 Luhn rule).
const XYZ_GSTIN = '07AABCU9603R1ZT'
const XYZ_PAN = 'AABCU9603R'

async function seedCompany() {
  const company = await prisma.company.upsert({
    where: { id: 'com-nexora' },
    update: {
      gstin: NEXORA_GSTIN, pan: NEXORA_PAN, legalName: NEXORA_LEGAL_NAME,
      turnoverCr: NEXORA_TURNOVER_CR, caTurnoverCr: NEXORA_TURNOVER_CR,
      gstr3bTotalCr: 23.8, auditedPnlCr: 23.5, netWorthCr: 6.5, yearsExperience: 10,
    },
    create: {
      id: 'com-nexora',
      name: 'Nexora Systems',
      legalName: NEXORA_LEGAL_NAME,
      gstin: NEXORA_GSTIN,
      pan: NEXORA_PAN,
      turnoverCr: NEXORA_TURNOVER_CR,
      caTurnoverCr: NEXORA_TURNOVER_CR,
      gstr3bTotalCr: 23.8,
      auditedPnlCr: 23.5,
      netWorthCr: 6.5,
      yearsExperience: 10,
      msme: false,
      iso: true,
      isReseller: false,
      isStartup: false,
      directorDins: '[]',
    },
  })
  await prisma.user.upsert({
    where: { email: 'contact@nexorasystems.com' },
    update: { companyId: company.id },
    create: {
      id: 'usr-seller-nexora',
      role: 'SELLER',
      email: 'contact@nexorasystems.com',
      password: Buffer.from('bidsure::seller123').toString('hex').length ? sha256('seller123') : '',
      name: 'Nexora Systems',
      subtitle: 'Registered Seller',
      initials: 'NS',
      companyId: company.id,
    },
  })
}

function sha256(password: string): string {
  // Mirrors lib/server/auth.ts hashPassword (kept in sync manually).
  return createHash('sha256').update(`bidsure::${password}`).digest('hex')
}

async function seedOfficer() {
  await prisma.user.upsert({
    where: { email: 'arun.mehta@digitransform.gov.in' },
    update: {},
    create: {
      id: 'usr-officer-mehta',
      role: 'OFFICER',
      email: 'arun.mehta@digitransform.gov.in',
      password: sha256('officer123'),
      name: 'Arun Mehta',
      subtitle: 'Procurement Division',
      initials: 'AM',
      department: 'Procurement Division',
      employeeId: 'EMP-2024-00142',
    },
  })
}

async function seedRegistry() {
  const rows: Array<{ registry: string; key: string; status: string; data: Record<string, unknown> }> = [
    { registry: 'GSTN', key: NEXORA_GSTIN, status: 'ACTIVE', data: { legalName: NEXORA_LEGAL_NAME, tradeName: 'Nexora', stateCode: '07' } },
    { registry: 'PAN', key: NEXORA_PAN, status: 'ACTIVE', data: { name: NEXORA_LEGAL_NAME, entityType: 'Company' } },
    { registry: 'INCOME_TAX', key: NEXORA_PAN, status: 'ACTIVE', data: { filedReturns3y: true } },
    { registry: 'UDYAM', key: 'UDYAM-07-00-0098765', status: 'ACTIVE', data: { enterpriseName: NEXORA_LEGAL_NAME, nicCode: '26201', orgType: 'Small' } },
    { registry: 'DPIIT', key: 'DPIIT2026NEXORA', status: 'ACTIVE', data: { entityName: NEXORA_LEGAL_NAME } },
    // Fraud demo (tests/e2e-fraud.mjs): GST record CANCELLED with a different
    // legal name → deterministic NON_COMPLIANT; PAN name mismatch.
    { registry: 'GSTN', key: XYZ_GSTIN, status: 'CANCELLED', data: { legalName: 'Fraud Enterprises', stateCode: '07' } },
    { registry: 'PAN', key: XYZ_PAN, status: 'ACTIVE', data: { name: 'XYZ Trading Private Limited', entityType: 'Company' } },
  ]
  for (const r of rows) {
    await prisma.mockRegistryEntry.upsert({
      where: { registry_key: { registry: r.registry, key: r.key } },
      update: { status: r.status, dataJson: JSON.stringify(r.data) },
      create: { registry: r.registry, key: r.key, status: r.status, dataJson: JSON.stringify(r.data) },
    })
  }
}

async function seedFraudDemo() {
  const company = await prisma.company.upsert({
    where: { id: 'com-xyz' },
    update: {
      gstin: XYZ_GSTIN, pan: XYZ_PAN, legalName: 'XYZ Trading Private Limited',
      turnoverCr: 5, caTurnoverCr: 4.6, yearsExperience: 3,
    },
    create: {
      id: 'com-xyz',
      name: 'XYZ Trading',
      legalName: 'XYZ Trading Private Limited',
      gstin: XYZ_GSTIN,
      pan: XYZ_PAN,
      turnoverCr: 5,
      caTurnoverCr: 4.6,
      gstr3bTotalCr: 4.2,
      auditedPnlCr: 4.0,
      netWorthCr: 1.5,
      yearsExperience: 3,
      msme: false,
      iso: false,
      isReseller: false,
      isStartup: false,
      directorDins: '[]',
    },
  })
  await prisma.user.upsert({
    where: { email: 'sales@xyztrading.in' },
    update: { companyId: company.id },
    create: {
      id: 'usr-seller-xyz',
      role: 'SELLER',
      email: 'sales@xyztrading.in',
      password: sha256('seller123'),
      name: 'XYZ Trading',
      subtitle: 'Registered Seller',
      initials: 'XT',
      companyId: company.id,
    },
  })
  const dir = join(process.cwd(), '.data', 'uploads', 'seed', 'com-xyz')
  await mkdir(dir, { recursive: true })
  const gst = `== SIMULATED GOVERNMENT DOCUMENT ==\nGoods and Services Tax Registration Certificate\nGSTIN: ${XYZ_GSTIN}\nLegal Name: XYZ Trading Private Limited\nBIDSURE-MOCK-EXTRACT ${JSON.stringify({ gstin: XYZ_GSTIN.toLowerCase(), legalName: 'XYZ Trading Private Limited', tradeName: 'XYZ Trading' })}\n-- end --`
  const pan = `== SIMULATED GOVERNMENT DOCUMENT ==\nIncome Tax Department — Permanent Account Number Card\nName: XYZ Trading Private Limited\nPAN: ${XYZ_PAN}\nBIDSURE-MOCK-EXTRACT ${JSON.stringify({ pan: XYZ_PAN.toLowerCase(), name: 'XYZ Trading Private Limited', entityType: 'Company' })}\n-- end --`
  await writeFile(join(dir, 'gstin.txt'), gst, 'utf-8')
  await writeFile(join(dir, 'pan.txt'), pan, 'utf-8')
}

async function seedFixtureDocs() {
  const dir = join(process.cwd(), '.data', 'uploads', 'seed', 'com-nexora')
  await mkdir(dir, { recursive: true })
  const gst = `== SIMULATED GOVERNMENT DOCUMENT ==\nGoods and Services Tax Registration Certificate\nGSTIN: ${NEXORA_GSTIN}\nLegal Name: ${NEXORA_LEGAL_NAME}\nTrade Name: Nexora\nBIDSURE-MOCK-EXTRACT ${JSON.stringify({ gstin: NEXORA_GSTIN.toLowerCase(), legalName: NEXORA_LEGAL_NAME, tradeName: 'Nexora' })}\n-- end --`
  const pan = `== SIMULATED GOVERNMENT DOCUMENT ==\nIncome Tax Department — Permanent Account Number Card\nName: ${NEXORA_LEGAL_NAME}\nPAN: ${NEXORA_PAN}\nBIDSURE-MOCK-EXTRACT ${JSON.stringify({ pan: NEXORA_PAN.toLowerCase(), name: NEXORA_LEGAL_NAME, entityType: 'Company' })}\n-- end --`
  const turnover = `== SIMULATED GOVERNMENT DOCUMENT ==\nChartered Accountant Certificate — Turnover\nUDIN: 261234567890123456\nBIDSURE-MOCK-EXTRACT ${JSON.stringify({ udin: '261234567890123456', certDate: '2026-04-10', caName: 'CA R. Iyer', membershipNo: '012345', turnoverCr: NEXORA_TURNOVER_CR, fy: '2025-26' })}\n-- end --`
  await writeFile(join(dir, 'gstin.txt'), gst, 'utf-8')
  await writeFile(join(dir, 'pan.txt'), pan, 'utf-8')
  await writeFile(join(dir, 'turnover.txt'), turnover, 'utf-8')
}

async function main() {
  await seedOfficer()
  await seedCompany()
  await seedFraudDemo()
  await seedRegistry()
  await seedFixtureDocs()
  const users = await prisma.user.count()
  const companies = await prisma.company.count()
  const tenders = await prisma.tender.count()
  console.log(`Database seeded: ${users} users, ${companies} companies, ${tenders} tenders, ${await prisma.mockRegistryEntry.count()} registry entries.`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
