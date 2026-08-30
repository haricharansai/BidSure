// Seed: officer + 3 seller personas (incl. the trader-MSME trap persona),
// 6 legacy tenders (D6 adapter source) and the v2 GeM workflow demo tenders.
// Run with: node prisma/seed.ts  (Node 24+ native TS stripping)
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function hashPassword(password: string): string {
  return createHash('sha256').update(`bidsure::${password}`).digest('hex')
}

const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Build a checksum-valid GSTIN from a state code + 10-char PAN + entity code. */
function gstinFor(stateCode: string, pan: string, entityCode = '1'): string {
  const body = `${stateCode}${pan}${entityCode}Z`
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const factor = i % 2 === 0 ? 2 : 1
    const product = BASE36.indexOf(body[i]) * factor
    sum += Math.floor(product / 36) + (product % 36)
  }
  return body + BASE36[(36 - (sum % 36)) % 36]
}

const personas = [
  {
    user: {
      id: 'usr-officer-001',
      role: 'OFFICER',
      email: 'arun.mehta@digitransform.gov.in',
      password: 'officer123',
      name: 'Arun Mehta',
      subtitle: 'Procurement Officer',
      initials: 'AM',
      department: 'Ministry of Digital Transformation',
      employeeId: 'EMP-2024-00142',
    },
    company: null,
  },
  {
    user: {
      id: 'usr-seller-001',
      role: 'SELLER',
      email: 'contact@nexorasystems.com',
      password: 'seller123',
      name: 'Nexora Systems',
      subtitle: 'Registered Seller',
      initials: 'NX',
    },
    company: {
      id: 'com-nexora',
      name: 'Nexora Systems Pvt. Ltd.',
      legalName: 'Nexora Systems Private Limited',
      pan: 'AAECN1234E',
      cin: 'U72900DL2014PTC401221',
      turnoverCr: 24,
      yearsExperience: 11,
      msme: false,
      iso: true,
      caTurnoverCr: 24.2,
      gstr3bTotalCr: 23.8,
      auditedPnlCr: 23.5,
      netWorthCr: 6.5,
      miiLocalContentPct: 62,
      isReseller: false,
      dscTokenId: 'DSC-NX-4411',
      directorDins: JSON.stringify(['DIN01234567', 'DIN07654321']),
    },
  },
  {
    user: {
      id: 'usr-seller-002',
      role: 'SELLER',
      email: 'contact@abctech.in',
      password: 'seller123',
      name: 'ABC Technologies',
      subtitle: 'Registered Seller · MSE',
      initials: 'AB',
    },
    company: {
      id: 'com-abc',
      name: 'ABC Technologies Pvt. Ltd.',
      legalName: 'ABC Technologies Private Limited',
      pan: 'AAGCA5678F',
      cin: 'U72200KA2018PTC334455',
      turnoverCr: 4.5,
      yearsExperience: 6,
      msme: true,
      iso: false,
      udyamNo: 'UDYAM-07-00-0012345',
      udyamNicCode: '26',
      caTurnoverCr: 4.6,
      gstr3bTotalCr: 4.4,
      auditedPnlCr: 4.3,
      netWorthCr: 1.2,
      miiLocalContentPct: 55,
      isReseller: false,
      isStartup: false,
      dscTokenId: 'DSC-AB-7720',
      directorDins: JSON.stringify(['DIN09111222']),
    },
  },
  {
    user: {
      id: 'usr-seller-003',
      role: 'SELLER',
      email: 'sales@xyztrading.in',
      password: 'seller123',
      name: 'XYZ Trading Co.',
      subtitle: 'Registered Seller · MSE (Trader)',
      initials: 'XY',
    },
    company: {
      id: 'com-xyz',
      name: 'XYZ Trading Co.',
      legalName: 'XYZ Trading Company',
      pan: 'AAFCX9012G',
      cin: 'U51109DL2012PTC998877',
      turnoverCr: 8,
      yearsExperience: 4,
      msme: true,
      iso: false,
      udyamNo: 'UDYAM-07-00-0098765',
      udyamNicCode: '46', // wholesale trade — the trader-MSME EMD trap
      caTurnoverCr: 9.8,
      gstr3bTotalCr: 6.1, // 37.7% variance → critical triangulation anomaly
      auditedPnlCr: 7.2,
      netWorthCr: -0.4, // negative net worth → deterministic disqualification
      miiLocalContentPct: 18,
      isReseller: true,
      isStartup: false,
      dscTokenId: 'DSC-XY-9103',
      directorDins: JSON.stringify(['DIN09334455']),
    },
  },
]

const OFFICER_ID = 'usr-officer-001'

