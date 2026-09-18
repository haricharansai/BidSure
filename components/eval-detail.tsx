'use client'

import {
  Ban, Check, ChevronRight, ClipboardCheck, Eye, FileCheck2, FileSearch,
  Gavel, MessagesSquare, Users, X,
} from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '@/lib/api'
import type { View, NavigateOptions } from '@/components/types'
import { useApi } from '@/components/hooks'
import {
  ErrorPanel, LoadingPanel, Alert, StageBadge, Doc6Badge, ClassificationChip,
  ElRow, runAction,
} from '@/components/ui'
import { PageFrame } from '@/components/layout'
import type { EvaluationDetailData, EvaluationRow } from '@/lib/types'

export function EvalDetailV2({ navigate, tenderId }: { navigate: (v: View, o?: NavigateOptions) => void; tenderId: string | null }) {
  const url = tenderId ? `/api/data?resource=evaluation-v2&tenderId=${encodeURIComponent(tenderId)}` : null
  const { data, error, retry } = useApi<EvaluationDetailData>(url)
  const [drill, setDrill] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [clarFor, setClarFor] = useState<EvaluationRow | null>(null)

  if (!tenderId) return <ErrorPanel message="No tender selected" />
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const d = data
  const drillData = d.rows.find(r => r.companyId === drill) ? drill : null

  const act = async (body: Record<string, unknown>) => { setActionError(null); setBusy(true); try { await runAction(body); retry() } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Action failed') } finally { setBusy(false) } }
  const statusCls = (s: string) => s === 'qualified' ? 'status-verified' : s === 'awarded' ? 'status-complete' : s === 'requires_review' ? 'status-in-review' : 'status-exception'

  return <PageFrame title="Evaluation & award" subtitle={`${d.tenderId} · ${d.tenderTitle}`} actions={<button className="secondary" onClick={() => navigate('w-tender', { tenderId: d.tenderId })}><Eye size={15} /> Tender</button>}>
    {actionError && <Alert variant="danger">{actionError}</Alert>}
    <div className="detail-actions">
      <StageBadge stage={d.stage} />
      {d.pendingClarifications > 0 && <span className="status status-in-review"><MessagesSquare size={12} /> {d.pendingClarifications} clarification(s) pending</span>}
      {d.lowestCr != null && <span className="status status-pending">L1 ₹{d.lowestCr} Cr</span>}
    </div>
    {d.awardBlockedReason && d.stage !== 'EVALUATED' && d.stage !== 'AUCTION_CLOSED' && <Alert variant="info">{d.awardBlockedReason}</Alert>}
    {(d.stage === 'EVALUATION_FAILED' || d.stage === 'AUCTION_FAILED') && (<Alert variant="danger" title="Zero qualified bidders">Officer decision required: cancel the tender or re-publish.<div className="button-row" style={{ marginTop: 8 }}><button className="secondary" disabled={busy} onClick={() => act({ action: 'cancelTender', tenderId: d.tenderId, reason: 'Zero qualified bidders' })}>Cancel tender</button></div></Alert>)}

    <section className="panel">
      <div className="table-caption"><b>{d.rows.length} evaluated bids</b></div>
      {d.rows.length === 0
        ? <div className="empty-evidence" style={{ height: 160 }}><FileSearch size={26} /><b>No evaluations yet</b></div>
        : <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Bidder</th><th>Status</th><th>Compliance</th><th>Technical</th><th>Financial</th><th>Flags</th><th /></tr></thead><tbody>
          {d.rows.map(r => <tr key={r.id} className={drillData === r.companyId ? 'row-selected' : ''} onClick={() => setDrill(drillData === r.companyId ? null : r.companyId)}>
            <td>{r.rank ? `L${r.rank}` : '—'}</td>
            <td><b>{r.companyName}</b></td>
            <td><span className={`status ${statusCls(r.status)}`}>{r.status.replace('_', ' ')}</span></td>
            <td><b>{r.compliancePct}%</b></td>
            <td>{r.technicalPassed}/{r.technicalTotal}</td>
            <td>{r.financialCr != null ? `₹${r.financialCr} Cr` : '—'}</td>
            <td>{r.flags.length ? <span className={`risk ${r.flags.some(f => f.severity === 'CRITICAL') ? 'risk-high' : 'risk-medium'}`}>{r.flags.length}</span> : '—'}</td>
            <td><ChevronRight size={16} /></td>
          </tr>)}
        </tbody></table></div>}
    </section>

    {d.mseMatches.length > 0 && (<section className="panel"><h2>MSE match options (L1 + 15%)</h2><div className="mini-list">{d.mseMatches.map(m => (<div key={m.companyId}><span className="tick"><Users size={13} /></span><div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b>{m.companyName}</b><small>₹{m.financialCr} Cr</small>{d.canAward && <button className="secondary" disabled={busy} onClick={() => act({ action: 'awardTender', tenderId: d.tenderId, companyId: m.companyId, epbgStatus: 'verified' })}>Award via match</button>}</div></div>))}</div></section>)}

    {d.canAward && d.rows.some(r => ['qualified', 'awarded'].includes(r.status)) && (
      <section className="panel"><h2>Award decision</h2>
        <div className="mini-list">
          {d.rows.filter(r => ['qualified', 'awarded'].includes(r.status)).map(r => (
            <div key={r.id}><span className="tick"><Check size={13} /></span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>{r.companyName}</b><small>{r.rank ? `L${r.rank}` : ''} · ₹{r.financialCr} Cr · {r.compliancePct}%</small>
                <select id={`epbg-${r.id}`} defaultValue="verified" style={{ width: 140 }}><option value="verified">ePBG: verified</option><option value="non-verified">ePBG: non-verified</option></select>
                <button className="primary" disabled={busy} onClick={() => act({ action: 'awardTender', tenderId: d.tenderId, companyId: r.companyId, epbgStatus: (document.getElementById(`epbg-${r.id}`) as HTMLSelectElement).value })}><Gavel size={14} /> Award</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    )}

    {drillData && (() => {
      const row = d.rows.find(r => r.companyId === drillData)
      const dd = d.drillDown
      if (!row || !dd || dd.companyName !== row.companyName) return null
      return (
        <section className="panel"><div className="panel-head"><div><h2>Drill-down — {dd.companyName}</h2></div><button className="icon-button" onClick={() => setDrill(null)}><X size={16} /></button></div>
          {row.status === 'requires_review' && (<Alert variant="warning" title="Review gate"><div className="button-row" style={{ marginTop: 8 }}><button className="primary" disabled={busy} onClick={() => act({ action: 'officerDecision', evaluationId: row.id, decision: 'approve', note: 'Approved after human review' })}><Check size={14} /> Approve</button><button className="secondary" disabled={busy} onClick={() => act({ action: 'officerDecision', evaluationId: row.id, decision: 'reject', note: 'Rejected after human review' })}><Ban size={14} /> Reject</button><button className="secondary" disabled={busy} onClick={() => setClarFor(row)}><MessagesSquare size={14} /> Ask clarification</button></div></Alert>)}
          <div className="detail-grid">
            <section>
              <p className="side-card-title">Documents</p>
              <div className="mini-list">
                {dd.docs.map(doc => (<div key={doc.docName}><span className="tick"><FileCheck2 size={13} /></span><div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}><b>{doc.label}</b><ClassificationChip c={doc.classification} /><Doc6Badge status={doc.status} />{doc.extractionConfidence != null && <small>confidence {(doc.extractionConfidence * 100).toFixed(0)}%</small>}</div><small>{doc.note}</small>
                  {doc.extracted && (<div className="detail-list" style={{ margin: '4px 0' }}>{Object.entries(doc.extracted).map(([k, v]) => (<div key={k}><span>{k}</span><b>{String(v)}</b></div>))}</div>)}
                  {doc.checks && doc.checks.length > 0 && (<div style={{ margin: '4px 0' }}>{doc.checks.map((c, i) => (<div key={i} style={{ display: 'flex', gap: 6, fontSize: 11 }}><span className={`status ${c.status === 'NON_COMPLIANT' ? 'status-exception' : c.status === 'VERIFIED' ? 'status-verified' : 'status-in-review'}`}>{c.status === 'NON_COMPLIANT' ? '✗' : c.status === 'VERIFIED' ? '✓' : '…'} {c.checkId}</span><small>{c.note}{c.mock && <b> · MOCK</b>}</small></div>))}</div>)}
                </div>))}
              </div>
              <p className="side-card-title">Triangulation</p>
              <Doc6Badge status={dd.triangulation.status} /> <small>{dd.triangulation.note}</small>
            </section>
            <aside>
              <p className="side-card-title">Eligibility</p>
              {dd.eligibilityRows.map(r => <ElRow key={r.key} row={r} />)}
              <p className="side-card-title">Technical</p>
              <p>{dd.technical.passed}/{dd.technical.total} golden parameters matched</p>
              {dd.technical.failures.map(f => <Alert key={f} variant="danger">{f}</Alert>)}
              <p className="side-card-title">Flags</p>
              {dd.flags.length === 0 ? <p>No forensic flags.</p> : dd.flags.map((f, i) => <Alert key={i} variant={f.severity === 'CRITICAL' ? 'danger' : f.severity === 'WARNING' ? 'warning' : 'info'} title={f.kind}>{f.note}</Alert>)}
              {dd.clarifications.length > 0 && <><p className="side-card-title">Clarifications</p>{dd.clarifications.map(c => <Alert key={c.id} variant={c.status === 'PENDING' ? 'warning' : 'info'}>{c.question} — {c.response ?? 'pending'}</Alert>)}</>}
            </aside>
          </div>
        </section>
      )
    })()}

    {clarFor && (
      <Alert variant="info" title={`Ask clarification — ${clarFor.companyName}`}>
        <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); if (!clarFor.submissionId) return; act({ action: 'askClarification', submissionId: clarFor.submissionId, question: String(f.get('question') || '') }).then(() => setClarFor(null)) }} style={{ marginTop: 8 }}>
          <label>Question<textarea name="question" rows={2} required placeholder="e.g. Clarify the UDIN on your turnover certificate" style={{ width: '100%' }} /></label>
          <button className="primary" type="submit" disabled={busy} style={{ marginTop: 8 }}>Send</button>
        </form>
      </Alert>
    )}
  </PageFrame>
}
