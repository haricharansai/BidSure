# Plan: Real-Document Verification Pipeline for BidSure (FINAL)

Supersedes the earlier mock-based classification design. Implements the GeM officer
pipeline (classify → OCR/extract → identify sources → query → compare → score → review)
against **real uploaded PDFs/images**, while preserving the existing architecture:
two-phase verification (PRELIMINARY/AUTHORITATIVE), pure engine, 6-state DocStatus,
worst-of merge, hash-chained audit, human review gate, and the current UI.

## Confirmed Decisions
1. **Scope**: Verification plan + real-document pipeline only. The config/policy
   workstream (lib/app-config.ts, lib/server/config.ts, Setting model, page.tsx
   policy wiring) is OUT OF SCOPE — treat that todo list as stale.
2. **OCR stack — Hybrid**: a real local `OCR` provider (PDF text-layer via `unpdf`;
   images via `tesseract.js`) is the default production extractor; an env-gated
   cloud stub (e.g. `OCR_PROVIDER=google-vision` + `GOOGLE_VISION_API_KEY`)
   implements the same interface for future plug-in. MOCK stays as a dev/test adapter.
3. **Authoritative sources — Interface + aggregator adapter**: a `RegistryProvider`
   interface with (a) the existing DB `MockRegistryEntry` loader as the dev/test
   adapter and (b) an env-gated HTTP adapter for a SurePass-style KYC aggregator
   (GSTIN search / PAN / UDYAM endpoints). Without credentials in production,
   mock-backed checks are capped at `NEEDS_REVIEW` (never a fake authoritative
   PASS/NON_COMPLIANT).
4. **Severity policy** (unchanged from the original plan): classification mismatch,
   identity mismatch, doc-vs-declared turnover conflicts → `NEEDS_REVIEW`;
   deterministic breaches auto-fail (registry CANCELLED from an authoritative
   provider, doc turnover < tender minimum, missing mandatory doc).
5. **Evidence retention**: every automated result keeps source evidence — extraction
   stores raw OCR/text-layer output + per-field source spans; every VerificationCheck
   row's `foundJson` carries the matched text spans / compared values.

## Non-Goals
- No redesign of app architecture, audit chain, review gate, or UI.
- No paid-API calls in tests; no cloud credentials required to run the suite.
- No changes to the `BIDSURE-MOCK-EXTRACT` demo flow in development.

---

## Task List (implementation-ready, in order)

### 1. Real OCR extraction provider — `lib/server/extraction/ocr-extractor.ts`
- Implement `ExtractionProvider` (interface at `lib/server/extraction/index.ts:13`)
  as a new `ocrExtract` provider, name `OCR`:
  - `application/pdf`: extract per-page text with `unpdf` (`extractText`).
    PDFs with an empty text layer (scanned) → `status: 'FAILED'` with a stable
    error routing to manual review (existing safe path; do NOT attempt rasterize-OCR).
  - `image/png`, `image/jpeg`: OCR with `tesseract.js` (lang `eng`).
  - `text/plain`: read as UTF-8 text directly.
- **Field harvesting from real text** (`lib/server/extraction/harvest.ts`):
  regex-based, per-doc-type field extraction mirroring `normalizeFields` in
  `mock-extractor.ts`: GSTIN (15-char format), PAN (10-char format), `UDYAM-`
  prefix + NIC, UDIN (20-digit) + cert date + `turnoverCr` from `₹…Cr` amounts,
  names via labelled lines. Reuse the existing normalizers: extract
  `normalizeFields` into `lib/server/extraction/normalize.ts` and have
  `mock-extractor.ts` re-export it (keeps existing tests untouched).
- **Classification (plan gap A, now real)**: `classifyDocType(text)` →
  `{ docType: DocTypeName, confidence, evidence: { pattern, span }[] }` using the
  same statutory patterns (GSTIN/PAN/UDYAM/UDIN formats + keyword hits);
  `generic` when nothing matches. Used to cross-check the tender's required
  `docName` and to auto-fill `docType` when it is `generic`.
- **Evidence retention**: extend `ExtractOutcome` with optional
  `evidence: { field, value, excerpt, page }[]`, `pageTexts: string[]`,
  `classification`. Persist into `ExtractionResult.rawJson` (structure:
  `{ fields, evidence, pageTexts? }`); `normalizedJson` keeps plain fields.
