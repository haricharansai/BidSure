import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const tenderId = request.nextUrl.searchParams.get('tender_id')
  try {
    const supabase = createSupabaseServerClient()
    let query = supabase.from('bids').select('*, bid_documents(*)').order('created_at', { ascending: false })
    if (tenderId) query = query.eq('tender_id', tenderId)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: 'Unable to load bids' }, { status: 502 })
    return NextResponse.json({ data: data ?? [] })
  } catch {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body?.tender_id || !body?.seller_id) return NextResponse.json({ error: 'tender_id and seller_id are required' }, { status: 400 })
  if (body.amount !== undefined && (!Number.isFinite(Number(body.amount)) || Number(body.amount) <= 0)) return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.from('bids').insert({ tender_id: body.tender_id, seller_id: body.seller_id, amount: body.amount ?? null, status: 'submitted', submitted_at: new Date().toISOString() }).select().single()
    if (error) return NextResponse.json({ error: 'Unable to submit bid' }, { status: 502 })
    return NextResponse.json({ data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 })
  }
}
