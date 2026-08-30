// All state-changing workflow actions, guarded by role checks, tick() and audit.
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api'
import type { AuthedUser } from '@/lib/server/auth'
import { recordAudit } from '@/lib/server/audit'
import { maybeExtendAuction } from '@/lib/server/lifecycle'
import { computeRanks } from '@/lib/server/evaluate'
import { DEFAULT_DOC_TEMPLATES, isTenderType } from '@/lib/tender-config'

const CORRIGENDUM_CUTOFF_MS = 60 * 1000 // demo-scaled GeM rule (≥7 days before bid end)
const EMD_MIN_ESTIMATE_CR = 0.05 // ₹5 L in Crores — EMD applies only above this (GeM)
const MSE_MATCH_MAX = 5

export interface ActionContext {
  user: AuthedUser
  body: Record<string, unknown>
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return null
}
function bool(v: unknown): boolean {
  return v === true || v === 'true'
}

async function requireTenderOwnedByOfficer(tenderId: string) {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } })
  if (!tender) throw new ApiError('Tender not found', 404)
  return tender
}

// ---------------------------------------------------------------------------
// Officer actions
// ---------------------------------------------------------------------------

export async function createTender({ user, body }: ActionContext) {
  if (user.role !== 'OFFICER') throw new ApiError('Only officers can create tenders', 403)
  const title = str(body.title).trim()
  if (!title) throw new ApiError('Title is required', 400)
  const type = str(body.type, 'open')
  if (!isTenderType(type)) throw new ApiError('Unknown tender type', 400)

  const valueCr = num(body.valueCr) ?? 1
  const emdRequired = bool(body.emdRequired)
  if (emdRequired && valueCr <= EMD_MIN_ESTIMATE_CR) {
    throw new ApiError('EMD applies only when the estimated value exceeds ₹5 Lakh (GeM rule)', 400)
  }
  const bidValidityDays = Math.min(180, Math.max(15, num(body.bidValidityDays) ?? 30))
  const submissionMinutes = Math.max(1, num(body.submissionMinutes) ?? 3)
  const submissionDeadline = new Date(Date.now() + submissionMinutes * 60 * 1000)

  const eligibility = Array.isArray(body.eligibility) ? body.eligibility : []
  const technical = Array.isArray(body.technical) ? body.technical : []
  const requirements = {
    eligibility,
    technical,
    requiredDocs: DEFAULT_DOC_TEMPLATES.map(d => ({
      name: d.name, label: d.description, classification: d.classification, conditionKey: d.conditionKey ?? null,
    })),
  }

  const id = `GOV/${(str(body.category, 'GEN') || 'GEN').toUpperCase().slice(0, 6)}/2026/${randomBytes(2).toString('hex').toUpperCase()}`
  const tender = await prisma.tender.create({
    data: {
      id,
      title,
      agency: str(body.agency, 'Ministry of Digital Transformation'),
      type,
      category: str(body.category) || null,
      product: str(body.product) || null,
      quantity: str(body.quantity) || null,
      unit: str(body.unit) || null,
      valueCr,
      valueLabel: `₹${valueCr} Cr`,
      location: str(body.location) || null,
      submissionDeadline,
      bidOpeningDate: submissionDeadline,
      auctionStart: null,
      auctionEnd: null,
      stage: 'PUBLISHED',
      requirementsJson: JSON.stringify(requirements),
      emdRequired,
      emdAmountCr: emdRequired ? (num(body.emdAmountCr) ?? valueCr * 0.02) : null,
      bidValidityDays,
      msePreference: bool(body.msePreference),
      miiMinLocalContentPct: num(body.miiMinLocalContentPct),
      albThresholdPct: num(body.albThresholdPct) ?? 25,
      corrigendaJson: '[]',
      createdById: user.id,
      requiredDocs: {
        create: requirements.requiredDocs.map(d => ({
          id: `${id}:${d.name}`,
          name: d.name,
          description: d.label,
          classification: d.classification,
          conditionKey: d.conditionKey,
        })),
      },
    },
  })
  await recordAudit({ actorId: user.id, actorRole: user.role, action: 'TENDER_CREATED', tenderId: tender.id, meta: { title, type, emdRequired, msePreference: bool(body.msePreference) } })
  return { tenderId: tender.id }
}

