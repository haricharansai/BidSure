export type Role = 'officer' | 'seller'
export type Status = 'Verified' | 'Pending' | 'Exception' | 'In Review' | 'Complete'
export type Risk = 'Low' | 'Medium' | 'High'

export interface SessionUser {
  id: string
  type: Role
  name: string
  subtitle: string
  initials: string
  email: string
}

export interface TenderRequirement {
  name: string
  status: Status
}

export interface Tender {
  id: string
  title: string
  agency: string
  deadline: string
  deadlineISO: string
  biddersCount: number
  status: Status
  value: string
  published: string
  bidSecurity: string
  evaluationMethod: string
  checksComplete: number
  checksTotal: number
  requirements: TenderRequirement[]
}

export interface Bidder {
  name: string
  reg: string
  docsSubmitted: number
  docsTotal: number
  status: Status
  risk: Risk
}

export interface CheckRow {
  requirement: string
  status: Status
  note: string
}

export interface StatCard {
  label: string
  value: string
  change: string
  tone?: 'warn' | 'danger'
}

export interface SeriesPoint {
  label: string
  value: number
}

export interface AttentionItem {
  title: string
  detail: string
  status: Status
}

export interface OfficerDashboardData {
  firstName: string
  department: string
  stats: StatCard[]
  recentTenders: Tender[]
  attention: AttentionItem[]
  activity: { caption: string; points: SeriesPoint[] }
}

export interface SellerDashboardData {
  companyName: string
  stats: StatCard[]
  recentBids: Tender[]
  deadlines: AttentionItem[]
  performance: { caption: string; points: SeriesPoint[] }
}

export interface ComplianceData {
  bidderName: string
  tenderId: string
  docsSubmitted: number
  docsTotal: number
  scorePct: number
  checks: CheckRow[]
}

export interface TenderDetailData {
  tender: Tender
  bidders: Bidder[]
}

export interface EvaluationData {
  tenderId: string
  tenderTitle: string
  checksComplete: number
  checksTotal: number
  bidders: Bidder[]
}

// ---------------------------------------------------------------------------
// Procurement workflow v2 (additive)
// ---------------------------------------------------------------------------

export type ProcurementStage =
  | 'PUBLISHED' | 'CORRIGENDUM' | 'CLOSED' | 'EVALUATED' | 'AUCTION_ACTIVE' | 'AUCTION_CLOSED'
  | 'EVALUATION_FAILED' | 'AUCTION_FAILED' | 'AWARDED' | 'CANCELLED'

export type DocClassification = 'MANDATORY' | 'CONDITIONAL' | 'SUPPORTING'
export type DocStatus6 =
  | 'VERIFIED' | 'WARNING' | 'NON_COMPLIANT' | 'UNVERIFIED' | 'NEEDS_REVIEW' | 'NOT_APPLICABLE'

export interface EligibilityRow {
  key: string
  label: string
  declared: string
  status: 'PASS' | 'FAIL' | 'ATTENTION'
}

export interface FlagRow { kind: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; note: string }

export interface DocOutcomeRow {
  docName: string
  label: string
  classification: DocClassification
  status: DocStatus6
  note: string
}

export interface MarketplaceTender {
  id: string
  title: string
  agency: string
  type: string
  typeLabel: string
  category: string | null
  valueLabel: string | null
  stage: ProcurementStage
  submissionDeadlineISO: string
  emdRequired: boolean
  msePreference: boolean
  miiMinLocalContentPct: number | null
  mySubmissionStatus: string | null
  eligibility: { overall: string; rows: EligibilityRow[] }
  nextStep: string
}

export interface TimelineStep { stage: string; label: string; state: 'done' | 'active' | 'todo' | 'skipped'; atISO?: string }