const DEFAULT_DOCS = [
  { name: 'pan', description: 'Permanent Account Number card', classification: 'MANDATORY', conditionKey: null },
  { name: 'gstin', description: 'GST registration certificate', classification: 'MANDATORY', conditionKey: null },
  { name: 'turnover', description: 'CA-certified turnover certificate with UDIN', classification: 'MANDATORY', conditionKey: null },
  { name: 'audited', description: 'Audited balance sheets — last 3 years', classification: 'MANDATORY', conditionKey: null },
  { name: 'board', description: 'Board resolution / power of attorney', classification: 'MANDATORY', conditionKey: null },
  { name: 'emd', description: 'EMD / bid security bank guarantee (required only when EMD applies)', classification: 'CONDITIONAL', conditionKey: 'emd' },
  { name: 'udyam', description: 'Udyam / MSE registration (claiming MSE preference or EMD exemption)', classification: 'CONDITIONAL', conditionKey: 'msme' },
  { name: 'startup', description: 'DPIIT startup recognition (claiming turnover/experience waiver)', classification: 'CONDITIONAL', conditionKey: 'startup' },
  { name: 'maf', description: 'Manufacturer authorization form (dealers/resellers)', classification: 'CONDITIONAL', conditionKey: 'reseller' },
  { name: 'mii', description: 'Make in India local content declaration (claiming Class-I/II status)', classification: 'CONDITIONAL', conditionKey: 'mii' },
  { name: 'iso', description: 'ISO certification', classification: 'SUPPORTING', conditionKey: null },
  { name: 'experience', description: 'Past experience / completion certificates', classification: 'SUPPORTING', conditionKey: null },
]

// D6: the six legacy tenders from the in-memory compliance demo, mapped into
// Prisma so the old views and the new workflow list share one source of truth.
// Terminal stages so tick() never mutates them.
const LEGACY_TENDERS = [
  { id: 'GOV/ICT/2026/041', title: 'Supply and installation of secure network infrastructure', agency: 'Ministry of Digital Transformation', type: 'open', category: 'ICT', valueCr: 18.4, published: '2026-08-18T10:00:00+05:30', deadline: '2026-09-12T17:00:00+05:30', stage: 'EVALUATED', emdRequired: true, emdAmountCr: 0.368, awardedToCompanyId: null },
  { id: 'PWD/INFRA/2026/019', title: 'Construction of regional public health centres', agency: 'Public Works Department', type: 'open', category: 'INFRA', valueCr: 42.8, published: '2026-08-02T10:00:00+05:30', deadline: '2026-09-20T17:00:00+05:30', stage: 'EVALUATED', emdRequired: true, emdAmountCr: 0.856, awardedToCompanyId: null },
  { id: 'EDU/TECH/2026/008', title: 'Digital classroom equipment and support services', agency: 'Department of Education', type: 'open', category: 'EDU', valueCr: 9.6, published: '2026-07-10T10:00:00+05:30', deadline: '2026-10-05T17:00:00+05:30', stage: 'AWARDED', emdRequired: true, emdAmountCr: 0.192, awardedToCompanyId: 'com-nexora' },
  { id: 'HEALTH/PHARMA/2026/032', title: 'Annual supply of essential medicines', agency: 'National Health Authority', type: 'limited', category: 'PHARMA', valueCr: 27.2, published: '2026-07-22T10:00:00+05:30', deadline: '2026-09-28T17:00:00+05:30', stage: 'EVALUATED', emdRequired: true, emdAmountCr: 0.544, awardedToCompanyId: null },
  { id: 'RDS/INFRA/2026/003', title: 'Road maintenance and infrastructure upgrade', agency: 'Road Development Authority', type: 'open', category: 'INFRA', valueCr: 55.3, published: '2026-08-25T10:00:00+05:30', deadline: '2026-10-15T17:00:00+05:30', stage: 'EVALUATED', emdRequired: true, emdAmountCr: 1.106, awardedToCompanyId: null },
  { id: 'ENV/WASTE/2026/017', title: 'Waste management services contract', agency: 'Environmental Protection Agency', type: 'open', category: 'ENV', valueCr: 12.7, published: '2026-08-12T10:00:00+05:30', deadline: '2026-09-30T17:00:00+05:30', stage: 'EVALUATED', emdRequired: true, emdAmountCr: 0.254, awardedToCompanyId: null },
]

