// Read-side projections for the GeM workflow (all session-authenticated).
// Bridges Prisma rows into the v2 shapes declared in lib/types.ts.
import { prisma } from '@/lib/prisma'
import type { AuthedUser } from '@/lib/server/auth'
import { verifyAuditChain } from '@/lib/server/audit'
import { evaluateEligibility, type CompanyProfile } from '@/lib/engine'
import { STAGE_LABELS, TENDER_TYPE_CONFIG, isTenderType } from '@/lib/tender-config'
import { mseMatchOptions, parseRequirements, toCompanyProfile } from '@/lib/server/evaluate'
import type {
  AuditData, AuditRow, AuctionState, EvaluationDetailData, EvaluationRow,
  MarketplaceTender, ProcurementStage, SellerSubmissionRow, TenderDetailV2,
  TimelineStep, OfficerTenderRow, FlagRow, EligibilityRow,
  DocStatus6,
  // legacy shapes
  Bidder, CheckRow, ComplianceData, EvaluationData,
  OfficerDashboardData, SellerDashboardData, Status, Tender, Risk,
  TenderDetailData, AttentionItem, StatCard, SeriesPoint,
} from '@/lib/types'

type MyCompany = TenderDetailV2['myCompany']

function parse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

function typeLabel(type: string): string {
  return isTenderType(type) ? TENDER_TYPE_CONFIG[type].label : type
}

function nextStepFor(type: string, stage: string): string {
  if (isTenderType(type) && (stage === 'PUBLISHED' || stage === 'CORRIGENDUM')) return TENDER_TYPE_CONFIG[type].nextStep
  return STAGE_LABELS[stage] ?? stage
}

const FULL_TIMELINE: { stage: string; label: string }[] = [
  { stage: 'PUBLISHED', label: 'Published — accepting submissions' },
  { stage: 'CORRIGENDUM', label: 'Corrigendum — amended terms' },
  { stage: 'CLOSED', label: 'Deadline lock / clarification window' },
  { stage: 'EVALUATED', label: 'Automated evaluation complete' },
  { stage: 'AUCTION_ACTIVE', label: 'Live e-reverse auction' },
  { stage: 'AUCTION_CLOSED', label: 'Auction closed' },
  { stage: 'AWARDED', label: 'Award' },
]

function buildTimeline(type: string, stage: ProcurementStage, isRA: boolean, hasCorrigenda = false): TimelineStep[] {
  const order = ['PUBLISHED', 'CORRIGENDUM', 'CLOSED', 'EVALUATED', 'AUCTION_ACTIVE', 'AUCTION_CLOSED', 'AWARDED']
  const reachIdx = Math.max(0, order.indexOf(stage))
  if (isRA && (stage === 'AUCTION_FAILED' || stage === 'CANCELLED')) {
    const done: TimelineStep[] = FULL_TIMELINE.slice(0, 3).map(s => ({ ...s, state: 'done' as const }))
    return done.concat([{ stage, label: STAGE_LABELS[stage] ?? stage, state: 'skipped' as const }])
  }
  const effective = isRA ? reachIdx : (() => {
    // Non-RA: auction steps are skipped entirely.
    if (stage === 'AUCTION_CLOSED') return order.indexOf('EVALUATED')
    return reachIdx
  })()
  return FULL_TIMELINE.filter(s => isRA || !s.stage.startsWith('AUCTION')).map(s => {
    const idx = order.indexOf(s.stage)
    if (s.stage === 'CORRIGENDUM' && !hasCorrigenda) return { ...s, state: 'skipped' as const }
    if (s.stage.startsWith('AUCTION') && !isRA) return { ...s, state: 'skipped' as const }
    if (idx < effective) return { ...s, state: 'done' as const }
    if (idx === effective) return { ...s, state: 'active' as const }
    return { ...s, state: 'todo' as const }
  })
}

function nextMoveFor(role: 'OFFICER' | 'SELLER', stage: ProcurementStage, opts: {
  isRA: boolean
  hasSubmission: boolean
  pendingClarifications: number
  qualified: boolean
  iWon: boolean
  zeroQualified: boolean
}): { label: string; target: string | null; detail: string } {
  if (role === 'OFFICER') {
    switch (stage) {
      case 'PUBLISHED':
      case 'CORRIGENDUM':
        return { label: stage === 'CORRIGENDUM' ? 'Corrigendum issued' : 'Accepting submissions', target: null, detail: stage === 'CORRIGENDUM' ? 'Amended terms are live; submissions continue until the (possibly extended) deadline.' : 'Monitor submissions; deadline lock and evaluation are automatic.' }
      case 'CLOSED':
        return opts.pendingClarifications
          ? { label: 'Clarifications pending', target: 'clarifications', detail: 'Technical evaluation is blocked while seller responses are pending (GeM rule).' }
          : { label: 'Awaiting auto-evaluation', target: null, detail: 'Evaluation runs on the next request after the deadline lock.' }
      case 'EVALUATED':
        return { label: 'Review evaluation', target: 'w-eval', detail: opts.isRA ? 'Verify qualified bidders before the reverse auction opens.' : 'Review the table, approve/reject review-gate items, then award.' }
      case 'AUCTION_ACTIVE':
        return { label: 'Auction running', target: 'w-eval', detail: 'Auto-extension applies to bids in the closing window (max 3).' }
      case 'AUCTION_CLOSED':
        return { label: 'Award the contract', target: 'w-eval', detail: 'Pick L1 (or MSE match option) and record the ePBG status.' }
      case 'EVALUATION_FAILED':
      case 'AUCTION_FAILED':
        return { label: 'Zero qualified bidders', target: null, detail: 'Officer decision required: cancel or re-publish.' }
      case 'AWARDED':
        return { label: 'Contract awarded', target: null, detail: 'ePBG status and award decision are recorded in the audit chain.' }
      case 'CANCELLED':
        return { label: 'Tender cancelled', target: null, detail: 'This tender is closed.' }
      default:
        return { label: STAGE_LABELS[stage] ?? stage, target: null, detail: '' }
    }
  }
  switch (stage) {
    case 'PUBLISHED':
    case 'CORRIGENDUM':
      return opts.hasSubmission
        ? { label: 'Submission locked in', target: null, detail: 'You can withdraw until the deadline (EMD forfeiture applies). No document changes after lock.' }
        : { label: 'Submit your bid', target: 'w-tender', detail: 'Complete the structured doc claims before the deadline.' }
    case 'CLOSED':
      return opts.pendingClarifications
        ? { label: 'Respond to clarification', target: 'clarifications', detail: 'Technical evaluation of your bid is blocked until you answer.' }
        : { label: 'Awaiting evaluation', target: null, detail: 'The deadline has passed; evaluation is automatic.' }
    case 'EVALUATED':
      return opts.qualified && opts.isRA
        ? { label: 'Prepare for auction', target: 'w-auction', detail: 'You qualified for the e-reverse auction.' }
        : opts.qualified
          ? { label: 'Awaiting award decision', target: null, detail: 'You qualified — the officer will award.' }
          : { label: 'Not qualified', target: null, detail: 'Check the reasons and flags on your evaluation.' }
    case 'AUCTION_ACTIVE':
      return { label: 'Place your bid', target: 'w-auction', detail: 'Bids must descend; auto-extension applies near close.' }
    case 'AUCTION_CLOSED':
    case 'AWARDED':
      return opts.iWon
        ? { label: 'You won the contract', target: null, detail: 'Award recorded with ePBG status (system-verified from declared data).' }
        : { label: 'Auction closed', target: null, detail: 'Awaiting the award decision.' }
    default:
      return { label: STAGE_LABELS[stage] ?? stage, target: null, detail: '' }
  }
}

