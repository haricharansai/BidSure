// Auto-extension integration test: bid placed in the closing window must
// extend the auction end (+60s, max 3).
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const base = 'http://localhost:3000'

async function post(path, body, token) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || res.status)
  return json
}

async function main() {
  const ot = (await post('/api/auth', { mode: 'login', type: 'officer', email: 'arun.mehta@digitransform.gov.in', password: 'officer123' })).token
  const nxt = (await post('/api/auth', { mode: 'login', type: 'seller', email: 'contact@nexorasystems.com', password: 'seller123' })).token
  const abc = (await post('/api/auth', { mode: 'login', type: 'seller', email: 'contact@abctech.in', password: 'seller123' })).token

  const t = await post('/api/action', {
    action: 'createTender', title: 'Auto-ext test', type: 'e-reverse-auction', valueCr: 1,
    submissionMinutes: 1, bidValidityDays: 30, emdRequired: true, msePreference: false,
    eligibility: [], technical: [],
  }, ot)
  const tid = t.result.tenderId
  console.log('created', tid)

  const docs = [
    { docName: 'pan', provided: true, fileName: 'p.pdf', extracted: { number: 'AAECN1234E' } },
    { docName: 'gstin', provided: true, fileName: 'g.pdf', extracted: { number: '07AAECN1234E1ZP' } },
    { docName: 'turnover', provided: true, fileName: 't.pdf', extracted: { udin: '261234567890123456', certDate: new Date().toISOString().slice(0, 10) } },
    { docName: 'audited', provided: true, fileName: 'a.pdf' },
    { docName: 'board', provided: true, fileName: 'b.pdf' },
    { docName: 'emd', provided: true, fileName: 'e.pdf', extracted: { validTill: '2030-06-01', claimPeriodDays: 60 } },
    { docName: 'udyam', provided: true, fileName: 'u.pdf', extracted: { number: 'UDYAM-07-00-0012345', nicCode: '26' } },
    { docName: 'mii', provided: true, fileName: 'm.pdf' },
  ]
  await post('/api/action', { action: 'submitTender', tenderId: tid, financialBidCr: 0.95, technicalResponse: {}, docs }, nxt)
  await post('/api/action', { action: 'submitTender', tenderId: tid, financialBidCr: 0.98, technicalResponse: {}, docs }, abc)
  console.log('submitted x2')

  // Test-only shortcut: force the deadline 2s away so tick() locks immediately
  // (the lifecycle is deadline-driven; tests drive the clock instead of waiting).
  await prisma.tender.update({ where: { id: tid }, data: { submissionDeadline: new Date(Date.now() + 2 * 1000) } })

  // Poll for evaluation rows (1s granularity; any API call triggers tick())
  let ev
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000))
    ev = await fetch(`${base}/api/data?resource=evaluation-v2&tenderId=${tid}`, { headers: { Authorization: 'Bearer ' + ot } }).then(r => r.json())
    if (ev.rows.length) break
  }
  for (const row of ev.rows.filter(r => r.status === 'requires_review')) {
    await post('/api/action', { action: 'officerDecision', evaluationId: row.id, decision: 'approve', note: 'ok' }, ot)
  }
  await new Promise(r => setTimeout(r, 500))
  let tender = await prisma.tender.findUnique({ where: { id: tid } })
  console.log('stage after approvals:', tender.stage)
  if (tender.stage !== 'AUCTION_ACTIVE') throw new Error('auction did not open: ' + tender.stage)

  // Force the auction into its closing window via DB (test-only shortcut)
  const forcedEnd = new Date(Date.now() + 8 * 1000)
  await prisma.tender.update({
    where: { id: tid },
    data: { auctionStart: new Date(Date.now() - 1000), auctionEnd: forcedEnd },
  })
  console.log('forced auction into closing window')

  const bid = await post('/api/action', { action: 'placeBid', tenderId: tid, amountCr: 0.9 }, nxt)
  console.log('bid placed, extended =', bid.result.extended)
  tender = await prisma.tender.findUnique({ where: { id: tid } })
  console.log('extensions used:', tender.auctionExtensions, 'new end:', tender.auctionEnd.toISOString())

  const ok = bid.result.extended === true && tender.auctionExtensions === 1 && tender.auctionEnd.getTime() > forcedEnd.getTime() + 30 * 1000
  console.log(ok ? 'AUTO-EXTENSION TEST PASSED' : 'AUTO-EXTENSION TEST FAILED')
  process.exit(ok ? 0 : 1)
}
main().catch(e => { console.error('FAILED:', e.message); process.exit(1) }).finally(() => prisma.$disconnect())