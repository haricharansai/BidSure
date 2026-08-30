import type {
  Bidder,
  CheckRow,
  ComplianceData,
  OfficerDashboardData,
  SellerDashboardData,
  SessionUser,
  Status,
  Tender,
} from '@/lib/types'

interface UserRecord {
  id: string
  type: 'officer' | 'seller'
  email: string
  password: string
  name: string
  subtitle: string
  initials: string
  department?: string
  employeeId?: string
  company?: string
  registrationNo?: string
  tin?: string
}

const USERS: UserRecord[] = [
  {
    id: 'usr-officer-001',
    type: 'officer',
    email: 'arun.mehta@digitransform.gov.in',
    password: 'officer123',
    name: 'Arun Mehta',
    subtitle: 'Procurement Officer',
    initials: 'AM',
    department: 'Ministry of Digital Transformation',
    employeeId: 'EMP-2024-00142',
  },
  {
    id: 'usr-seller-001',
    type: 'seller',
    email: 'contact@nexorasystems.com',
    password: 'seller123',
    name: 'Nexora Systems',
    subtitle: 'Registered Seller',
    initials: 'NX',
    company: 'Nexora Systems Pvt. Ltd.',
    registrationNo: 'CIN U72900DL2014PTC',
    tin: 'TIN-07ABCDE1234F',
  },
]