// ---------------------------------------------------------------------------
// Marketplace (seller discovery)
// ---------------------------------------------------------------------------

export async function getMarketplace(user: AuthedUser): Promise<{ tenders: MarketplaceTender[] }> {
  const [tenders, mySubs] = await Promise.all([
    prisma.tender.findMany({
      where: { stage: { in: ['PUBLISHED', 'CORRIGENDUM'] } },
      orderBy: { submissionDeadline: 'asc' },
      include: { _count: { select: { submissions: true } } },
    }),
    user.companyId
      ? prisma.submission.findMany({ where: { company: { id: user.companyId } } })
      : Promise.resolve([]),
  ])
  const profile = user.companyId
    ? toCompanyProfile(await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } }))
    : null
  const subByTender = new Map(mySubs.map(s => [s.tenderId, s]))
  const rows: MarketplaceTender[] = tenders.map(t => {
    const requirements = parseRequirements(t)
    const eligibility = profile
      ? { overall: overallEligibility(evaluateEligibility(profile, requirements)), rows: evaluateEligibility(profile, requirements) }
      : { overall: 'not_yet_verified', rows: [] as EligibilityRow[] }
    const sub = subByTender.get(t.id)
    return {
      id: t.id,
      title: t.title,
      agency: t.agency,
      type: t.type,
      typeLabel: typeLabel(t.type),
      category: t.category,
      valueLabel: t.valueLabel,
      stage: t.stage as ProcurementStage,
      submissionDeadlineISO: t.submissionDeadline.toISOString(),
      emdRequired: t.emdRequired,
      msePreference: t.msePreference,
      miiMinLocalContentPct: t.miiMinLocalContentPct,
      mySubmissionStatus: sub ? (sub.status === 'WITHDRAWN' ? 'WITHDRAWN' : 'SUBMITTED') : null,
      eligibility,
      nextStep: nextStepFor(t.type, t.stage),
    }
  })
  return { tenders: rows }
}

function overallEligibility(rows: { status: 'PASS' | 'FAIL' | 'ATTENTION' }[]): string {
  if (!rows.length) return 'not_yet_verified'
  if (rows.some(r => r.status === 'FAIL')) return 'not_eligible'
  if (rows.some(r => r.status === 'ATTENTION')) return 'needs_attention'
  return 'qualified'
}

// ---------------------------------------------------------------------------
// Tender detail v2 (seller submit flow / officer overview)
// ---------------------------------------------------------------------------

