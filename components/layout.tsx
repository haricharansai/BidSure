'use client'

import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import {
  ArrowRight, BarChart3, Bell, BookOpen, ChevronRight, ClipboardCheck,
  Clock3, FileCheck2, FileSearch, FileText, Gavel, HelpCircle, History, LogOut, Menu,
  Search, Settings2, Users, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { View, NavigateOptions, SessionContextValue } from '@/components/types'
import { SessionContext } from '@/components/types'
import { useApi } from '@/components/hooks'
import { ThemeToggle } from '@/components/hooks'
import { Logo, StatusBadge } from '@/components/ui'
import { Highlight } from '@/components/ui'
import type { AttentionItem, Status, Tender, Bidder } from '@/lib/types'

// ---------------------------------------------------------------------------
// Public header (unauthenticated)
// ---------------------------------------------------------------------------

export function PublicHeader({ view, navigate }: { view: View; navigate: (v: View) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [fontSize, setFontSize] = useState(100)
  const go = (v: View) => { setMenuOpen(false); navigate(v) }
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])
  const adjustFontSize = useCallback((delta: number) => {
    setFontSize(prev => {
      const next = Math.min(150, Math.max(80, prev + delta))
      document.documentElement.style.fontSize = `${next}%`
      return next
    })
  }, [])
  const resetFontSize = useCallback(() => {
    setFontSize(100)
    document.documentElement.style.fontSize = '100%'
  }, [])
  return <>
    <div className="utility"><div><b>Government Procurement</b><span>•</span> Digital Verification Platform</div><div className="utility-links"><button type="button" className="text-button" onClick={() => { const el = document.getElementById('main-content'); if (el) el.scrollIntoView({ behavior: 'smooth' }) }}>Skip to main content</button><span>|</span><button type="button" className="text-button" onClick={() => adjustFontSize(-10)} aria-label="Decrease font size">A-</button><button type="button" className="text-button" onClick={resetFontSize} aria-label="Reset font size">A</button><button type="button" className="text-button" onClick={() => adjustFontSize(10)} aria-label="Increase font size">A+</button>          <ThemeToggle />
    </div></div>
    <header className="public-header">
      <Logo />
      <nav>
        <button className={view === 'home' ? 'active' : ''} aria-current={view === 'home' ? 'page' : undefined} onClick={() => navigate('home')}>Home</button>
        <button className={view === 'about' ? 'active' : ''} aria-current={view === 'about' ? 'page' : undefined} onClick={() => navigate('about')}>About</button>
        <button onClick={() => navigate('about')}>How It Works</button>
        <button className={view === 'help' ? 'active' : ''} aria-current={view === 'help' ? 'page' : undefined} onClick={() => navigate('help')}>Help</button>
      </nav>
      <div className="header-actions">
        <button className="icon-button" aria-label="Profile" onClick={() => navigate('login')}><span className="avatar">U</span></button>
        <button className="primary small" onClick={() => navigate('login')}>Login</button>
      </div>
      <button className="mobile-menu" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}><Menu /></button>
    </header>
    {menuOpen && (
      <div className="public-mobile-nav">
        <button className={view === 'home' ? 'active' : ''} onClick={() => go('home')}>Home <ChevronRight size={16} /></button>
        <button className={view === 'about' ? 'active' : ''} onClick={() => go('about')}>About <ChevronRight size={16} /></button>
        <button onClick={() => go('about')}>How It Works <ChevronRight size={16} /></button>
        <button className={view === 'help' ? 'active' : ''} onClick={() => go('help')}>Help <ChevronRight size={16} /></button>
        <button className="primary" onClick={() => go('login')}>Login</button>
      </div>
    )}
  </>
}

// ---------------------------------------------------------------------------
// Public footer
// ---------------------------------------------------------------------------

export function PublicFooter({ navigate }: { navigate: (v: View) => void }) {
  return (
    <footer className="public-footer">
      <div>
        <Logo compact />
        <p>© 2026 BidSure. All rights reserved.</p>
      </div>
      <div className="footer-links">
        <button type="button" onClick={() => navigate('about')}>About</button>
        <button type="button" onClick={() => navigate('help')}>Help</button>
        <button type="button" onClick={() => navigate('accessibility')}>Accessibility</button>
        <button type="button" onClick={() => navigate('privacy')}>Privacy</button>
        <button type="button" onClick={() => navigate('terms')}>Terms</button>
      </div>
      <p>For authorized government procurement users</p>
    </footer>
  )
}