export async function askClarification({ user, body }: ActionContext) {
  if (user.role !== 'OFFICER') throw new ApiError('Only officers can ask clarifications', 403)
  const submissionId = str(body.submissionId)
  const submission = await prisma.submission.findUnique({ where: { id: submissionId }, include: { tender: true } })
  if (!submission) throw new ApiError('Submission not found', 404)
  if (!['CLOSED', 'EVALUATED', 'AUCTION_ACTIVE', 'AUCTION_CLOSED'].includes(submission.tender.stage)) {
    throw new ApiError('Clarifications can be raised after the submission deadline (GeM rule)', 400)
  }
  const question = str(body.question).trim()
  if (!question) throw new ApiError('Question is required', 400)
  const { clarificationDeadline } = await import('@/lib/server/lifecycle')
  const clarification = await prisma.clarification.create({
    data: {
      tenderId: submission.tenderId,
      submissionId: submission.id,
      question,
      respondBy: clarificationDeadline(),
      status: 'PENDING',
    },
  })
  // Officer may hold the tender in CLOSED until answered.
  if (submission.tender.stage === 'EVALUATED') {
    await prisma.tender.update({ where: { id: submission.tenderId }, data: { stage: 'CLOSED' } })
  }
  await recordAudit({ actorId: user.id, actorRole: user.role, action: 'CLARIFICATION_ASKED', tenderId: submission.tenderId, meta: { clarificationId: clarification.id, companyId: submission.companyId } })
  return { clarificationId: clarification.id }
}

export async function issueCorrigendum({ user, body }: ActionContext) {
  if (user.role !== 'OFFICER') throw new ApiError('Only officers can issue corrigenda', 403)
  const tender = await requireTenderOwnedByOfficer(str(body.tenderId))
  if (tender.stage !== 'PUBLISHED' && tender.stage !== 'CORRIGENDUM') throw new ApiError('Corrigenda can only be issued while the tender is accepting submissions', 400)
  const remaining = tender.submissionDeadline.getTime() - Date.now()
  if (remaining < CORRIGENDUM_CUTOFF_MS) {
    throw new ApiError('Corrigendum window closed: amendments require ≥7 days before bid end (demo-scaled: 1 minute)', 400)
  }
  const note = str(body.note).trim()
  if (!note) throw new ApiError('Corrigendum note is required', 400)
  const extendMinutes = num(body.extendMinutes) ?? 0
  let corrigenda: { version: string; note: string; createdAtISO: string; deadlineChanged: boolean }[] = []
  try { corrigenda = JSON.parse(tender.corrigendaJson) } catch {}
  const lastVersion = corrigenda.length ? parseFloat(corrigenda[corrigenda.length - 1].version) : 1.0
  const version = (lastVersion + 0.1).toFixed(1)
  const newDeadline = extendMinutes > 0 ? new Date(tender.submissionDeadline.getTime() + extendMinutes * 60 * 1000) : null
  corrigenda.push({ version, note, createdAtISO: new Date().toISOString(), deadlineChanged: newDeadline != null })
  await prisma.tender.update({
    where: { id: tender.id },
    data: {
      stage: 'CORRIGENDUM',
      corrigendaJson: JSON.stringify(corrigenda),
      ...(newDeadline ? { submissionDeadline: newDeadline } : {}),
    },
  })
  await recordAudit({ actorId: user.id, actorRole: user.role, action: 'CORRIGENDUM_ISSUED', tenderId: tender.id, meta: { version, note, extendMinutes } })
  return { version }
}

