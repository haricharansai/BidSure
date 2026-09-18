'use client'

import { Check, ChevronRight, FileCheck2, FileText, RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import { ApiError, apiFetch } from '@/lib/api'
import { DEFAULT_DOC_TEMPLATES, TENDER_TYPE_CONFIG } from '@/lib/tender-config'
import type { View, NavigateOptions } from '@/components/types'
import { useApi } from '@/components/hooks'
import { ErrorPanel, LoadingPanel, Field, Alert } from '@/components/ui'
import { PageFrame } from '@/components/layout'
import { StageBadge } from '@/components/ui'
import type { OfficerTenderRow } from '@/lib/types'

// ---------------------------------------------------------------------------
// Workflow tenders list
// ---------------------------------------------------------------------------

export function WorkflowTenders({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
  const { data, error, retry } = useApi<{ tenders: OfficerTenderRow[] }>('/api/data?resource=workflow-tenders')
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const rows = data.tenders
  return <PageFrame title="GeM workflow tenders" subtitle="Multi-seller procurement workflow with deterministic compliance evaluation." actions={<button className="primary" onClick={() => navigate('w-create')}><FileText size={16} /> New tender</button>}>
    {rows.length === 0
      ? <section className="panel"><div className="empty-evidence" style={{ height: 220 }}><FileSearch size={28} /><b>No workflow tenders yet</b><small>Create a tender to start the GeM workflow.</small><button className="primary" style={{ marginTop: 12 }} onClick={() => navigate('w-create')}>Create the first tender</button></div></section>
      : <section className="panel"><div className="table-caption"><b>{rows.length} tenders</b><span>Deadline lock, evaluation and auctions run server-side (tick)</span></div>
        <div className="table-wrap"><table><thead><tr><th>Tender</th><th>Type</th><th>Stage</th><th>Deadline</th><th>Bids</th><th>Qualified</th><th>Review</th><th>L1</th><th /></tr></thead><tbody>
          {rows.map(t => <tr key={t.id} onClick={() => navigate(['EVALUATED', 'AUCTION_CLOSED', 'AWARDED', 'AUCTION_FAILED', 'EVALUATION_FAILED'].includes(t.stage) ? 'w-eval' : 'w-tender', { tenderId: t.id })}>
            <td><b className="linkish">{t.title}</b><small>{t.id}</small></td>
            <td>{t.typeLabel}</td>
            <td><StageBadge stage={t.stage} /></td>
            <td>{new Date(t.submissionDeadlineISO).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
            <td>{t.submissions}</td>
            <td>{t.qualified}</td>
            <td>{t.requiresReview > 0 ? <span className="risk risk-medium">{t.requiresReview}</span> : 0}</td>
            <td>{t.lowestCr != null ? `₹${t.lowestCr} Cr` : '—'}</td>
            <td><ChevronRight size={17} /></td>
          </tr>)}
        </tbody></table></div>
      </section>}
  </PageFrame>
}

// Helper: FileSearch icon for empty state
import { FileSearch } from 'lucide-react'

// ---------------------------------------------------------------------------
// Create tender form (multi-step)
// ---------------------------------------------------------------------------

interface DocBuilderRow {
  name: string; description: string; classification: 'MANDATORY' | 'CONDITIONAL' | 'SUPPORTING'
  conditionKey: string | null; allowedTypes: string[]; maxSizeMb: number; isCustom: boolean
}

const ALL_FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain']

function catalogueDoc(name: string): DocBuilderRow {
  const tpl = DEFAULT_DOC_TEMPLATES.find(d => d.name === name)
  return { name, description: tpl?.description ?? name, classification: (tpl?.classification ?? 'SUPPORTING') as DocBuilderRow['classification'], conditionKey: tpl?.conditionKey ?? null, allowedTypes: ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'], maxSizeMb: 5, isCustom: false }
}

function defaultCondition(name: string): string | null {
  return DEFAULT_DOC_TEMPLATES.find(d => d.name === name)?.conditionKey ?? null
}

export function CreateTender({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
  const [type, setType] = useState('e-reverse-auction')
  const [emdOn, setEmdOn] = useState(true)
  const [valueCr, setValueCr] = useState('2')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [step, setStep] = useState(1)
  const formRef = useRef<HTMLFormElement | null>(null)
  const STEP_LABELS = ['Details', 'Deadlines', 'Eligibility', 'Documents', 'Review']
  const emdBlocked = Number(valueCr) <= 0.05
  const [docs, setDocs] = useState<DocBuilderRow[]>(() =>
    DEFAULT_DOC_TEMPLATES.map(d => ({ name: d.name, description: d.description, classification: d.classification as DocBuilderRow['classification'], conditionKey: d.conditionKey ?? null, allowedTypes: ['application/pdf', 'image/png', 'image/jpeg', 'text/plain'], maxSizeMb: 5, isCustom: false })).filter(d => ['pan', 'gstin', 'turnover', 'audited', 'board', 'emd', 'udyam', 'iso'].includes(d.name))
  )

  const toggleDoc = (name: string) => setDocs(ds => ds.some(d => d.name === name) ? ds.filter(d => d.name !== name) : [...ds, catalogueDoc(name)])
  const patchDoc = (name: string, patch: Partial<DocBuilderRow>) => setDocs(ds => ds.map(d => d.name === name ? { ...d, ...patch } : d))
  const addCustom = () => { const n = `custom_${docs.filter(d => d.isCustom).length + 1}_${Date.now().toString(36).slice(-4)}`; setDocs(ds => [...ds, { name: n, description: 'Custom document', classification: 'SUPPORTING', conditionKey: null, allowedTypes: ['application/pdf'], maxSizeMb: 5, isCustom: true }]) }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null); setBusy(true)
    const f = new FormData(e.currentTarget)
    const fail = (message: string, stepTo: number) => { setError(message); setStep(stepTo); setBusy(false) }
    if (!String(f.get('title') || '').trim()) return fail('Tender title is required (Details, step 1)', 1)
    if (!String(f.get('agency') || '').trim()) return fail('Agency is required (Details, step 1)', 1)
    if (!Number(valueCr) || Number(valueCr) <= 0) return fail('Estimated value (₹ Cr) is required (Details, step 1)', 1)
    if (!Number(f.get('submissionMinutes')) || Number(f.get('submissionMinutes')) < 1) return fail('Submission window is required (Deadlines, step 2)', 2)
    const eligibility: { key: string; label: string; value: number }[] = []
    const turnover = String(f.get('minTurnoverCr') || '')
    const experience = String(f.get('minYearsExperience') || '')
    if (turnover) eligibility.push({ key: 'minTurnoverCr', label: 'Average annual turnover (last 3 years)', value: Number(turnover) })
    if (experience) eligibility.push({ key: 'minYearsExperience', label: 'Years in similar business', value: Number(experience) })
    if (f.get('netWorthPositive')) eligibility.push({ key: 'netWorthPositive', label: 'Positive net worth', value: 1 })
    const mii = String(f.get('miiMinLocalContentPct') || '')
    if (mii) eligibility.push({ key: 'miiMinLocalContentPct', label: 'Class-I local content (Make in India)', value: Number(mii) })
    const technical: { key: string; label: string; expected: string }[] = []
    for (let i = 1; i <= 3; i++) { const label = String(f.get(`techLabel${i}`) || '').trim(); const expected = String(f.get(`techExpected${i}`) || '').trim(); if (label && expected) technical.push({ key: `spec${i}`, label, expected }) }
    try {
      const res = await apiFetch<{ tenderId: string }>('/api/action', { method: 'POST', body: { action: 'createTender', title: String(f.get('title') || ''), agency: String(f.get('agency') || ''), type, category: String(f.get('category') || ''), product: String(f.get('product') || ''), quantity: String(f.get('quantity') || ''), unit: String(f.get('unit') || ''), location: String(f.get('location') || ''), valueCr: Number(valueCr) || 1, submissionMinutes: Number(f.get('submissionMinutes') || 5), bidValidityDays: Number(f.get('bidValidityDays') || 30), emdRequired: emdOn && !emdBlocked, emdAmountCr: emdOn && !emdBlocked ? Number(f.get('emdAmountCr') || 0) || undefined : undefined, msePreference: !!f.get('msePreference'), miiMinLocalContentPct: mii ? Number(mii) : undefined, albThresholdPct: Number(f.get('albThresholdPct') || 25), eligibility, technical, requiredDocs: docs.map(d => ({ name: d.name, description: d.description, classification: d.classification, conditionKey: d.conditionKey, allowedTypes: d.allowedTypes, maxSizeMb: d.maxSizeMb, isCustom: d.isCustom })) } })
      setDone(res.tenderId)
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not create the tender') } finally { setBusy(false) }
  }

  if (done) {
    return <PageFrame title="Tender published" subtitle="The tender is live on the GeM workflow." actions={null}>
      <section className="panel"><div className="empty-evidence" style={{ height: 200 }}><Check size={30} /><b>{done}</b><small>Sellers can now discover it in the marketplace and submit structured claims.</small></div>
        <div className="button-row" style={{ justifyContent: 'center', marginTop: 12 }}><button className="secondary" onClick={() => navigate('tenders')}>View all tenders</button><button className="primary" onClick={() => navigate('w-tender', { tenderId: done })}>Open tender <ChevronRight size={15} /></button></div>
      </section>
    </PageFrame>
  }

  const nextStep = () => { if (formRef.current && !formRef.current.reportValidity()) return; setStep(s => Math.min(4, s + 1)) }
  const prevStep = () => setStep(s => Math.max(1, s - 1))

  return <PageFrame title="Create tender" subtitle="GeM-portal-verified rules are enforced: EMD only above ₹5 L, bid validity 15–180 days." actions={null}>
    {error && <Alert variant="danger">{error}</Alert>}
    <div className="step-progress">{STEP_LABELS.map((label, i) => (<div key={label} className={`step-item ${step > i + 1 ? 'completed' : step === i + 1 ? 'active' : ''}`}><div className="step-circle">{step > i + 1 ? <Check size={14} /> : i + 1}</div><span className="step-label">{label}</span></div>))}<div className="step-track"><div className="step-fill" style={{ width: `${((step - 1) / (STEP_LABELS.length - 1)) * 100}%` }} /></div></div>
    <form ref={formRef} onSubmit={submit} noValidate>
      <div hidden={step !== 1}><section className="panel"><h2>Tender details</h2><Field label="Title" type="text" name="title" placeholder="e.g. Supply of Computer Systems" required /><Field label="Agency" type="text" name="agency" defaultValue="Ministry of Digital Transformation" required /><label>Procurement type<span className="input-wrap"><select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }}>{Object.entries(TENDER_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.description}</option>)}</select></span></label><div className="form-grid-2"><Field label="Category" type="text" name="category" placeholder="e.g. ICT, INFRA, PHARMA" /><Field label="Location" type="text" name="location" placeholder="e.g. New Delhi" /></div><Field label="Product / scope" type="text" name="product" placeholder="e.g. Desktop computer systems" /><div className="form-grid-3"><Field label="Quantity" type="text" name="quantity" placeholder="e.g. 1200" /><Field label="Unit" type="text" name="unit" placeholder="e.g. units, lots, kg" /><Field label="Estimated value (₹ Cr)" type="number" name="valueCr" step="0.01" min="0" value={valueCr} onChange={e => setValueCr(e.target.value)} required /></div></section></div>
      <div hidden={step !== 2}><section className="panel"><h2>Deadlines &amp; guarantees</h2><Field label="Submission window (minutes, demo-scaled)" type="number" name="submissionMinutes" min="1" defaultValue={5} required /><Field label="Bid validity (days, GeM 15–180)" type="number" name="bidValidityDays" min={15} max={180} defaultValue={30} required /><label className="check" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" name="emdRequired" checked={emdOn && !emdBlocked} disabled={emdBlocked} onChange={e => setEmdOn(e.target.checked)} /> Require EMD</label>{emdBlocked && <Alert variant="warning">EMD applies only when the estimated value exceeds ₹5 Lakh (GeM rule) — disabled for ₹{valueCr} Cr.</Alert>}{emdOn && !emdBlocked && <Field label="EMD amount (₹ Cr, default 2% of estimate)" type="number" name="emdAmountCr" step="0.001" min="0" placeholder="0.04" />}<label className="check" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" name="msePreference" defaultChecked /> MSE purchase preference</label><Field label="MII minimum local content % (optional)" type="number" name="miiMinLocalContentPct" min="0" max="100" placeholder="50" /><Field label="Abnormally-low-bid threshold (% below estimate)" type="number" name="albThresholdPct" min="1" max="90" defaultValue={25} /></section></div>
      <div hidden={step !== 3}><section className="panel"><h2>Eligibility criteria</h2><div className="form-grid-2"><Field label="Min turnover (₹ Cr)" type="number" name="minTurnoverCr" step="0.1" min="0" placeholder="2" /><Field label="Min years of experience" type="number" name="minYearsExperience" min="0" placeholder="3" /></div><label className="check" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" name="netWorthPositive" defaultChecked /> Require positive net worth</label></section><section className="panel"><h2>Technical specifications</h2>{[1, 2, 3].map(i => (<div className="form-grid-2" key={i}><Field label={`Spec ${i} — label`} type="text" name={`techLabel${i}`} placeholder={i === 1 ? 'RAM' : i === 2 ? 'Operating system' : 'Onsite warranty'} /><Field label={`Spec ${i} — required value`} type="text" name={`techExpected${i}`} placeholder={i === 1 ? '16 GB DDR4' : i === 2 ? 'Windows 11 Pro' : '3 years'} /></div>))}</section></div>
      <div hidden={step !== 4}><section className="panel"><h2>Required documents</h2><div className="mini-list">{DEFAULT_DOC_TEMPLATES.map(tpl => { const included = docs.find(d => d.name === tpl.name); return (<div key={tpl.name} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><label className="check" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 220px' }}><input type="checkbox" checked={included != null} onChange={() => toggleDoc(tpl.name)} /><b>{tpl.description}</b></label>{included && (<><select value={included.classification} onChange={e => patchDoc(tpl.name, { classification: e.target.value as DocBuilderRow['classification'], conditionKey: e.target.value === 'CONDITIONAL' ? (included.conditionKey ?? defaultCondition(tpl.name)) : null })} style={{ width: 150 }}><option value="MANDATORY">Mandatory</option><option value="CONDITIONAL">Conditional</option><option value="SUPPORTING">Supporting / optional</option></select>{included.classification === 'CONDITIONAL' && (<select value={included.conditionKey ?? ''} onChange={e => patchDoc(tpl.name, { conditionKey: e.target.value || null })} style={{ width: 160 }}><option value="">— condition —</option><option value="emd">EMD applies</option><option value="msme">bidder claims MSE</option><option value="startup">bidder claims startup</option><option value="reseller">bidder is reseller</option><option value="mii">bidder declares MII %</option></select>)}</>)}</div>)})}</div>{docs.filter(d => d.isCustom).map(d => (<div key={d.name} className="claim-row" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><input type="text" value={d.description} onChange={e => patchDoc(d.name, { description: e.target.value })} placeholder="Custom document title" style={{ flex: 1, minWidth: 200 }} /><select value={d.classification} onChange={e => patchDoc(d.name, { classification: e.target.value as DocBuilderRow['classification'] })} style={{ width: 150 }}><option value="MANDATORY">Mandatory</option><option value="CONDITIONAL">Conditional</option><option value="SUPPORTING">Supporting / optional</option></select><button type="button" className="secondary" onClick={() => setDocs(ds => ds.filter(x => x.name !== d.name))}>Remove</button></div>))}<button type="button" className="secondary" onClick={addCustom}><FileCheck2 size={14} /> Add custom document</button></section></div>
      <div className="button-row" style={{ justifyContent: 'space-between' }}><div style={{ display: 'flex', gap: 'var(--space-3)' }}><button type="button" className="secondary" onClick={() => navigate('tenders')}>Cancel</button>{step > 1 && <button type="button" className="ghost" onClick={prevStep}><RotateCcw size={15} /> Back</button>}</div><div style={{ display: 'flex', gap: 'var(--space-3)' }}>{step < 4 && <button type="button" className="primary" onClick={nextStep}>Next</button>}{step === 4 && <button className="primary" type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish tender'}</button>}</div></div>
    </form>
  </PageFrame>
}
