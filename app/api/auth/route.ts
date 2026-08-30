// POST /api/auth — DB-backed login (officer/seller) and seller registration.
// Returns a session bearer token (D2): the client never supplies userId/role again.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api'
import { createSession, hashPassword, toAuthedUser } from '@/lib/server/auth'
import { recordAudit } from '@/lib/server/audit'

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? 'U') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const mode = body?.mode === 'register' ? 'register' : 'login'
    const type = body?.type === 'officer' ? 'officer' : 'seller'
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    if (mode === 'register') {
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) {
        return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
      }

      if (type === 'officer') {
        const name = String(body?.name ?? '').trim()
        const department = String(body?.department ?? '').trim()
        const employeeId = String(body?.employeeId ?? '').trim()
        
        if (!name || !department || !employeeId) {
          return NextResponse.json({ error: 'Name, department, and employee ID are required' }, { status: 400 })
        }
        
        const user = await prisma.user.create({
          data: {
            id: `usr-officer-${crypto.randomUUID().slice(0, 8)}`,
            role: 'OFFICER',
            email,
            password: hashPassword(password),
            name,
            subtitle: department,
            initials: initialsFor(name),
            employeeId,
          },
          include: { company: { select: { name: true } } },
        })
        const token = await createSession(user.id)
        await recordAudit({ actorId: user.id, actorRole: 'OFFICER', action: 'OFFICER_REGISTERED', meta: { email, name, department, employeeId } })
        return NextResponse.json({ success: true, token, user: toAuthedUser(user) })
      }

      if (type === 'seller') {
        const companyName = String(body?.companyName ?? '').trim()
        if (!companyName) {
          return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
        }
        const gstin = typeof body?.gstin === 'string' ? body.gstin.trim().toUpperCase() : null
        const pan = typeof body?.pan === 'string' ? body.pan.trim().toUpperCase() : null
        const companyId = `com-${crypto.randomUUID().slice(0, 8)}`
        const user = await prisma.$transaction(async tx => {
          await tx.company.create({
            data: {
              id: companyId,
              name: companyName,
              legalName: companyName,
              gstin: gstin || null,
              pan: pan || null,
            },
          })
          return tx.user.create({
            data: {
              id: `usr-seller-${crypto.randomUUID().slice(0, 8)}`,
              role: 'SELLER',
              email,
              password: hashPassword(password),
              name: companyName.split(' ').slice(0, 2).join(' '),
              subtitle: 'Registered Seller',
              initials: initialsFor(companyName),
              companyId,
            },
            include: { company: { select: { name: true } } },
          })
        })
        const token = await createSession(user.id)
        await recordAudit({ actorId: user.id, actorRole: 'SELLER', action: 'SELLER_REGISTERED', meta: { email, companyName } })
        return NextResponse.json({ success: true, token, user: toAuthedUser(user) })
      }

      return NextResponse.json({ error: 'Invalid account type for registration' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: { select: { name: true } } },
    })
    const role = type === 'officer' ? 'OFFICER' : 'SELLER'
    if (!user || user.role !== role || user.password !== hashPassword(password)) {
      return NextResponse.json({ error: 'Invalid credentials. Please check your details and try again.' }, { status: 401 })
    }
    const employeeId = typeof body?.employeeId === 'string' ? body.employeeId.trim() : ''
    if (role === 'OFFICER' && user.employeeId && employeeId && employeeId !== user.employeeId) {
      return NextResponse.json({ error: 'Invalid credentials. Please check your details and try again.' }, { status: 401 })
    }

    const token = await createSession(user.id)
    return NextResponse.json({ success: true, token, user: toAuthedUser(user) })
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