- Provider selection in `lib/server/extraction/index.ts`:
  - `BIDSURE_EXTRACTION_PROVIDER=mock` forces MOCK (dev/test/demo).
  - `=cloud` + configured key → cloud stub adapter
    (`lib/server/extraction/cloud-extractor.ts`, HTTP skeleton, env-gated).
  - Default: OCR for real MIME types; MOCK only when the buffer contains the
    `BIDSURE-MOCK-EXTRACT` marker AND running in dev/test (`NODE_ENV !== 'production'`).

### 2. RegistryProvider interface + aggregator adapter — `lib/server/registry/`
- New `lib/server/registry/provider.ts`:
  `interface RegistryProvider { name; authoritative: boolean; lookup(registry, key): Promise<RegistryRecord | null> }`.
- `MockRegistryProvider` — wraps the existing `loadRegistryEntry` DB loader
  (`lib/server/registry.ts`); `authoritative: false`.
- `AggregatorRegistryProvider` — env-gated (`REGISTRY_AGGREGATOR_URL` +
  `REGISTRY_AGGREGATOR_API_KEY`), SurePass-style endpoints (GSTIN advanced search,
  PAN, UDYAM); maps responses to `RegistryRecord`; `authoritative: true`.
  Network failures → return `null` with an audit note (→ NEEDS_REVIEW), never throw.
- Selection: aggregator when configured; else mock. `lib/server/registry.ts`
  keeps its exports and delegates (`loadRegistryForDoc` gains a provider param,
  defaulting to the active provider, so existing call sites stay valid).
- **Production safety cap** (in `lib/server/verify.ts`, NOT the pure engine, so
  engine tests are unchanged): when the active provider is the mock and
  `NODE_ENV === 'production'` (unless `BIDSURE_ALLOW_MOCK_REGISTRY=1`), registry
  check statuses are capped at `NEEDS_REVIEW` with a note that the mock registry
  is not authoritative. Dev/test behavior (incl. CANCELLED → NON_COMPLIANT) unchanged.
- Set `mock: false` on check rows produced from aggregator data (extend
  `registryCheck` in `lib/engine/registry.ts` with a `mock` argument; default true).

### 3. Classification mismatch check — `lib/server/verify.ts`
- After extraction succeeds, compare `classified docType` (from §1) against the
  tender's required `docName`; if mismatch and classified ≠ `generic`, inject
  `DOC_TYPE_MISMATCH` (stage `STRUCTURAL`, `NEEDS_REVIEW`, `mock: false`) with
  evidence: matched patterns + text spans in `foundJson`.
- Fires in both PRELIMINARY and AUTHORITATIVE phases (verifyDocument is shared).