const TENDERS: Tender[] = [
  {
    id: 'GOV/ICT/2026/041',
    title: 'Supply and installation of secure network infrastructure',
    agency: 'Ministry of Digital Transformation',
    deadline: '12 Sep 2026',
    deadlineISO: '2026-09-12T17:00:00+05:30',
    biddersCount: 8,
    status: 'In Review',
    value: '₹18.4 Cr',
    published: '18 Aug 2026',
    bidSecurity: '₹36.8 Lakhs',
    evaluationMethod: 'Two-stage — technical & financial',
    checksComplete: 42,
    checksTotal: 86,
    requirements: [
      { name: 'Bidder registration & identity', status: 'Verified' },
      { name: 'Technical capability and experience', status: 'Verified' },
      { name: 'Financial capacity', status: 'Verified' },
      { name: 'OEM authorization', status: 'Verified' },
      { name: 'Local-content declaration', status: 'Pending' },
      { name: 'Debarment screening', status: 'Pending' },
    ],
  },
  {
    id: 'PWD/INFRA/2026/019',
    title: 'Construction of regional public health centres',
    agency: 'Public Works Department',
    deadline: '20 Sep 2026',
    deadlineISO: '2026-09-20T17:00:00+05:30',
    biddersCount: 12,
    status: 'Pending',
    value: '₹42.8 Cr',
    published: '02 Aug 2026',
    bidSecurity: '₹85.6 Lakhs',
    evaluationMethod: 'Single-stage — two envelope',
    checksComplete: 18,
    checksTotal: 120,
    requirements: [
      { name: 'Bidder registration & identity', status: 'Verified' },
      { name: 'Technical capability and experience', status: 'Verified' },
      { name: 'Financial capacity', status: 'Pending' },
      { name: 'OEM authorization', status: 'Pending' },
      { name: 'Local-content declaration', status: 'Pending' },
      { name: 'Debarment screening', status: 'Pending' },
    ],
  },
  {
    id: 'EDU/TECH/2026/008',
    title: 'Digital classroom equipment and support services',
    agency: 'Department of Education',
    deadline: '05 Oct 2026',
    deadlineISO: '2026-10-05T17:00:00+05:30',
    biddersCount: 5,
    status: 'Complete',
    value: '₹9.6 Cr',
    published: '10 Jul 2026',
    bidSecurity: '₹19.2 Lakhs',
    evaluationMethod: 'Quality-cum-cost based',
    checksComplete: 64,
    checksTotal: 64,
    requirements: [
      { name: 'Bidder registration & identity', status: 'Verified' },
      { name: 'Technical capability and experience', status: 'Verified' },
      { name: 'Financial capacity', status: 'Verified' },
      { name: 'OEM authorization', status: 'Verified' },
      { name: 'Local-content declaration', status: 'Verified' },
      { name: 'Debarment screening', status: 'Verified' },
    ],
  },
  {
    id: 'HEALTH/PHARMA/2026/032',
    title: 'Annual supply of essential medicines',
    agency: 'National Health Authority',
    deadline: '28 Sep 2026',
    deadlineISO: '2026-09-28T17:00:00+05:30',
    biddersCount: 16,
    status: 'Exception',
    value: '₹27.2 Cr',
    published: '22 Jul 2026',
    bidSecurity: '₹54.4 Lakhs',
    evaluationMethod: 'Two-stage — technical & financial',
    checksComplete: 51,
    checksTotal: 96,
    requirements: [
      { name: 'Bidder registration & identity', status: 'Verified' },
      { name: 'Technical capability and experience', status: 'Verified' },
      { name: 'Financial capacity', status: 'Exception' },
      { name: 'OEM authorization', status: 'Pending' },
      { name: 'Local-content declaration', status: 'Pending' },
      { name: 'Debarment screening', status: 'Verified' },
    ],
  },
  {
    id: 'RDS/INFRA/2026/003',
    title: 'Road maintenance and infrastructure upgrade',
    agency: 'Road Development Authority',
    deadline: '15 Oct 2026',
    deadlineISO: '2026-10-15T17:00:00+05:30',
    biddersCount: 9,
    status: 'In Review',
    value: '₹55.3 Cr',
    published: '25 Aug 2026',
    bidSecurity: '₹1.1 Cr',
    evaluationMethod: 'Single-stage — two envelope',
    checksComplete: 12,
    checksTotal: 90,
    requirements: [
      { name: 'Bidder registration & identity', status: 'Verified' },
      { name: 'Technical capability and experience', status: 'Pending' },
      { name: 'Financial capacity', status: 'Pending' },
      { name: 'OEM authorization', status: 'Pending' },
      { name: 'Local-content declaration', status: 'Pending' },
      { name: 'Debarment screening', status: 'Verified' },
    ],
  },
  {
    id: 'ENV/WASTE/2026/017',
    title: 'Waste management services contract',
    agency: 'Environmental Protection Agency',
    deadline: '30 Sep 2026',
    deadlineISO: '2026-09-30T17:00:00+05:30',
    biddersCount: 6,
    status: 'Pending',
    value: '₹12.7 Cr',
    published: '12 Aug 2026',
    bidSecurity: '₹25.4 Lakhs',
    evaluationMethod: 'Quality-cum-cost based',
    checksComplete: 9,
    checksTotal: 60,
    requirements: [
      { name: 'Bidder registration & identity', status: 'Pending' },
      { name: 'Technical capability and experience', status: 'Pending' },
      { name: 'Financial capacity', status: 'Pending' },
      { name: 'OEM authorization', status: 'Pending' },
      { name: 'Local-content declaration', status: 'Verified' },
      { name: 'Debarment screening', status: 'Verified' },
    ],
  },
]

