// E2E fraud demo: XYZ seller uploads its seeded GST/PAN docs whose registry
// rows are CANCELLED with a legal-name mismatch. Expect: GSTN MISMATCH +
// CANCELLED -> doc NON_COMPLIANT -> submission disqualified / HIGH risk.
const BASE = 'http://localhost:3000'

async function j(url, opts = {}) {
  const res = await fetch(BASE + url, opts)
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${res.status} ${url}: ${JSON.stringify(data)}`)
  return data
}
function auth(token) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }

async function login(type, email, password, extra = {}) {
  const r = await j('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'login', type, email, password, ...extra }) })
  return r.token
}

async function upload(token, submissionId, docName, filePath, mime) {
  const { readFileSync } = await import('node:fs')
  const bytes = readFileSync(filePath)
  const fileName = filePath.split(/[\\/]/).pop()
  const form = new FormData()
  form.append('submissionId', submissionId)
  form.append('docName', docName)
  form.append('file', new Blob([bytes], { type: mime }), fileName)
  const res = await fetch(BASE + '/api/documents/upload', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  const data = await res.json()
  if (!res.ok) throw new Error(`upload ${res.status}: ${JSON.stringify(data)}`)
  return data
}

const officerToken = await login('officer', 'arun.mehta@digitransform.gov.in', 'officer123', { employeeId: 'EMP-2024-00142' })
const sellerToken = await login('seller', 'sales@xyztrading.in', 'seller123')
console.log('FRAUD-1 login OK')

const ct = await j('/api/action', { method: 'POST', headers: auth(officerToken), body: JSON.stringify({
  action: 'createTender', title: 'E2E Fraud Detection Tender', type: 'open', category: 'TEST', valueCr: 1,
  submissionMinutes: 1, bidValidityDays: 30, msePreference: false,
  eligibility: [{ key: 'minTurnoverCr', label: 'Min turnover', value: 1 }],
  technical: [{ key: 'ram', label: 'RAM', expected: '16 GB DDR4' }],
  requiredDocs: [
    { name: 'pan', description: 'Permanent Account Number card', classification: 'MANDATORY', allowedTypes: ['text/plain'], maxSizeMb: 5 },
    { name: 'gstin', description: 'GST registration certificate', classification: 'MANDATORY', allowedTypes: ['text/plain'], maxSizeMb: 5 },
  ],
}) })
const tenderId = ct.result.tenderId
console.log('FRAUD-2 tender created:', tenderId)

const sb = await j('/api/action', { method: 'POST', headers: auth(sellerToken), body: JSON.stringify({ action: 'startBid', tenderId }) })
const sid = sb.result.submissionId
console.log('FRAUD-3 draft started:', sid)

const seedDir = '.data/uploads/seed/com-xyz'
const up1 = await upload(sellerToken, sid, 'gstin', `${seedDir}/gstin.txt`, 'text/plain')
console.log('FRAUD-4 GST upload:', up1.fileId, 'extraction:', up1.extraction.status, 'fields:', JSON.stringify(up1.extraction.fields))
for (const c of up1.checks) console.log(`   PRELIM ${c.checkId} -> ${c.status}${c.mock ? ' [MOCK]' : ''} — ${c.note}`)
const up2 = await upload(sellerToken, sid, 'pan', `${seedDir}/pan.txt`, 'text/plain')
console.log('FRAUD-5 PAN upload extraction:', up2.extraction.status, JSON.stringify(up2.extraction.fields))
for (const c of up2.checks) console.log(`   PRELIM ${c.checkId} -> ${c.status}${c.mock ? ' [MOCK]' : ''} — ${c.note}`)

const fin = await j('/api/action', { method: 'POST', headers: auth(sellerToken), body: JSON.stringify({ action: 'submitTender', tenderId, financialBidCr: 1.85, technicalResponse: { ram: '16 GB DDR4' }, eligibilitySnapshot: [] }) })
console.log('FRAUD-6 finalized:', fin.result.submissionId === sid ? 'OK' : JSON.stringify(fin))

console.log('FRAUD-7 waiting for deadline lock (70s)...')
await new Promise(r => setTimeout(r, 70000))
const evalDetail = await j(`/api/data?resource=evaluation-v2&tenderId=${encodeURIComponent(tenderId)}&companyId=com-xyz`, { headers: auth(officerToken) })
console.log('FRAUD-8 evaluation:', evalDetail.stage, 'rows:', JSON.stringify(evalDetail.rows.map(r => ({ company: r.companyName, status: r.status, risk: r.risk, compliance: r.compliancePct }))))
const dd = evalDetail.drillDown
if (dd) {
  for (const doc of dd.docs) {
    console.log(`FRAUD-9 doc ${doc.docName}: status=${doc.status} file=${doc.fileName ?? '—'}`)
    for (const c of (doc.checks ?? [])) console.log(`   ${c.status === 'NON_COMPLIANT' ? '✗' : c.status === 'VERIFIED' ? '✓' : '…'} ${c.checkId} -> ${c.status}${c.mock ? ' [MOCK GOVERNMENT DATABASE]' : ''} — ${c.note}`)
    if (doc.extracted) console.log('   extracted:', JSON.stringify(doc.extracted))
  }
}
const audit = await j('/api/data?resource=audit', { headers: auth(officerToken) })
console.log('FRAUD-9 audit chain:', audit.chainValid ? 'VALID' : `BROKEN: ${audit.chainMessage}`)
console.log('FRAUD COMPLETE')
