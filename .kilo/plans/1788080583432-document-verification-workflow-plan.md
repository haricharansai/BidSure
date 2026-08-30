# BidSure — Document Verification Workflow Implementation Plan

Extends the existing Next.js 16 + Prisma 6 + PostgreSQL app. No rebuild. No Redis/BullMQ/Kafka/microservices. No real gov APIs. No VerificationJob. Legacy files (`lib/db.ts`, legacy data resources, `prisma/dev.db`) are NOT deleted in this implementation.

---

## 1. Executive Implementation Summary

Add four Prisma models (`DocumentFile`, `ExtractionResult`, `VerificationCheck`, `MockRegistryEntry`), modify three (`RequiredDoc`, `SubmittedDoc`, `Submission.status` gains `DRAFT`). Add a private local file store (`.data/uploads/`, never `public/`), a deterministic mock extraction provider behind a provider interface, a polymorphic mock government registry, and a two-tier verification design:

- **Preliminary** (on upload, non-authoritative): store → hash → extract → preview to seller.
- **Authoritative** (deadline lock, in existing `tick()` → `runAutomatedEvaluation`): re-read files, re-extract, re-lookup registry, run existing engine + new pure registry cross-checks, persist `VerificationCheck` rows, `EvaluationResult`, and audit events.

Officer-configurable required documents (catalogue + custom), seller file uploads with read-only extraction preview, officer document-level verification drill-down, all events in the existing SHA-256 audit chain. Existing engine validators/reconciliation/eligibility/technical/scoring are preserved; extraction feeds the same `extracted` field the engine already consumes.

## 2. Final Architecture Diagram

```
Officer: CreateTender (page.tsx w-create)
  └─ POST /api/action createTender {requiredDocs[]}   [actions.ts]
RequiredDoc[] (+ allowedTypes, maxSizeMb, isCustom)    [prisma + requirementsJson]
Seller: WorkflowTenderDetail
  ↓ POST /api/action startBid           → Submission(status=DRAFT)
  ↓ POST /api/documents/upload (multipart, NEW)
      → DocumentFile → .data/uploads + sha256     [lib/server/storage.ts NEW]
      → MockExtractionProvider                    [lib/server/extraction/ NEW]
      → ExtractionResult + SubmittedDoc(extractedJson)  (PRELIMINARY, non-authoritative)
      → read-only extraction preview in UI
  ↓ POST /api/action submitBid (finalize) → status=SUBMITTED
  ↓ deadline → tick() locks submissions            [lifecycle.ts, existing]
Authoritative: runAutomatedEvaluation               [evaluate.ts]
  ├─ completeness (existing engine stage 1)
  ├─ validators (validators.ts, existing)
  ├─ registry cross-check (engine/registry.ts NEW, pure) ← server/registry.ts loads MockRegistryEntry
  ├─ cross-doc reconciliation (reconciliation.ts, existing)
  ├─ eligibility + technical (existing)
  ↓
EvaluationResult (compliancePct, risk, flags, reasons) + VerificationCheck[] + SubmittedDoc 6-state
  ↓ requires_review → officerDecision (existing)
  ↓ recordAudit (existing SHA-256 chain)
```

## 3. Final Database Schema Proposal

### New models

