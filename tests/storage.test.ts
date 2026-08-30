// File validation + storage utility tests (plan §18: type/size validation, sha256).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeFileName, sniffMime, validateFile, fileSha256 } from '../lib/server/storage.ts'
import { ApiError } from '../lib/api.ts'

test('sanitizeFileName strips path traversal and control chars', () => {
  assert.equal(sanitizeFileName('../../etc/passwd'), '.._.._etc_passwd')
  assert.equal(sanitizeFileName('my\u0000file:name?.pdf'), 'myfilename.pdf')
  assert.equal(sanitizeFileName('   '), 'document')
})

test('sniffMime detects magic bytes (pdf/png/jpeg/text)', () => {
  assert.equal(sniffMime(Buffer.from('%PDF-1.7 rest'), 'application/octet-stream'), 'application/pdf')
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.equal(sniffMime(png, 'image/png'), 'image/png')
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
  assert.equal(sniffMime(jpg, 'image/jpeg'), 'image/jpeg')
  assert.equal(sniffMime(Buffer.from('hello world'), 'text/plain'), 'text/plain')
})

test('validateFile accepts an allowed PDF', () => {
  validateFile({ buffer: Buffer.from('%PDF-1.4 demo'), type: 'application/pdf', name: 'a.pdf' }, { allowedTypes: ['application/pdf'], maxSizeMb: 5 })
})

test('validateFile rejects disallowed MIME (declared PNG but sniffed PDF counts as PDF)', () => {
  assert.throws(
    () => validateFile({ buffer: Buffer.from('%PDF-1.4 x'), type: 'application/pdf', name: 'a.pdf' }, { allowedTypes: ['image/png'], maxSizeMb: 5 }),
    (err: unknown) => err instanceof ApiError && /not allowed/.test(err.message),
  )
})

test('validateFile rejects oversized files', () => {
  assert.throws(
    () => validateFile({ buffer: Buffer.alloc(6 * 1024 * 1024, 0x41), type: 'text/plain', name: 'big.txt' }, { allowedTypes: ['text/plain'], maxSizeMb: 5 }),
    /maximum size/,
  )
})

test('validateFile rejects empty uploads', () => {
  assert.throws(
    () => validateFile({ buffer: Buffer.alloc(0), type: 'text/plain', name: 'e.txt' }, { allowedTypes: [], maxSizeMb: 5 }),
    /empty/,
  )
})

test('fileSha256 matches the known node crypto digest', () => {
  assert.equal(fileSha256(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
