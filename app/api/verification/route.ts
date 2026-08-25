import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const bidId = request.nextUrl.searchParams.get('bid_id')
  if (!bidId) return NextResponse.json({ error: 'bid_id is required' }, { status: 400 })
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.from('verification_jobs').select('*, verification_checks(*), verification_results(*)').eq('bid_id', bidId).maybeSingle()
    if (error) return NextResponse.json({ error: 'Unable to load verification' }, { status: 502 })
    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body?.bid_id) return NextResponse.json({ error: 'bid_id is required' }, { status: 400 })
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.from('verification_jobs').upsert({ bid_id: body.bid_id, status: 'QUEUED', attempts: 0 }, { onConflict: 'bid_id' }).select().single()
    if (error) return NextResponse.json({ error: 'Unable to queue verification' }, { status: 502 })
    return NextResponse.json({ data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 })
  }
}