```prisma
model DocumentFile {
  id           String   @id @default(cuid())
  storageKey   String   @unique        // "uploads/<yyyy>/<mm>/<uuid>.<ext>" — locates bytes on disk
  originalName String                  // sanitized display name
  mimeType     String                  // validated against RequiredDoc.allowedTypes
  sizeBytes    Int                      // validated against RequiredDoc.maxSizeMb
  sha256       String                   // integrity + audit tamper-evidence
  uploadedById String
  uploadedBy   User     @relation(fields:[uploadedById], references:[id])
  submittedDoc SubmittedDoc?
  extraction   ExtractionResult?
  createdAt    DateTime @default(now())
  deletedAt    DateTime?                // soft delete on replacement (audit)
}
model ExtractionResult {
  id             String @id @default(cuid())
  documentFileId String @unique
  documentFile   DocumentFile @relation(fields:[documentFileId], references:[id])
  submittedDoc   SubmittedDoc? @relation(fields:[submittedDocId], references:[id]) // denormalized link
  submittedDocId String?
  docType        String
  provider       String        // "MOCK" (later "OCR")
  status         String        // DONE | FAILED
  confidence     Float?        // mock: 1.0 when recognized, else null
  rawJson        String @default("{}")
  normalizedJson String @default("{}")
  error          String?
  durationMs     Int?
  createdAt      DateTime @default(now())
}
model VerificationCheck {
  id             String @id @default(cuid())
  submissionId   String
  submission     Submission @relation(fields:[submissionId], references:[id])
  submittedDocId String?                    // null for cross-document / bid-level checks
  docName        String
  checkId        String      // GSTIN_FORMAT | GSTN_REGISTRY_MATCH | PAN_EMBED | TURNOVER_TRIANGULATION | ...
  stage          String      // STRUCTURAL | REGISTRY | CROSS_DOC | ELIGIBILITY | TECHNICAL
  inputJson      String @default("{}")
  expectedJson   String @default("{}")
  foundJson      String @default("{}")
  status         String      // 6-state DocStatus
  note           String @default("")
  run            String      // PRELIMINARY | AUTHORITATIVE
  createdAt      DateTime @default(now())
  @@index([submissionId])
  @@index([tenderId])
}
model MockRegistryEntry {
  id       String @id @default(cuid())
  registry String   // GSTN | PAN | UDYAM | MCA | INCOME_TAX | DPIIT | NSIC
  key      String
  status   String   // ACTIVE | CANCELLED | SUSPENDED | STRUCK_OFF | INACTIVE
  dataJson String @default("{}")
  isMock   Boolean @default(true)
  @@unique([registry, key])
  @@index([key])
}
```

### Modified models

- `RequiredDoc`: begin writing `allowedTypes` (JSON string array) and `maxSizeMb`; add `Boolean isCustom @default(false)`. No new columns otherwise.
- `SubmittedDoc`: add `documentFile DocumentFile?`, `String extractionStatus @default("PENDING")` (PENDING/RUNNING/DONE/FAILED).
- `Submission`: add `String status @default("SUBMITTED")` already exists — add value `"DRAFT"`; uniqueness `@@unique([tenderId, companyId])` retained: a DRAFT occupies the slot, `submitTender` finalize flips DRAFT→SUBMITTED (rename action: keep `submitTender` for finalize, new `startBid` creates DRAFT).

### Replacement / deletion behavior (critical)

- Seller replaces a doc: old `DocumentFile` gets `deletedAt` set (file bytes may remain on disk), its `ExtractionResult` and any `PRELIMINARY` `VerificationCheck` rows are marked stale by **deleting only PRELIMINARY VerificationChecks for that SubmittedDoc** and resetting `SubmittedDoc` to `extractionStatus=PENDING`, `status=UNVERIFIED`, `extractedJson="{}"`. No stale preliminary result can survive as authoritative because (a) authoritative runs always **re-run** extraction from disk bytes and **delete+recreate** all prior `run=AUTHORITATIVE` checks for the submission, and (b) the UI only ever renders authoritative checks as final once the tender is CLOSED.

## 4. File Storage Design

- Directory: `bid-sure/.data/uploads/` (gitignored; create at runtime if missing). Never `public/`.
- Storage key format: `uploads/<yyyy>-<mm>/<cuid>.<ext>` — server-generated name only; original name kept in `originalName`.
- Filename sanitization: strip path separators, control chars, limit to 128 chars, only allowlist ext derived from MIME.
- Size validation: reject > `RequiredDoc.maxSizeMb` (enforce server-side; default 5 MB).
- MIME validation: compare `file.type` + magic-byte sniff first 8 bytes (pdf `%PDF`, png `\x89PNG`, jpg `FFD8FF`) against `RequiredDoc.allowedTypes`.
- Access: only via `GET /api/files/[id]` with Bearer session; officer sees all (their tenders), seller only own-company files.
- Replacement: supersede (new DocumentFile row, old row soft-deleted). Deletion: hard delete bytes only for superseded files during finalization purge — keep it simple: soft-delete record, overwrite not allowed.

