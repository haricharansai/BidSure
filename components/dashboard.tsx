'use client'

import { ArrowRight, BarChart3, ClipboardCheck, FileText, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react'
import type { View, NavigateOptions } from '@/components/types'
import { useApi } from '@/components/hooks'
import { ErrorPanel, LoadingPanel, StatusBadge, Stat } from '@/components/ui'
import { PageFrame, TenderTable } from '@/components/layout'
import type { AttentionItem, OfficerDashboardData, SellerDashboardData, Status, Tender } from '@/lib/types'
import { useState } from 'react'

// ---------------------------------------------------------------------------
// Bar chart
// ---------------------------------------------------------------------------

function Bars({ points }: { points: { label: string; value: number }[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const max = Math.max(...points.map(p => p.value), 1)
  const niceMax = Math.max(10, Math.ceil(max / 10) * 10)
  const avg = points.length ? Math.round(points.reduce((s, p) => s + p.value, 0) / points.length) : 0
  const gridVals = [niceMax, Math.round(niceMax * 0.75), Math.round(niceMax * 0.5), Math.round(niceMax * 0.25), 0]
  return (
    <div className="chart">
      <div className="chart-plot">
        <div className="grid">{gridVals.map((v, i) => <span key={i}>{v}</span>)}</div>
        <div className="avg" style={{ bottom: `${(avg / niceMax) * 100}%` }} title={`Average ${avg}`} />
        <div className="bars">
          {points.map((p, i) => (
            <div key={p.label} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
              <span className={i === points.length - 1 ? 'is-latest' : ''} style={{ height: `${(p.value / niceMax) * 100}%` }}><b>{p.value}</b></span>
              {hoveredIdx === i && (
                <div className="chart-tooltip" role="tooltip">
                  <b>{p.label}</b>
                  <span>{p.value} event{p.value !== 1 ? 's' : ''}</span>
                  <span className="chart-tooltip-pct">{avg > 0 ? `${Math.round((p.value / avg) * 100)}% of avg` : '—'}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="chart-labels">{points.map(p => <small key={p.label}>{p.label}</small>)}</div>
      <div className="chart-legend"><span><i className="bar" /> Value</span><span><i className="avg" /> Average ({avg})</span></div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Attention list
// ---------------------------------------------------------------------------

function AttentionList({ items, onSelect }: { items: AttentionItem[]; onSelect?: () => void }) {
  return <>{items.map(item => <button className="attention-row" key={`${item.title}-${item.detail}`} onClick={onSelect}><span className="attention-icon">!</span><span><b>{item.title}</b><small>{item.detail}</small></span><StatusBadge status={item.status} /></button>)}</>
}

// ---------------------------------------------------------------------------
// Officer dashboard
// ---------------------------------------------------------------------------

export function OfficerDashboard({ navigate, userId }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string }) {
  const { data, error, retry } = useApi<OfficerDashboardData>(`/api/data?resource=dashboard&userId=${encodeURIComponent(userId)}`)
  const [weeks, setWeeks] = useState(12)
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const statTarget = (label: string): View => label.startsWith('Active') ? 'tenders' : label.startsWith('Bids') ? 'evaluation' : label.startsWith('Exceptions') ? 'compliance' : 'documents'
  return <PageFrame title={`Good morning, ${data.firstName}`} subtitle="Here is what needs your attention today." actions={<button className="primary" onClick={() => navigate('tenders')}><FileText size={16} /> Review tenders</button>}>
    <div className="stats">
      {data.stats.map(s => <Stat key={s.label} label={s.label} value={s.value} change={s.change} icon={s.label.startsWith('Bids') ? <ClipboardCheck /> : s.label.startsWith('Exceptions') ? <ShieldCheck /> : s.label.startsWith('Documents') ? <FileText /> : <FileText />} warn={s.tone === 'warn'} danger={s.tone === 'danger'} onClick={() => navigate(statTarget(s.label))} />)}
    </div>
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-head"><div><h2>Recent tenders</h2><p>Latest procurement activity across your departments</p></div><button className="text-button" onClick={() => navigate('tenders')}>View all <ArrowRight size={15} /></button></div>
        <TenderTable rows={data.recentTenders} navigate={navigate} />
      </section>
      <section className="panel attention">
        <div className="panel-head"><div><h2>Needs attention</h2><p>Items requiring officer review</p></div></div>
        <div className="attention-scroll"><AttentionList items={data.attention} onSelect={() => navigate('compliance')} /></div>
      </section>
    </div>
    <section className="panel activity">
      <div className="panel-head"><div><h2>Verification activity</h2><p>{data.activity.caption}</p></div><select value={weeks} onChange={e => setWeeks(Number(e.target.value))} aria-label="Chart period"><option value={4}>Last 4 weeks</option><option value={8}>Last 8 weeks</option><option value={12}>Last 12 weeks</option></select></div>
      <Bars points={data.activity.points.slice(-weeks)} />
    </section>
  </PageFrame>
}

// ---------------------------------------------------------------------------
// Seller dashboard
// ---------------------------------------------------------------------------

export function SellerDashboard({ navigate, userId }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string }) {
  const { data, error, retry } = useApi<SellerDashboardData>(`/api/data?resource=dashboard&userId=${encodeURIComponent(userId)}`)
  const [months, setMonths] = useState(12)
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const statTarget = (label: string): View => label.startsWith('Open') ? 'opportunities' : 'my-bids'
  return <PageFrame title={`Welcome back, ${data.companyName}`} subtitle="Track your bids and discover new opportunities." role="seller" actions={<button className="primary" onClick={() => navigate('opportunities')}><Search size={16} /> Find opportunities</button>}>
    <div className="stats">
      {data.stats.map(s => <Stat key={s.label} label={s.label} value={s.value} change={s.change} icon={s.label.startsWith('Win rate') ? <BarChart3 /> : s.label.startsWith('Open opportunities') ? <Search /> : <FileText />} warn={s.tone === 'warn'} danger={s.tone === 'danger'} onClick={() => navigate(statTarget(s.label))} />)}
    </div>
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-head"><div><h2>My recent bids</h2><p>Track the status of your submitted bids</p></div><button className="text-button" onClick={() => navigate('my-bids')}>View all <ArrowRight size={15} /></button></div>
        <TenderTable rows={data.recentBids.slice(0, 3)} navigate={navigate} />
      </section>
      <section className="panel attention">
        <div className="panel-head"><div><h2>Upcoming deadlines</h2><p>Actions required before deadline</p></div></div>
        <div className="attention-scroll"><AttentionList items={data.deadlines} onSelect={() => navigate('my-bids')} /></div>
      </section>
    </div>
    <section className="panel activity">
      <div className="panel-head"><div><h2>Bid performance</h2><p>{data.performance.caption}</p></div><select value={months} onChange={e => setMonths(Number(e.target.value))} aria-label="Chart period"><option value={3}>Last 3 months</option><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option></select></div>
      <Bars points={data.performance.points.slice(-months)} />
    </section>
  </PageFrame>
}

