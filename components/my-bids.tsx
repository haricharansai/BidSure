'use client'

import { Clock3, FileText, Search } from 'lucide-react'
import type { View, NavigateOptions } from '@/components/types'
import { useApi } from '@/components/hooks'
import { ErrorPanel, LoadingPanel, Alert, StageBadge } from '@/components/ui'
import { PageFrame } from '@/components/layout'
import type { SellerSubmissionRow } from '@/lib/types'

export function MyBids({ navigate, userId }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string }) {
  const { data, error, retry } = useApi<{ submissions: SellerSubmissionRow[] }>(`/api/data?resource=submissions&userId=${encodeURIComponent(userId)}`)
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const rows = [...data.submissions].sort((a, b) =>
    ((a.status === 'DRAFT' ? 0 : a.status === 'DISCARDED' ? 2 : 1) - (b.status === 'DRAFT' ? 0 : b.status === 'DISCARDED' ? 2 : 1)))
  return <PageFrame title="My bids" subtitle="Track your submitted bids and their current status." role="seller" actions={<button className="primary" onClick={() => navigate('marketplace')}><Search size={16} /> Find opportunities</button>}>
    {rows.length === 0 ? (
      <section className="panel">
        <div className="empty-evidence" style={{ height: 180 }}><FileText size={28} /><b>No bids yet</b><small>Start a bid from the marketplace — it appears here the moment you finalize it.</small></div>
        <div className="button-row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="secondary" onClick={() => navigate('marketplace')}>Browse GeM marketplace</button>
        </div>
      </section>
    ) : (
      <section className="panel">
        <div className="panel-head"><div><h2>Submitted bids</h2><p>{rows.filter(r => r.status !== 'DRAFT').length} submitted · {rows.filter(r => r.status === 'DRAFT').length} draft(s)</p></div><button className="text-button" onClick={retry}><Clock3 size={14} /> Refresh</button></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tender</th><th>Submitted</th><th>Financial bid</th><th>Documents</th><th>Tender stage</th><th>Result</th><th /></tr></thead>
            <tbody>
              {rows.map(s => (
                <tr key={s.id} onClick={() => navigate('w-tender', { tenderId: s.tenderId })}>
                  <td><b className="linkish">{s.tenderTitle}</b><small>{s.tenderId}</small></td>
                  <td><Clock3 size={14} />{s.status === 'DRAFT' ? <em>not submitted</em> : new Date(s.submittedAtISO).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{s.financialBidCr != null ? `₹${s.financialBidCr} Cr` : '—'}</td>
                  <td>{s.docsProvided} / {s.docsTotal}</td>
                  <td><StageBadge stage={s.stage} /></td>
                  <td>
                    {s.status === 'DRAFT'
                      ? <span className="status status-pending">Draft in progress</span>
                      : s.status === 'DISCARDED'
                        ? <span className="status status-pending">Draft discarded</span>
                        : s.resultStatus
                          ? <span className={`status ${s.resultStatus === 'awarded' ? 'status-complete' : s.resultStatus === 'qualified' ? 'status-verified' : s.resultStatus === 'disqualified' ? 'status-exception' : 'status-in-review'}`}>{s.resultStatus}{s.rank != null ? ` · rank ${s.rank}` : ''}{s.compliancePct != null ? ` · ${s.compliancePct}%` : ''}</span>
                          : <span className="status status-pending">pending evaluation</span>}
                  </td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.some(s => s.flags.length > 0) && (
          <div style={{ marginTop: 10 }}>
            <p className="side-card-title">Evaluation flags on your bids</p>
            {rows.filter(s => s.flags.length > 0).flatMap(s => s.flags.map((f, i) => (
              <Alert key={`${s.id}-${i}`} variant={f.severity === 'CRITICAL' ? 'danger' : f.severity === 'WARNING' ? 'warning' : 'info'} title={`${s.tenderTitle} — ${f.kind}`}>{f.note}</Alert>
            )))}
          </div>
        )}
      </section>
    )}
  </PageFrame>
}