## 5. Extraction Architecture

- `lib/server/extraction/types.ts`: `ExtractionProvider { name; extract(docType, file:{buffer,mimeType,fileName}): Promise<ExtractOutcome> }`; typed `ExtractedDocumentData` per doc type (§3 of discovery: gstin, pan, udyam, turnover, audited, emd, mii, iso, experience, startup, maf, board, mca, generic).
- `lib/server/extraction/mock-extractor.ts`: **deterministic**. Demo-document convention: prototype documents are small PDF/text files containing a machine-readable header block, e.g. a line `BIDSURE-MOCK-EXTRACT {json}` — seed generates such files per company; the mock provider parses that block deterministically (JSON.parse of the block, mapping to the typed fields). Files without the block: provider returns `FAILED` with "unrecognized document — manual review" (drives the NEEDS_REVIEW demo). **No random values, no timestamps in output.** Seeded demo artifacts are created as real files in `.data/uploads/seed/` by `prisma/seed.ts` so the demo works end-to-end.
- Engine depends only on `SubmittedDocClaim.extracted` — provider swap requires no engine change.
- Extraction happens twice: preliminary on upload; authoritative re-run at evaluation (files re-read from disk, same provider → same output; determinism makes re-run idempotent).

## 6. Mock Registry Architecture

- `lib/server/registry.ts`: `loadRegistryEntries(keys)` — DB access only here; returns plain records.
- `lib/engine/registry.ts`: pure functions `crossCheckGst(extracted, entry)`, `crossCheckPan`, `crossCheckUdyam`, `crossCheckMca`, `crossCheckDpiit`, `crossCheckIncomeTax`, `crossCheckNsic`, `crossCheckTurnover(INCOME_TAX)`; each returns `VerificationCheck[]` with field-level MATCH/MISMATCH/UNKNOWN. **No registry-backed doc → no registry stage** (board, maf, mii, emd, iso, experience are metadata/completeness only).
- Every persisted check + UI rendering + audit meta carries `mock: true` / "MOCK GOVERNMENT DATABASE" labeling.

## 7. Verification Pipeline (15 steps)

| # | Step | Module | DB | Pure | When |
|---|---|---|---|---|---|
| 1 | File validation | `app/api/documents/upload/route.ts` | read RequiredDoc | no | upload |
| 2 | File storage | `lib/server/storage.ts` | create DocumentFile | no | upload |
| 3 | SHA-256 | `lib/server/storage.ts` | — (in meta) | pure fn | upload + authoritative |
| 4 | Extraction | `lib/server/extraction/*` | no | no (file I/O) | upload + authoritative |
| 5 | Extraction persistence | upload route / `evaluate.ts` | upsert ExtractionResult + SubmittedDoc | no | both |
| 6 | Structural validation | `lib/engine/validators.ts` (existing) | no | yes | both |
| 7 | Registry lookup | `lib/server/registry.ts` | read MockRegistryEntry | no | both (re-read authoritative) |
| 8 | Field comparison | `lib/engine/registry.ts` | no | yes | both |
| 9 | Cross-document consistency | `lib/engine/reconciliation.ts` (existing) + doc-name/name-similarity | no | yes | authoritative |
| 10 | Eligibility | existing `evaluateSubmission` stage 3 | no | yes | authoritative |
| 11 | Technical | existing stage 4 | no | yes | authoritative |
| 12 | Compliance score | existing weighted formula (registry mismatch ⇒ doc NON_COMPLIANT ⇒ inherits weight) | no | yes | authoritative |
| 13 | Risk | existing derivation + registry-mismatch bump | no | yes | authoritative |
| 14 | Review gate | existing `requires_review` → `officerDecision` | yes | no | authoritative |
| 15 | Audit | `recordAudit` | insert AuditEntry | no | both |

`evaluateSubmission` signature: add optional `registry: Record<string, MockRegistryEntryLike>` argument; docs' `extracted` now comes from extraction. Existing validator/reconciliation code unchanged.