const BIDDERS_BY_TENDER: Record<string, Bidder[]> = {
  'GOV/ICT/2026/041': [
    { name: 'Nexora Systems Pvt. Ltd.', reg: 'CIN U72900DL2014PTC...', docsSubmitted: 14, docsTotal: 14, status: 'Verified', risk: 'Low' },
    { name: 'Apex Infrastructure Ltd.', reg: 'CIN U45201MH2010PLC...', docsSubmitted: 12, docsTotal: 14, status: 'Exception', risk: 'Medium' },
    { name: 'CivicGrid Technologies', reg: 'CIN U72200KA2018PTC...', docsSubmitted: 14, docsTotal: 14, status: 'Verified', risk: 'Low' },
    { name: 'Harborline Solutions', reg: 'CIN U74999TN2016PTC...', docsSubmitted: 11, docsTotal: 14, status: 'Pending', risk: 'High' },
    { name: 'TechBuild Constructions', reg: 'CIN U70100GJ2019PTC...', docsSubmitted: 13, docsTotal: 14, status: 'Verified', risk: 'Low' },
    { name: 'SecureLogics Inc.', reg: 'CIN U32300AP2015PTC...', docsSubmitted: 10, docsTotal: 14, status: 'Exception', risk: 'High' },
    { name: 'UrbanDevelopers Ltd.', reg: 'CIN U45100DL2020PTC...', docsSubmitted: 14, docsTotal: 14, status: 'Verified', risk: 'Low' },
    { name: 'GlobalTenders Corp.', reg: 'CIN U51100UP2018PTC...', docsSubmitted: 9, docsTotal: 14, status: 'Pending', risk: 'Medium' },
  ],
  'PWD/INFRA/2026/019': [
    { name: 'Nexora Systems Pvt. Ltd.', reg: 'CIN U72900DL2014PTC...', docsSubmitted: 14, docsTotal: 14, status: 'Verified', risk: 'Low' },
    { name: 'Apex Infrastructure Ltd.', reg: 'CIN U45201MH2010PLC...', docsSubmitted: 13, docsTotal: 14, status: 'In Review', risk: 'Medium' },
    { name: 'TechBuild Constructions', reg: 'CIN U70100GJ2019PTC...', docsSubmitted: 14, docsTotal: 14, status: 'Verified', risk: 'Low' },
  ],
  'EDU/TECH/2026/008': [
    { name: 'Nexora Systems Pvt. Ltd.', reg: 'CIN U72900DL2014PTC...', docsSubmitted: 14, docsTotal: 14, status: 'Verified', risk: 'Low' },
    { name: 'CivicGrid Technologies', reg: 'CIN U72200KA2018PTC...', docsSubmitted: 14, docsTotal: 14, status: 'Verified', risk: 'Low' },
  ],
  'HEALTH/PHARMA/2026/032': [
    { name: 'Harborline Solutions', reg: 'CIN U74999TN2016PTC...', docsSubmitted: 11, docsTotal: 14, status: 'Exception', risk: 'High' },
    { name: 'SecureLogics Inc.', reg: 'CIN U32300AP2015PTC...', docsSubmitted: 10, docsTotal: 14, status: 'Exception', risk: 'High' },
  ],
  'RDS/INFRA/2026/003': [
    { name: 'Apex Infrastructure Ltd.', reg: 'CIN U45201MH2010PLC...', docsSubmitted: 12, docsTotal: 14, status: 'In Review', risk: 'Medium' },
    { name: 'GlobalTenders Corp.', reg: 'CIN U51100UP2018PTC...', docsSubmitted: 9, docsTotal: 14, status: 'Pending', risk: 'Medium' },
  ],
  'ENV/WASTE/2026/017': [
    { name: 'UrbanDevelopers Ltd.', reg: 'CIN U45100DL2020PTC...', docsSubmitted: 14, docsTotal: 14, status: 'Pending', risk: 'Low' },
  ],
}

const SELLER_TENDER_IDS: Record<string, string[]> = {
  'usr-seller-001': ['GOV/ICT/2026/041', 'PWD/INFRA/2026/019', 'EDU/TECH/2026/008'],
}

const BASE_CHECKS: CheckRow[] = [
  { requirement: 'Company registration certificate', status: 'Verified', note: 'Verified against MCA registry' },
  { requirement: 'Tax clearance certificate', status: 'Verified', note: 'Verified with GSTN records' },
  { requirement: 'Financial capacity statement', status: 'Exception', note: 'Below required turnover threshold' },
  { requirement: 'OEM authorization letter', status: 'Pending', note: 'Verification source unavailable' },
  { requirement: 'Past experience references', status: 'Verified', note: '3 of 3 references confirmed' },
  { requirement: 'Debarment declaration', status: 'Verified', note: 'No matches found' },
]

const BIDDER_DOC_TOTALS = 14

const OFFICER_ACTIVITY: { caption: string; points: { label: string; value: number }[] } = {
  caption: 'Checks completed across all active tenders',
  points: [
    { label: 'May 25', value: 45 }, { label: 'Jun 01', value: 62 }, { label: 'Jun 08', value: 52 },
    { label: 'Jun 15', value: 70 }, { label: 'Jun 22', value: 58 }, { label: 'Jun 29', value: 85 },
    { label: 'Jul 06', value: 72 }, { label: 'Jul 13', value: 64 }, { label: 'Jul 20', value: 90 },
    { label: 'Jul 27', value: 76 }, { label: 'Aug 03', value: 82 }, { label: 'Aug 10', value: 94 },
  ],
}

