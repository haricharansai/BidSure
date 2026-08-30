// SHA-256 hash-chained audit trail. Each entry commits to
// SHA256(seq + ts + actorId + actorRole + action + payload + prevHash),
// so any DB mutation breaks verification in the audit explorer.
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'

export interface AuditInput {
  actorId: string
  actorRole: string
  action: string
  tenderId?: string | null
  meta?: Record<string, unknown>
}

export function computeAuditHash(input: {
  seq: number
  ts: Date
  actorId: string
  actorRole: string
  action: string
  meta: string
  prevHash: string
}): string {
  return createHash('sha256')
    .update(`${input.seq}|${input.ts.toISOString()}|${input.actorId}|${input.actorRole}|${input.action}|${input.meta}|${input.prevHash}`)
    .digest('hex')
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const last = await prisma.auditEntry.findFirst({ orderBy: { seq: 'desc' } })
  const seq = (last?.seq ?? 0) + 1
  const metaJson = JSON.stringify(input.meta ?? {})
  const prevHash = last?.hash ?? ''
  const ts = new Date()
  const hash = computeAuditHash({ seq, ts, actorId: input.actorId, actorRole: input.actorRole, action: input.action, meta: metaJson, prevHash })
  await prisma.auditEntry.create({
    data: {
      seq,
      ts,
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      tenderId: input.tenderId ?? null,
      metaJson,
      prevHash,
      hash,
    },
  })
}

export interface ChainVerification {
  valid: boolean
  brokenAtSeq: number | null
  message: string
}

export async function verifyAuditChain(): Promise<ChainVerification> {
  const entries = await prisma.auditEntry.findMany({ orderBy: { seq: 'asc' } })
  let prevHash = ''
  for (const e of entries) {
    if (e.prevHash !== prevHash) {
      return { valid: false, brokenAtSeq: e.seq, message: `Chain broken at entry #${e.seq}: previous-hash link does not match` }
    }
    const expected = computeAuditHash({
      seq: e.seq, ts: e.ts, actorId: e.actorId, actorRole: e.actorRole,
      action: e.action, meta: e.metaJson, prevHash: e.prevHash,
    })
    if (expected !== e.hash) {
      return { valid: false, brokenAtSeq: e.seq, message: `Entry #${e.seq} was mutated after commit — hash mismatch (tamper detected)` }
    }
    prevHash = e.hash
  }
  return { valid: true, brokenAtSeq: null, message: `Chain intact across ${entries.length} entries` }
}
