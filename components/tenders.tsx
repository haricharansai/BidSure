'use client'

import { Clock3, ChevronRight, Users, RotateCcw, SlidersHorizontal, X, Search } from 'lucide-react'
import { useCallback, useMemo, useState, useEffect } from 'react'
import type { View, NavigateOptions } from '@/components/types'
import { useApi } from '@/components/hooks'
import { ErrorPanel, LoadingPanel, StatusBadge, Highlight } from '@/components/ui'
import { PageFrame, TenderTable, BidderTable } from '@/components/layout'
import type { Tender, TenderDetailData, EvaluationData, Status } from '@/lib/types'

const TENDERS_PAGE_SIZE = 8

// ---------------------------------------------------------------------------
// Tenders list view
// ---------------------------------------------------------------------------

export function Tenders({ navigate, userId }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string }) {
  const { data, error, retry } = useApi<{ tenders: Tender[] }>(`/api/data?resource=tenders&userId=${encodeURIComponent(userId)}`)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | Status>('ALL')
  const [agencyFilter, setAgencyFilter] = useState<string>('ALL')
  const [evalMethodFilter, setEvalMethodFilter] = useState<string>('ALL')
  const [biddersFilter, setBiddersFilter] = useState<'ALL' | '0' | '1+' | '3+' | '5+'>('ALL')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'deadline-soon' | 'bidders-high' | 'value-high' | 'value-low' | 'checks-progress'>('newest')
  const [filterOpen, setFilterOpen] = useState(false)
  const [page, setPage] = useState(1)

  const allTenders = useMemo(() => data?.tenders || [], [data])

  const agencies = useMemo(() => Array.from(new Set(allTenders.map(t => t.agency).filter(Boolean))).sort(), [allTenders])
  const evalMethods = useMemo(() => Array.from(new Set(allTenders.map(t => t.evaluationMethod).filter(Boolean))).sort(), [allTenders])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: allTenders.length, Verified: 0, 'In Review': 0, Pending: 0, Exception: 0, Complete: 0 }
    allTenders.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++ })
    return counts
  }, [allTenders])

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (statusFilter !== 'ALL') count++
    if (agencyFilter !== 'ALL') count++
    if (evalMethodFilter !== 'ALL') count++
    if (biddersFilter !== 'ALL') count++
    if (sortBy !== 'newest') count++
    if (query.trim()) count++
    return count
  }, [statusFilter, agencyFilter, evalMethodFilter, biddersFilter, sortBy, query])

  const resetFilters = useCallback(() => {
    setQuery(''); setStatusFilter('ALL'); setAgencyFilter('ALL'); setEvalMethodFilter('ALL'); setBiddersFilter('ALL'); setSortBy('newest'); setPage(1)
  }, [])

  const filtered = useMemo(() => {
    return allTenders.filter(t => {
      if (query.trim()) { const q = query.toLowerCase(); const text = `${t.id} ${t.title} ${t.agency} ${t.value} ${t.evaluationMethod} ${t.status}`.toLowerCase(); if (!text.includes(q)) return false }
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false
      if (agencyFilter !== 'ALL' && t.agency !== agencyFilter) return false
      if (evalMethodFilter !== 'ALL' && t.evaluationMethod !== evalMethodFilter) return false
      if (biddersFilter === '0' && t.biddersCount !== 0) return false
      if (biddersFilter === '1+' && t.biddersCount < 1) return false
      if (biddersFilter === '3+' && t.biddersCount < 3) return false
      if (biddersFilter === '5+' && t.biddersCount < 5) return false
      return true
    }).sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.published).getTime() - new Date(b.published).getTime()
      if (sortBy === 'deadline-soon') return new Date(a.deadlineISO).getTime() - new Date(b.deadlineISO).getTime()
      if (sortBy === 'bidders-high') return b.biddersCount - a.biddersCount
      if (sortBy === 'value-high') { const vA = parseFloat(a.value.replace(/[^0-9.]/g, '')) || 0; const vB = parseFloat(b.value.replace(/[^0-9.]/g, '')) || 0; return vB - vA }
      if (sortBy === 'value-low') { const vA = parseFloat(a.value.replace(/[^0-9.]/g, '')) || 0; const vB = parseFloat(b.value.replace(/[^0-9.]/g, '')) || 0; return vA - vB }
      if (sortBy === 'checks-progress') { const pA = a.checksComplete / Math.max(a.checksTotal, 1); const pB = b.checksComplete / Math.max(b.checksTotal, 1); return pB - pA }
      return new Date(b.deadlineISO).getTime() - new Date(a.deadlineISO).getTime()
    })
  }, [allTenders, query, statusFilter, agencyFilter, evalMethodFilter, biddersFilter, sortBy])

  useEffect(() => { setPage(1) }, [query, statusFilter, agencyFilter, evalMethodFilter, biddersFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / TENDERS_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * TENDERS_PAGE_SIZE, currentPage * TENDERS_PAGE_SIZE)

  return (
    <PageFrame title="Tenders" subtitle="Manage procurement opportunities, review compliance, and track bidder submissions." actions={null}>
      <div className="toolbar">
        <div className="search"><Search size={17} /><input placeholder="Search tenders by reference, title, or agency" value={query} onChange={e => setQuery(e.target.value)} />{query && <button type="button" className="icon-button" style={{ padding: 2, marginRight: -4 }} onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}</div>
        <button type="button" className={`filter ${filterOpen || activeFilterCount > 0 ? 'active' : ''}`} onClick={() => setFilterOpen(o => !o)} aria-expanded={filterOpen}><SlidersHorizontal size={16} /> Filters {activeFilterCount > 0 && <span>{activeFilterCount}</span>}</button>
      </div>
      <div className="filter-pills" role="tablist" aria-label="Filter tenders by status">
        <button type="button" className={`filter-pill ${statusFilter === 'ALL' ? 'active' : ''}`} onClick={() => setStatusFilter('ALL')}>All <span className="pill-count">{statusCounts.ALL}</span></button>
        <button type="button" className={`filter-pill ${statusFilter === 'Verified' ? 'active' : ''}`} onClick={() => setStatusFilter('Verified')}>Verified <span className="pill-count">{statusCounts.Verified}</span></button>
        <button type="button" className={`filter-pill ${statusFilter === 'In Review' ? 'active' : ''}`} onClick={() => setStatusFilter('In Review')}>In Review <span className="pill-count">{statusCounts['In Review']}</span></button>
        <button type="button" className={`filter-pill ${statusFilter === 'Pending' ? 'active' : ''}`} onClick={() => setStatusFilter('Pending')}>Pending <span className="pill-count">{statusCounts.Pending}</span></button>
        <button type="button" className={`filter-pill ${statusFilter === 'Exception' ? 'active' : ''}`} onClick={() => setStatusFilter('Exception')}>Exception <span className="pill-count">{statusCounts.Exception}</span></button>
      </div>
      {activeFilterCount > 0 && (
        <div className="active-filters">
          <span className="active-filters-label">Active filters:</span>
          {query.trim() && <span className="filter-tag">Search: &ldquo;{query}&rdquo;<button type="button" onClick={() => setQuery('')} aria-label="Remove search filter"><X size={12} /></button></span>}
          {statusFilter !== 'ALL' && <span className="filter-tag">Status: {statusFilter}<button type="button" onClick={() => setStatusFilter('ALL')} aria-label="Remove status filter"><X size={12} /></button></span>}
          <button type="button" className="text-button" onClick={resetFilters} style={{ fontSize: 'var(--text-xs)' }}>Reset all</button>
        </div>
      )}
      {error ? (<ErrorPanel message={error} onRetry={retry} />) : !data ? (<LoadingPanel />) : (
        <section className="panel">
          <div className="table-caption"><b>{filtered.length} {filtered.length === 1 ? 'tender' : 'tenders'} found</b><span>{allTenders.length > 0 && filtered.length !== allTenders.length ? `Filtered from ${allTenders.length} total active tenders` : 'Personalized results for your account'}</span></div>
          {filtered.length === 0 ? (
            <div className="empty-evidence" style={{ height: 220 }}><Search size={30} /><b>No tenders match your filter criteria</b><small>Try adjusting your search query, status, or department filters.</small><button className="secondary" style={{ marginTop: 12 }} onClick={resetFilters}><RotateCcw size={15} /> Reset all filters</button></div>
          ) : (
            <>
              <TenderTable rows={pageRows} navigate={navigate} query={query} />
              {filtered.length > TENDERS_PAGE_SIZE && (
                <div className="pagination">
                  <span className="pg-info">Showing {(currentPage - 1) * TENDERS_PAGE_SIZE + 1}–{Math.min(currentPage * TENDERS_PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                  <div className="pg-controls">
                    <button disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
                    <span className="pg-page">Page {currentPage} of {totalPages}</span>
                    <button disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </PageFrame>
  )
}

// ---------------------------------------------------------------------------
// Tender detail (legacy)
// ---------------------------------------------------------------------------

export function TenderDetail({ navigate, userId, tenderId }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string; tenderId: string | null }) {
  const url = tenderId
    ? `/api/data?resource=tender-detail&userId=${encodeURIComponent(userId)}&tenderId=${encodeURIComponent(tenderId)}`
    : `/api/data?resource=tender-detail&userId=${encodeURIComponent(userId)}`
  const { data, error, retry } = useApi<TenderDetailData>(url)
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const { tender, bidders } = data
  return <PageFrame title={tender.title} subtitle={`${tender.id} · ${tender.agency}`} actions={null}>
    <div className="detail-actions"><StatusBadge status={tender.status} /><button className="primary" onClick={() => navigate('evaluation', { tenderId: tender.id })}>Start bid evaluation</button></div>
    <div className="detail-grid">
      <section className="panel"><h2>Tender overview</h2><div className="detail-list">
        <div><span>Published</span><b>{tender.published}</b></div>
        <div><span>Submission deadline</span><b>{new Date(tender.deadlineISO).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} IST</b></div>
        <div><span>Estimated value</span><b>{tender.value}</b></div>
        <div><span>Bid security</span><b>{tender.bidSecurity}</b></div>
        <div><span>Evaluation method</span><b>{tender.evaluationMethod}</b></div>
        <div><span>Review progress</span><b>{tender.checksComplete} of {tender.checksTotal} checks complete</b></div>
      </div></section>
      <section className="panel"><h2>Compliance requirements</h2>{tender.requirements.map(x => <div className="requirement" key={x.name}><span className={x.status === 'Verified' ? 'done' : ''}>{x.status === 'Verified' ? '✓' : ''}</span><b>{x.name}</b><small>{x.status === 'Verified' ? 'Verified' : x.status === 'Exception' ? 'Exception raised' : 'Pending review'}</small></div>)}</section>
    </div>
    <section className="panel">
      <div className="panel-head"><div><h2>Submitted bidders</h2><p>{bidders.length} bidders submitted before the deadline</p></div></div>
      <BidderTable navigate={navigate} rows={bidders.slice(0, 3)} />
    </section>
  </PageFrame>
}

// ---------------------------------------------------------------------------
// Evaluation (legacy)
// ---------------------------------------------------------------------------

export function Evaluation({ navigate, userId, tenderId }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string; tenderId: string | null }) {
  const url = tenderId
    ? `/api/data?resource=evaluation&userId=${encodeURIComponent(userId)}&tenderId=${encodeURIComponent(tenderId)}`
    : `/api/data?resource=evaluation&userId=${encodeURIComponent(userId)}`
  const { data, error, retry } = useApi<EvaluationData>(url)
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const pct = Math.round((data.checksComplete / Math.max(data.checksTotal, 1)) * 100)
  return <PageFrame title="Bid evaluation" subtitle={`${data.tenderId} · ${data.tenderTitle}`} actions={null}>
    <div className="evaluation-head"><div className="progress"><span>Evaluation progress</span><b>{data.checksComplete} <small>/ {data.checksTotal} checks complete</small></b><div><i style={{ width: `${pct}%` }} /></div></div></div>
    <section className="panel"><div className="panel-head"><div><h2>Bidder evaluation queue</h2><p>Review each submission against the tender requirements.</p></div></div><BidderTable navigate={navigate} rows={data.bidders} /></section>
  </PageFrame>
}
