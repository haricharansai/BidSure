'use client'

import { FileText, Search, Timer, Users, Wallet } from 'lucide-react'
import type { View, NavigateOptions } from '@/components/types'
import { useApi } from '@/components/hooks'
import { ErrorPanel, LoadingPanel, StageBadge, fmtCountdown } from '@/components/ui'
import { PageFrame } from '@/components/layout'
import type { MarketplaceTender } from '@/lib/types'

export function Marketplace({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
  const { data, error, retry } = useApi<{ tenders: MarketplaceTender[] }>('/api/data?resource=marketplace', 5000)
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const rows = data.tenders
  return <PageFrame title="GeM marketplace" subtitle="Open tenders with a live eligibility pre-check from your declared company data." role="seller" actions={null}>
    {rows.length === 0
      ? <section className="panel"><div className="empty-evidence" style={{ height: 180 }}><Search size={28} /><b>No open tenders right now</b><small>Check back soon — new tenders appear here when published.</small></div></section>
      : <div className="report-cards">
        {rows.map(t => {
          const eCls = t.eligibility.overall === 'qualified' ? 'status-verified' : t.eligibility.overall === 'not_eligible' ? 'status-exception' : 'status-in-review'
          return (
            <button className="report-card" key={t.id} style={{ textAlign: 'left' }} onClick={() => navigate('w-tender', { tenderId: t.id })}>
              <div className="circle-icon"><FileText /></div>
              <b>{t.title}</b>
              <p>{t.typeLabel} · {t.agency}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
                <span className="status status-pending"><Timer size={12} /> <span suppressHydrationWarning>{fmtCountdown(t.submissionDeadlineISO)}</span></span>
                {t.emdRequired && <span className="status status-pending"><Wallet size={12} /> EMD</span>}
                {t.msePreference && <span className="status status-pending"><Users size={12} /> MSE pref</span>}
                {t.miiMinLocalContentPct != null && <span className="status status-pending">MII ≥ {t.miiMinLocalContentPct}%</span>}
                {t.mySubmissionStatus && <span className="status status-verified">submitted</span>}
              </div>
              <span className={`status ${eCls}`}>
                {t.eligibility.overall === 'qualified' ? 'You qualify (pre-check)' : t.eligibility.overall === 'not_eligible' ? 'Not eligible (pre-check)' : 'Needs attention'}
              </span>
              <p><small>{t.nextStep}</small></p>
            </button>
          )
        })}
      </div>}
  </PageFrame>
}
