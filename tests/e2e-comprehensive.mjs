// Comprehensive E2E Test Suite for BidSure
const BASE = 'http://localhost:3000'
let pass = 0
let fail = 0
const failures = []

async function j(url, opts = {}) {
  const res = await fetch(BASE + url, opts)
  const data = await res.json().catch(() => null)
  return { status: res.status, data }
}
function auth(token) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }

function assert(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; failures.push({ name, detail }); console.log(`  ✗ FAIL: ${name} — ${detail}`) }
}

console.log('═══════════════════════════════════════════════')
console.log('  BidSure E2E Test Suite')
console.log('═══════════════════════════════════════════════')

// ── 1. PUBLIC PAGES ──────────────────────────────
console.log('\n[1] PUBLIC PAGES')
{
  const r = await j('/')
  assert('Homepage loads (200)', r.status === 200, `got ${r.status}`)
}

// ── 2. AUTH — OFFICER LOGIN ──────────────────────
console.log('\n[2] AUTH — OFFICER LOGIN (arun.mehta)')
let officerToken
{
  const r = await j('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'login', type: 'officer', email: 'arun.mehta@digitransform.gov.in', password: 'officer123', employeeId: 'EMP-2024-00142' })
  })
  assert('Officer login returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.data)}`)
  assert('Officer login returns token', !!r.data?.token, 'no token in response')
  assert('Officer login returns user.id', !!r.data?.user?.id, JSON.stringify(r.data?.user))
  assert('Officer login returns role OFFICER', r.data?.user?.role === 'OFFICER', `got ${r.data?.user?.role}`)
  officerToken = r.data?.token
}

// ── 3. AUTH — OFFICER LOGIN EDGE CASES ───────────
console.log('\n[3] AUTH — OFFICER EDGE CASES')
{
  const r1 = await j('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'login', type: 'officer', email: 'arun.mehta@digitransform.gov.in', password: 'wrongpassword' })
  })
  assert('Wrong password returns 401', r1.status === 401, `got ${r1.status}`)

  const r2 = await j('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'login', type: 'officer', email: '', password: '' })
  })
  assert('Missing credentials returns 400', r2.status === 400, `got ${r2.status}`)

  const r3 = await j('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'login', type: 'officer', email: 'arun.mehta@digitransform.gov.in', password: 'officer123', employeeId: 'WRONG-ID' })
  })
  assert('Employee ID mismatch returns 401', r3.status === 401, `got ${r3.status}`)
}

// ── 4. AUTH — SELLER (CLEAN) LOGIN ───────────────
console.log('\n[4] AUTH — SELLER (CLEAN) LOGIN (Nexora Systems)')
let sellerCleanToken
{
  const r = await j('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'login', type: 'seller', email: 'contact@nexorasystems.com', password: 'seller123' })
  })
  assert('Seller (clean) login returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.data)}`)
  assert('Seller (clean) login returns token', !!r.data?.token, 'no token')
  assert('Seller (clean) returns role SELLER', r.data?.user?.role === 'SELLER', `got ${r.data?.user?.role}`)
  sellerCleanToken = r.data?.token
}

// ── 5. AUTH — SELLER (FRAUD) LOGIN ───────────────
console.log('\n[5] AUTH — SELLER (FRAUD) LOGIN (XYZ Trading)')
let sellerFraudToken
{
  const r = await j('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'login', type: 'seller', email: 'sales@xyztrading.in', password: 'seller123' })
  })
  assert('Seller (fraud) login returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.data)}`)
  assert('Seller (fraud) login returns token', !!r.data?.token, 'no token')
  sellerFraudToken = r.data?.token
}

