import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('tenders')
      .select('id, reference, title, description, agency, value, deadline, status, requirements, created_at, updated_at')
      .order('deadline', { ascending: true })

    if (error) {
      return NextResponse.json({ error: 'Unable to load tenders' }, { status: 502 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 })
  }
}