const SELLER_PERFORMANCE: { caption: string; points: { label: string; value: number }[] } = {
  caption: 'Your submission and win activity',
  points: [
    { label: 'Jan', value: 30 }, { label: 'Feb', value: 45 }, { label: 'Mar', value: 38 },
    { label: 'Apr', value: 52 }, { label: 'May', value: 48 }, { label: 'Jun', value: 60 },
    { label: 'Jul', value: 55 }, { label: 'Aug', value: 42 }, { label: 'Sep', value: 68 },
    { label: 'Oct', value: 58 }, { label: 'Nov', value: 72 }, { label: 'Dec', value: 80 },
  ],
}

export function findUserById(id: string): UserRecord | undefined {
  return USERS.find(u => u.id === id)
}

export function authenticate(
  type: 'officer' | 'seller',
  email: string,
  password: string,
  extras?: { employeeId?: string; tin?: string }
): SessionUser | null {
  const user = USERS.find(u => u.type === type && u.email.toLowerCase() === email.toLowerCase() && u.password === password)
  if (!user) return null
  if (user.type === 'officer' && user.employeeId && extras?.employeeId?.trim() && extras.employeeId.trim() !== user.employeeId) {
    return null
  }
  if (user.type === 'seller' && user.tin && extras?.tin?.trim() && extras.tin.trim() !== user.tin) {
    return null
  }
  return toSessionUser(user)
}

function toSessionUser(user: UserRecord): SessionUser {
  return { id: user.id, type: user.type, name: user.name, subtitle: user.subtitle, initials: user.initials, email: user.email }
}

export function getTendersForUser(user: UserRecord): Tender[] {
  if (user.type === 'officer') return TENDERS
  const ids = SELLER_TENDER_IDS[user.id] || []
  return TENDERS.filter(t => ids.includes(t.id))
}

function countDocs(bidders: Bidder[], predicate: (b: Bidder) => boolean) {
  return bidders.reduce((sum, b) => (predicate(b) ? sum + b.docsSubmitted : sum), 0)
}

export function getOfficerDashboard(user: UserRecord): OfficerDashboardData {
  const tenders = getTendersForUser(user)
  const allBidders = tenders.flatMap(t => BIDDERS_BY_TENDER[t.id] || [])
  const activeTenders = tenders.filter(t => t.status !== 'Complete')
  const underReview = allBidders.filter(b => b.status !== 'Verified').length
  const exceptions = allBidders.filter(b => b.status === 'Exception').length
  const verifiedDocs = countDocs(allBidders, b => b.status === 'Verified')

  return {
    firstName: user.name.split(' ')[0],
    department: user.department || '',
    stats: [
      { label: 'Active tenders', value: String(activeTenders.length), change: `${tenders.filter(t => t.status === 'Pending').length} awaiting kickoff` },
      { label: 'Bids under review', value: String(underReview), change: `${exceptions} require action`, tone: 'warn' },
      { label: 'Exceptions flagged', value: String(exceptions + tenders.filter(t => t.status === 'Exception').length), change: `${tenders.filter(t => t.status === 'Exception').length} tender(s) affected`, tone: 'danger' },
      { label: 'Documents verified', value: String(verifiedDocs), change: `across ${allBidders.length} submissions` },
    ],
    recentTenders: tenders.slice(0, 3),
    attention: buildOfficerAttention(tenders),
    activity: OFFICER_ACTIVITY,
  }
}

function buildOfficerAttention(tenders: Tender[]) {
  const items: { title: string; detail: string; status: Status }[] = []
  for (const tender of tenders) {
    for (const bidder of BIDDERS_BY_TENDER[tender.id] || []) {
      if (bidder.status === 'Exception') {
        const failed = getComplianceChecks(tender.id, bidder.name).filter(c => c.status === 'Exception')
        items.push({
          title: bidder.name,
          detail: failed.length ? `${failed[0].requirement.toLowerCase()} — ${failed[0].note.toLowerCase()}` : `${tender.id} requires review`,
          status: 'Exception',
        })
      }
    }
    if (tender.status === 'Exception') {
      const exceptionCount = (BIDDERS_BY_TENDER[tender.id] || []).filter(b => b.status === 'Exception').length
      items.push({ title: tender.id, detail: `${exceptionCount} bidder exceptions require review`, status: 'Pending' })
    }
    for (const check of getComplianceChecks(tender.id, '')) {
      if (check.note === 'Verification source unavailable') {
        items.push({ title: `${tender.id}`, detail: `${check.requirement}: verification source unavailable`, status: 'Exception' })
        break
      }
    }
  }
  return items.slice(0, 3)
}