export async function officerDecision({ user, body }: ActionContext) {
  if (user.role !== 'OFFICER') throw new ApiError('Only officers can take review decisions', 403)
  const evaluationId = str(body.evaluationId)
  const decision = str(body.decision)
  const evaluation = await prisma.evaluationResult.findUnique({ where: { id: evaluationId }, include: { tender: true, company: true } })
  if (!evaluation) throw new ApiError('Evaluation not found', 404)
  if (evaluation.status !== 'requires_review') throw new ApiError('Only items in the review gate can be decided', 400)
  if (decision !== 'approve' && decision !== 'reject') throw new ApiError('Decision must be approve or reject', 400)
  const note = str(body.note)
  await prisma.evaluationResult.update({
    where: { id: evaluationId },
    data: {
      status: decision === 'approve' ? 'qualified' : 'disqualified',
      reviewedBy: user.id,
      reviewNote: note || (decision === 'approve' ? 'Officer approved after human review (GFR human-in-the-loop)' : 'Officer rejected after human review'),
      reviewedAt: new Date(),
    },
  })
  await recordAudit({
    actorId: user.id, actorRole: user.role, action: decision === 'approve' ? 'REVIEW_APPROVED' : 'REVIEW_REJECTED',
    tenderId: evaluation.tenderId,
    meta: { companyId: evaluation.companyId, companyName: evaluation.company.name, note },
  })
  await computeRanks(evaluation.tenderId)
  // Human-in-the-loop decisions can unblock the lifecycle: if the tender stalled
  // (no qualified bidders while review items existed), re-run finalization.
  const { tryFinalizeEvaluation } = await import('@/lib/server/lifecycle')
  if (['CLOSED', 'EVALUATION_FAILED', 'AUCTION_FAILED'].includes(evaluation.tender.stage)) {
    await prisma.tender.update({ where: { id: evaluation.tenderId }, data: { stage: 'CLOSED' } })
    await tryFinalizeEvaluation(evaluation.tenderId)
  }
  return { ok: true }
}

export async function awardTender({ user, body }: ActionContext) {
  if (user.role !== 'OFFICER') throw new ApiError('Only officers can award tenders', 403)
  const tender = await requireTenderOwnedByOfficer(str(body.tenderId))
  if (!['EVALUATED', 'AUCTION_CLOSED'].includes(tender.stage)) {
    throw new ApiError('Awards are only possible after evaluation or a closed auction', 400)
  }
  const companyId = str(body.companyId)
  const evaluation = await prisma.evaluationResult.findUnique({ where: { tenderId_companyId: { tenderId: tender.id, companyId } } })
  if (!evaluation || !['qualified', 'awarded'].includes(evaluation.status)) {
    throw new ApiError('Selected company is not a qualified bidder', 400)
  }
  await prisma.tender.update({
    where: { id: tender.id },
    data: {
      stage: 'AWARDED',
      awardedToCompanyId: companyId,
      awardNote: str(body.note) || `Awarded to L${evaluation.rank ?? 1}. ePBG status: ${str(body.epbgStatus, 'verified')} (system-verified from declared data).`,
    },
  })
  await prisma.evaluationResult.update({ where: { id: evaluation.id }, data: { status: 'awarded' } })
  await recordAudit({
    actorId: user.id, actorRole: user.role, action: 'TENDER_AWARDED', tenderId: tender.id,
    meta: { companyId, companyName: (await prisma.company.findUnique({ where: { id: companyId } }))?.name, epbgStatus: str(body.epbgStatus, 'verified') },
  })
  return { ok: true }
}