// ── 6. SESSION / ME ENDPOINT ─────────────────────
console.log('\n[6] SESSION — /api/me')
{
  const r1 = await j('/api/me', { headers: auth(officerToken) })
  assert('Officer /api/me returns 200', r1.status === 200, `got ${r1.status}`)
  assert('Officer /api/me returns OFFICER role', r1.data?.user?.role === 'OFFICER', JSON.stringify(r1.data?.user))

  const r2 = await j('/api/me', { headers: auth(sellerCleanToken) })
  assert('Seller /api/me returns 200', r2.status === 200, `got ${r2.status}`)
  assert('Seller /api/me returns SELLER role', r2.data?.user?.role === 'SELLER', JSON.stringify(r2.data?.user))

  const r3 = await j('/api/me')
  assert('No token returns 401', r3.status === 401, `got ${r3.status}`)

  const r4 = await j('/api/me', { headers: { Authorization: 'Bearer invalid-token' } })
  assert('Invalid token returns 401', r4.status === 401, `got ${r4.status}`)
}

// ── 7. OFFICER DASHBOARD ────────────────────────
console.log('\n[7] OFFICER DASHBOARD')
{
  const r = await j('/api/data?resource=dashboard', { headers: auth(officerToken) })
  assert('Officer dashboard returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.data).slice(0,200)}`)
  assert('Dashboard has stats', Array.isArray(r.data?.stats), JSON.stringify(Object.keys(r.data || {})))
}

// ── 8. OFFICER — CREATE TENDER ──────────────────
console.log('\n[8] OFFICER — CREATE TENDER')
let newTenderId
{
  const r = await j('/api/action', {
    method: 'POST',
    headers: auth(officerToken),
    body: JSON.stringify({
      action: 'createTender',
      title: 'E2E Test Tender — Secure Systems',
      type: 'open',
      category: 'ICT',
      valueCr: 5,
      submissionMinutes: 60,
      bidValidityDays: 30,
      msePreference: false,
      eligibility: [{ key: 'minTurnoverCr', label: 'Min turnover', value: 2 }],
      technical: [{ key: 'ram', label: 'RAM', expected: '16 GB DDR4' }],
      requiredDocs: [
        { name: 'gstin', description: 'GST certificate', classification: 'MANDATORY', allowedTypes: ['text/plain'], maxSizeMb: 5 },
        { name: 'pan', description: 'PAN card', classification: 'MANDATORY', allowedTypes: ['text/plain'], maxSizeMb: 5 },
      ],
    }),
  })
  assert('Create tender returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.data).slice(0,300)}`)
  newTenderId = r.data?.result?.tenderId
  assert('Create tender returns tenderId', !!newTenderId, JSON.stringify(r.data))
  console.log(`    Tender ID: ${newTenderId}`)
}

// ── 9. OFFICER CANNOT PERFORM SELLER ACTIONS ────
console.log('\n[9] OFFICER CANNOT PERFORM SELLER ACTIONS')
{
  const r = await j('/api/action', {
    method: 'POST',
    headers: auth(officerToken),
    body: JSON.stringify({ action: 'startBid', tenderId: newTenderId }),
  })
  assert('Officer cannot startBid (403)', r.status === 403, `got ${r.status}`)
}

// ── 10. SELLER (CLEAN) — VIEW TENDER ───────────
console.log('\n[10] SELLER (CLEAN) — VIEW TENDER')
{
  const r = await j(`/api/data?resource=tender-v2&tenderId=${encodeURIComponent(newTenderId)}`, { headers: auth(sellerCleanToken) })
  assert('Seller can view tender-v2', r.status === 200, `got ${r.status}: ${JSON.stringify(r.data).slice(0,200)}`)
  assert('Tender title matches', r.data?.title === 'E2E Test Tender — Secure Systems', `got "${r.data?.title}"`)
  assert('Tender stage is PUBLISHED', r.data?.stage === 'PUBLISHED', `got ${r.data?.stage}`)
  assert('Required docs returned', Array.isArray(r.data?.requiredDocs), JSON.stringify(Object.keys(r.data || {})))
}

// ── 11. SELLER (CLEAN) — START BID ──────────────
console.log('\n[11] SELLER (CLEAN) — START BID / DRAFT')
let submissionId
{
  const r = await j('/api/action', {
    method: 'POST',
    headers: auth(sellerCleanToken),
    body: JSON.stringify({ action: 'startBid', tenderId: newTenderId }),
  })
  assert('Start bid returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.data)}`)
  submissionId = r.data?.result?.submissionId
  assert('Submission ID returned', !!submissionId, JSON.stringify(r.data))
  console.log(`    Submission ID: ${submissionId}`)
}

// ── 12. SELLER (CLEAN) — UPLOAD DOCUMENTS ───────
console.log('\n[12] SELLER (CLEAN) — UPLOAD DOCUMENTS')
{
  const fs = await import('node:fs')
  const path = await import('node:path')
  const seedDir = '.data/uploads/seed/com-nexora'

  for (const docName of ['gstin', 'pan']) {
    const filePath = path.join(process.cwd(), seedDir, `${docName}.txt`)
    if (!fs.existsSync(filePath)) {
      console.log(`    ⚠ Seed file not found: ${filePath}`)
      continue
    }
    const bytes = fs.readFileSync(filePath)
    const form = new FormData()
    form.append('submissionId', submissionId)
    form.append('docName', docName)
    form.append('file', new Blob([bytes], { type: 'text/plain' }), `${docName}.txt`)
    const res = await fetch(`${BASE}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${sellerCleanToken}` }, body: form })
    const data = await res.json()
    assert(`Upload ${docName} returns 200`, res.status === 200, `got ${res.status}: ${JSON.stringify(data).slice(0,200)}`)
    assert(`${docName} extraction status is DONE`, data?.extraction?.status === 'DONE', `got ${data?.extraction?.status}`)
    console.log(`    ${docName}: confidence=${data?.extraction?.confidence} fields=${JSON.stringify(data?.extraction?.fields)}`)
    if (data.checks) {
      for (const c of data.checks) {
        console.log(`      PRELIM ${c.checkId} -> ${c.status} ${c.mock ? '[MOCK]' : ''}`)
      }
    }
  }
}

// ── 13. SELLER (CLEAN) — SUBMIT BID ─────────────
console.log('\n[13] SELLER (CLEAN) — SUBMIT BID')
{
  const r = await j('/api/action', {
    method: 'POST',
    headers: auth(sellerCleanToken),
    body: JSON.stringify({
      action: 'submitTender',
      tenderId: newTenderId,
      financialBidCr: 4.5,
      technicalResponse: { ram: '16 GB DDR4' },
      eligibilitySnapshot: [],
    }),
  })
  assert('Submit bid returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.data)}`)
  assert('Submission matches startBid id', r.data?.result?.submissionId === submissionId, `got ${r.data?.result?.submissionId} vs ${submissionId}`)
}

// ── 14. SELLER (CLEAN) — RE-SUBMIT SAME TENDER ─
console.log('\n[14] SELLER (CLEAN) — RE-SUBMIT SAME TENDER')
{
  const r = await j('/api/action', {
    method: 'POST',
    headers: auth(sellerCleanToken),
    body: JSON.stringify({
      action: 'submitTender',
      tenderId: newTenderId,
      financialBidCr: 4.0,
      technicalResponse: { ram: '16 GB DDR4' },
      eligibilitySnapshot: [],
    }),
  })
  assert('Re-submit returns 200 or 4xx', r.status === 200 || (r.status >= 400 && r.status < 500), `got ${r.status}`)
}

// ── 15. SELLER (FRAUD) — VIEW & BID ────────────
console.log('\n[15] SELLER (FRAUD) — VIEW TENDER & START BID')
let fraudSubmissionId
{
  const r = await j(`/api/data?resource=tender-v2&tenderId=${encodeURIComponent(newTenderId)}`, { headers: auth(sellerFraudToken) })
  assert('Fraud seller can view tender', r.status === 200, `got ${r.status}`)

  const r2 = await j('/api/action', {
    method: 'POST',
    headers: auth(sellerFraudToken),
    body: JSON.stringify({ action: 'startBid', tenderId: newTenderId }),
  })
  assert('Fraud seller can start bid', r2.status === 200, `got ${r2.status}: ${JSON.stringify(r2.data)}`)
  fraudSubmissionId = r2.data?.result?.submissionId
  assert('Fraud submission ID returned', !!fraudSubmissionId, JSON.stringify(r2.data))
}

// ── 16. SELLER (FRAUD) — UPLOAD DOCUMENTS ───────
console.log('\n[16] SELLER (FRAUD) — UPLOAD DOCUMENTS')
{
  const fs = await import('node:fs')
  const path = await import('node:path')
  const seedDir = '.data/uploads/seed/com-xyz'

  for (const docName of ['gstin', 'pan']) {
    const filePath = path.join(process.cwd(), seedDir, `${docName}.txt`)
    if (!fs.existsSync(filePath)) {
      console.log(`    ⚠ Seed file not found: ${filePath}`)
      continue
    }
    const bytes = fs.readFileSync(filePath)
    const form = new FormData()
    form.append('submissionId', fraudSubmissionId)
    form.append('docName', docName)
    form.append('file', new Blob([bytes], { type: 'text/plain' }), `${docName}.txt`)
    const res = await fetch(`${BASE}/api/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${sellerFraudToken}` }, body: form })
    const data = await res.json()
    assert(`Fraud upload ${docName} returns 200`, res.status === 200, `got ${res.status}: ${JSON.stringify(data).slice(0,300)}`)
    assert(`Fraud ${docName} extraction completes`, ['DONE', 'FAILED'].includes(data?.extraction?.status), `got ${data?.extraction?.status}`)
    if (data.checks) {
      const nonComp = data.checks.filter(c => c.status === 'NON_COMPLIANT')
      console.log(`    ${docName}: extraction=${data?.extraction?.status}, non_compliant_checks=${nonComp.length}`)
      for (const c of data.checks) {
        const icon = c.status === 'NON_COMPLIANT' ? '✗' : c.status === 'VERIFIED' ? '✓' : '…'
        console.log(`      ${icon} ${c.checkId} -> ${c.status} ${c.mock ? '[MOCK GOV DB]' : ''} — ${c.note}`)
      }
    }
  }
}