export function getSellerDashboard(user: UserRecord): SellerDashboardData {
  const myBids = getTendersForUser(user)
  const activeBids = myBids.filter(t => t.status !== 'Complete')
  const completed = myBids.filter(t => t.status === 'Complete').length
  const won = myBids.filter(t => t.status === 'Complete' && (BIDDERS_BY_TENDER[t.id] || []).some(b => b.name.startsWith(user.company?.split(' ')[0] || '###'))).length
  const winRate = completed > 0 ? Math.round((won / completed) * 100) : 0
  const verifiedDocs = myBids.reduce((sum, t) => sum + (BIDDERS_BY_TENDER[t.id] || []).filter(b => b.status === 'Verified').reduce((s, b) => s + b.docsSubmitted, 0), 0)
  const openOpportunities = TENDERS.filter(t => !myBids.some(m => m.id === t.id) && t.status !== 'Complete')
  const closingSoon = openOpportunities.filter(t => new Date(t.deadlineISO).getTime() - Date.now() < 21 * 24 * 3600 * 1000).length

  return {
    companyName: user.company?.split(' ').slice(0, 2).join(' ') || user.name,
    stats: [
      { label: 'Active bids', value: String(activeBids.length), change: `${activeBids.filter(t => t.status === 'Pending').length} pending response` },
      { label: 'Win rate', value: `${winRate}%`, change: completed > 0 ? `${won} of ${completed} completed bids won` : 'No completed bids yet' },
      { label: 'Documents verified', value: String(verifiedDocs), change: 'Across your submissions' },
      { label: 'Open opportunities', value: String(openOpportunities.length), change: `${closingSoon} closing soon`, tone: 'warn' },
    ],
    recentBids: myBids,
    deadlines: buildSellerDeadlines(myBids),
    performance: SELLER_PERFORMANCE,
  }
}

function buildSellerDeadlines(myBids: Tender[]) {
  const items: { title: string; detail: string; status: Status }[] = []
  for (const tender of myBids) {
    if (tender.status === 'Complete') continue
    const pending = tender.requirements.find(r => r.status === 'Pending')
    const daysLeft = Math.max(1, Math.ceil((new Date(tender.deadlineISO).getTime() - Date.now()) / (24 * 3600 * 1000)))
    items.push({
      title: tender.id,
      detail: pending ? `${pending.name} — ${daysLeft} day(s) left` : `Awaiting evaluation — ${daysLeft} day(s) left`,
      status: 'Pending',
    })
  }
  return items.slice(0, 3)
}

export function getComplianceChecks(_tenderId: string, _bidderName: string): CheckRow[] {
  return BASE_CHECKS.map(check => ({ ...check }))
}

export function getCompliance(tenderId: string, bidderName: string): ComplianceData | null {
  const bidders = BIDDERS_BY_TENDER[tenderId] || []
  const bidder = bidders.find(b => b.name === bidderName) || bidders[0]
  if (!bidder) return null
  const checks = getComplianceChecks(tenderId, bidder.name).map(check => ({
    ...check,
    status: (bidder.status === 'Verified' ? 'Verified' : check.status) as Status,
  }))
  const verified = checks.filter(c => c.status === 'Verified').length
  return {
    bidderName: bidder.name,
    tenderId,
    docsSubmitted: bidder.docsSubmitted,
    docsTotal: BIDDER_DOC_TOTALS,
    scorePct: Math.round((verified / checks.length) * 100),
    checks,
  }
}

export function getBiddersForTender(tenderId: string): Bidder[] {
  return BIDDERS_BY_TENDER[tenderId] || []
}