export async function getTenderDetailV2(user: AuthedUser, tenderId: string): Promise<TenderDetailV2 | null> {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    include: {
      requiredDocs: true,
      submissions: { include: { clarifications: true, company: true, docs: true } },
      evaluations: { include: { company: { select: { name: true } } } },
    },
  })
  if (!tender) return null

  const requirements = parseRequirements(tender)
  const isRA = tender.type === 'e-reverse-auction'
  const stage = tender.stage as ProcurementStage
  const mySubmission = user.companyId ? tender.submissions.find(s => s.companyId === user.companyId) ?? null : null
  const myEvaluationRow = user.companyId ? tender.evaluations.find(e => e.companyId === user.companyId) ?? null : null
  const myClarifications = mySubmission ? mySubmission.clarifications : []
  const pendingClarifications = myClarifications.filter(c => c.status === 'PENDING').length
  const awardedCompanyName = tender.awardedToCompanyId
    ? tender.evaluations.find(e => e.companyId === tender.awardedToCompanyId)?.company.name ?? null
    : null

  let myCompany: TenderDetailV2['myCompany'] = null
  let eligibility: TenderDetailV2['eligibility'] = null
  if (user.companyId) {
    const c = await prisma.company.findUnique({ where: { id: user.companyId } })
    if (c) {
      const profile = toCompanyProfile(c)
      myCompany = {
        gstin: c.gstin, pan: c.pan, udyamNo: c.udyamNo, udyamNicCode: c.udyamNicCode,
        miiLocalContentPct: c.miiLocalContentPct, msme: c.msme, isStartup: c.isStartup, isReseller: c.isReseller,
      }
      const rows = evaluateEligibility(profile, requirements)
      eligibility = { overall: overallEligibility(rows), rows }
    }
  }

  return {
    id: tender.id,
    title: tender.title,
    agency: tender.agency,
    type: tender.type,
    typeLabel: typeLabel(tender.type),
    category: tender.category,
    product: tender.product,
    quantity: tender.quantity,
    unit: tender.unit,
    valueCr: tender.valueCr,
    valueLabel: tender.valueLabel,
    location: tender.location,
    stage,
    stageLabel: STAGE_LABELS[stage] ?? stage,
    publishDateISO: tender.publishDate.toISOString(),
    submissionDeadlineISO: tender.submissionDeadline.toISOString(),
    auctionStartISO: tender.auctionStart?.toISOString() ?? null,
    auctionEndISO: tender.auctionEnd?.toISOString() ?? null,
    emdRequired: tender.emdRequired,
    emdAmountCr: tender.emdAmountCr,
    bidValidityDays: tender.bidValidityDays,
    msePreference: tender.msePreference,
    miiMinLocalContentPct: tender.miiMinLocalContentPct,
    albThresholdPct: tender.albThresholdPct,
    eligibilityReqs: requirements.eligibility ?? [],
    technicalReqs: requirements.technical ?? [],
    requiredDocs: tender.requiredDocs.map(d => ({
      name: d.name, description: d.description, classification: d.classification as TenderDetailV2['requiredDocs'][number]['classification'], conditionKey: d.conditionKey,
    })),
    corrigenda: parse<{ version: string; note: string; createdAtISO: string; deadlineChanged: boolean }[]>(tender.corrigendaJson, []).map(c => ({
      version: parseFloat(c.version), note: c.note, createdAtISO: c.createdAtISO, deadlineChanged: c.deadlineChanged,
    })),
    eligibility,
    mySubmission: mySubmission ? {
      id: mySubmission.id,
      tenderId: tender.id,
      tenderTitle: tender.title,
      stage,
      submittedAtISO: mySubmission.submittedAt.toISOString(),
      financialBidCr: mySubmission.financialBidCr,
      docsProvided: mySubmission.docs.filter(d => d.provided).length,
      docsTotal: mySubmission.docs.length,
      resultStatus: myEvaluationRow?.status ?? null,
      rank: myEvaluationRow?.rank ?? null,
      compliancePct: myEvaluationRow?.compliancePct ?? null,
      flags: parse<FlagRow[]>(myEvaluationRow?.flagsJson ?? '[]', []),
    } : null,
    clarifications: myClarifications.map(c => ({
      id: c.id, question: c.question, response: c.response,
      askedAtISO: c.askedAt.toISOString(), respondByISO: c.respondBy.toISOString(), status: c.status,
    })),
    nextMove: nextMoveFor(user.role, stage, {
      isRA,
      hasSubmission: !!mySubmission,
      pendingClarifications,
      qualified: ['qualified', 'awarded'].includes(myEvaluationRow?.status ?? ''),
      iWon: tender.awardedToCompanyId === user.companyId,
      zeroQualified: stage === 'EVALUATION_FAILED',
    }),
    timeline: buildTimeline(tender.type, stage, isRA, tender.corrigendaJson !== '[]'),
    myEvaluation: myEvaluationRow ? toEvaluationRow(myEvaluationRow) : null,
    awardedToCompanyName: awardedCompanyName,
    iWon: tender.awardedToCompanyId === user.companyId,
    myCompany,
  }
}

function toEvaluationRow(e: {
  id: string; submissionId: string | null; companyId: string; company: { name: string }
  status: string; eligibility: string; technical: string; compliancePct: number
  financialCr: number | null; rank: number | null; risk: string
  flagsJson: string; reasonsJson: string; reviewNote: string | null
}): EvaluationRow {
  const technical = parse<{ passed: number; total: number; failures: string[] }>(e.technical, { passed: 0, total: 0, failures: [] })
  return {
    id: e.id,
    companyId: e.companyId,
    companyName: e.company.name,
    submissionId: e.submissionId,
    status: e.status as EvaluationRow['status'],
    eligibility: e.eligibility,
    technicalPassed: technical.passed,
    technicalTotal: technical.total,
    compliancePct: e.compliancePct,
    financialCr: e.financialCr,
    rank: e.rank,
    risk: e.risk,
    flags: parse<FlagRow[]>(e.flagsJson, []),
    reasons: parse<string[]>(e.reasonsJson, []),
    reviewNote: e.reviewNote,
  }
}

// ---------------------------------------------------------------------------
// Seller submissions ("my bids")
// ---------------------------------------------------------------------------

export async function getMySubmissions(user: AuthedUser): Promise<{ submissions: SellerSubmissionRow[] }> {
  if (!user.companyId) return { submissions: [] }
  const subs = await prisma.submission.findMany({
    where: { companyId: user.companyId },
    include: {
      tender: true,
      docs: true,
      clarifications: true,
    },
    orderBy: { submittedAt: 'desc' },
  })
  const rows: SellerSubmissionRow[] = []
  for (const s of subs) {
    const evaluation = await prisma.evaluationResult.findUnique({
      where: { tenderId_companyId: { tenderId: s.tenderId, companyId: s.companyId } },
    })
    rows.push({
      id: s.id,
      tenderId: s.tenderId,
      tenderTitle: s.tender.title,
      stage: s.tender.stage as ProcurementStage,
      submittedAtISO: s.submittedAt.toISOString(),
      financialBidCr: s.financialBidCr,
      docsProvided: s.docs.filter(d => d.provided).length,
      docsTotal: s.docs.length,
      resultStatus: evaluation?.status ?? null,
      rank: evaluation?.rank ?? null,
      compliancePct: evaluation?.compliancePct ?? null,
      flags: parse<FlagRow[]>(evaluation?.flagsJson ?? '[]', []),
    })
  }
  return { submissions: rows }
}

// ---------------------------------------------------------------------------
// Auction state
// ---------------------------------------------------------------------------