// ── 17. SELLER (FRAUD) — SUBMIT BID ─────────────
console.log('\n[17] SELLER (FRAUD) — SUBMIT BID')
{
  const r = await j('/api/action', {
    method: 'POST',
    headers: auth(sellerFraudToken),
    body: JSON.stringify({
      action: 'submitTender',
      tenderId: newTenderId,
      financialBidCr: 4.2,
      technicalResponse: { ram: '16 GB DDR4' },
      eligibilitySnapshot: [],
    }),
  })
  assert('Fraud seller submits bid', r.status === 200, `got ${r.status}: ${JSON.stringify(r.data)}`)
}

// ── 18. MARKETPLACE (SELLER VIEW) ───────────────
console.log('\n[18] SELLER (CLEAN) — MARKETPLACE')
{
  const r = await j('/api/data?resource=marketplace', { headers: auth(sellerCleanToken) })
  assert('Marketplace returns 200', r.status === 200, `got ${r.status}`)
  assert('Marketplace has tenders array', Array.isArray(r.data), `got ${typeof r.data}: ${JSON.stringify(r.data).slice(0,200)}`)
  if (Array.isArray(r.data)) {
    const found = r.data.find(t => t.id === newTenderId)
    assert('New tender visible in marketplace', !!found, `looking for ${newTenderId} in ${r.data.length} tenders`)
  }
}

