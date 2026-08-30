// GET /api/files/[id] — authenticated download of a stored document.
// Officers can access files of tenders they created; sellers only their own
// company's files. Files are never publicly accessible (plan constraint 14).
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api'
import { requireUser } from '@/lib/server/auth'
import { readStoredFile } from '@/lib/server/storage'

export const runtime = 'nodejs'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request)
    const { id } = await params
    const doc = await prisma.documentFile.findUnique({
      where: { id },
      include: {
        submittedDoc: { include: { submission: { include: { tender: { select: { createdById: true } } } } } },
      },
    })
    if (!doc) return NextResponse.json({ error: 'File not found' }, { status: 404 })
    const submission = doc.submittedDoc?.submission
    if (!submission) return NextResponse.json({ error: 'File not found' }, { status: 404 })
    const isOwner = user.role === 'SELLER' && submission.companyId === user.companyId
    const isOfficer = user.role === 'OFFICER' && submission.tender.createdById === user.id
    if (!isOwner && !isOfficer) return NextResponse.json({ error: 'Not authorized to access this file' }, { status: 403 })

    const buffer = await readStoredFile(doc.storageKey)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': doc.mimeType,
        'Content-Length': String(buffer.byteLength),
        'Content-Disposition': `inline; filename="${doc.originalName.replace(/"/g, '')}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    if (err instanceof ApiError) return NextResponse.json({ error: err.message }, { status: err.status })
    console.error('file access failed:', err)
    return NextResponse.json({ error: 'File access failed' }, { status: 500 })
  }
}
