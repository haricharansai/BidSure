// D3 — server-enforced deadlines. tick() runs at the start of every API handler
// and drives all stage transitions, locks and auto-evaluation. The UI never
// derives state from a local clock; it re-reads `stage` from the server.
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/server/audit'
import { runAutomatedEvaluation } from '@/lib/server/evaluate'

const AUCTION_MAX_EXTENSIONS = 3
const AUTO_EXTEND_WINDOW_MS = 15 * 1000 // demo-scaled (real GeM: 15 min)
const AUTO_EXTEND_BY_MS = 60 * 1000
const CLARIFICATION_WINDOW_MS = 10 * 60 * 1000

/** Progress every tender's lifecycle. Idempotent; safe to call per request. */
export async function tick(): Promise<void> {
  const now = new Date()
  const active = await prisma.tender.findMany({
    where: { stage: { in: ['PUBLISHED', 'CORRIGENDUM', 'CLOSED', 'AUCTION_ACTIVE', 'EVALUATED'] } },
  })
  for (const tender of active) {
    try {
      if ((tender.stage === 'PUBLISHED' || tender.stage === 'CORRIGENDUM') && tender.submissionDeadline.getTime() <= now.getTime()) {
        await lockSubmissions(tender.id)
        await tryFinalizeEvaluation(tender.id)
      } else if (tender.stage === 'CLOSED') {
        await tryFinalizeEvaluation(tender.id)
      } else if (tender.stage === 'AUCTION_ACTIVE' && (tender.auctionEnd?.getTime() ?? 0) <= now.getTime()) {
        await closeAuction(tender.id)
      }
    } catch (err) {
      console.error(`tick() failed for tender ${tender.id}:`, err)
    }
  }
}

/** Deadline lock: submissions can no longer change; preliminary doc validation runs. */
async function lockSubmissions(tenderId: string): Promise<void> {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } })
  if (!tender || !['PUBLISHED', 'CORRIGENDUM'].includes(tender.stage)) return
  await prisma.tender.update({ where: { id: tenderId }, data: { stage: 'CLOSED' } })
  await recordAudit({
    actorId: tender.createdById, actorRole: 'SYSTEM', action: 'SUBMISSIONS_LOCKED', tenderId,
    meta: { deadlineISO: tender.submissionDeadline.toISOString() },
  })
}

/**
 * Finalize evaluation once no clarifications are pending. Creates clarifications
 * opportunity? No — clarifications are opened by the officer; while any PENDING
 * exists the tender stays CLOSED (tech eval blocked, GeM rule).
 */