// ── 19. OFFICER — WORKFLOW TENDERS LIST ──────────
console.log('\n[19] OFFICER — WORKFLOW TENDERS LIST')
{
  const r = await j('/api/data?resource=workflow-tenders', { headers: auth(officerToken) })
  assert('Workflow tenders returns 200', r.status === 200, `got ${r.status}`)
  if (Array.isArray(r.data)) {
    const found = r.data.find(t => t.id === newTenderId)
    assert('New tender in workflow list', !!found, `looking for ${newTenderId} in ${r.data.length} tenders`)
  }
}

// ── 20. LEGACY TENDERS LIST ─────────────────────
console.log('\n[20] LEGACY TENDERS LIST')
{
  const r = await j('/api/data?resource=tenders', { headers: auth(officerToken) })
  assert('Legacy tenders returns 200', r.status === 200, `got ${r.status}`)
  assert('Legacy tenders has tenders array', !!r.data?.tenders, JSON.stringify(Object.keys(r.data || {})))
}

// ── 21. SELLER DASHBOARD ────────────────────────
console.log('\n[21] SELLER (CLEAN) DASHBOARD')
{
  const r = await j('/api/data?resource=dashboard', { headers: auth(sellerCleanToken) })
  assert('Seller dashboard returns 200', r.status === 200, `got ${r.status}`)
  assert('Dashboard has stats', Array.isArray(r.data?.stats), JSON.stringify(Object.keys(r.data || {})))
}

