'use client'

import React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { storeToken } from '@/lib/api'
import type { SessionUser } from '@/lib/types'

// --- Shared types & helpers ---
import {
  type View, type NavigateOptions, type SessionContextValue,
  SessionContext, SESSION_KEY, VIEW_KEY, TENDER_KEY, BIDDER_KEY,
  viewToHash, hashToView,
} from '@/components/types'

// --- Shared UI ---
import { ToastProvider, ErrorBoundary, PageTransition } from '@/components/ui'

// --- Layout ---
import { PublicHeader, PublicFooter, AppShell } from '@/components/layout'

// --- Hooks ---
import { useKeyboardShortcuts } from '@/components/hooks'

// --- Feature components ---
import { Home } from '@/components/home'
import { Login } from '@/components/login'
import { OfficerDashboard, SellerDashboard } from '@/components/dashboard'
import { Tenders, TenderDetail, Evaluation } from '@/components/tenders'
import { Compliance } from '@/components/compliance'
import { WorkflowTenders, CreateTender } from '@/components/workflow'
import { WorkflowTenderDetail } from '@/components/workflow-detail'
import { EvalDetailV2 } from '@/components/eval-detail'
import { AuctionRoom } from '@/components/auction'
import { ClarificationCenter } from '@/components/clarifications'
import { Marketplace } from '@/components/marketplace'
import { MyBids } from '@/components/my-bids'
import { AuditExplorer } from '@/components/audit'
import { GenericPage } from '@/components/static-pages'

// ---------------------------------------------------------------------------
// Main Page component (entry point)
// ---------------------------------------------------------------------------

export default function Page() {
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>('home')
  const [user, setUser] = useState<SessionUser | null>(null)
  const [selectedTenderId, setSelectedTenderId] = useState<string | null>(null)
  const [selectedBidder, setSelectedBidder] = useState<string | null>(null)

  const navigate = useCallback((v: View, opts?: NavigateOptions) => {
    if (opts?.tenderId !== undefined) setSelectedTenderId(opts.tenderId)
    if (opts?.bidder !== undefined) setSelectedBidder(opts.bidder)
    setView(v)
    try {
      sessionStorage.setItem(VIEW_KEY, v)
      if (opts?.tenderId != null) sessionStorage.setItem(TENDER_KEY, opts.tenderId)
      else sessionStorage.removeItem(TENDER_KEY)
      if (opts?.bidder != null) sessionStorage.setItem(BIDDER_KEY, opts.bidder)
      else sessionStorage.removeItem(BIDDER_KEY)
    } catch {}
    window.history.pushState({ view: v, tenderId: opts?.tenderId, bidder: opts?.bidder }, '', viewToHash(v, opts?.tenderId, opts?.bidder))
  }, [])

  const signIn = useCallback((u: SessionUser) => {
    setUser(u)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(u))
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
    storeToken(null)
    sessionStorage.removeItem(SESSION_KEY)
    try { sessionStorage.removeItem(VIEW_KEY); sessionStorage.removeItem(TENDER_KEY); sessionStorage.removeItem(BIDDER_KEY) } catch {}
    setSelectedTenderId(null)
    setSelectedBidder(null)
    setView('home')
    window.history.replaceState({ view: 'home' }, '', '#/')
  }, [])

  useEffect(() => {
    try { const raw = sessionStorage.getItem(SESSION_KEY); if (raw) setUser(JSON.parse(raw)) } catch { sessionStorage.removeItem(SESSION_KEY) }
    let initView: View = 'home'; let initTenderId: string | undefined; let initBidder: string | undefined
    if (window.location.hash && window.location.hash !== '#') { const parsed = hashToView(); initView = parsed.view; initTenderId = parsed.tenderId; initBidder = parsed.bidder }
    else { try { const sv = sessionStorage.getItem(VIEW_KEY); if (sv) initView = sv as View; const st = sessionStorage.getItem(TENDER_KEY); if (st) initTenderId = st; const sb = sessionStorage.getItem(BIDDER_KEY); if (sb) initBidder = sb } catch {} }
    setView(initView); if (initTenderId) setSelectedTenderId(initTenderId); if (initBidder) setSelectedBidder(initBidder)
    if (!window.location.hash || window.location.hash === '#') { window.history.replaceState({ view: initView, tenderId: initTenderId, bidder: initBidder }, '', viewToHash(initView, initTenderId, initBidder)) }
    setReady(true)
  }, [])

  useEffect(() => {
    const syncFromUrl = () => { const { view: v, tenderId, bidder } = hashToView(); setView(v); setSelectedTenderId(tenderId ?? null); setSelectedBidder(bidder ?? null); try { sessionStorage.setItem(VIEW_KEY, v); if (tenderId) sessionStorage.setItem(TENDER_KEY, tenderId); else sessionStorage.removeItem(TENDER_KEY); if (bidder) sessionStorage.setItem(BIDDER_KEY, bidder); else sessionStorage.removeItem(BIDDER_KEY) } catch {} }
    window.addEventListener('popstate', syncFromUrl); window.addEventListener('hashchange', syncFromUrl)
    return () => { window.removeEventListener('popstate', syncFromUrl); window.removeEventListener('hashchange', syncFromUrl) }
  }, [])

  useEffect(() => {
    if (!ready) return
    const publicViews: View[] = ['home', 'about', 'help', 'login', 'privacy', 'terms', 'accessibility']
    if (!user && !publicViews.includes(view)) { setView('home'); try { sessionStorage.setItem(VIEW_KEY, 'home'); sessionStorage.removeItem(TENDER_KEY); sessionStorage.removeItem(BIDDER_KEY) } catch {}; window.history.replaceState({ view: 'home' }, '', '#/') }
    else if (user && view === 'home') { setView('dashboard'); try { sessionStorage.setItem(VIEW_KEY, 'dashboard'); sessionStorage.removeItem(TENDER_KEY); sessionStorage.removeItem(BIDDER_KEY) } catch {}; window.history.replaceState({ view: 'dashboard' }, '', '#/dashboard') }
  }, [ready, user, view])

  const sessionValue = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut])
  if (!ready) return null

  return (
    <ErrorBoundary>
      <ToastProvider>
        <PageContent view={view} user={user} sessionValue={sessionValue} navigate={navigate} signIn={signIn} selectedTenderId={selectedTenderId} selectedBidder={selectedBidder} />
      </ToastProvider>
    </ErrorBoundary>
  )
}

