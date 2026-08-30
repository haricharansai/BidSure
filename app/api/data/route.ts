// GET /api/data — single session-authenticated read endpoint.
// D2: the Bearer token is the only identity source; client-supplied userIds
// are never trusted. All resources (v2 and legacy) now read from Prisma/DB.
import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api'
import { requireUser } from '@/lib/server/auth'
import { tick } from '@/lib/server/lifecycle'
import {
  getAuctionState, getAuditData, getClarifications, getCompanies, getEvaluationDetail,
  getMarketplace, getMySubmissions, getOfficerTenders, getTenderDetailV2,
  // real-DB legacy adapters (replace the hardcoded lib/db.ts data)
  getOfficerDashboardV2, getSellerDashboardV2,
  getLegacyTenders, getLegacyTenderDetail,
  getLegacyEvaluation, getLegacyCompliance,
} from '@/lib/server/data'

function firstParam(request: Request, key: string): string | null {
  return new URL(request.url).searchParams.get(key)
}

export async function GET(request: Request) {
  try {
    await tick()
    const user = await requireUser(request)
    const resource = firstParam(request, 'resource')
    const tenderId = firstParam(request, 'tenderId')

    // --- GeM workflow (v2) resources -----------------------------------------
    switch (resource) {
      case 'marketplace':
        return NextResponse.json(await getMarketplace(user))
      case 'workflow-tenders':
        return NextResponse.json(await getOfficerTenders(user))
      case 'tender-v2': {
        const id = tenderId
        if (!id) return NextResponse.json({ error: 'tenderId is required' }, { status: 400 })
        const detail = await getTenderDetailV2(user, id)
        if (!detail) return NextResponse.json({ error: 'Tender not found' }, { status: 404 })
        return NextResponse.json(detail)
      }
      case 'submissions':
        return NextResponse.json(await getMySubmissions(user))
      case 'auction': {
        const id = tenderId
        if (!id) return NextResponse.json({ error: 'tenderId is required' }, { status: 400 })
        const state = await getAuctionState(user, id)
        if (!state) return NextResponse.json({ error: 'Tender not found' }, { status: 404 })
        return NextResponse.json(state)
      }
      case 'evaluation-v2': {
        const id = tenderId
        if (!id) return NextResponse.json({ error: 'tenderId is required' }, { status: 400 })
        const detail = await getEvaluationDetail(user, id, firstParam(request, 'companyId'))
        if (!detail) return NextResponse.json({ error: 'Tender not found' }, { status: 404 })
        return NextResponse.json(detail)
      }
      case 'clarifications':
        return NextResponse.json(await getClarifications(user, tenderId))
      case 'companies':
        return NextResponse.json(await getCompanies(user))
      case 'audit':
        return NextResponse.json(await getAuditData())

      // --- Legacy resources (now DB-backed via Prisma) -----------------------
      case 'dashboard':
        return NextResponse.json(
          user.role === 'OFFICER'
            ? await getOfficerDashboardV2(user)
            : await getSellerDashboardV2(user)
        )
      case 'tenders':
        return NextResponse.json(await getLegacyTenders(user))
      case 'tender-detail': {
        const id = tenderId
        if (!id) {
          // No tenderId: fall back to most recent tender visible to this user
          const all = await getLegacyTenders(user)
          const first = all.tenders[0]
          if (!first) return NextResponse.json({ error: 'No tenders found' }, { status: 404 })
          const detail = await getLegacyTenderDetail(user, first.id)
          if (!detail) return NextResponse.json({ error: 'Tender not found' }, { status: 404 })
          return NextResponse.json(detail)
        }
        const detail = await getLegacyTenderDetail(user, id)
        if (!detail) return NextResponse.json({ error: 'Tender not found' }, { status: 404 })
        return NextResponse.json(detail)
      }
      case 'evaluation': {
        if (user.role !== 'OFFICER') return NextResponse.json({ error: 'Officer role required' }, { status: 403 })
        let evTenderId = tenderId
        if (!evTenderId) {
          // Fall back to first tender
          const all = await getLegacyTenders(user)
          evTenderId = all.tenders[0]?.id ?? null
        }
        if (!evTenderId) return NextResponse.json({ error: 'No tenders found' }, { status: 404 })
        const evalData = await getLegacyEvaluation(user, evTenderId)
        if (!evalData) return NextResponse.json({ error: 'Tender not found' }, { status: 404 })
        return NextResponse.json(evalData)
      }
      case 'compliance': {
        const bidder = firstParam(request, 'bidder') ?? ''
        const complianceTenderId = tenderId ?? ''
        const compliance = await getLegacyCompliance(user, complianceTenderId, bidder)
        if (!compliance) return NextResponse.json({ error: 'No bidder submissions found' }, { status: 404 })
        return NextResponse.json(compliance)
      }

      default:
        return NextResponse.json({ error: 'Invalid resource' }, { status: 400 })
    }
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('data resource failed:', err)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}