// ── 22. MY SUBMISSIONS ──────────────────────────
console.log('\n[22] SELLER (CLEAN) — MY SUBMISSIONS')
{
  const r = await j('/api/data?resource=submissions', { headers: auth(sellerCleanToken) })
  assert('My submissions returns 200', r.status === 200, `got ${r.status}`)
  assert('My submissions is array', Array.isArray(r.data), `got ${typeof r.data}`)
  if (Array.isArray(r.data)) {
    const found = r.data.find(s => s.tenderId === newTenderId)
    assert('New submission visible', !!found, `looking for tender ${newTenderId} in ${r.data.length} submissions`)
  }
}

// ── 23. AUDIT TRAIL ─────────────────────────────
console.log('\n[23] OFFICER — AUDIT TRAIL')
{
  const r = await j('/api/data?resource=audit', { headers: auth(officerToken) })
  assert('Audit returns 200', r.status === 200, `got ${r.status}`)
  assert('Audit has entries', Array.isArray(r.data?.entries), JSON.stringify(Object.keys(r.data || {})))
  assert('Audit chain valid', r.data?.chainValid === true, `chainValid=${r.data?.chainValid}: ${r.data?.chainMessage}`)
  if (Array.isArray(r.data?.entries)) {
    const actions = r.data.entries.map(e => e.action)
    assert('Audit contains TENDER_CREATED', actions.includes('TENDER_CREATED'), `actions: ${actions.join(', ')}`)
    assert('Audit contains DOC_UPLOADED', actions.includes('DOC_UPLOADED'), 'missing DOC_UPLOADED')
  }
}

// ── 24. CROSS-ROLE ISOLATION ────────────────────
console.log('\n[24] CROSS-ROLE ISOLATION')
{
  const r2 = await j('/api/action', {
    method: 'POST',
    headers: auth(sellerCleanToken),
    body: JSON.stringify({ action: 'createTender', title: 'Unauthorized Tender', type: 'open' }),
  })
  assert('Seller cannot create tender (403)', r2.status === 403, `got ${r2.status}`)
}

// ── 25. API ERROR HANDLING ──────────────────────
console.log('\n[25] API ERROR HANDLING')
{
  const r1 = await j('/api/action', {
    method: 'POST',
    headers: auth(officerToken),
    body: JSON.stringify({ action: 'nonexistentAction' }),
  })
  assert('Unknown action returns 400', r1.status === 400, `got ${r1.status}`)

  const r2 = await j('/api/data?resource=invalidResource', { headers: auth(officerToken) })
  assert('Invalid resource returns 400', r2.status === 400, `got ${r2.status}`)

  const r3 = await j('/api/data?resource=tender-v2', { headers: auth(officerToken) })
  assert('Missing tenderId returns 400', r3.status === 400, `got ${r3.status}`)
}

// ── 26. CLARIFICATIONS ENDPOINT ─────────────────
console.log('\n[26] SELLER (CLEAN) — CLARIFICATIONS')
{
  const r = await j('/api/data?resource=clarifications', { headers: auth(sellerCleanToken) })
  assert('Clarifications endpoint returns 200', r.status === 200, `got ${r.status}`)
}

