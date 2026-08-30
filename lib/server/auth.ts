// D2 — server-side sessions. Never trust client-supplied userId/role:
// every request is authenticated by its Bearer token against the Session table.
import { randomBytes, createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api'

export type Role = 'OFFICER' | 'SELLER'

export interface AuthedUser {
  id: string
  role: Role
  email: string
  name: string
  subtitle: string
  initials: string
  department: string | null
  employeeId: string | null
  companyId: string | null
  companyName: string | null
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(`bidsure::${password}`).digest('hex')
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  await prisma.session.create({ data: { token, userId, expiresAt } })
  return token
}

export async function destroySession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } })
}

function initialsFor(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? 'U') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function toAuthedUser(u: {
  id: string; role: string; email: string; name: string; subtitle: string; initials: string
  department: string | null; employeeId: string | null; companyId: string | null
  company: { name: string } | null
}): AuthedUser {
  return {
    id: u.id,
    role: u.role === 'OFFICER' ? 'OFFICER' : 'SELLER',
    email: u.email,
    name: u.name,
    subtitle: u.subtitle,
    initials: u.initials || initialsFor(u.name),
    department: u.department,
    employeeId: u.employeeId,
    companyId: u.companyId,
    companyName: u.company?.name ?? null,
  }
}

async function userFromToken(token: string): Promise<AuthedUser | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { company: { select: { name: true } } } } },
  })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { token } }).catch(() => {})
    return null
  }
  return toAuthedUser(session.user)
}

export function bearerFrom(request: Request): string | null {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match ? match[1].trim() : null
}

export async function requireUser(request: Request): Promise<AuthedUser> {
  const token = bearerFrom(request)
  if (!token) throw new ApiError('Authentication required', 401)
  const user = await userFromToken(token)
  if (!user) throw new ApiError('Session expired. Please sign in again.', 401)
  return user
}

export async function requireOfficer(request: Request): Promise<AuthedUser> {
  const user = await requireUser(request)
  if (user.role !== 'OFFICER') throw new ApiError('Officer role required', 403)
  return user
}

export async function requireSeller(request: Request): Promise<AuthedUser> {
  const user = await requireUser(request)
  if (user.role !== 'SELLER' || !user.companyId) throw new ApiError('Seller account required', 403)
  return user
}

export { toAuthedUser }