## 8. Preliminary vs Authoritative

- **Preliminary** (upload): extraction + structural checks + registry lookup → stored with `run="PRELIMINARY"`, surfaced to seller as preview. Never used for scoring; UI labels it "Preliminary — not authoritative".
- **Authoritative** (deadline → `lockSubmissions` → `tryFinalizeEvaluation` → `runAutomatedEvaluation`): for each submission: re-read every `DocumentFile` from disk, re-hash (compare with stored sha256 — tamper check), re-run extraction, re-load registry, run full engine, **delete previous AUTHORITATIVE VerificationChecks for the submission and recreate**, write 6-state doc statuses, `EvaluationResult`, ranks, audit events.
- Staleness guarantee: authoritative pipeline never reads preliminary VerificationChecks; scoring derives only from the authoritative pass's in-memory outcome + freshly loaded registry rows.

## 9. Officer Workflow

`CreateTender` gains a Required Documents builder: default palette = `DEFAULT_DOC_TEMPLATES` (pre-checked recommended: pan, gstin, turnover, audited, board); officer can add from catalogue, add custom (name+description, `isCustom`), remove, set classification (MANDATORY/CONDITIONAL/SUPPORTING), conditionKey (from known set), allowedTypes (checkboxes: PDF/JPG/PNG), maxSizeMb. Payload `requiredDocs[]`; backend validates (names unique, ≥1 MANDATORY, classification enum, conditionKey whitelist, types/size bounds), persists both `RequiredDoc` rows and `requirementsJson.requiredDocs[]` (keep in sync — single source written at create time).

## 10. Seller Workflow

Start Bid (`startBid` new action) → DRAFT Submission (creates SubmittedDoc rows) → financial + technical entered → per-doc upload → extraction runs → read-only preview + preliminary status → optional replace (invalidates old extraction) → `submitTender` finalizes (DRAFT→SUBMITTED, locks doc changes per existing deadline rules). If deadline passes with DRAFT, tick() discards it (delete DRAFT submissions at lock; audited).

## 11. API Contracts

| Endpoint | Auth/Role | Request | Response | Errors |
|---|---|---|---|---|
| `POST /api/action {action:'startBid', tenderId}` | SELLER, own company, stage PUBLISHED/CORRIGENDUM, before deadline, no existing submission | — | `{submissionId}` | 403/400/409 (existing patterns) |
| `POST /api/documents/upload` | SELLER owning DRAFT submission | multipart: `submissionId`, `docName`, `file` | `{fileId, extraction:{status,confidence,fields}, preliminaryChecks}` | 400 unknown doc/bad type/too large; 403 ownership; 410 deadline passed |
| `GET /api/files/[id]` | session; officer-on-tender or owning seller | — | file bytes (Content-Disposition) | 401/403/404 |
| `POST /api/action {action:'submitTender'}` | SELLER | now: `submissionId` + financial/technical (docs come from uploads) | `{submissionId}` | 400 if mandatory docs unprovided/unextracted |
| `POST /api/action {action:'createTender', requiredDocs[]}` | OFFICER | doc config list | `{tenderId}` | 400 validation |
| `GET /api/data resource=tender-v2 / evaluation-v2` | authed | extended fields (allowedTypes, maxSizeMb, doc file/extraction/checks, drill-down) | — | existing |

`tick()` gains: delete DRAFT submissions on lock. `runAutomatedEvaluation` gains authoritative verification block.

## 12. UI Changes

- **Officer CreateTender**: editable docs builder (replaces read-only panel page.tsx:1352-1365).
- **Seller WorkflowTenderDetail**: upload UI (file input, progress), read-only extraction preview card, preliminary status chips, replace buttons, finalize button. Remove all seller-typed `ex(...)` inputs (1553-1573).
- **Seller "Your submission"**: per-doc file link + verification checks + MOCK registry badge.
- **Officer EvalDetailV2 drill-down**: per-document verification panel — extracted values, structural checks, registry field MATCH/MISMATCH table, confidence, overall 6-state, reasons, risk, "MOCK GOVERNMENT DATABASE" label, view-file link.
- New components: `DocUploader`, `ExtractionPreviewCard`, `VerificationChecksTable`, `RegistryMatchBadge`.
- Reused unchanged: `Doc6Badge`, `ClassificationChip`, `StageBadge`, `Alert`, `Modal`, `PageFrame`, `useApi`, dashboards, audit explorer, auction.