// ── 27. CLARIFICATION WORKFLOW ──────────────────
console.log('\n[27] OFFICER — ASK CLARIFICATION')
{
  const subR = await j('/api/data?resource=submissions', { headers: auth(sellerCleanToken) })
  const sub = Array.isArray(subR.data) ? subR.data.find(s => s.tenderId === newTenderId) : null
  if (sub) {
    const r = await j('/api/action', {
      method: 'POST',
      headers: auth(officerToken),
      body: JSON.stringify({
        action: 'askClarification',
        submissionId: sub.id,
        question: 'Please clarify your technical approach.',
      }),
    })
    assert('Ask clarification returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.data)}`)

    if (r.data?.result?.clarificationId) {
      const r2 = await j('/api/action', {
        method: 'POST',
        headers: auth(sellerCleanToken),
        body: JSON.stringify({
          action: 'respondClarification',
          clarificationId: r.data.result.clarificationId,
          response: 'We will use enterprise-grade solutions.',
        }),
      })
      assert('Respond clarification returns 200', r2.status === 200, `got ${r2.status}: ${JSON.stringify(r2.data)}`)
    }
  } else {
    console.log('    ⚠ No submission found to ask clarification on')
  }
}

// ── 28. OFFICER — CANCEL TENDER ─────────────────
console.log('\n[28] OFFICER — CANCEL TENDER')
{
  const ct = await j('/api/action', {
    method: 'POST',
    headers: auth(officerToken),
    body: JSON.stringify({
      action: 'createTender',
      title: 'Tender to be cancelled',
      type: 'open',
      valueCr: 1,
      submissionMinutes: 60,
      requiredDocs: [],
    }),
  })
  if (ct.data?.result?.tenderId) {
    const cancelId = ct.data.result.tenderId
    const r = await j('/api/action', {
      method: 'POST',
      headers: auth(officerToken),
      body: JSON.stringify({ action: 'cancelTender', tenderId: cancelId }),
    })
    assert('Cancel tender returns 200', r.status === 200, `got ${r.status}: ${JSON.stringify(r.data)}`)

    const detail = await j(`/api/data?resource=tender-v2&tenderId=${encodeURIComponent(cancelId)}`, { headers: auth(officerToken) })
    assert('Cancelled tender stage is CANCELLED', detail.data?.stage === 'CANCELLED', `got ${detail.data?.stage}`)
  } else {
    console.log('    ⚠ Could not create tender to cancel')
  }
}

// ── 29. EXISTING LEGACY TENDERS ─────────────────
console.log('\n[29] EXISTING LEGACY TENDERS (pre-seeded)')
{
  const r = await j('/api/data?resource=tenders', { headers: auth(officerToken) })
  if (r.data?.tenders) {
    assert('Has legacy tenders', r.data.tenders.length >= 6, `got ${r.data.tenders.length}`)
    for (const id of ['GOV/ICT/2026/041', 'PWD/INFRA/2026/019', 'EDU/TECH/2026/008']) {
      assert(`Legacy tender ${id} exists`, r.data.tenders.some(t => t.id === id), 'not found')
    }
  }
}

// ── 30. COMPANIES ENDPOINT ──────────────────────
console.log('\n[30] COMPANIES ENDPOINT')
{
  const r = await j('/api/data?resource=companies', { headers: auth(officerToken) })
  assert('Companies endpoint returns 200', r.status === 200, `got ${r.status}`)
  if (Array.isArray(r.data)) {
    assert('Nexora Systems in companies', r.data.some(c => c.name?.includes('Nexora')), `found ${r.data.length} companies`)
  }
}

// ══════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════')
console.log(`  RESULTS: ${pass} passed, ${fail} failed`)
console.log('═══════════════════════════════════════════════')
if (failures.length) {
  console.log('\n  FAILURES:')
  for (const f of failures) console.log(`    ✗ ${f.name}: ${f.detail}`)
}
console.log('')
process.exit(fail > 0 ? 1 : 0)