// ---------------------------------------------------------------------------
// Notifications bell
// ---------------------------------------------------------------------------

export function NotificationsBell({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
  const { user } = useContext(SessionContext)
  const { data } = useApi<{ attention?: AttentionItem[]; deadlines?: AttentionItem[] }>(user ? `/api/data?resource=dashboard&userId=${encodeURIComponent(user.id)}` : null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const items = data?.attention ?? data?.deadlines ?? []
  const target: View = user?.type === 'seller' ? 'my-bids' : 'compliance'

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="notif" ref={ref}>
      <button className="icon-button" aria-label={`Notifications${items.length ? `, ${items.length} need attention` : ''}`} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Bell size={19} />
        {items.length > 0 && <span className="notif-badge">{items.length > 9 ? '9+' : items.length}</span>}
      </button>
      {open && (
        <div className="notif-popover" role="dialog" aria-label="Notifications">
          <div className="notif-head"><b>Notifications</b><span>{items.length ? `${items.length} need${items.length === 1 ? 's' : ''} attention` : 'Up to date'}</span></div>
          <div className="notif-list">
            {items.length === 0
              ? <div className="notif-empty">You&apos;re all caught up.</div>
              : items.map(it => <button className="notif-item" key={`${it.title}-${it.detail}`} onClick={() => { setOpen(false); navigate(target) }}><span className="attention-icon">!</span><span><b>{it.title}</b><small>{it.detail}</small></span></button>)}
          </div>
          {items.length > 0 && <div className="notif-foot"><button className="text-button" onClick={() => { setOpen(false); navigate('dashboard') }}>View all in dashboard <ArrowRight size={14} /></button></div>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// App shell (authenticated layout)
// ---------------------------------------------------------------------------

type NavGroup = [string, [View, string, LucideIcon][]]

export function AppShell({ view, navigate, children }: { view: View; navigate: (v: View, o?: NavigateOptions) => void; children: React.ReactNode }) {
  const { user, signOut } = useContext(SessionContext)
  const [sideOpen, setSideOpen] = useState(false)
  const closeSide = () => setSideOpen(false)
  const viewLabels: Partial<Record<View, string>> = {
    dashboard: 'Dashboard', tenders: 'Tenders', tender: 'Tender detail',
    evaluation: 'Bid evaluation', compliance: 'Bidder compliance',
    documents: 'Documents', reports: 'Reports', audit: 'Audit explorer',
    'my-bids': 'My bids', opportunities: 'Opportunities', support: 'Support',
    workflow: 'GeM workflow', 'w-tender': 'Workflow tender', 'w-eval': 'Evaluation & award',
    'w-auction': 'Live auction', 'w-create': 'Create tender', clarifications: 'Clarifications',
    marketplace: 'GeM marketplace', about: 'About', help: 'Help',
  }
  const officerNav: NavGroup[] = [
    ['Overview', [['dashboard', 'Dashboard', BarChart3]]],
    ['GeM Workflow', [['workflow', 'Workflow Tenders', Gavel], ['w-create', 'Create Tender', FileText]]],
    ['Verification', [['tenders', 'Tenders', FileText], ['evaluation', 'Bid Evaluation', ClipboardCheck], ['compliance', 'Bidder Compliance', Users], ['documents', 'Document Verification', FileCheck2]]],
    ['Records', [['reports', 'Reports', BookOpen], ['audit', 'Audit Explorer', History]]],
  ]
  const sellerNav: NavGroup[] = [
    ['Overview', [['dashboard', 'Dashboard', BarChart3]]],
    ['Marketplace', [['marketplace', 'GeM Marketplace', Search], ['opportunities', 'Tender Opportunities', Search]]],
    ['Bidding', [['my-bids', 'My Bids', FileText]]],
    ['Compliance', [['compliance', 'Compliance Status', Users]]],
    ['Support', [['support', 'Support', HelpCircle]]],
  ]
  const nav = user?.type === 'officer' ? officerNav : sellerNav
  const handleSignOut = () => { signOut(); navigate('home') }
  return (
    <div className={`app-shell${sideOpen ? ' sidebar-open' : ''}`}>
      <div className={`nav-backdrop${sideOpen ? ' open' : ''}`} onClick={closeSide} aria-hidden="true" />
      <aside className={sideOpen ? 'open' : ''}>
        <div className="side-top">
          <Logo compact />
        </div>
        <nav className="side-nav">
          {nav.map(([group, items]) => (
            <div className="nav-group" key={group}>
              <span className="nav-group-label">{group}</span>
              {items.map(([id, label, Icon]) => (
                <button key={id} className={view === id ? 'selected' : ''} onClick={() => { navigate(id); closeSide() }}>
                  <Icon size={18} /><span className="nav-label">{label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-bottom">
          <button className="account-trigger" type="button"><Settings2 size={17} /><span className="acc-info"><b>Settings</b></span></button>
          <button className="account-trigger" type="button" onClick={handleSignOut}><LogOut size={17} /><span className="acc-info"><b>Sign out</b></span></button>
        </div>
      </aside>
      <main className="app-main">
        <div className="app-top">
          <button className="mobile-menu" aria-label="Open navigation" onClick={() => setSideOpen(o => !o)}><Menu /></button>
          <div className="breadcrumbs">
            <button className="crumb-home" onClick={() => navigate('dashboard')}>BidSure</button>
            <ChevronRight size={14} />
            <b>{viewLabels[view] ?? 'Dashboard'}</b>
          </div>
          <div className="top-actions">
            <ThemeToggle />
            <NotificationsBell navigate={navigate} />
            <span className="avatar">{user?.initials}</span>
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page frame
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tender table (shared by officer dashboard, tenders list, etc.)
// ---------------------------------------------------------------------------

export function TenderTable({ rows, navigate, query = '' }: { rows: Tender[]; navigate: (v: View, o?: NavigateOptions) => void; query?: string }) {
  return (
    <>
      <div className="table-wrap">
        <table><thead><tr><th>Tender reference</th><th>Title</th><th>Deadline</th><th>Bidders</th><th>Status</th><th /></tr></thead><tbody>{rows.map(t => <tr key={t.id} onClick={() => navigate('tender', { tenderId: t.id })}><td><b className="linkish">{t.id}</b><small>{t.agency}</small></td><td><Highlight text={t.title} query={query} /></td><td><Clock3 size={14} />{t.deadline}</td><td>{t.biddersCount}</td><td><StatusBadge status={t.status} /></td><td><ChevronRight size={17} /></td></tr>)}</tbody></table>
      </div>
      <div className="mobile-cards">
        {rows.map(t => (
          <button key={t.id} className="mobile-card" onClick={() => navigate('tender', { tenderId: t.id })}>
            <div className="mobile-card-head">
              <b className="linkish">{t.id}</b>
              <StatusBadge status={t.status} />
            </div>
            <p className="mobile-card-title"><Highlight text={t.title} query={query} /></p>
            <div className="mobile-card-meta">
              <span><Clock3 size={12} /> {t.deadline}</span>
              <span><Users size={12} /> {t.biddersCount} bidders</span>
            </div>
            <div className="mobile-card-footer"><small>{t.agency}</small><ChevronRight size={16} /></div>
          </button>
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Bidder table
// ---------------------------------------------------------------------------

export function BidderTable({ navigate, rows }: { navigate: (v: View, o?: NavigateOptions) => void; rows: Bidder[] }) {
  return (
    <div className="table-wrap">
      <table><thead><tr><th>Bidder</th><th>Registration</th><th>Documents</th><th>Risk</th><th>Status</th><th /></tr></thead><tbody>{rows.map(b => <tr key={b.name} onClick={() => navigate('compliance', { bidder: b.name })}><td><b>{b.name}</b></td><td>{b.reg}</td><td>{b.docsSubmitted} / {b.docsTotal}</td><td><span className={`risk risk-${b.risk.toLowerCase()}`}>{b.risk}</span></td><td><StatusBadge status={b.status} /></td><td><ChevronRight size={17} /></td></tr>)}</tbody></table>
    </div>
  )
}

export function PageFrame({ title, subtitle, children, role = 'officer', actions, eyebrow }: {
  title: string; subtitle: string; children: React.ReactNode; role?: 'officer' | 'seller'; actions?: React.ReactNode; eyebrow?: string
}) {
  return (
    <div className="page-content">
      <div className="page-title">
        <div>
          <p className="eyebrow">{eyebrow ?? (role === 'seller' ? 'SELLER WORKSPACE' : 'OFFICER WORKSPACE')}</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="page-actions">{actions}</div>
      </div>
      {children}
    </div>
  )
}