// Spec-walkthrough demo tenders (§10): an e-reverse auction with EMD + MSE
// preference, and a small open tender below the ₹5 L EMD cutoff.
function demoTenders() {
  const raDeadline = new Date(Date.now() + 5 * 60 * 1000)
  const openDeadline = new Date(Date.now() + 30 * 60 * 1000)
  return [
    {
      id: 'GOV/ICT/2026/RA01',
      title: 'Supply of Computer Systems',
      agency: 'Ministry of Digital Transformation',
      type: 'e-reverse-auction',
      category: 'ICT',
      product: 'Desktop computer systems (Ministry standard configuration)',
      quantity: '1200',
      unit: 'units',
      valueCr: 2,
      valueLabel: '₹2 Cr',
      location: 'New Delhi',
      submissionDeadline: raDeadline,
      bidOpeningDate: raDeadline,
      stage: 'PUBLISHED',
      requirementsJson: JSON.stringify({
        eligibility: [
          { key: 'minTurnoverCr', label: 'Average annual turnover (last 3 years)', value: 2 },
          { key: 'minYearsExperience', label: 'Years in similar supply business', value: 3 },
          { key: 'netWorthPositive', label: 'Positive net worth', value: 1 },
          { key: 'miiMinLocalContentPct', label: 'Class-I local content (Make in India)', value: 50 },
        ],
        technical: [
          { key: 'processor', label: 'Processor', expected: 'Intel Core i5 12th Gen or above' },
          { key: 'ram', label: 'RAM', expected: '16 GB DDR4' },
          { key: 'os', label: 'Operating system', expected: 'Windows 11 Pro' },
          { key: 'warranty', label: 'Onsite warranty', expected: '3 years' },
        ],
      }),
      emdRequired: true,
      emdAmountCr: 0.04,
      bidValidityDays: 30,
      msePreference: true,
      miiMinLocalContentPct: 50,
      albThresholdPct: 25,
    },
    {
      id: 'GOV/GEN/2026/OP07',
      title: 'Supply of office consumables and stationery',
      agency: 'Ministry of Digital Transformation',
      type: 'open',
      category: 'GEN',
      product: 'Office consumables — annual rate contract',
      quantity: 'Lot',
      unit: 'lot',
      valueCr: 0.04,
      valueLabel: '₹4 L',
      location: 'New Delhi',
      submissionDeadline: openDeadline,
      bidOpeningDate: openDeadline,
      stage: 'PUBLISHED',
      requirementsJson: JSON.stringify({
        eligibility: [
          { key: 'minTurnoverCr', label: 'Average annual turnover (last 3 years)', value: 0.5 },
          { key: 'netWorthPositive', label: 'Positive net worth', value: 1 },
        ],
        technical: [],
      }),
      emdRequired: false, // ≤ ₹5 L ⇒ EMD not applicable (GeM rule)
      emdAmountCr: null,
      bidValidityDays: 15,
      msePreference: true,
      miiMinLocalContentPct: null,
      albThresholdPct: 25,
    },
  ]
}

async function seedTender(t: Record<string, unknown>) {
  const id = String(t.id)
  const deadline = (t.submissionDeadline ?? t.deadline) as string | Date
  const deadlineDate = deadline instanceof Date ? deadline : new Date(deadline)
  const data = {
    ...t,
    createdById: OFFICER_ID,
    corrigendaJson: '[]',
    requirementsJson: t.requirementsJson ?? JSON.stringify({ eligibility: [], technical: [] }),
    publishDate: t.published ? new Date(String(t.published)) : new Date(),
    submissionDeadline: deadlineDate,
    bidOpeningDate: deadlineDate,
  } as Parameters<typeof prisma.tender.upsert>[0]['create']
  delete (data as Record<string, unknown>).deadline
  delete (data as Record<string, unknown>).published
  await prisma.tender.upsert({
    where: { id },
    update: data,
    create: {
      ...data,
      requiredDocs: {
        create: DEFAULT_DOCS.map(d => ({ ...d, id: `${id}:${d.name}` })),
      },
    },
  })
}

async function main() {
  for (const p of personas) {
    let companyId: string | null = null
    if (p.company) {
      const gstin = gstinFor('07', p.company.pan)
      const c = p.company as Record<string, unknown>
      const data = { ...c, gstin } as unknown as { id: string; name: string } & Record<string, unknown>
      await prisma.company.upsert({
        where: { id: p.company.id },
        update: data,
        create: data,
      })
      companyId = p.company.id
    }
    await prisma.user.upsert({
      where: { id: p.user.id },
      update: { ...p.user, password: hashPassword(p.user.password), companyId },
      create: { ...p.user, password: hashPassword(p.user.password), companyId },
    })
  }

  for (const t of LEGACY_TENDERS) await seedTender(t)
  for (const t of demoTenders()) await seedTender(t)

  const users = await prisma.user.count()
  const companies = await prisma.company.count()
  const tenders = await prisma.tender.count()
  console.log(`Seed complete: ${users} users, ${companies} companies, ${tenders} tenders.`)
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