export async function getAuctionState(user: AuthedUser, tenderId: string): Promise<AuctionState | null> {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    include: {
      bids: { orderBy: { amountCr: 'asc' } },
      evaluations: { include: { company: { select: { name: true, id: true } } } },
    },
  })
  if (!tender) return null
  const myEvaluation = user.companyId ? tender.evaluations.find(e => e.companyId === user.companyId) ?? null : null
  const amQualified = ['qualified', 'awarded'].includes(myEvaluation?.status ?? '')
  const lowest = tender.bids[0] ?? null
  const myBids = user.companyId ? tender.bids.filter(b => b.companyId === user.companyId) : []
  const myLowest = myBids[0] ?? null
  const rankedCompanies = [...new Set(tender.bids.map(b => b.companyId))]
  const myRank = myLowest ? rankedCompanies.indexOf(user.companyId as string) + 1 : null

  let message = ''
  if (tender.stage === 'AUCTION_ACTIVE') {
    if (!amQualified) message = 'You are not a qualified bidder in this auction.'
    else if (tender.auctionStart && Date.now() < tender.auctionStart.getTime()) message = 'Auction starts shortly — prepare your bid.'
    else message = 'Bids must be below the current lowest. Auto-extension applies in the closing window (max 3).'
  } else if (tender.stage === 'AUCTION_CLOSED') message = 'The auction has closed — awaiting award.'
  else if (tender.stage === 'AUCTION_FAILED') message = 'The auction could not start (fewer than 2 qualified bidders).'
  else message = 'The auction has not opened yet.'

  return {
    tenderId: tender.id,
    stage: tender.stage as ProcurementStage,
    startsAtISO: tender.auctionStart?.toISOString() ?? null,
    endsAtISO: tender.auctionEnd?.toISOString() ?? null,
    extensionsLeft: Math.max(0, 3 - tender.auctionExtensions),
    startPriceCr: tender.valueCr,
    lowestCr: lowest?.amountCr ?? null,
    myLowestCr: myLowest?.amountCr ?? null,
    myRank,
    activeBidders: rankedCompanies.length,
    totalBids: tender.bids.length,
    recentBids: tender.bids.slice(0, 8).reverse().map(b => ({
      amountCr: b.amountCr,
      atISO: b.placedAt.toISOString(),
      anonymous: `Bidder ${String(rankedCompanies.indexOf(b.companyId) + 1).padStart(2, '0')}`,
      mine: b.companyId === user.companyId,
    })),
    amQualified,
    message,
  }
}

// ---------------------------------------------------------------------------
// Officer evaluation detail
// ---------------------------------------------------------------------------

export async function getEvaluationDetail(user: AuthedUser, tenderId: string, drillCompanyId?: string | null): Promise<EvaluationDetailData | null> {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    include: {
      requiredDocs: true,
      submissions: { include: { clarifications: true, company: true, docs: true } },
      evaluations: { include: { company: true } },
    },
  })
  if (!tender) return null

  const stage = tender.stage as ProcurementStage
  const rows = tender.evaluations.map(toEvaluationRow).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
  const qualified = rows.filter(r => ['qualified', 'awarded'].includes(r.status))
  const lowestCr = qualified.length ? Math.min(...qualified.map(r => r.financialCr ?? Infinity)) : null
  const pendingClarifications = tender.submissions.flatMap(s => s.clarifications).filter(c => c.status === 'PENDING').length
  const mseMatches = lowestCr != null && Number.isFinite(lowestCr)
    ? mseMatchOptions(
        tender.evaluations.map(e => ({ companyId: e.companyId, companyName: e.company.name, financialCr: e.financialCr, company: { msme: e.company.msme, isStartup: e.company.isStartup } })),
        lowestCr,
      )
    : []

  let awardBlockedReason: string | null = null
  if (!['EVALUATED', 'AUCTION_CLOSED'].includes(stage)) {
    awardBlockedReason = stage === 'AUCTION_ACTIVE'
      ? 'Award is possible only after the auction closes.'
      : stage === 'CLOSED'
        ? 'Evaluation has not completed yet.'
        : 'No award is possible at this stage.'
  } else if (!qualified.length) {
    awardBlockedReason = 'No qualified bidders to award.'
  }

  let drillDown: EvaluationDetailData['drillDown'] = null
  const drill = drillCompanyId ? tender.evaluations.find(e => e.companyId === drillCompanyId) : null
  if (drill) {
    const submission = tender.submissions.find(s => s.companyId === drill.companyId) ?? null
    const specByName = new Map(tender.requiredDocs.map(d => [d.name, d]))
    const docs = submission
      ? submission.docs.map(d => ({
          docName: d.docName,
          label: specByName.get(d.docName)?.description ?? d.docName,
          classification: d.classification as 'MANDATORY' | 'CONDITIONAL' | 'SUPPORTING',
          status: d.status as DocStatus6,
          note: d.note,
        }))
      : []
    const flags = parse<FlagRow[]>(drill.flagsJson, [])
    drillDown = {
      companyName: drill.company.name,
      docs,
      eligibilityRows: parse<EligibilityRow[]>(submission?.eligibilitySnapshot ?? '[]', []),
      technical: parse<{ passed: number; total: number; failures: string[] }>(drill.technical, { passed: 0, total: 0, failures: [] }),
      triangulation: {
        status: (flags.find(f => f.kind === 'TRIANGULATION')?.severity === 'CRITICAL' ? 'NON_COMPLIANT' : 'VERIFIED') as DocStatus6,
        note: flags.find(f => f.kind === 'TRIANGULATION')?.note ?? 'No turnover figures declared — triangulation not possible',
      },
      reasons: parse<string[]>(drill.reasonsJson, []),
      flags,
      clarifications: (submission?.clarifications ?? []).map(c => ({
        id: c.id, question: c.question, response: c.response, status: c.status, respondByISO: c.respondBy.toISOString(),
      })),
    }
  }

  return {
    tenderId: tender.id,
    tenderTitle: tender.title,
    stage,
    stageLabel: STAGE_LABELS[stage] ?? stage,
    pendingClarifications,
    rows,
    drillDown,
    canAward: awardBlockedReason == null,
    awardBlockedReason,
    lowestCr: lowestCr != null && Number.isFinite(lowestCr) ? lowestCr : null,
    mseMatches,
  }
}

// ---------------------------------------------------------------------------
// Clarifications
// ---------------------------------------------------------------------------

export async function getClarifications(user: AuthedUser, tenderId?: string | null) {
  const where = user.role === 'OFFICER'
    ? { ...(tenderId ? { tenderId } : {}) }
    : { submission: { companyId: user.companyId ?? '__none__' } }
  const rows = await prisma.clarification.findMany({
    where,
    include: { submission: { include: { company: { select: { name: true } } } }, tender: { select: { id: true, title: true, stage: true } } },
    orderBy: { askedAt: 'desc' },
  })
  return {
    clarifications: rows.map(c => ({
      id: c.id,
      tenderId: c.tenderId,
      tenderTitle: c.tender.title,
      stage: c.tender.stage,
      companyName: c.submission.company.name,
      question: c.question,
      response: c.response,
      askedAtISO: c.askedAt.toISOString(),
      respondByISO: c.respondBy.toISOString(),
      status: c.status,
    })),
  }
}

