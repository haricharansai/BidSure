// Private local file storage for the SIH prototype (plan §7).
// Bytes live under .data/uploads/ (never public/); the DB stores metadata
// keyed by a server-generated storageKey. Files are only served through the
// authenticated GET /api/files/[id] route.
import { createHash, randomUUID } from 'crypto'
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { join, extname } from 'path'
import { ApiError } from '../api.ts'

const STORAGE_ROOT = join(process.cwd(), '.data', 'uploads')

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'text/plain': '.txt',
}

const MAGIC_BYTES: Array<{ mime: string; test: (b: Buffer) => boolean }> = [
  { mime: 'application/pdf', test: b => b.subarray(0, 4).toString('ascii') === '%PDF' },
  { mime: 'image/png', test: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'text/plain', test: b => !b.subarray(0, 8).includes(0x00) },
]

export function sanitizeFileName(name: string): string {
  return (name || 'document')
    .replace(/[\\/]/g, '_')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"|?*]/g, '')
    .slice(0, 128)
    .trim() || 'document'
}

/** Sniff the real MIME from magic bytes; fall back to declared type for text. */
export function sniffMime(buffer: Buffer, declaredType: string): string {
  for (const m of MAGIC_BYTES) {
    if (m.test(buffer)) return m.mime
  }
  return declaredType
}

export function validateFile(file: { buffer: Buffer; type: string; name: string }, spec: { allowedTypes: string[]; maxSizeMb: number }): void {
  const declared = (file.type || 'application/octet-stream').toLowerCase()
  const mime = sniffMime(file.buffer, declared)
  if (spec.allowedTypes.length && !spec.allowedTypes.includes(mime)) {
    throw new ApiError(`File type ${mime} is not allowed for this document (allowed: ${spec.allowedTypes.join(', ')})`, 400)
  }
  if (file.buffer.byteLength <= 0) throw new ApiError('Uploaded file is empty', 400)
  if (file.buffer.byteLength > spec.maxSizeMb * 1024 * 1024) {
    throw new ApiError(`File exceeds the maximum size of ${spec.maxSizeMb} MB for this document`, 400)
  }
}

export interface StoredFile {
  storageKey: string
  originalName: string
  mimeType: string
  sizeBytes: number
  sha256: string
}

export async function storeFile(buffer: Buffer, originalName: string, declaredType: string): Promise<StoredFile> {
  const mime = sniffMime(buffer, declaredType)
  const ext = MIME_EXTENSIONS[mime] ?? (extname(sanitizeFileName(originalName)).slice(0, 8) || '.bin')
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const storageKey = `uploads/${month}/${randomUUID()}${ext}`
  const dir = join(STORAGE_ROOT, 'uploads', month)
  await mkdir(dir, { recursive: true })
  await writeFile(join(STORAGE_ROOT, storageKey), buffer)
  return {
    storageKey,
    originalName: sanitizeFileName(originalName),
    mimeType: mime,
    sizeBytes: buffer.byteLength,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  }
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  if (storageKey.includes('..') || !storageKey.startsWith('uploads/')) {
    throw new ApiError('Invalid storage key', 400)
  }
  try {
    return await readFile(join(STORAGE_ROOT, storageKey))
  } catch {
    throw new ApiError('Stored file not found on disk', 404)
  }
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  if (storageKey.includes('..') || !storageKey.startsWith('uploads/')) return
  await unlink(join(STORAGE_ROOT, storageKey)).catch(() => {})
}

export function fileSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