export async function tryFinalizeEvaluation(tenderId: string): Promise<void> {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    include: { submissions: { include: { clarifications: true, company: true } }, evaluations: true },
  })
  if (!tender || tender.stage !== 'CLOSED') return

  const pending = tender.submissions.flatMap(s => s.clarifications).filter(c => c.status === 'PENDING')
  if (pending.length) return

  const actor = { id: tender.createdById, role: 'SYSTEM' }
  await runAutomatedEvaluation(tenderId, actor)

  const evaluations = await prisma.evaluationResult.findMany({ where: { tenderId }, orderBy: { rank: 'asc' } })
  const qualified = evaluations.filter(e => e.status === 'qualified' || e.status === 'awarded')

  await recordAudit({
    actorId: tender.createdById, actorRole: 'SYSTEM', action: 'EVALUATION_COMPLETED', tenderId,
    meta: { total: evaluations.length, qualified: qualified.length },
  })

  if (qualified.length === 0) {
    await prisma.tender.update({ where: { id: tenderId }, data: { stage: 'EVALUATION_FAILED' } })
    await recordAudit({ actorId: tender.createdById, actorRole: 'SYSTEM', action: 'EVALUATION_FAILED', tenderId, meta: {} })
    return
  }

  if (tender.type === 'e-reverse-auction') {
    // RA qualifying: H1 elimination or 50%-of-TQ rule (round up; all go if only 2–3 TQ).
    let qualifying = qualified
    if (qualified.length > 3) {
      const keep = Math.max(2, Math.ceil(qualified.length / 2))
      qualifying = qualified.slice(0, keep) // results ordered by rank/amount in computeRanks
      for (const eliminated of qualified.slice(keep)) {
        await prisma.evaluationResult.update({ where: { id: eliminated.id }, data: { status: 'disqualified', reasonsJson: JSON.stringify(['Not shortlisted for reverse auction (50%-of-TQ rule)']) } })
      }
      await recordAudit({ actorId: tender.createdById, actorRole: 'SYSTEM', action: 'RA_QUALIFYING', tenderId, meta: { qualified: qualified.length, shortlisted: qualifying.length } })
    }
    if (qualifying.length < 2) {
      await prisma.tender.update({ where: { id: tenderId }, data: { stage: 'AUCTION_FAILED' } })
      await recordAudit({ actorId: tender.createdById, actorRole: 'SYSTEM', action: 'AUCTION_FAILED', tenderId, meta: { reason: 'Fewer than 2 qualified bidders — RA cannot start' } })
      return
    }
    const start = new Date(Date.now() + 2 * 60 * 1000)
    const end = new Date(start.getTime() + 5 * 60 * 1000)
    await prisma.tender.update({
      where: { id: tenderId },
      data: { stage: 'AUCTION_ACTIVE', auctionStart: start, auctionEnd: end, auctionExtensions: 0 },
    })
    await recordAudit({ actorId: tender.createdById, actorRole: 'SYSTEM', action: 'AUCTION_OPENED', tenderId, meta: { startISO: start.toISOString(), endISO: end.toISOString(), bidders: qualifying.length } })
  } else {
    await prisma.tender.update({ where: { id: tenderId }, data: { stage: 'EVALUATED' } })
  }
}

export async function closeAuction(tenderId: string): Promise<void> {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } })
  if (!tender || tender.stage !== 'AUCTION_ACTIVE') return
  await prisma.tender.update({ where: { id: tenderId }, data: { stage: 'AUCTION_CLOSED' } })
  const bids = await prisma.bid.findMany({ where: { tenderId }, orderBy: { amountCr: 'asc' } })
  await recordAudit({
    actorId: tender.createdById, actorRole: 'SYSTEM', action: 'AUCTION_CLOSED', tenderId,
    meta: { totalBids: bids.length, lowestCr: bids[0]?.amountCr ?? null },
  })
}

/**
 * Auto-extension: a bid placed in the closing window extends the auction
 * (demo: last 15 s, +60 s, max 3 extensions; real GeM: last 15 min).
 * Returns whether an extension was applied.
 */
export async function maybeExtendAuction(tenderId: string, now: Date): Promise<boolean> {
  const tender = await prisma.tender.findUnique({ where: { id: tenderId } })
  if (!tender || tender.stage !== 'AUCTION_ACTIVE' || !tender.auctionEnd) return false
  if (tender.auctionExtensions >= AUCTION_MAX_EXTENSIONS) return false
  const remaining = tender.auctionEnd.getTime() - now.getTime()
  if (remaining > AUTO_EXTEND_WINDOW_MS) return false
  const newEnd = new Date(tender.auctionEnd.getTime() + AUTO_EXTEND_BY_MS)
  await prisma.tender.update({
    where: { id: tenderId },
    data: { auctionEnd: newEnd, auctionExtensions: { increment: 1 } },
  })
  await recordAudit({
    actorId: tender.createdById, actorRole: 'SYSTEM', action: 'AUCTION_EXTENDED', tenderId,
    meta: { newEndISO: newEnd.toISOString(), extension: tender.auctionExtensions + 1 },
  })
  return true
}

export function clarificationDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + CLARIFICATION_WINDOW_MS)
}
