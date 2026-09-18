'use client'

import {
  BadgeCheck, Ban, Check, CheckCircle2, ChevronRight, Clock3, FileCheck2,
  Gavel, Gavel as GavelIcon, MessagesSquare, ScrollText, Users, Wallet, X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { ApiError } from '@/lib/api'
import type { View, NavigateOptions, SessionUser } from '@/components/types'
import { useApi } from '@/components/hooks'
import {
  ErrorPanel, LoadingPanel, Alert, Field, StageBadge, Doc6Badge,
  ClassificationChip, fmtCountdown, runAction, ElRow,
} from '@/components/ui'
import { PageFrame } from '@/components/layout'
import type { TenderDetailV2 } from '@/lib/types'
import { uploadDocument } from '@/lib/api'

const CONDITION_WHY: Record<string, string> = {
  emd: 'The tender requires EMD (estimated value above ₹5 Lakh).',
  msme: 'You are registered as MSE — the Udyam certificate activates your EMD exemption / MSE preference claim.',
  startup: 'You are a DPIIT-recognized startup — this activates the turnover/experience waiver claim.',
  reseller: 'You are a reseller/dealer — an OEM authorization form is required.',
  mii: 'You declared a local-content percentage — the Make in India declaration applies.',
}

function conditionAppliesSeller(conditionKey: string | null, company: TenderDetailV2['myCompany']): boolean {
  if (!company) return false
  switch (conditionKey) {
    case 'msme': return company.msme
    case 'startup': return company.isStartup
    case 'mii': return company.miiLocalContentPct != null
    case 'reseller': return company.isReseller
    default: return false
  }
}

export function WorkflowTenderDetail({ navigate, user, tenderId }: { navigate: (v: View, o?: NavigateOptions) => void; user: SessionUser; tenderId: string | null }) {
  const url = tenderId ? `/api/data?resource=tender-v2&tenderId=${encodeURIComponent(tenderId)}` : null
  const { data, error, retry } = useApi<TenderDetailV2>(url)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [tech, setTech] = useState<Record<string, string>>({})
  const [financialBid, setFinancialBid] = useState('')
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => { const h = setInterval(() => setNowTick(Date.now()), 1000); return () => clearInterval(h) }, [])
  const isOfficer = user.type === 'officer'

  if (!tenderId) return <ErrorPanel message="No tender selected" />
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const t = data

  const startDraft = async () => { setActionError(null); setBusy(true); try { await runAction({ action: 'startBid', tenderId: t.id }); retry() } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Could not start the bid') } finally { setBusy(false) } }
  const uploadForDoc = async (docName: string, file: File) => { if (!t.mySubmission) return; setActionError(null); setUploadingDoc(docName); try { await uploadDocument(t.mySubmission.id, docName, file); retry() } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Upload failed') } finally { setUploadingDoc(null) } }
  const finalizeBid = async () => { setActionError(null); setBusy(true); try { await runAction({ action: 'submitTender', tenderId: t.id, financialBidCr: Number(financialBid), technicalResponse: tech, eligibilitySnapshot: t.eligibility?.rows ?? [] }); retry() } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Submission failed') } finally { setBusy(false) } }
  const withdraw = async () => { setActionError(null); setBusy(true); try { await runAction({ action: 'withdrawBid', tenderId: t.id }); retry() } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Withdrawal failed') } finally { setBusy(false) } }
  const issueCorrigendum = async (form: HTMLFormElement) => { const f = new FormData(form); setActionError(null); setBusy(true); try { await runAction({ action: 'issueCorrigendum', tenderId: t.id, note: String(f.get('note') || ''), extendMinutes: Number(f.get('extendMinutes') || 0) }); retry() } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Corrigendum failed') } finally { setBusy(false) } }

  return <PageFrame title={t.title} subtitle={`${t.id} · ${t.agency} · ${t.typeLabel}`} actions={null}>
    {actionError && <Alert variant="danger">{actionError}</Alert>}
    <div className="detail-actions">
      <StageBadge stage={t.stage} />
      {t.emdRequired && <span className="status status-pending"><Wallet size={12} /> EMD ₹{t.emdAmountCr} Cr</span>}
      {t.msePreference && <span className="status status-pending"><Users size={12} /> MSE preference</span>}
      {t.miiMinLocalContentPct != null && <span className="status status-pending"><BadgeCheck size={12} /> MII ≥ {t.miiMinLocalContentPct}%</span>}
    </div>

    <section className="panel"><h2>Timeline</h2>
      <div className="mini-list steps">
        {t.timeline.map(s => (<div key={s.stage}><span className={`tick ${s.state === 'active' ? 'tick-active' : s.state === 'skipped' ? 'tick-skipped' : ''}`}>{s.state === 'done' ? <Check size={13} /> : s.state === 'active' ? '●' : s.state === 'skipped' ? '–' : '○'}</span><div><b>{s.label}</b><small>{s.state === 'active' ? 'current stage' : s.state === 'done' ? 'completed' : s.state === 'skipped' ? 'not applicable' : 'upcoming'}</small></div></div>))}
      </div>
      {!isOfficer && <Alert variant={t.stage === 'PUBLISHED' || t.stage === 'CORRIGENDUM' ? 'info' : 'warning'}><b>{t.nextMove.label}.</b> {t.nextMove.detail}</Alert>}
    </section>

    {t.corrigenda.length > 0 && (<section className="panel"><h2>Corrigenda</h2>{t.corrigenda.map(c => (<Alert key={c.version} variant="warning" title={`v${c.version}`}>{c.note} {c.deadlineChanged && '— submission deadline extended.'} <small>({new Date(c.createdAtISO).toLocaleString('en-IN')})</small></Alert>))}</section>)}

    <div className="detail-grid">
      <section className="panel"><h2>Tender overview</h2><div className="detail-list">
        <div><span>Estimated value</span><b>{t.valueLabel ?? '—'}</b></div>
        <div><span>Submission deadline</span><b>{new Date(t.submissionDeadlineISO).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} IST</b></div>
        <div><span>Closes in</span><b suppressHydrationWarning>{t.stage === 'PUBLISHED' || t.stage === 'CORRIGENDUM' ? fmtCountdown(t.submissionDeadlineISO) : '—'}</b></div>
        <div><span>Bid validity required</span><b>{t.bidValidityDays} days</b></div>
        {t.awardedToCompanyName && <div><span>Awarded to</span><b>{t.awardedToCompanyName}{t.iWon ? ' — you won' : ''}</b></div>}
      </div></section>

      {!isOfficer && t.eligibility && (<section className="panel"><h2>Your eligibility</h2><span className={`status ${t.eligibility.overall === 'qualified' ? 'status-verified' : t.eligibility.overall === 'not_eligible' ? 'status-exception' : 'status-in-review'}`}>{t.eligibility.overall === 'qualified' ? 'Qualified' : t.eligibility.overall === 'not_eligible' ? 'Not eligible' : 'Needs attention'}</span>{t.eligibility.rows.map(r => <ElRow key={r.key} row={r} />)}</section>)}

      {isOfficer && (t.stage === 'PUBLISHED' || t.stage === 'CORRIGENDUM') && (<section className="panel"><h2>Issue corrigendum</h2><form onSubmit={e => { e.preventDefault(); issueCorrigendum(e.currentTarget) }}><label>Amendment note<textarea name="note" rows={2} required placeholder="e.g. Quantity revised from 1000 to 1200 units" style={{ width: '100%' }} /></label><Field label="Extend deadline by (minutes, 0 = keep)" type="number" name="extendMinutes" min="0" defaultValue={0} /><button className="primary" type="submit" disabled={busy}><ScrollText size={15} /> Publish corrigendum</button></form></section>)}
    </div>

    <section className="panel"><h2>Required documents</h2>
      <div className="mini-list">
        {t.requiredDocs.map(d => {
          return (<div key={d.name}><span className="tick"><FileCheck2 size={13} /></span><div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}><b>{d.description}</b><ClassificationChip c={d.classification} />{d.conditionKey && <small>{isOfficer ? `conditional on "${d.conditionKey}"` : CONDITION_WHY[d.conditionKey] ?? `applies when you claim "${d.conditionKey}"`}</small>}</div></div>)
        })}
      </div>
    </section>

    {!isOfficer && (t.stage === 'PUBLISHED' || t.stage === 'CORRIGENDUM') && !t.mySubmission && (
      <section className="panel"><h2>Start your bid</h2><p className="eyebrow">Upload the required documents — the system extracts and verifies them automatically.</p><div className="button-row" style={{ justifyContent: 'flex-end' }}><button className="primary" disabled={busy} onClick={startDraft}><FileCheck2 size={15} /> Start bid (documents checklist)</button></div></section>
    )}

    {!isOfficer && t.mySubmission && t.mySubmission.status === 'DRAFT' && (() => {
      const msLeft = new Date(t.submissionDeadlineISO).getTime() - nowTick
      const windowClosed = t.stage !== 'PUBLISHED' && t.stage !== 'CORRIGENDUM' ? true : msLeft <= 0
      const windowCritical = !windowClosed && msLeft < 60_000
      return <>
        {windowClosed ? <Alert variant="danger">The submission window has closed.</Alert> : windowCritical && <Alert variant="warning">Submission window closes in {Math.ceil(msLeft / 1000)}s.</Alert>}
        <section className="panel"><h2>Submit your bid — document uploads</h2>
          <Field label="Financial bid (₹ Cr)" type="number" step="0.0001" min="0.0001" value={financialBid} onChange={e => setFinancialBid(e.target.value)} placeholder="e.g. 1.85" required />
          {t.technicalReqs.length > 0 && (<div><p className="side-card-title">Technical responses</p>{t.technicalReqs.map(r => (<div className="form-grid-2" key={r.key}><Field label={r.label} type="text" value={tech[r.key] ?? ''} onChange={e => setTech(s => ({ ...s, [r.key]: e.target.value }))} placeholder={`required: ${r.expected}`} /></div>))}</div>)}
          <div><p className="side-card-title">Required documents (upload)</p>
            {t.mySubmissionDocs.map(d => {
              const active = d.classification === 'CONDITIONAL' && (d.conditionKey === 'emd' ? t.emdRequired : conditionAppliesSeller(d.conditionKey, t.myCompany))
              const requiredNow = d.classification === 'MANDATORY' || active
              return (<div key={d.docName} className="claim-row"><div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}><b>{d.label}</b><ClassificationChip c={d.classification} />{d.provided && <Doc6Badge status={d.status} />}</div>
                {!d.provided && (<div style={{ marginTop: 6 }}><input type="file" disabled={windowClosed || uploadingDoc === d.docName || busy} accept={d.allowedTypes.join(',')} onChange={e => { const f = e.target.files?.[0]; if (f) void uploadForDoc(d.docName, f) }} /><small style={{ marginLeft: 8 }}>max {d.maxSizeMb} MB</small></div>)}
                {d.provided && (<div style={{ marginTop: 6, fontSize: 13 }}><div><b>File:</b> {d.fileName} {d.fileId && <a href={`/api/files/${d.fileId}`} target="_blank" rel="noreferrer" className="linkish">view</a>}</div><div><b>Extraction:</b> {d.extractionStatus}{d.extractionConfidence != null ? ` (${(d.extractionConfidence * 100).toFixed(0)}%)` : ''}{d.extractionError ? ` — ${d.extractionError}` : ''}</div></div>)}
              </div>)
            })}
          </div>
          <div className="button-row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="secondary" disabled={busy} onClick={withdraw}>Discard draft</button>
            <button className="primary" disabled={busy || !financialBid || windowClosed} onClick={finalizeBid}>{busy ? 'Submitting…' : windowClosed ? 'Window closed' : 'Finalize bid'}</button>
          </div>
        </section>
      </>
    })()}

    {!isOfficer && t.mySubmission && t.mySubmission.status !== 'DRAFT' && (
      <section className="panel"><h2>Your submission</h2>
        <div className="detail-list">
          <div><span>Submitted</span><b>{new Date(t.mySubmission.submittedAtISO).toLocaleString('en-IN')}</b></div>
          <div><span>Financial bid</span><b>{t.mySubmission.financialBidCr != null ? `₹${t.mySubmission.financialBidCr} Cr` : '—'}</b></div>
          <div><span>Documents provided</span><b>{t.mySubmission.docsProvided} / {t.mySubmission.docsTotal}</b></div>
          {t.mySubmission.resultStatus && <div><span>Result</span><b>{t.mySubmission.resultStatus}{t.mySubmission.rank ? ` — rank ${t.mySubmission.rank}` : ''} · {t.mySubmission.compliancePct ?? 0}% compliant</b></div>}
        </div>
        {t.mySubmission.flags.length > 0 && (<div>{t.mySubmission.flags.map((f, i) => <Alert key={i} variant={f.severity === 'CRITICAL' ? 'danger' : f.severity === 'WARNING' ? 'warning' : 'info'} title={f.kind}>{f.note}</Alert>)}</div>)}
        {(t.stage === 'PUBLISHED' || t.stage === 'CORRIGENDUM') && <button className="secondary" disabled={busy} onClick={withdraw}><Ban size={15} /> Withdraw bid {t.emdRequired ? '(EMD forfeited)' : ''}</button>}
      </section>
    )}
  </PageFrame>
}