### 4. Three-way identity chain — `lib/engine/registry.ts` + `lib/server/verify.ts`
- New pure checks comparing extracted fields against the **company profile**
  (bidder's registered Company row — distinct from the authoritative registry):
  `IDENTITY_GSTIN` (extracted.gstin vs company.gstin), `IDENTITY_PAN`,
  `IDENTITY_LEGAL_NAME` (nameSimilarity ≥ 0.85, same threshold as registry checks).
- Stage `CROSS_DOC`; `MATCH` → `VERIFIED`, mismatch → `NEEDS_REVIEW` (never
  auto-fail); `mock: false`; `foundJson` carries both values + similarity.
- `DocVerifyInput` gains optional `company: { gstin, pan, legalName, name }`;
  `verifyDocument` emits these checks after registry checks.
- Callers thread it through: `app/api/documents/upload/route.ts` (load the
  seller's company) and `lib/server/evaluate.ts` (already has `submission.company`).

### 5. Turnover eligibility — `lib/engine/index.ts` + `lib/server/evaluate.ts`
- In `evaluateSubmission`, for the `turnover` doc with extracted `turnoverCr`:
  - `TURNOVER_ELIGIBILITY` (stage `ELIGIBILITY` — add to the `EngineCheck` stage
    union in `lib/engine/registry.ts`; schema `stage` is a String column, comment
    only, no migration): `NON_COMPLIANT` if `turnoverCr < tender.requirements`
    `minTurnoverCr`, else `VERIFIED`; note carries both figures.
  - `TURNOVER_DECLARATION_MATCH` (stage `CROSS_DOC`): extracted `turnoverCr` vs
    `company.turnoverCr`; divergence > 15% → `NEEDS_REVIEW`, else `VERIFIED`.
  - **Precedence** (matches the existing "extracted identifiers take precedence"
    rule, `lib/engine/index.ts:336`): when extracted turnover is present, use it
    for the `minTurnoverCr` eligibility row instead of `company.turnoverCr`; the
    declaration mismatch still raises `NEEDS_REVIEW`.
  - Only the submission-level check rows are persisted as new
    `VerificationCheck` rows via the existing CROSS_DOC/ELIGIBILITY persistence
    in `evaluate.ts` (generic — no structural change).

### 6. Evidence plumbing through verify/evaluate
- `verifyDocument` persists richer `ExtractionResult.rawJson` (evidence spans,
  page texts) — schema already has the columns; no migration for this.
- `evaluate.ts` passes the company profile into `verifyDocument`; all new checks
  flow through the existing `VerificationCheck.createMany` (generic).
- Audit: extend existing `EXTRACTION_*` and `REGISTRY_*` audit `meta` with
  `provider`, `classification`, `authoritative` flags — no new action types.

### 7. Seed + env
- `prisma/seed.ts`: keep `BIDSURE-MOCK-EXTRACT` demo docs (dev adapter); the
  turnover block already emits `turnoverCr: company.caTurnoverCr` (line 374).
  No changes required beyond confirming com-nexora `caTurnoverCr = 24.2` and
  tender `minTurnoverCr = 2` exercise the checks.
- Create `.env.example` documenting:
  `DATABASE_URL`, `BIDSURE_EXTRACTION_PROVIDER`, `OCR_PROVIDER`,
  `GOOGLE_VISION_API_KEY`, `REGISTRY_AGGREGATOR_URL`, `REGISTRY_AGGREGATOR_API_KEY`,
  `BIDSURE_ALLOW_MOCK_REGISTRY`.

### 8. Tests (new, `tests/` — node:test + tsx-style TS via Node 24)
- `extraction.test.ts` additions: OCR provider on a real text-layer PDF buffer
  (fixture generated in-test via minimal PDF bytes) → correct GSTIN/PAN harvest;
  classification confidence; scanned-PDF empty-text → FAILED.
  Image-OCR (tesseract) test guarded by `BIDSURE_TEST_OCR=1` (skipped offline).
- New `tests/classification.test.ts`: pattern-based doc-type classification
  (gstin/pan/udyam/turnover/generic) with evidence spans.
- `pipeline.test.ts` / `engine.test.ts` additions: DOC_TYPE_MISMATCH fires on
  mismatch only; IDENTITY_* checks vs company profile; TURNOVER_ELIGIBILITY
  FAIL/PASS; TURNOVER_DECLARATION_MATCH 15% band; production cap on mock
  registry checks (assert via pure function or config flag, no NODE_ENV mutation).

---

## Preservation Guarantees
- The MOCK extractor/provider and demo seed docs keep working unchanged in dev
  (`BIDSURE_EXTRACTION_PROVIDER=mock` or auto-detected mock marker).
- All 41 existing tests keep passing unchanged (mock-extractor exports intact;
  engine changes are additive checks; verify.ts caps only in production).
- Audit chain stays hash-chained via existing `recordAudit` calls; only `meta`
  payloads gain fields. Review gate untouched (NEEDS_REVIEW rows flow through
  the existing `worst-of` merge → `requires_review`).
- No Prisma schema changes required (provider/stage columns are Strings;
  `provider` gains values `OCR`/`CLOUD`; `stage` gains `ELIGIBILITY` as a comment).
  No migration beyond what exists.

## Risks & Mitigations
- **tesseract.js runtime data download** → image-OCR test env-gated; PDF text
  path is offline and deterministic (unpdf is pure JS).
- **OCR inaccuracy** → confidence < threshold (e.g. 0.6) or missing required
  fields → extraction `FAILED` → existing manual-review path; never guess fields.
- **Cloud stub without credentials** → never selected; falls through to OCR/mock.
- **Aggregator adapter misconfigured** → lookup returns null → `NEEDS_REVIEW`,
  audited, never a silent PASS.
- **New check rows vs worst-of merge** → all new statuses are from the existing
  `DocStatus` union; merge logic is generic.

## Validation
1. `npm test` — existing 41 + new tests pass.
2. `npx tsc --noEmit` — clean.
3. `npm run build` — clean.
4. E2E smoke (`node tests/e2e-smoke.mjs` + manual dev run):
   - Upload a real text-layer PDF GST certificate → provider `OCR`, structured
     fields, evidence spans stored, registry + identity + classification checks run.
   - Upload a real PNG → tesseract OCR path extracts the GSTIN.
   - Upload a scanned (no-text-layer) PDF → extraction FAILED → NEEDS_REVIEW.
   - Demo mock docs still verify as before in dev.
   - Turnover: tender with `minTurnoverCr` above the extracted figure →
     TURNOVER_ELIGIBILITY FAIL; declaration divergence > 15% → NEEDS_REVIEW.
