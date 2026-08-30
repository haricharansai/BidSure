// GET /api/me — current session profile (Bearer token; never client-supplied ids).
import { NextResponse } from 'next/server'
import { ApiError } from '@/lib/api'
import { requireUser } from '@/lib/server/auth'
import { tick } from '@/lib/server/lifecycle'

export async function GET(request: Request) {
  try {
    await tick()
    const user = await requireUser(request)
    return NextResponse.json({ user })
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  }
}