// ---------------------------------------------------------------------------
// PageContent — view router
// ---------------------------------------------------------------------------

function PageContent({ view, user, sessionValue, navigate, signIn, selectedTenderId, selectedBidder }: {
  view: View; user: SessionUser | null; sessionValue: SessionContextValue
  navigate: (v: View, opts?: NavigateOptions) => void; signIn: (u: SessionUser) => void
  selectedTenderId: string | null; selectedBidder: string | null
}) {
  useKeyboardShortcuts(navigate)

  if (view === 'login') {
    return <SessionContext.Provider value={sessionValue}><Login navigate={navigate} signIn={signIn} /></SessionContext.Provider>
  }

  const officerViews = ['dashboard', 'workflow', 'w-tender', 'w-eval', 'w-auction', 'w-create', 'clarifications', 'tenders', 'tender', 'evaluation', 'compliance', 'documents', 'reports', 'audit', 'about', 'help', 'privacy', 'terms', 'accessibility']
  const sellerViews = ['dashboard', 'marketplace', 'w-tender', 'w-auction', 'my-bids', 'opportunities', 'compliance', 'documents', 'tenders', 'tender', 'about', 'help', 'support', 'privacy', 'terms', 'accessibility']

  if (user && ['dashboard', 'workflow', 'w-tender', 'w-eval', 'w-auction', 'w-create', 'clarifications', 'marketplace', 'tenders', 'tender', 'evaluation', 'compliance', 'documents', 'reports', 'audit', 'about', 'help', 'my-bids', 'opportunities', 'support', 'privacy', 'terms', 'accessibility'].includes(view)) {
    const allowed = user.type === 'officer' ? officerViews : sellerViews
    const gv = (allowed.includes(view) ? view : 'dashboard') as View
    return (
      <SessionContext.Provider value={sessionValue}>
        <AppShell view={gv} navigate={navigate}>
          <PageTransition view={gv}>
            {gv === 'dashboard' ? (user.type === 'officer' ? <OfficerDashboard navigate={navigate} userId={user.id} /> : <SellerDashboard navigate={navigate} userId={user.id} />)
              : gv === 'my-bids' && user.type === 'seller' ? <MyBids navigate={navigate} userId={user.id} />
              : gv === 'workflow' ? <WorkflowTenders navigate={navigate} />
              : gv === 'w-create' ? <CreateTender navigate={navigate} />
              : gv === 'w-tender' ? <WorkflowTenderDetail navigate={navigate} user={user} tenderId={selectedTenderId} />
              : gv === 'w-eval' ? <EvalDetailV2 navigate={navigate} tenderId={selectedTenderId} />
              : gv === 'w-auction' ? <AuctionRoom tenderId={selectedTenderId} />
              : gv === 'clarifications' ? <ClarificationCenter user={user} />
              : gv === 'marketplace' ? <Marketplace navigate={navigate} />
              : gv === 'audit' && user.type === 'officer' ? <AuditExplorer />
              : gv === 'tenders' ? <Tenders navigate={navigate} userId={user.id} />
              : gv === 'tender' ? <TenderDetail navigate={navigate} userId={user.id} tenderId={selectedTenderId} />
              : gv === 'evaluation' ? <Evaluation navigate={navigate} userId={user.id} tenderId={selectedTenderId} />
              : gv === 'compliance' ? <Compliance navigate={navigate} userId={user.id} tenderId={selectedTenderId} bidder={selectedBidder} />
              : <GenericPage view={gv} navigate={navigate} />}
          </PageTransition>
        </AppShell>
      </SessionContext.Provider>
    )
  }

  return (
    <SessionContext.Provider value={sessionValue}>
      <PageTransition view={view}>
        <div className="public-site">
          <PublicHeader view={view} navigate={navigate} />
          <main id="main-content">{view === 'home' ? <Home navigate={navigate} /> : <GenericPage view={view} navigate={navigate} />}</main>
          <PublicFooter navigate={navigate} />
        </div>
      </PageTransition>
    </SessionContext.Provider>
  )
}