## 13. Audit Design

Existing `recordAudit`/chain unchanged. New actions (meta JSON): `DOC_UPLOADED{fileId,sha256,sizeBytes,docName}`, `EXTRACTION_STARTED{submittedDocId,docType}`, `EXTRACTION_COMPLETED{provider,confidence}`, `EXTRACTION_FAILED{error}`, `REGISTRY_LOOKUP{registry,key,found,mock:true}`, `REGISTRY_MATCH/MISMATCH{registry,key,fields,mock:true}`, `DOC_VERIFIED{submittedDocId,checkCount}`, `DOC_FLAGGED{submittedDocId,failedChecks}`, `MANUAL_REVIEW_REQUESTED{submissionId,reason}`, `DOC_REPLACED{oldFileId,newFileId}`, `DRAFT_DISCARDED`. Preliminary events marked `phase:"PRELIMINARY"`, authoritative `phase:"AUTHORITATIVE"`. Lookup/match events recorded only for authoritative run (avoid chain bloat) — preliminary kept in VerificationCheck rows only.

## 14. Seed / Demo Design

`prisma/seed.ts` additions: `MockRegistryEntry` rows for all seeded companies (GSTN/PAN/UDYAM/MCA/DPIIT) + a **fraud entry**: bad seller's GSTIN registry row has `legalName` ≠ company name and `status="CANCELLED"`. Three deterministic scenarios:

1. **CLEAN** (Nexora): all docs seeded with matching payloads → QUALIFIED, LOW risk.
2. **NON-COMPLIANT** (trader-MSME/bad-GST persona): GSTIN matches key but legal name MISMATCH + registry CANCELLED → NON_COMPLIANT, HIGH risk.
3. **NEEDS-REVIEW**: valid docs but one doc (e.g., ISO) has unparseable mock block → extraction NEEDS_REVIEW path.

Seeded demo documents are real small files with `BIDSURE-MOCK-EXTRACT {...}` blocks written to `.data/uploads/seed/`; seeds reference them. Also seed a "custom document" tender to demo officer-configured docs.

## 15. Exact Files to Modify

`prisma/schema.prisma`, `prisma/seed.ts`, `lib/server/actions.ts` (createTender docs param; submitTender finalize; startBid; uploadDoc rework), `lib/server/evaluate.ts` (authoritative pipeline + VerificationCheck persistence), `lib/server/lifecycle.ts` (DRAFT discard on lock), `lib/server/data.ts` (extend tender-v2/evaluation-v2 payloads), `lib/engine/index.ts` (registry param + per-check outputs), `app/page.tsx` (3 UI areas), `lib/api.ts` (multipart helper), `lib/types.ts`, `package.json` (no new deps expected; prisma migrate only).

## 16. Exact Files to Create

`lib/server/storage.ts`, `lib/server/extraction/index.ts`, `lib/server/extraction/mock-extractor.ts`, `lib/engine/registry.ts`, `lib/server/registry.ts`, `app/api/documents/upload/route.ts`, `app/api/files/[id]/route.ts`, `tests/registry.test.ts`, `tests/storage.test.ts`, `tests/pipeline.test.ts`.

## 17. Phase-by-Phase Plan