// ---------------------------------------------------------------------------
// Companies (officer directory)
// ---------------------------------------------------------------------------

export async function getCompanies(user: AuthedUser) {
  const rows = await prisma.company.findMany({ orderBy: { name: 'asc' } })
  return {
    companies: rows.map(c => ({
      id: c.id,
      name: c.name,
      legalName: c.legalName,
      gstin: c.gstin,
      pan: c.pan,
      msme: c.msme,
      isStartup: c.isStartup,
      isReseller: c.isReseller,
      udyamNo: c.udyamNo,
      udyamNicCode: c.udyamNicCode,
      turnoverCr: c.turnoverCr,
      netWorthCr: c.netWorthCr,
      miiLocalContentPct: c.miiLocalContentPct,
    })),
  }
}

// ---------------------------------------------------------------------------
// Officer workflow tenders
// ---------------------------------------------------------------------------

export async function getOfficerTenders(user: AuthedUser): Promise<{ tenders: OfficerTenderRow[] }> {
  const tenders = await prisma.tender.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { submissions: true } },
      evaluations: { select: { status: true, financialCr: true } },
    },
  })
  return {
    tenders: tenders.map(t => {
      const qualified = t.evaluations.filter(e => ['qualified', 'awarded'].includes(e.status))
      const lowest = qualified.length ? Math.min(...qualified.map(e => e.financialCr ?? Infinity)) : null
      return {
        id: t.id,
        title: t.title,
        type: t.type,
        typeLabel: typeLabel(t.type),
        stage: t.stage as ProcurementStage,
        stageLabel: STAGE_LABELS[t.stage] ?? t.stage,
        submissionDeadlineISO: t.submissionDeadline.toISOString(),
        submissions: t._count.submissions,
        qualified: qualified.length,
        requiresReview: t.evaluations.filter(e => e.status === 'requires_review').length,
        lowestCr: lowest != null && Number.isFinite(lowest) ? lowest : null,
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// Audit explorer (hash-chain verified client-visible)
// ---------------------------------------------------------------------------

export async function getAuditData(): Promise<AuditData> {
  const [entries, chain] = await Promise.all([
    prisma.auditEntry.findMany({
      orderBy: { seq: 'desc' },
      include: { actor: { select: { name: true } } },
      take: 200,
    }),
    verifyAuditChain(),
  ])
  const rows: AuditRow[] = entries.map(e => ({
    seq: e.seq,
    tsISO: e.ts.toISOString(),
    actorName: e.actor?.name ?? e.actorRole,
    actorRole: e.actorRole,
    action: e.action,
    tenderId: e.tenderId,
    meta: parse<Record<string, unknown>>(e.metaJson, {}),
    hashShort: e.hash.slice(0, 12),
    prevHashShort: e.prevHash ? e.prevHash.slice(0, 12) : '—',
  }))
  return { entries: rows, chainValid: chain.valid, chainMessage: chain.message, total: rows.length }
}

export type { CompanyProfile }

// ---------------------------------------------------------------------------
// Legacy adapter — maps real Prisma rows into the v1 frontend shapes so the
// existing Dashboard / Tenders / Compliance views show real DB data without
// any component-level changes.
// ---------------------------------------------------------------------------

/** Map a DB tender stage to the legacy Status used by the UI. */
function legacyStageStatus(stage: string, evalStatus?: string | null): Status {
  if (evalStatus) {
    if (evalStatus === 'awarded') return 'Complete'
    if (evalStatus === 'qualified') return 'Verified'
    if (evalStatus === 'disqualified') return 'Exception'
    if (evalStatus === 'requires_review') return 'In Review'
  }
  if (stage === 'AWARDED') return 'Complete'
  if (['EVALUATION_FAILED', 'AUCTION_FAILED', 'CANCELLED'].includes(stage)) return 'Exception'
  if (['CLOSED', 'EVALUATED', 'AUCTION_ACTIVE', 'AUCTION_CLOSED'].includes(stage)) return 'In Review'
  return 'Pending'
}

/** Map an EvaluationResult status to the legacy Status. */
function evalToLegacyStatus(s: string | null | undefined): Status {
  if (!s) return 'Pending'
  if (s === 'awarded') return 'Complete'
  if (s === 'qualified') return 'Verified'
  if (s === 'disqualified') return 'Exception'
  if (s === 'requires_review') return 'In Review'
  return 'Pending'
}

/** Map a SubmittedDoc status to the legacy Status. */
function docToLegacyStatus(s: string): Status {
  if (s === 'VERIFIED') return 'Verified'
  if (s === 'NON_COMPLIANT') return 'Exception'
  if (s === 'NEEDS_REVIEW' || s === 'WARNING') return 'In Review'
  return 'Pending'
}

/** Map an EvaluationResult risk to the legacy Risk type. */
function toRisk(r: string): Risk {
  if (r === 'HIGH') return 'High'
  if (r === 'MEDIUM') return 'Medium'
  return 'Low'
}

/** Format a Date for display (e.g. '12 Sep 2026'). */
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Format a week start date as a short chart label (e.g. 'Aug 25'). */
function weekChartLabel(d: Date): string {
  const month = d.toLocaleDateString('en-IN', { month: 'short' })
  return `${month} ${String(d.getDate()).padStart(2, '0')}`
}

type TenderRow = {
  id: string; title: string; agency: string
  submissionDeadline: Date; publishDate: Date; stage: string
  valueCr: number | null; valueLabel: string | null
  emdRequired: boolean; emdAmountCr: number | null; type: string
  requiredDocs: { name: string; description: string }[]
}

/** Map a Prisma Tender row to the legacy Tender shape. */
function dbToLegacyTender(
  t: TenderRow,
  submissionCount: number,
  myEvalStatus?: string | null,
): Tender {
  const status = legacyStageStatus(t.stage, myEvalStatus)
  const docsTotal = Math.max(t.requiredDocs.length, 1)
  // Approximate checks based on status
  const checksComplete =
    status === 'Complete' || status === 'Verified' ? docsTotal
    : status === 'In Review' ? Math.round(docsTotal * 0.6)
    : status === 'Exception' ? Math.round(docsTotal * 0.4)
    : Math.round(docsTotal * 0.1)

  const methodMap: Record<string, string> = {
    'e-reverse-auction': 'E-reverse auction',
    limited: 'Limited tender — two envelope',
    single: 'Single-stage — single envelope',
    open: 'Two-stage — technical & financial',
  }

  const bidSecurity =
    t.emdRequired && t.emdAmountCr != null
      ? t.emdAmountCr >= 1
        ? `₹${t.emdAmountCr.toFixed(2)} Cr`
        : `₹${(t.emdAmountCr * 100).toFixed(2)} Lakhs`
      : 'Not applicable'

  return {
    id: t.id,
    title: t.title,
    agency: t.agency,
    deadline: fmtDate(t.submissionDeadline),
    deadlineISO: t.submissionDeadline.toISOString(),
    biddersCount: submissionCount,
    status,
    value: t.valueLabel ?? (t.valueCr != null ? `₹${t.valueCr} Cr` : '—'),
    published: fmtDate(t.publishDate),
    bidSecurity,
    evaluationMethod: methodMap[t.type] ?? 'Open tender',
    checksComplete,
    checksTotal: docsTotal,
    requirements: t.requiredDocs.map(d => ({ name: d.description || d.name, status: 'Pending' as Status })),
  }
}

// ---------------------------------------------------------------------------
// Officer dashboard (real DB)
// ---------------------------------------------------------------------------

export async function getOfficerDashboardV2(user: AuthedUser): Promise<OfficerDashboardData> {
  const twelveWeeksAgo = new Date(Date.now() - 84 * 24 * 3600 * 1000)

  const [allTenders, allEvals, recentAudit] = await Promise.all([
    prisma.tender.findMany({
      include: {
        _count: { select: { submissions: true } },
        evaluations: { select: { status: true, risk: true } },
        requiredDocs: { select: { name: true, description: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.evaluationResult.findMany({ select: { status: true, risk: true } }),
    prisma.auditEntry.findMany({
      where: { ts: { gte: twelveWeeksAgo } },
      select: { ts: true },
      orderBy: { ts: 'asc' },
    }),
  ])

  const activeTenders = allTenders.filter(
    t => !['CANCELLED'].includes(t.stage)
  )
  const openTenders = activeTenders.filter(
    t => ['PUBLISHED', 'CORRIGENDUM'].includes(t.stage)
  )
  const totalSubmissions = activeTenders.reduce((s, t) => s + t._count.submissions, 0)
  const underReview = allEvals.filter(e => e.status === 'requires_review').length
  const exceptions = allEvals.filter(e => e.status === 'disqualified').length
  const qualified = allEvals.filter(e => ['qualified', 'awarded'].includes(e.status)).length

  // Attention items: evaluations needing officer review
  const reviewItems = await prisma.evaluationResult.findMany({
    where: { status: 'requires_review' },
    include: {
      company: { select: { name: true } },
      tender: { select: { id: true } },
    },
    take: 5,
  })
  const attention: AttentionItem[] = reviewItems.map(e => ({
    title: e.company.name,
    detail: `${e.tender.id} — awaiting officer review decision`,
    status: 'In Review' as Status,
  }))

  // Add failed tenders that need cancellation or re-publish decision
  const failedTenders = allTenders
    .filter(t => ['EVALUATION_FAILED', 'AUCTION_FAILED'].includes(t.stage))
    .slice(0, 2)
  for (const ft of failedTenders) {
    attention.push({
      title: ft.id,
      detail: `${ft.stage === 'EVALUATION_FAILED' ? 'No qualified bidders' : 'Auction failed'} — officer decision required`,
      status: 'Exception' as Status,
    })
  }

  // Build activity chart: count audit events per week for the last 12 weeks
  const now = Date.now()
  const activityPoints: SeriesPoint[] = []
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(now - (i + 1) * 7 * 24 * 3600 * 1000)
    const weekEnd = new Date(now - i * 7 * 24 * 3600 * 1000)
    const count = recentAudit.filter(e => e.ts >= weekStart && e.ts < weekEnd).length
    activityPoints.push({ label: weekChartLabel(weekStart), value: count })
  }

  const stats: StatCard[] = [
    {
      label: 'Active tenders',
      value: String(openTenders.length),
      change: `${activeTenders.length} total across all stages`,
    },
    {
      label: 'Bids under review',
      value: String(underReview),
      change: `${underReview} require officer action`,
      tone: underReview > 0 ? 'warn' : undefined,
    },
    {
      label: 'Exceptions flagged',
      value: String(exceptions),
      change: `${allTenders.filter(t => ['EVALUATION_FAILED', 'AUCTION_FAILED'].includes(t.stage)).length} tender(s) affected`,
      tone: exceptions > 0 ? 'danger' : undefined,
    },
    {
      label: 'Documents verified',
      value: String(qualified),
      change: `across ${totalSubmissions} submissions`,
    },
  ]

  return {
    firstName: user.name.split(' ')[0],
    department: user.department ?? 'Procurement Division',
    stats,
    recentTenders: activeTenders.slice(0, 3).map(t => dbToLegacyTender(t, t._count.submissions)),
    attention: attention.slice(0, 4),
    activity: {
      caption: 'Audit events across all tenders (last 12 weeks)',
      points: activityPoints,
    },
  }
}

// ---------------------------------------------------------------------------
// Seller dashboard (real DB)
// ---------------------------------------------------------------------------

export async function getSellerDashboardV2(user: AuthedUser): Promise<SellerDashboardData> {
  const emptyDashboard: SellerDashboardData = {
    companyName: user.companyName ?? user.name,
    stats: [
      { label: 'Active bids', value: '0', change: 'No submissions yet' },
      { label: 'Win rate', value: '0%', change: 'No completed bids yet' },
      { label: 'Documents verified', value: '0', change: 'Across your submissions' },
      { label: 'Open opportunities', value: '0', change: 'Browse the marketplace' },
    ],
    recentBids: [],
    deadlines: [],
    performance: { caption: 'Your submission and activity', points: [] },
  }
  if (!user.companyId) return emptyDashboard

  const twelveMonthsAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000)

  const [mySubs, openTenders, myAudit] = await Promise.all([
    prisma.submission.findMany({
      where: { companyId: user.companyId },
      include: {
        tender: {
          include: {
            requiredDocs: { select: { name: true, description: true } },
            _count: { select: { submissions: true } },
          },
        },
        docs: { select: { provided: true, status: true } },
      },
      orderBy: { submittedAt: 'desc' },
    }),
    prisma.tender.count({
      where: {
        stage: { in: ['PUBLISHED', 'CORRIGENDUM'] },
        submissions: { none: { companyId: user.companyId } },
      },
    }),
    prisma.auditEntry.findMany({
      where: { actorId: user.id, ts: { gte: twelveMonthsAgo } },
      select: { ts: true },
      orderBy: { ts: 'asc' },
    }),
  ])

  // Fetch evaluations for all my submissions in one query
  const evalResults = user.companyId
    ? await prisma.evaluationResult.findMany({
        where: { companyId: user.companyId },
        select: { tenderId: true, status: true },
      })
    : []
  const evalByTender = new Map(evalResults.map(e => [e.tenderId, e.status]))

  const activeSubs = mySubs.filter(
    s => !['AWARDED', 'CANCELLED'].includes(s.tender.stage)
  )
  const completedTenders = mySubs.filter(
    s => ['AWARDED', 'EVALUATION_FAILED', 'AUCTION_CLOSED', 'AUCTION_FAILED'].includes(s.tender.stage)
  )
  const wonCount = mySubs.filter(s => evalByTender.get(s.tenderId) === 'awarded').length
  const winRate =
    completedTenders.length > 0 ? Math.round((wonCount / completedTenders.length) * 100) : 0
  const verifiedDocs = mySubs.reduce(
    (sum, s) => sum + s.docs.filter(d => d.status === 'VERIFIED').length,
    0
  )

  // Deadlines: active submissions closing soon
  const deadlines: AttentionItem[] = activeSubs
    .filter(s => ['PUBLISHED', 'CORRIGENDUM', 'CLOSED'].includes(s.tender.stage))
    .slice(0, 3)
    .map(s => {
      const daysLeft = Math.max(
        1,
        Math.ceil((s.tender.submissionDeadline.getTime() - Date.now()) / (24 * 3600 * 1000))
      )
      const ev = evalByTender.get(s.tenderId)
      return {
        title: s.tenderId,
        detail: ev
          ? `Result: ${ev} — ${daysLeft} day(s) left`
          : `Awaiting evaluation — ${daysLeft} day(s) left`,
        status: 'Pending' as Status,
      }
    })

  // Build performance chart: audit events per month for last 12 months
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const now2 = new Date()
  const performancePoints: SeriesPoint[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1)
    const nextD = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const count = myAudit.filter(e => e.ts >= d && e.ts < nextD).length
    performancePoints.push({ label: monthNames[d.getMonth()], value: count })
  }

  const closingSoonCount = await prisma.tender.count({
    where: {
      stage: { in: ['PUBLISHED', 'CORRIGENDUM'] },
      submissions: { none: { companyId: user.companyId! } },
      submissionDeadline: { lte: new Date(Date.now() + 21 * 24 * 3600 * 1000) },
    },
  })

  return {
    companyName: (user.companyName ?? user.name).split(' ').slice(0, 2).join(' '),
    stats: [
      {
        label: 'Active bids',
        value: String(activeSubs.length),
        change: `${activeSubs.filter(s => ['PUBLISHED', 'CORRIGENDUM'].includes(s.tender.stage)).length} still accepting submissions`,
      },
      {
        label: 'Win rate',
        value: `${winRate}%`,
        change: completedTenders.length > 0
          ? `${wonCount} of ${completedTenders.length} completed bids won`
          : 'No completed bids yet',
      },
      {
        label: 'Documents verified',
        value: String(verifiedDocs),
        change: 'Across your submissions',
      },
      {
        label: 'Open opportunities',
        value: String(openTenders),
        change: `${closingSoonCount} closing soon`,
        tone: closingSoonCount > 0 ? 'warn' : undefined,
      },
    ],
    recentBids: mySubs.slice(0, 3).map(s =>
      dbToLegacyTender(s.tender, s.tender._count.submissions, evalByTender.get(s.tenderId))
    ),
    deadlines,
    performance: {
      caption: 'Your bid and audit activity (last 12 months)',
      points: performancePoints,
    },
  }
}

// ---------------------------------------------------------------------------
// Tenders list (real DB, legacy shape)
// ---------------------------------------------------------------------------

export async function getLegacyTenders(
  user: AuthedUser
): Promise<{ tenders: Tender[] }> {
  if (user.role === 'OFFICER') {
    const tenders = await prisma.tender.findMany({
      include: {
        _count: { select: { submissions: true } },
        requiredDocs: { select: { name: true, description: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return { tenders: tenders.map(t => dbToLegacyTender(t, t._count.submissions)) }
  }

  if (!user.companyId) return { tenders: [] }

  const subs = await prisma.submission.findMany({
    where: { companyId: user.companyId },
    include: {
      tender: {
        include: {
          _count: { select: { submissions: true } },
          requiredDocs: { select: { name: true, description: true } },
        },
      },
    },
    orderBy: { submittedAt: 'desc' },
  })
  const evalResults = await prisma.evaluationResult.findMany({
    where: { companyId: user.companyId },
    select: { tenderId: true, status: true },
  })
  const evalByTender = new Map(evalResults.map(e => [e.tenderId, e.status]))

  return {
    tenders: subs.map(s =>
      dbToLegacyTender(s.tender, s.tender._count.submissions, evalByTender.get(s.tenderId))
    ),
  }
}

// ---------------------------------------------------------------------------
// Tender detail (real DB, legacy shape)
// ---------------------------------------------------------------------------

export async function getLegacyTenderDetail(
  user: AuthedUser,
  tenderId: string
): Promise<TenderDetailData | null> {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    include: {
      _count: { select: { submissions: true } },
      requiredDocs: { select: { name: true, description: true } },
      submissions: {
        include: {
          company: { select: { name: true, cin: true, gstin: true } },
          docs: { select: { provided: true, status: true } },
        },
      },
      evaluations: {
        select: { companyId: true, status: true, risk: true },
      },
    },
  })
  if (!tender) return null

  const evalByCompany = new Map(tender.evaluations.map(e => [e.companyId, e]))
  const tenderLegacy = dbToLegacyTender(tender, tender._count.submissions)
  // Override requirements with real doc descriptions
  tenderLegacy.requirements = tender.requiredDocs.map(d => ({
    name: d.description || d.name,
    status: 'Pending' as Status,
  }))

  // For officers, show all submissions; for sellers, show only their own (if present)
  const visibleSubmissions = user.role === 'SELLER' && user.companyId
    ? tender.submissions.filter(s => s.companyId === user.companyId)
    : tender.submissions

  const bidders: Bidder[] = visibleSubmissions.map(s => {
    const ev = evalByCompany.get(s.companyId)
    return {
      name: s.company.name,
      reg: s.company.cin ?? s.company.gstin ?? 'N/A',
      docsSubmitted: s.docs.filter(d => d.provided).length,
      docsTotal: s.docs.length || tender.requiredDocs.length,
      status: ev ? evalToLegacyStatus(ev.status) : 'Pending' as Status,
      risk: ev ? toRisk(ev.risk) : 'Low' as Risk,
    }
  })

  return { tender: tenderLegacy, bidders }
}

// ---------------------------------------------------------------------------
// Evaluation overview (real DB, legacy shape)
// ---------------------------------------------------------------------------

export async function getLegacyEvaluation(
  user: AuthedUser,
  tenderId: string
): Promise<EvaluationData | null> {
  if (user.role !== 'OFFICER') return null
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    include: {
      requiredDocs: { select: { name: true } },
      submissions: {
        include: {
          company: { select: { name: true, cin: true, gstin: true } },
          docs: { select: { provided: true, status: true } },
        },
      },
      evaluations: {
        select: { companyId: true, status: true, risk: true },
      },
    },
  })
  if (!tender) return null

  const evalByCompany = new Map(tender.evaluations.map(e => [e.companyId, e]))
  const docsPerSub = tender.requiredDocs.length || 12
  const checksTotal = docsPerSub * tender.submissions.length
  const checksComplete = tender.submissions.reduce(
    (sum, s) => sum + s.docs.filter(d => d.status === 'VERIFIED').length,
    0
  )

  const bidders: Bidder[] = tender.submissions.map(s => {
    const ev = evalByCompany.get(s.companyId)
    return {
      name: s.company.name,
      reg: s.company.cin ?? s.company.gstin ?? 'N/A',
      docsSubmitted: s.docs.filter(d => d.provided).length,
      docsTotal: s.docs.length || docsPerSub,
      status: ev ? evalToLegacyStatus(ev.status) : 'Pending' as Status,
      risk: ev ? toRisk(ev.risk) : 'Low' as Risk,
    }
  })

  return {
    tenderId: tender.id,
    tenderTitle: tender.title,
    checksComplete,
    checksTotal,
    bidders,
  }
}

// ---------------------------------------------------------------------------
// Compliance detail (real DB, legacy shape)
// ---------------------------------------------------------------------------

function buildComplianceData(
  sub: {
    tenderId: string
    company: { name: string }
    docs: { provided: boolean; status: string; docName: string; note: string }[]
    tender: { requiredDocs: { name: string; description: string }[] }
  }
): ComplianceData {
  const specByName = new Map(
    sub.tender.requiredDocs.map(d => [d.name, d.description || d.name])
  )
  const provided = sub.docs.filter(d => d.provided)
  const checks: CheckRow[] = sub.docs.map(d => {
    const requirement = specByName.get(d.docName) ?? d.docName
    const status = docToLegacyStatus(d.status)
    const note = d.note ||
      (d.status === 'VERIFIED' ? 'Verified from submitted data'
        : d.status === 'NON_COMPLIANT' ? 'Non-compliant — officer review required'
        : d.status === 'NEEDS_REVIEW' ? 'Flagged for officer review'
        : !d.provided ? 'Document not submitted'
        : 'Pending verification')
    return { requirement, status, note }
  })
  const verifiedCount = checks.filter(c => c.status === 'Verified').length
  return {
    bidderName: sub.company.name,
    tenderId: sub.tenderId,
    docsSubmitted: provided.length,
    docsTotal: sub.docs.length,
    scorePct: checks.length > 0 ? Math.round((verifiedCount / checks.length) * 100) : 0,
    checks,
  }
}

export async function getLegacyCompliance(
  user: AuthedUser,
  tenderId: string,
  bidderName: string
): Promise<ComplianceData | null> {
  // Security: sellers can only see their own submission
  if (user.role === 'SELLER') {
    if (!user.companyId) return null
    const sub = await prisma.submission.findFirst({
      where: { companyId: user.companyId, ...(tenderId ? { tenderId } : {}) },
      include: {
        company: { select: { name: true } },
        docs: { select: { provided: true, status: true, docName: true, note: true } },
        tender: { include: { requiredDocs: { select: { name: true, description: true } } } },
      },
      orderBy: { submittedAt: 'desc' },
    })
    if (!sub) return null
    return buildComplianceData(sub)
  }

  // Officer: find by bidder name match, or first submission if name is empty
  const whereClause = bidderName
    ? {
        ...(tenderId ? { tenderId } : {}),
        company: { name: { contains: bidderName, mode: 'insensitive' as const } },
      }
    : (tenderId ? { tenderId } : {})

  const sub = await prisma.submission.findFirst({
    where: whereClause,
    include: {
      company: { select: { name: true } },
      docs: { select: { provided: true, status: true, docName: true, note: true } },
      tender: { include: { requiredDocs: { select: { name: true, description: true } } } },
    },
    orderBy: { submittedAt: 'desc' },
  })
  if (!sub) return null
  return buildComplianceData(sub)
}
