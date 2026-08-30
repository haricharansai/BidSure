// POST /api/action — single guarded entry point for all state-changing workflow
// actions. Every request: tick() → requireUser → role/ownership checks (inside
// each action) → audit entry. No client-supplied userIds are honored (D2).
import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api'
import { requireUser } from '@/lib/server/auth'
import { tick } from '@/lib/server/lifecycle'
import {
  askClarification,
  awardTender,
  cancelTender,
  createTender,
  issueCorrigendum,
  officerDecision,
  placeBid,
  respondClarification,
  submitTender,
  uploadDoc,
  withdrawBid,
} from '@/lib/server/actions'

const ACTIONS: Record<string, (ctx: { user: import('@/lib/server/auth').AuthedUser; body: Record<string, unknown> }) => Promise<unknown>> = {
  createTender,
  submitTender,
  placeBid,
  awardTender,
  officerDecision,
  askClarification,
  respondClarification,
  issueCorrigendum,
  uploadDoc,
  withdrawBid,
  cancelTender,
}

export async function POST(request: Request) {
  try {
    await tick()
    const user = await requireUser(request)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : ''
    const handler = ACTIONS[action]
    if (!handler) {
      return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400 })
    }
    const result = await handler({ user, body })
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('action failed:', err)
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