**PHASE 0 — Baseline.** Files: none. Run `pnpm test`, `pnpm build`, note results as regression baseline. AC: baseline recorded.
**PHASE 1 — Schema + seed.** Files: schema.prisma, seed.ts. DB: 4 new models + 3 modified + migration. Tests: schema validation, seed run. AC: migration applies; seed creates registries + 3 scenarios + demo docs.
**PHASE 2 — Storage + upload/download.** Files: storage.ts (new), api/documents/upload/route.ts (new), api/files/[id]/route.ts (new), api.ts, SubmittedDoc wiring. AC: seller uploads file to own DRAFT; wrong owner/size/MIME rejected; file not in public/.
**PHASE 3 — Officer doc builder.** Files: actions.ts, tender-config.ts (palette export), page.tsx CreateTender, types.ts. AC: officer-configured tender persists RequiredDoc + requirementsJson; validation errors surfaced.
**PHASE 4 — Seller draft + upload flow.** Files: actions.ts (startBid, submitTender finalize), lifecycle.ts, page.tsx seller panel. AC: DRAFT → upload → finalize works; deadline lock discards drafts; old submit path still blocked appropriately.
**PHASE 5 — Extraction.** Files: lib/server/extraction/* (new), evaluate hooks later. AC: seeded docs extract deterministically; unparseable → FAILED; preview shown; confidence preserved.
**PHASE 6 — Mock registry.** Files: lib/server/registry.ts, lib/engine/registry.ts, seed registries. AC: pure cross-check functions unit-tested (match/mismatch/unknown).
**PHASE 7 — Verification pipeline.** Files: engine/index.ts (registry stage + per-check emission), evaluate.ts (persist VerificationCheck). AC: each doc yields structured checks; engine tests still pass.
**PHASE 8 — Authoritative integration.** Files: evaluate.ts, lifecycle.ts. AC: deadline lock triggers re-extraction/re-hash/registry; preliminary results never used; EvaluationResult + checks + audit written; 3 demo scenarios produce expected verdicts.
**PHASE 9 — Seller verification UI.** Files: page.tsx, types.ts, data.ts. AC: seller sees doc statuses, checks, MOCK badges, file links.
**PHASE 10 — Officer verification UI.** Files: page.tsx, data.ts. AC: drill-down shows full per-doc verification incl. registry table; review gate unchanged.
**PHASE 11 — Audit integration.** Files: evaluate.ts, actions.ts, storage/extraction call sites. AC: all §13 events in chain; verifyAuditChain passes.
**PHASE 12 — E2E + demo.** Files: tests/*, seed polish. AC: full run-through of 3 scenarios via UI; all tests green.

## 18. Testing Strategy

Extend `node --test` convention (keep `tests/engine.test.ts` green). New tests per §17 ACs: registry cross-checks (pure), storage (temp dir), extraction determinism + failure, replacement invalidation, size/type validation, draft lifecycle, 3 scenario e2e via pure-engine calls with seeded fixtures, audit event assertions. Engine regression: existing `tests/engine.test.ts` must pass unchanged (pure functions keep signatures; add new params as optional).

## 19. Risks and Mitigations

- **Prisma migration on live DB** → backup/`prisma migrate dev` with review before apply; baseline DB dump in Phase 0.
- **Sync extraction in request path** → small files + mock provider; keep per-file work <100ms; note future job queue.
- **requirementsJson vs RequiredDoc drift** → write both from one validated list at creation; read from requirementsJson in engine (as today).
- **page.tsx monolith edits** → keep changes additive and localized to the three mapped sections.
- **Audit chain volume** → only authoritative registry events audited; preliminary kept in VerificationCheck.
- **DRAFT uniqueness edge** → one active DRAFT per (tender, company) via existing unique constraint; withdrawal deletes draft.

## 20. Definition of Done

1. Officer builds a custom required-doc list; seller uploads real files; extraction preview is system-derived (no seller-typed extracted values); finalize locks docs.
2. Authoritative evaluation re-runs extraction + registry and produces VerificationCheck rows; preliminary results never influence scores.
3. 3 seeded demo scenarios yield QUALIFIED/LOW, NON_COMPLIANT/HIGH, NEEDS_REVIEW reproducibly.
4. Officer UI shows document-level explainability with MOCK-registry labeling; review gate works.
5. All uploads private, hashed, authenticated access only.
6. All new events present in the hash-chained audit; chain verifies.
7. Existing tests pass; new tests pass; `pnpm build` clean.
8. No legacy files deleted; PostgreSQL/Prisma intact; no new infra dependencies.