export interface TenderDetailV2 {
  id: string
  title: string
  agency: string
  type: string
  typeLabel: string
  category: string | null
  product: string | null
  quantity: string | null
  unit: string | null
  valueCr: number | null
  valueLabel: string | null
  location: string | null
  stage: ProcurementStage
  stageLabel: string
  publishDateISO: string
  submissionDeadlineISO: string
  auctionStartISO: string | null
  auctionEndISO: string | null
  emdRequired: boolean
  emdAmountCr: number | null
  bidValidityDays: number
  msePreference: boolean
  miiMinLocalContentPct: number | null
  albThresholdPct: number
  eligibilityReqs: { key: string; label: string; value: number }[]
  technicalReqs: { key: string; label: string; expected: string }[]
  requiredDocs: { name: string; description: string; classification: DocClassification; conditionKey: string | null }[]
  corrigenda: { version: number; note: string; createdAtISO: string; deadlineChanged: boolean }[]
  eligibility: { overall: string; rows: EligibilityRow[] } | null
  mySubmission: SellerSubmissionRow | null
  clarifications: { id: string; question: string; response: string | null; askedAtISO: string; respondByISO: string; status: string }[]
  nextMove: { label: string; target: string | null; detail: string }
  timeline: TimelineStep[]
  myEvaluation: EvaluationRow | null
  awardedToCompanyName: string | null
  iWon: boolean
  myCompany: {
    gstin: string | null
    pan: string | null
    udyamNo: string | null
    udyamNicCode: string | null
    miiLocalContentPct: number | null
    msme: boolean
    isStartup: boolean
    isReseller: boolean
  } | null
}

export interface SellerSubmissionRow {
  id: string
  tenderId: string
  tenderTitle: string
  stage: ProcurementStage
  submittedAtISO: string
  financialBidCr: number | null
  docsProvided: number
  docsTotal: number
  resultStatus: string | null
  rank: number | null
  compliancePct: number | null
  flags: FlagRow[]
}

export interface EvaluationRow {
  id: string
  companyId: string
  companyName: string
  submissionId: string | null
  status: 'qualified' | 'disqualified' | 'requires_review' | 'awarded'
  eligibility: string
  technicalPassed: number
  technicalTotal: number
  compliancePct: number
  financialCr: number | null
  rank: number | null
  risk: string
  flags: FlagRow[]
  reasons: string[]
  reviewNote: string | null
}

export interface EvaluationDetailData {
  tenderId: string
  tenderTitle: string
  stage: ProcurementStage
  stageLabel: string
  pendingClarifications: number
  rows: EvaluationRow[]
  drillDown: {
    companyName: string
    docs: DocOutcomeRow[]
    eligibilityRows: EligibilityRow[]
    technical: { passed: number; total: number; failures: string[] }
    triangulation: { status: DocStatus6; note: string }
    reasons: string[]
    flags: FlagRow[]
    clarifications: { id: string; question: string; response: string | null; status: string; respondByISO: string }[]
  } | null
  canAward: boolean
  awardBlockedReason: string | null
  lowestCr: number | null
  mseMatches: { companyId: string; companyName: string; financialCr: number }[]
}

export interface AuctionState {
  tenderId: string
  stage: ProcurementStage
  startsAtISO: string | null
  endsAtISO: string | null
  extensionsLeft: number
  startPriceCr: number | null
  lowestCr: number | null
  myLowestCr: number | null
  myRank: number | null
  activeBidders: number
  totalBids: number
  recentBids: { amountCr: number; atISO: string; anonymous: string; mine: boolean }[]
  amQualified: boolean
  message: string
}

export interface AuditRow {
  seq: number
  tsISO: string
  actorName: string
  actorRole: string
  action: string
  tenderId: string | null
  meta: Record<string, unknown>
  hashShort: string
  prevHashShort: string
}

export interface AuditData {
  entries: AuditRow[]
  chainValid: boolean
  chainMessage: string
  total: number
}

export interface OfficerTenderRow {
  id: string
  title: string
  type: string
  typeLabel: string
  stage: ProcurementStage
  stageLabel: string
  submissionDeadlineISO: string
  submissions: number
  qualified: number
  requiresReview: number
  lowestCr: number | null
}
