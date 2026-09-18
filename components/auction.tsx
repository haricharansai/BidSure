'use client'

import { Clock3, Gavel, Timer, Users, Wallet } from 'lucide-react'
import { useState } from 'react'
import { ApiError, apiFetch } from '@/lib/api'
import type { View, NavigateOptions } from '@/components/types'
import { useApi } from '@/components/hooks'
import { ErrorPanel, LoadingPanel, Stat, Alert, Field, runAction, fmtCountdown, StageBadge } from '@/components/ui'
import { PageFrame } from '@/components/layout'
import type { AuctionState } from '@/lib/types'

export function AuctionRoom({ tenderId }: { tenderId: string | null }) {
  const url = tenderId ? `/api/data?resource=auction&tenderId=${encodeURIComponent(tenderId)}` : null
  const { data, error, retry } = useApi<AuctionState>(url, 2000)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [bidMsg, setBidMsg] = useState<string | null>(null)

  if (!tenderId) return <ErrorPanel message="No tender selected — open one from the workflow list." />
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const a = data

  const place = async () => {
    setBidMsg(null); setBusy(true)
    try {
      const res = await apiFetch<{ extended: boolean }>('/api/action', { method: 'POST', body: { action: 'placeBid', tenderId, amountCr: Number(amount) } })
      setBidMsg(res.extended ? 'Bid accepted — closing window bid triggered an auto-extension.' : 'Bid accepted — you are at the new lowest.')
      setAmount('')
      retry()
    } catch (err) {
      setBidMsg(err instanceof ApiError ? err.message : 'Bid failed')
    } finally { setBusy(false) }
  }

  return <PageFrame title="Live e-reverse auction" subtitle="Descending bids — anonymized competitors, own rank visible" actions={null}>
    <div className="detail-actions">
      <StageBadge stage={a.stage} />
      {a.endsAtISO && (a.stage === 'AUCTION_ACTIVE') && <span className="status status-exception"><Timer size={12} /> ends in <span suppressHydrationWarning>{fmtCountdown(a.endsAtISO)}</span></span>}
      <span className="status status-pending">{a.extensionsLeft} auto-extension(s) left</span>
    </div>
    <Alert variant={a.stage === 'AUCTION_ACTIVE' ? 'info' : a.amQualified ? 'warning' : 'danger'}>{a.message}</Alert>
    <div className="stats">
      <Stat label="Current lowest (L1)" value={a.lowestCr != null ? `₹${a.lowestCr} Cr` : '—'} change={a.startPriceCr != null ? `start ₹${a.startPriceCr} Cr` : ''} icon={<Gavel />} />
      <Stat label="Your lowest" value={a.myLowestCr != null ? `₹${a.myLowestCr} Cr` : '—'} change={a.myRank ? `rank ${a.myRank}` : 'no bid yet'} icon={<Wallet />} warn={a.myRank != null && a.myRank > 1} />
      <Stat label="Active bidders" value={String(a.activeBidders)} change={`${a.totalBids} total bids`} icon={<Users />} />
    </div>
    {a.stage === 'AUCTION_ACTIVE' && a.amQualified && (
      <section className="panel"><h2>Place your bid</h2>
        <p className="eyebrow">Must be below the current lowest. A bid in the last 15 s extends the auction by 60 s (max 3, demo-scaled).</p>
        <div className="button-row">
          <Field label="Bid amount (₹ Cr)" type="number" step="0.0001" min="0.0001" value={amount} onChange={e => setAmount(e.target.value)} placeholder={a.lowestCr != null ? `below ₹${a.lowestCr} Cr` : 'opening bid'} />
          <button className="primary" disabled={busy || !amount} onClick={place}><Gavel size={16} /> {busy ? 'Placing…' : 'Place bid'}</button>
        </div>
        {bidMsg && <Alert variant={bidMsg.includes('accepted') ? 'success' : 'danger'}>{bidMsg}</Alert>}
      </section>
    )}
    <section className="panel"><h2>Recent bids (anonymized)</h2>
      {a.recentBids.length === 0
        ? <div className="empty-evidence" style={{ height: 120 }}><Gavel size={24} /><b>No bids yet</b><small>Be the first to move the price down.</small></div>
        : <div className="mini-list">{a.recentBids.map((b, i) => (<div key={i}><span className="tick"><Gavel size={13} /></span><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><b>₹{b.amountCr} Cr</b><small>{b.anonymous} · {new Date(b.atISO).toLocaleTimeString('en-IN')}{b.mine ? ' — you' : ''}</small></div></div>))}</div>}
    </section>
  </PageFrame>
}