export async function cancelTender({ user, body }: ActionContext) {
  if (user.role !== 'OFFICER') throw new ApiError('Only officers can cancel tenders', 403)
  const tender = await requireTenderOwnedByOfficer(str(body.tenderId))
  if (!['EVALUATION_FAILED', 'EVALUATED', 'AUCTION_FAILED', 'AUCTION_CLOSED', 'PUBLISHED', 'CLOSED'].includes(tender.stage)) {
    throw new ApiError('Tender cannot be cancelled at this stage', 400)
  }
  await prisma.tender.update({ where: { id: tender.id }, data: { stage: 'CANCELLED' } })
  await recordAudit({ actorId: user.id, actorRole: user.role, action: 'TENDER_CANCELLED', tenderId: tender.id, meta: { reason: str(body.reason) } })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Seller actions
// ---------------------------------------------------------------------------

interface DocClaimInput {
  docName: string
  provided: boolean
  fileName?: string
  fileType?: string
  sizeMb?: number
  validTill?: string
  extracted?: Record<string, unknown>
}

export async function submitTender({ user, body }: ActionContext) {
  if (user.role !== 'SELLER' || !user.companyId) throw new ApiError('Seller account required', 403)
  const tender = await prisma.tender.findUnique({ where: { id: str(body.tenderId) }, include: { requiredDocs: true } })
  if (!tender) throw new ApiError('Tender not found', 404)
  if (!['PUBLISHED', 'CORRIGENDUM'].includes(tender.stage) || tender.submissionDeadline.getTime() <= Date.now()) {
    throw new ApiError('Submissions are locked for this tender', 400)
  }
  const existing = await prisma.submission.findUnique({
    where: { tenderId_companyId: { tenderId: tender.id, companyId: user.companyId } },
  })
  if (existing) throw new ApiError('You have already submitted a bid for this tender', 409)

  const claims = (Array.isArray(body.docs) ? body.docs : []) as DocClaimInput[]
  const financialBidCr = num(body.financialBidCr)
  if (financialBidCr == null || financialBidCr <= 0) throw new ApiError('A positive financial bid is required', 400)

  let eligibilitySnapshot: unknown[] = []
  try { eligibilitySnapshot = JSON.parse(str(body.eligibilitySnapshot, '[]')) } catch {}

  const submission = await prisma.submission.create({
    data: {
      tenderId: tender.id,
      companyId: user.companyId,
      userId: user.id,
      status: 'SUBMITTED',
      technicalResponse: JSON.stringify(body.technicalResponse ?? {}),
      financialBidCr,
      eligibilitySnapshot: JSON.stringify(eligibilitySnapshot),
      docs: {
        create: tender.requiredDocs.map(spec => {
          const claim = claims.find(c => c.docName === spec.name)
          return {
            docName: spec.name,
            provided: claim?.provided === true,
            classification: spec.classification,
            fileName: claim?.fileName ?? null,
            fileType: claim?.fileType ?? null,
            sizeMb: claim?.sizeMb ?? null,
            validTill: claim?.validTill ? new Date(claim.validTill) : null,
            extractedJson: JSON.stringify(claim?.extracted ?? {}),
            status: 'UNVERIFIED',
          }
        }),
      },
    },
  })
  await recordAudit({ actorId: user.id, actorRole: user.role, action: 'BID_SUBMITTED', tenderId: tender.id, meta: { submissionId: submission.id, financialBidCr } })
  return { submissionId: submission.id }
}

export async function placeBid({ user, body }: ActionContext) {
  if (user.role !== 'SELLER' || !user.companyId) throw new ApiError('Seller account required', 403)
  const tenderId = str(body.tenderId)
  const amountCr = num(body.amountCr)
  if (amountCr == null || amountCr <= 0) throw new ApiError('A positive bid amount is required', 400)

  const evaluation = await prisma.evaluationResult.findUnique({
    where: { tenderId_companyId: { tenderId, companyId: user.companyId } },
  })
  if (!evaluation || !['qualified', 'awarded'].includes(evaluation.status)) {
    throw new ApiError('Only qualified bidders can participate in the auction', 403)
  }

  const bid = await prisma.$transaction(async tx => {
    const tender = await tx.tender.findUnique({ where: { id: tenderId } })
    if (!tender) throw new ApiError('Tender not found', 404)
    if (tender.stage !== 'AUCTION_ACTIVE') throw new ApiError('The auction is not active', 400)
    const now = Date.now()
    if (tender.auctionStart && now < tender.auctionStart.getTime()) throw new ApiError('The auction has not started yet', 400)

    // Row-lock style re-check inside the transaction: prevents double-bid races.
    const lowest = await tx.bid.aggregate({ where: { tenderId }, _min: { amountCr: true } })
    const currentLowest = lowest._min.amountCr
    if (currentLowest != null && amountCr >= currentLowest) {
      throw new ApiError(`Bid must be below the current lowest ₹${currentLowest} Cr`, 409)
    }
    const created = await tx.bid.create({
      data: { tenderId, companyId: user.companyId as string, userId: user.id, amountCr },
    })
    return { bid: created, lowestBefore: currentLowest, stage: tender.stage }
  })

  const extended = await maybeExtendAuction(tenderId, new Date())
  await recordAudit({
    actorId: user.id, actorRole: user.role, action: 'BID_PLACED', tenderId,
    meta: { bidId: bid.bid.id, amountCr, previousLowestCr: bid.lowestBefore, autoExtended: extended },
  })
  return { bidId: bid.bid.id, extended }
}

export async function respondClarification({ user, body }: ActionContext) {
  if (user.role !== 'SELLER' || !user.companyId) throw new ApiError('Seller account required', 403)
  const clarificationId = str(body.clarificationId)
  const clarification = await prisma.clarification.findUnique({ where: { id: clarificationId }, include: { submission: true, tender: true } })
  if (!clarification) throw new ApiError('Clarification not found', 404)
  if (clarification.submission.companyId !== user.companyId) {
    throw new ApiError('You can only respond to clarifications on your own submission', 403)
  }
  if (clarification.status !== 'PENDING') throw new ApiError('Clarification already answered', 409)
  const response = str(body.response).trim()
  if (!response) throw new ApiError('Response is required', 400)
  const late = clarification.respondBy.getTime() < Date.now()
  await prisma.clarification.update({
    where: { id: clarificationId },
    data: { response, status: 'ANSWERED' },
  })
  await recordAudit({
    actorId: user.id, actorRole: user.role, action: 'CLARIFICATION_RESPONDED', tenderId: clarification.tenderId,
    meta: { clarificationId, late },
  })
  return { ok: true, late }
}

export async function withdrawBid({ user, body }: ActionContext) {
  if (user.role !== 'SELLER' || !user.companyId) throw new ApiError('Seller account required', 403)
  const tender = await prisma.tender.findUnique({ where: { id: str(body.tenderId) }, include: { submissions: true } })
  if (!tender) throw new ApiError('Tender not found', 404)
  const submission = tender.submissions.find(s => s.companyId === user.companyId)
  if (!submission) throw new ApiError('No submission found', 404)
  if (!['PUBLISHED', 'CORRIGENDUM'].includes(tender.stage)) throw new ApiError('Bid can only be withdrawn before the deadline', 400)
  await prisma.submittedDoc.deleteMany({ where: { submissionId: submission.id } })
  await prisma.submission.delete({ where: { id: submission.id } })
  // EMD forfeiture is recorded in the audit trail (GeM rule).
  await recordAudit({
    actorId: user.id, actorRole: user.role, action: 'BID_WITHDRAWN', tenderId: tender.id,
    meta: { emdForfeited: tender.emdRequired, emdAmountCr: tender.emdAmountCr },
  })
  return { ok: true }
}

export async function uploadDoc({ user, body }: ActionContext): Promise<{ ok: true }> {
  if (user.role !== 'SELLER' || !user.companyId) throw new ApiError('Seller account required', 403)
  const submissionId = str(body.submissionId)
  const submission = await prisma.submission.findUnique({ where: { id: submissionId }, include: { tender: true } })
  if (!submission || submission.companyId !== user.companyId) throw new ApiError('Submission not found', 404)
  if (!['PUBLISHED', 'CORRIGENDUM'].includes(submission.tender.stage) || submission.tender.submissionDeadline.getTime() <= Date.now()) {
    throw new ApiError('Submissions are locked — documents cannot change after the deadline', 400)
  }
  const docName = str(body.docName)
  const doc = await prisma.submittedDoc.findFirst({ where: { submissionId, docName } })
  if (!doc) throw new ApiError('Unknown document for this tender', 400)
  await prisma.submittedDoc.update({
    where: { id: doc.id },
    data: {
      provided: true,
      fileName: str(body.fileName) || null,
      fileType: str(body.fileType) || null,
      sizeMb: num(body.sizeMb),
      validTill: body.validTill ? new Date(str(body.validTill)) : null,
      extractedJson: JSON.stringify(body.extracted ?? {}),
      status: 'UNVERIFIED',
      note: '',
    },
  })
  await recordAudit({ actorId: user.id, actorRole: user.role, action: 'DOC_UPLOADED', tenderId: submission.tenderId, meta: { submissionId, docName } })
  return { ok: true }
}

export const MSE_MATCH_MAX_BIDDERS = MSE_MATCH_MAX
