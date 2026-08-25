import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const classifications = ['AUTO_PASS', 'AUTO_FAIL', 'NEEDS_REVIEW'] as const
const ratings = ['A+', 'A', 'B', 'C', 'D'] as const

export async function POST(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params
  const body = await request.json().catch(() => null)
  const score = Number(body?.compliance_score)
  if (!Number.isFinite(score) || score < 0 || score > 100 || !ratings.includes(body?.safety_rating) || !classifications.includes(body?.classification)) {
    return NextResponse.json({ error: 'Invalid verification result' }, { status: 400 })
  }
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase.from('verification_results').upsert({ job_id: jobId, compliance_score: score, safety_rating: body.safety_rating, classification: body.classification, summary: typeof body.summary === 'string' ? body.summary.slice(0, 2000) : null }, { onConflict: 'job_id' }).select().single()
    if (error) return NextResponse.json({ error: 'Unable to save verification result' }, { status: 502 })
    await supabase.from('verification_jobs').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('id', jobId)
    return NextResponse.json({ data }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 })
  }
}
