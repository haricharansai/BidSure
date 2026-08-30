'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowRight, ArrowUpRight, BadgeCheck, Ban, BarChart3, Bell, BookOpen, Building2, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ClipboardCheck, Clock3, Download, Eye, FileCheck2, FileSearch, FileText, Fingerprint, Gavel, Hash, HelpCircle, History, Info,
  LockKeyhole, LogIn, LogOut, Mail, MapPin, Menu, MessagesSquare, Moon, Phone, RefreshCw, RotateCcw, ScrollText, Search, Settings2, ShieldCheck,
  SlidersHorizontal, Sun, Timer, UserRound, Users, Wallet, X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ApiError, apiFetch, storeToken } from '@/lib/api'
import { DEFAULT_DOC_TEMPLATES, TENDER_TYPE_CONFIG } from '@/lib/tender-config'
import type {
  AttentionItem, AuditData, AuctionState, Bidder, ComplianceData, EvaluationData, EvaluationDetailData,
  MarketplaceTender, OfficerDashboardData, SellerDashboardData, SellerSubmissionRow,
  SessionUser, Status, Tender, TenderDetailData, TenderDetailV2, TenderDetailV2 as TDV,
  EvaluationDetailData as EvalV2, OfficerTenderRow, EvaluationRow,
} from '@/lib/types'
import type { DocStatus6 } from '@/lib/types'

type View = 'home' | 'about' | 'help' | 'login' | 'dashboard' | 'tenders' | 'tender' | 'evaluation' | 'compliance' | 'documents' | 'reports' | 'audit' | 'my-bids' | 'opportunities' | 'support' | 'workflow' | 'w-tender' | 'w-eval' | 'w-auction' | 'w-create' | 'clarifications' | 'marketplace'

interface SessionContextValue {
  user: SessionUser | null
  signIn: (user: SessionUser) => void
  signOut: () => void
}

const SESSION_KEY = 'bidsure.session'
const SessionContext = createContext<SessionContextValue>({ user: null, signIn: () => {}, signOut: () => {} })

function useApi<T>(url: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    setData(null)
    setError(null)
    apiFetch<T>(url)
      .then(d => { if (!cancelled) setData(d) })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Something went wrong')
      })
    return () => { cancelled = true }
  }, [url, nonce])

  useEffect(() => {
    if (!url || !pollMs) return
    const id = window.setInterval(() => setNonce(n => n + 1), pollMs)
    return () => window.clearInterval(id)
  }, [url, pollMs])

  const retry = useCallback(() => setNonce(n => n + 1), [])
  return { data, error, retry, refresh: retry }
}

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    const read = () => setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    read()
    window.addEventListener('bs-theme-change', read)
    return () => window.removeEventListener('bs-theme-change', read)
  }, [])
  const toggle = useCallback(() => {
    const el = document.documentElement
    const next = el.classList.contains('dark') ? 'light' : 'dark'
    el.classList.toggle('dark', next === 'dark')
    el.style.colorScheme = next
    try { localStorage.setItem('bidsure.theme', next) } catch {}
    window.dispatchEvent(new Event('bs-theme-change'))
  }, [])
  return { theme, mounted, toggle }
}

function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, mounted, toggle } = useTheme()
  const isDark = mounted && theme === 'dark'
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggle}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title="Toggle light / dark"
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  )
}

function PanelSkeleton() {
  return (
    <section className="panel" aria-hidden="true">
      <div className="skeleton sk-title" />
      {[0, 1, 2, 3, 4].map(i => (
        <div className="sk-row" key={i}>
          <div className="skeleton sk-avatar" />
          <div className="sk-grow">
            <div className="skeleton sk-line" style={{ width: '55%' }} />
            <div className="skeleton sk-line" style={{ width: '30%', marginTop: 8 }} />
          </div>
          <div className="skeleton sk-line" style={{ width: 72, height: 22 }} />
        </div>
      ))}
    </section>
  )
}

function LoadingPanel(label = 'Loading your data…') {
  return (
    <div className="page-content" role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="skeleton sk-title" aria-hidden="true" />
      <div className="sk-stats" aria-hidden="true">
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton sk-stat" />)}
      </div>
      <PanelSkeleton />
    </div>
  )
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <section className="panel">
      <div className="error-panel" role="alert">
        <span className="error-icon"><AlertTriangle size={26} /></span>
        <b>Something went wrong</b>
        <p>{message}</p>
        {onRetry && <button className="secondary" onClick={onRetry}><RotateCcw size={15} /> Try again</button>}
      </div>
    </section>
  )
}

type AlertVariant = 'info' | 'success' | 'warning' | 'danger'

function Alert({ variant = 'info', title, children }: { variant?: AlertVariant; title?: string; children: React.ReactNode }) {
  const Icon = variant === 'success' ? CheckCircle2 : variant === 'info' ? Info : AlertTriangle
  return (
    <div className={`alert alert-${variant}`} role={variant === 'danger' ? 'alert' : undefined}>
      <Icon size={16} />
      <div>{title && <b>{title}</b>}<span>{children}</span></div>
    </div>
  )
}

function Modal({ title, subtitle, onClose, children, footer, size }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'lg' }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  const sizeClass = size === 'sm' ? 'modal-sm' : size === 'lg' ? 'modal-lg' : ''
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className={`modal ${sizeClass}`.trim()} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="brand-mark"><ShieldCheck size={compact ? 22 : 28} strokeWidth={1.7} /></span><span><strong>BidSure</strong>{!compact && <small>Bid Compliance Verification Platform</small>}</span></div>
}

function StatusBadge({ status }: { status: Status }) {
  const Icon = status === 'Verified' || status === 'Complete' ? Check : status === 'Exception' ? AlertTriangle : status === 'In Review' ? RefreshCw : Clock3
  return <span className={`status status-${status.toLowerCase().replace(' ', '-')}`}><Icon size={12} />{status}</span>
}

function PublicHeader({ view, navigate }: { view: View; navigate: (v: View) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const go = (v: View) => { setMenuOpen(false); navigate(v) }
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])
  return <>
    <div className="utility"><div><b>Government Procurement</b><span>•</span> Digital Verification Platform</div><div className="utility-links"><span>Skip to main content</span><span>|</span><span>A-</span><span>A</span><span>A+</span><ThemeToggle /><span>English⌄</span></div></div>
    <header className="public-header">
      <Logo />
      <nav>
        <button className={view === 'home' ? 'active' : ''} aria-current={view === 'home' ? 'page' : undefined} onClick={() => navigate('home')}>Home</button>
        <button className={view === 'about' ? 'active' : ''} aria-current={view === 'about' ? 'page' : undefined} onClick={() => navigate('about')}>About</button>
        <button onClick={() => navigate('about')}>How It Works</button>
        <button className={view === 'help' ? 'active' : ''} aria-current={view === 'help' ? 'page' : undefined} onClick={() => navigate('help')}>Help</button>
      </nav>
      <div className="header-actions">
        <button className="icon-button" aria-label="Profile"><UserRound size={19} /></button>
        <button className="language">◎ &nbsp; English⌄</button>
        <button className="primary small" onClick={() => navigate('login')}><LockKeyhole size={16} /> Login</button>
      </div>
      <button className="mobile-menu" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}><Menu /></button>
    </header>
    {menuOpen && (
      <div className="public-mobile-nav">
        <button className={view === 'home' ? 'active' : ''} onClick={() => go('home')}>Home <ChevronRight size={16} /></button>
        <button className={view === 'about' ? 'active' : ''} onClick={() => go('about')}>About <ChevronRight size={16} /></button>
        <button onClick={() => go('about')}>How It Works <ChevronRight size={16} /></button>
        <button className={view === 'help' ? 'active' : ''} onClick={() => go('help')}>Help <ChevronRight size={16} /></button>
        <button className="primary" onClick={() => go('login')}><LockKeyhole size={16} /> Login</button>
      </div>
    )}
  </>
}

function PublicFooter() { return <footer className="public-footer"><div><Logo compact /><p>© 2026 BidSure. All rights reserved.</p></div><div className="footer-links"><span>About</span><span>Help</span><span>Accessibility</span><span>Privacy</span><span>Terms</span></div><p>For authorized government procurement users</p></footer> }

function Home({ navigate }: { navigate: (v: View) => void }) {
  return <><section className="hero"><div className="hero-copy"><p className="eyebrow">DIGITAL PROCUREMENT ASSURANCE</p><h1>Simplifying Bid<br /><em>Compliance Verification</em></h1><p className="lede">An integrated platform for verifying bidder credentials, documents and tender requirements through transparent, evidence-based compliance checks.</p><div className="button-row"><button className="primary relative group" onClick={() => navigate('login')}>
<LockKeyhole size={18} /> Login
<span className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-40 rounded-md bg-navy px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
<span className="block">Officer&apos;s Login</span>
<span className="block mt-1">Seller&apos;s Login</span>
</span>
</button><button className="secondary" onClick={() => navigate('about')}><span className="play">▶</span> How It Works</button></div><div className="hero-trust"><div><ShieldCheck size={16} /> Government-grade security</div><div><FileCheck2 size={16} /> Evidence-based checks</div><div><History size={16} /> Full audit trail</div></div></div><ProcessGraphic /></section><section className="pillars"><h2>One platform for structured bid verification</h2><div className="pillar-grid"><Pillar icon={<FileSearch />} title="Requirement Analysis" text="Identify eligibility and compliance requirements from tender documents." /><Pillar icon={<FileCheck2 />} title="Bid Verification" text="Verify bidder information and submitted documents against available authorized verification sources." /><Pillar icon={<ShieldCheck />} title="Evidence-Based Review" text="Highlight missing information, inconsistencies and exceptions for procurement officers." /></div></section><section className="capabilities"><h2>Built for transparent procurement verification</h2><div className="cap-grid">{([
    [<BadgeCheck />, 'Bidder identity & registration verification'],
    [<FileCheck2 />, 'Document completeness and consistency'],
    [<Wallet />, 'Financial & experience eligibility'],
    [<Settings2 />, 'OEM and technical compliance'],
    [<MapPin />, 'Local-content requirements'],
    [<Ban />, 'Blacklisting/debarment checks'],
    [<ScrollText />, 'Evidence and audit trail'],
  ] as [React.ReactNode, string][]).map(([icon, t]) => <div className="cap" key={t}><span>{icon}</span><b>{t}</b></div>)}</div></section></>
}

function ProcessGraphic() { const steps: [string, React.ReactNode, string][] = [['Tender Requirements', <FileText />, 'Eligibility criteria, technical specifications, and terms'],['Bid Documents', <FileSearch />, 'Documents submitted by bidders for evaluation'],['Verification', <ShieldCheck />, 'Information verified against authorized sources'],['Compliance Review', <BadgeCheck />, 'Exceptions highlighted for procurement officer review']]; return <div className="process">{steps.map(([title, icon, text], i) => <div className="process-step" key={title as string}><b>{title}</b><div className={`doc doc-${i}`}><span>{icon}</span><i /><i /><i /><i /></div><p>{text}</p>{i < 3 && <ChevronRight className="step-arrow" />}</div>)}</div> }

function Pillar({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="pillar"><div className="circle-icon">{icon}</div><div><h3>{title}</h3><p>{text}</p></div></div> }

function Field({ label, icon, ...props }: { label: string; icon?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      {label}
      <span className="input-wrap">{icon}<input {...props} /></span>
    </label>
  )
}

function Login({ navigate, signIn }: { navigate: (v: View) => void; signIn: (user: SessionUser) => void }) {
  const [loginType, setLoginType] = useState<'officer' | 'seller'>('seller')
  const [registerMode, setRegisterMode] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ref = document.referrer
    if (ref && !ref.includes('bid-sure')) {
      sessionStorage.setItem('returnAfterLogin', ref)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const form = new FormData(e.currentTarget)
    try {
      const result = await apiFetch<{ success: boolean; token: string; user: { id: string; role: 'OFFICER' | 'SELLER'; name: string; subtitle: string; initials: string; email: string } }>('/api/auth', {
        method: 'POST',
        body: {
          mode: registerMode ? 'register' : 'login',
          type: loginType,
          name: String(form.get('name') || ''),
          email: String(form.get('email') || ''),
          password: String(form.get('password') || ''),
          department: String(form.get('department') || ''),
          employeeId: String(form.get('employeeId') || ''),
          companyName: String(form.get('companyName') || ''),
          gstin: String(form.get('gstin') || ''),
          pan: String(form.get('pan') || ''),
        },
      })
      storeToken(result.token)
      signIn({
        id: result.user.id,
        type: result.user.role === 'OFFICER' ? 'officer' : 'seller',
        name: result.user.name,
        subtitle: result.user.subtitle,
        initials: result.user.initials,
        email: result.user.email,
      })
      sessionStorage.removeItem('returnAfterLogin')
      navigate('dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in right now')
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-theme"><ThemeToggle /></div>
      <div className="login-card">
        <div className="login-intro">
          <Logo />
          <p className="eyebrow">AUTHORIZED ACCESS</p>
          <h1>{loginType === 'officer' ? 'Officer portal' : 'Seller portal'}</h1>
          <p>
            {loginType === 'officer'
              ? 'Sign in to manage tenders, verify bidder submissions, and complete compliance reviews.'
              : 'Sign in to submit bids, track tender status, and manage your compliance documents.'}
          </p>
          <div className="secure-note">
            <ShieldCheck size={20} />
            <span>
              <b>Secure government service</b>
              <small>Your session is protected with end-to-end encryption.</small>
            </span>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="login-type-toggle">
            <button type="button" className={loginType === 'seller' ? 'active' : ''} onClick={() => setLoginType('seller')}>Seller Login</button>
            <button type="button" className={loginType === 'officer' ? 'active' : ''} onClick={() => setLoginType('officer')}>Officer Login</button>
          </div>
          {loginType === 'officer' ? (
            registerMode ? (
              <>
                <Field label="Full name" icon={<UserRound size={16} />} type="text" name="name" placeholder="Enter your full name" required />
                <Field label="Official email address" icon={<Mail size={16} />} type="email" name="email" placeholder="name@department.gov" required />
                <Field label="Password" icon={<LockKeyhole size={16} />} type="password" name="password" placeholder="Choose a password" required />
                <Field label="Department" icon={<Building2 size={16} />} type="text" name="department" placeholder="e.g. Ministry of Digital Transformation" required />
                <Field label="Employee ID" icon={<Fingerprint size={16} />} type="text" name="employeeId" placeholder="e.g. EMP-2024-00142" required />
              </>
            ) : (
              <>
                <Field label="Official email address" icon={<Mail size={16} />} type="email" name="email" placeholder="name@department.gov" required />
                <Field label="Password" icon={<LockKeyhole size={16} />} type="password" name="password" placeholder="Enter your password" required />
                <Field label="Department" icon={<Building2 size={16} />} type="text" name="department" placeholder="e.g. Ministry of Digital Transformation" required />
                <Field label="Employee ID" icon={<Fingerprint size={16} />} type="text" name="employeeId" placeholder="e.g. EMP-2024-00142" required />
              </>
            )
          ) : registerMode ? (
            <>
              <Field label="Business email address" icon={<Mail size={16} />} type="email" name="email" placeholder="contact@company.com" required />
              <Field label="Password" icon={<LockKeyhole size={16} />} type="password" name="password" placeholder="Choose a password" required />
              <Field label="Company Name" icon={<Building2 size={16} />} type="text" name="companyName" placeholder="e.g. Nexora Systems Pvt. Ltd." required />
              <Field label="GSTIN (optional)" icon={<Hash size={16} />} type="text" name="gstin" placeholder="e.g. 07AAECN1234E1ZP" />
              <Field label="PAN (optional)" icon={<Hash size={16} />} type="text" name="pan" placeholder="e.g. AAECN1234E" />
            </>
          ) : (
            <>
              <Field label="Business email address" icon={<Mail size={16} />} type="email" name="email" placeholder="contact@company.com" required />
              <Field label="Password" icon={<LockKeyhole size={16} />} type="password" name="password" placeholder="Enter your password" required />
            </>
          )}
          <div className="form-line">
            <label className="check">
              <input type="checkbox" /> Remember me
            </label>
            <button type="button" className="text-button" onClick={() => { setRegisterMode(r => !r); setError(null) }}>
              {registerMode 
                ? 'Have an account? Sign in' 
                : (loginType === 'seller' ? 'New seller? Register your company' : 'New officer? Register')}
            </button>
          </div>
          {error && <Alert variant="danger">{error}</Alert>}
          <button className="primary wide" type="submit" disabled={submitting}>
            <LogIn size={18} /> {submitting ? 'Please wait…' : registerMode ? 'Register & sign in' : loginType === 'officer' ? 'Sign in to portal' : 'Sign in as seller'}
          </button>
          <button type="button" className="back-link" onClick={() => navigate('home')}>
            ← Return to BidSure home
          </button>
        </form>
      </div>
    </main>
  )
}

interface NavigateOptions { tenderId?: string; bidder?: string }

type NavGroup = [string, [View, string, LucideIcon][]]

function AppShell({ view, navigate, children }: { view: View; navigate: (v: View, o?: NavigateOptions) => void; children: React.ReactNode }) {
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
    ['Verification', [['tenders', 'Tenders', FileText], ['evaluation', 'Bid Evaluation', ClipboardCheck], ['compliance', 'Bidder Compliance', Users], ['documents', 'Document Verification', FileCheck2]]],
    ['Records', [['reports', 'Reports', BookOpen], ['audit', 'Audit Explorer', History]]],
  ]
  const sellerNav: NavGroup[] = [
    ['Overview', [['dashboard', 'Dashboard', BarChart3]]],
    ['Marketplace', [['marketplace', 'GeM Marketplace', Search], ['opportunities', 'Tender Opportunities', Search]]],
    ['Bidding', [['my-bids', 'My Bids', FileText], ['clarifications', 'Clarifications', MessagesSquare]]],
    ['Compliance', [['compliance', 'Compliance Status', Users], ['documents', 'Documents', FileCheck2]]],
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

function Stat({ label, value, change, icon, warn, danger, onClick }: { label: string; value: string; change: string; icon: React.ReactNode; warn?: boolean; danger?: boolean; onClick?: () => void }) {
  const cls = `stat${danger ? ' is-danger' : warn ? ' is-warn' : ''}${onClick ? ' clickable' : ''}`
  const inner = (
    <>
      <div className={`stat-icon ${warn ? 'warn' : ''} ${danger ? 'danger' : ''}`}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={danger ? 'red' : ''}>{change}</small>
      {onClick && <ArrowUpRight className="stat-go" size={16} />}
    </>
  )
  return onClick
    ? <button type="button" className={cls} onClick={onClick} aria-label={`${label}: ${value}. View details`}>{inner}</button>
    : <div className={cls}>{inner}</div>
}

function Bars({ points }: { points: { label: string; value: number }[] }) {
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
            <div key={p.label} title={`${p.label}: ${p.value}`}>
              <span className={i === points.length - 1 ? 'is-latest' : ''} style={{ height: `${(p.value / niceMax) * 100}%` }}><b>{p.value}</b></span>
            </div>
          ))}
        </div>
      </div>
      <div className="chart-labels">{points.map(p => <small key={p.label}>{p.label}</small>)}</div>
      <div className="chart-legend"><span><i className="bar" /> Value</span><span><i className="avg" /> Average ({avg})</span></div>
    </div>
  )
}

function AttentionList({ items, onSelect }: { items: AttentionItem[]; onSelect?: () => void }) {
  return <>{items.map(item => <button className="attention-row" key={`${item.title}-${item.detail}`} onClick={onSelect}><span className="attention-icon">!</span><span><b>{item.title}</b><small>{item.detail}</small></span><StatusBadge status={item.status} /></button>)}</>
}

function NotificationsBell({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
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

function PageFrame({ title, subtitle, children, role = 'officer', actions, eyebrow }: {title:string;subtitle:string;children:React.ReactNode;role?:SessionUser['type'];actions?:React.ReactNode;eyebrow?:string}) { return <div className="page-content"><div className="page-title"><div><p className="eyebrow">{eyebrow ?? (role === 'seller' ? 'SELLER WORKSPACE' : 'OFFICER WORKSPACE')}</p><h1>{title}</h1><p>{subtitle}</p></div><div className="page-actions">{actions !== undefined ? actions : <button className="primary"><Download size={16} /> Export report</button>}</div></div>{children}</div> }

function TenderTable({ rows, navigate }: { rows: Tender[]; navigate: (v: View, o?: NavigateOptions) => void }) { return <div className="table-wrap"><table><thead><tr><th>Tender reference</th><th>Title</th><th>Deadline</th><th>Bidders</th><th>Status</th><th /></tr></thead><tbody>{rows.map(t => <tr key={t.id} onClick={() => navigate('tender', { tenderId: t.id })}><td><b className="linkish">{t.id}</b><small>{t.agency}</small></td><td>{t.title}</td><td><Clock3 size={14} />{t.deadline}</td><td>{t.biddersCount}</td><td><StatusBadge status={t.status} /></td><td><ChevronRight size={17} /></td></tr>)}</tbody></table></div> }

function BidderTable({ navigate, rows }: {navigate:(v:View,o?:NavigateOptions)=>void;rows:Bidder[]}) { return <div className="table-wrap"><table><thead><tr><th>Bidder</th><th>Registration</th><th>Documents</th><th>Risk</th><th>Status</th><th /></tr></thead><tbody>{rows.map(b=><tr key={b.name} onClick={()=>navigate('compliance', { bidder: b.name })}><td><b>{b.name}</b></td><td>{b.reg}</td><td>{b.docsSubmitted} / {b.docsTotal}</td><td><span className={`risk risk-${b.risk.toLowerCase()}`}>{b.risk}</span></td><td><StatusBadge status={b.status}/></td><td><ChevronRight size={17}/></td></tr>)}</tbody></table></div> }

function OfficerDashboard({ navigate, userId }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string }) {
  const { data, error, retry } = useApi<OfficerDashboardData>(`/api/data?resource=dashboard&userId=${encodeURIComponent(userId)}`)
  const [weeks, setWeeks] = useState(12)
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const statTarget = (label: string): View => label.startsWith('Active') ? 'tenders' : label.startsWith('Bids') ? 'evaluation' : label.startsWith('Exceptions') ? 'compliance' : 'documents'
  return <PageFrame title={`Good morning, ${data.firstName}`} subtitle="Here is what needs your attention today." actions={<><button className="secondary"><Download size={16} /> Export</button><button className="primary" onClick={() => navigate('tenders')}><FileText size={16} /> Review tenders</button></>}>
    <div className="stats">
      {data.stats.map(s => <Stat key={s.label} label={s.label} value={s.value} change={s.change} icon={s.label.startsWith('Bids') ? <ClipboardCheck /> : s.label.startsWith('Exceptions') ? <ShieldCheck /> : s.label.startsWith('Documents') ? <BadgeCheck /> : <FileText />} warn={s.tone === 'warn'} danger={s.tone === 'danger'} onClick={() => navigate(statTarget(s.label))} />)}
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

function SellerDashboard({ navigate, userId }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string }) {
  const { data, error, retry } = useApi<SellerDashboardData>(`/api/data?resource=dashboard&userId=${encodeURIComponent(userId)}`)
  const [months, setMonths] = useState(12)
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const statTarget = (label: string): View => label.startsWith('Open') ? 'opportunities' : label.startsWith('Documents') ? 'documents' : 'my-bids'
  return <PageFrame title={`Welcome back, ${data.companyName}`} subtitle="Track your bids and discover new opportunities." role="seller" actions={<><button className="secondary"><Download size={16} /> Export</button><button className="primary" onClick={() => navigate('opportunities')}><Search size={16} /> Find opportunities</button></>}>
    <div className="stats">
      {data.stats.map(s => <Stat key={s.label} label={s.label} value={s.value} change={s.change} icon={s.label.startsWith('Win rate') ? <BarChart3 /> : s.label.startsWith('Documents') ? <BadgeCheck /> : s.label.startsWith('Open opportunities') ? <Search /> : <FileText />} warn={s.tone === 'warn'} danger={s.tone === 'danger'} onClick={() => navigate(statTarget(s.label))} />)}
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

const TENDERS_PAGE_SIZE = 8

function Tenders({ navigate, userId }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string }) {
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

  const agencies = useMemo(() => {
    const list = Array.from(new Set(allTenders.map(t => t.agency).filter(Boolean))).sort()
    return list
  }, [allTenders])

  const evalMethods = useMemo(() => {
    const list = Array.from(new Set(allTenders.map(t => t.evaluationMethod).filter(Boolean))).sort()
    return list
  }, [allTenders])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: allTenders.length, Verified: 0, 'In Review': 0, Pending: 0, Exception: 0, Complete: 0 }
    allTenders.forEach(t => {
      if (counts[t.status] !== undefined) counts[t.status]++
    })
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
    setQuery('')
    setStatusFilter('ALL')
    setAgencyFilter('ALL')
    setEvalMethodFilter('ALL')
    setBiddersFilter('ALL')
    setSortBy('newest')
    setPage(1)
  }, [])

  const filtered = useMemo(() => {
    return allTenders.filter(t => {
      // Query filter
      if (query.trim()) {
        const q = query.toLowerCase()
        const text = `${t.id} ${t.title} ${t.agency} ${t.value} ${t.evaluationMethod} ${t.status}`.toLowerCase()
        if (!text.includes(q)) return false
      }
      // Status filter
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false
      // Agency filter
      if (agencyFilter !== 'ALL' && t.agency !== agencyFilter) return false
      // Evaluation method filter
      if (evalMethodFilter !== 'ALL' && t.evaluationMethod !== evalMethodFilter) return false
      // Bidders count filter
      if (biddersFilter === '0' && t.biddersCount !== 0) return false
      if (biddersFilter === '1+' && t.biddersCount < 1) return false
      if (biddersFilter === '3+' && t.biddersCount < 3) return false
      if (biddersFilter === '5+' && t.biddersCount < 5) return false

      return true
    }).sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.published).getTime() - new Date(b.published).getTime()
      }
      if (sortBy === 'deadline-soon') {
        return new Date(a.deadlineISO).getTime() - new Date(b.deadlineISO).getTime()
      }
      if (sortBy === 'bidders-high') {
        return b.biddersCount - a.biddersCount
      }
      if (sortBy === 'value-high') {
        const valA = parseFloat(a.value.replace(/[^0-9.]/g, '')) || 0
        const valB = parseFloat(b.value.replace(/[^0-9.]/g, '')) || 0
        return valB - valA
      }
      if (sortBy === 'value-low') {
        const valA = parseFloat(a.value.replace(/[^0-9.]/g, '')) || 0
        const valB = parseFloat(b.value.replace(/[^0-9.]/g, '')) || 0
        return valA - valB
      }
      if (sortBy === 'checks-progress') {
        const progA = a.checksComplete / Math.max(a.checksTotal, 1)
        const progB = b.checksComplete / Math.max(b.checksTotal, 1)
        return progB - progA
      }
      // default: newest
      return new Date(b.deadlineISO).getTime() - new Date(a.deadlineISO).getTime()
    })
  }, [allTenders, query, statusFilter, agencyFilter, evalMethodFilter, biddersFilter, sortBy])

  useEffect(() => { setPage(1) }, [query, statusFilter, agencyFilter, evalMethodFilter, biddersFilter, sortBy])

  const totalPages = Math.max(1, Math.ceil(filtered.length / TENDERS_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * TENDERS_PAGE_SIZE, currentPage * TENDERS_PAGE_SIZE)

  return (
    <PageFrame
      title="Tenders"
      subtitle="Manage procurement opportunities, review compliance, and track bidder submissions."
      actions={null}
    >
      <div className="toolbar">
        <div className="search">
          <Search size={17} />
          <input
            placeholder="Search tenders by reference, title, or agency"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="icon-button"
              style={{ padding: 2, marginRight: -4 }}
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          type="button"
          className={`filter ${filterOpen || activeFilterCount > 0 ? 'active' : ''}`}
          onClick={() => setFilterOpen(o => !o)}
          aria-expanded={filterOpen}
        >
          <SlidersHorizontal size={16} /> Filters {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
        </button>
        <button className="primary" onClick={() => navigate('w-create')}>
          <FileText size={16} /> New tender
        </button>
      </div>

      {/* Quick Status Filter Tabs */}
      <div className="filter-pills" role="tablist" aria-label="Filter tenders by status">
        <button
          type="button"
          className={`filter-pill ${statusFilter === 'ALL' ? 'active' : ''}`}
          onClick={() => setStatusFilter('ALL')}
        >
          All <span className="pill-count">{statusCounts.ALL}</span>
        </button>
        <button
          type="button"
          className={`filter-pill ${statusFilter === 'Verified' ? 'active' : ''}`}
          onClick={() => setStatusFilter('Verified')}
        >
          Verified <span className="pill-count">{statusCounts.Verified}</span>
        </button>
        <button
          type="button"
          className={`filter-pill ${statusFilter === 'In Review' ? 'active' : ''}`}
          onClick={() => setStatusFilter('In Review')}
        >
          In Review <span className="pill-count">{statusCounts['In Review']}</span>
        </button>
        <button
          type="button"
          className={`filter-pill ${statusFilter === 'Pending' ? 'active' : ''}`}
          onClick={() => setStatusFilter('Pending')}
        >
          Pending <span className="pill-count">{statusCounts.Pending}</span>
        </button>
        <button
          type="button"
          className={`filter-pill ${statusFilter === 'Exception' ? 'active' : ''}`}
          onClick={() => setStatusFilter('Exception')}
        >
          Exception <span className="pill-count">{statusCounts.Exception}</span>
        </button>
        {statusCounts.Complete > 0 && (
          <button
            type="button"
            className={`filter-pill ${statusFilter === 'Complete' ? 'active' : ''}`}
            onClick={() => setStatusFilter('Complete')}
          >
            Complete <span className="pill-count">{statusCounts.Complete}</span>
          </button>
        )}
      </div>

      {/* Expandable Filter Panel */}
      {filterOpen && (
        <section className="filter-panel" aria-label="Tender filter options">
          <div className="filter-panel-head">
            <h3><SlidersHorizontal size={16} /> Refine &amp; Sort Tenders</h3>
            <button className="icon-button" onClick={() => setFilterOpen(false)} aria-label="Close filter panel">
              <X size={16} />
            </button>
          </div>
          <div className="filter-grid">
            <div className="filter-field">
              <label htmlFor="filter-department">Department / Agency</label>
              <select
                id="filter-department"
                value={agencyFilter}
                onChange={e => setAgencyFilter(e.target.value)}
              >
                <option value="ALL">All Departments ({allTenders.length})</option>
                {agencies.map(a => (
                  <option key={a} value={a}>
                    {a} ({allTenders.filter(t => t.agency === a).length})
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="filter-status">Status</label>
              <select
                id="filter-status"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as 'ALL' | Status)}
              >
                <option value="ALL">All Statuses</option>
                <option value="Verified">Verified ({statusCounts.Verified})</option>
                <option value="In Review">In Review ({statusCounts['In Review']})</option>
                <option value="Pending">Pending ({statusCounts.Pending})</option>
                <option value="Exception">Exception ({statusCounts.Exception})</option>
                <option value="Complete">Complete ({statusCounts.Complete})</option>
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="filter-method">Evaluation Method</label>
              <select
                id="filter-method"
                value={evalMethodFilter}
                onChange={e => setEvalMethodFilter(e.target.value)}
              >
                <option value="ALL">All Methods</option>
                {evalMethods.map(m => (
                  <option key={m} value={m}>
                    {m} ({allTenders.filter(t => t.evaluationMethod === m).length})
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="filter-bidders">Bidder Activity</label>
              <select
                id="filter-bidders"
                value={biddersFilter}
                onChange={e => setBiddersFilter(e.target.value as 'ALL' | '0' | '1+' | '3+' | '5+')}
              >
                <option value="ALL">All Activity</option>
                <option value="1+">1+ Bidders submitted</option>
                <option value="3+">3+ Bidders (High Activity)</option>
                <option value="5+">5+ Bidders (Competitive)</option>
                <option value="0">0 Bidders (No submissions yet)</option>
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="filter-sort">Sort Order</label>
              <select
                id="filter-sort"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
              >
                <option value="newest">Latest Published</option>
                <option value="oldest">Oldest Published</option>
                <option value="deadline-soon">Submission Deadline (Earliest)</option>
                <option value="bidders-high">Most Bidders</option>
                <option value="value-high">Estimated Value (High → Low)</option>
                <option value="value-low">Estimated Value (Low → High)</option>
                <option value="checks-progress">Checks Progress</option>
              </select>
            </div>
          </div>

          <div className="filter-panel-foot">
            {activeFilterCount > 0 && (
              <button type="button" className="secondary small" onClick={resetFilters}>
                <RotateCcw size={14} /> Clear all filters
              </button>
            )}
            <button type="button" className="primary small" onClick={() => setFilterOpen(false)}>
              Apply &amp; close
            </button>
          </div>
        </section>
      )}

      {/* Active Filter Tags */}
      {activeFilterCount > 0 && (
        <div className="active-filters">
          <span className="active-filters-label">Active filters:</span>
          {query.trim() && (
            <span className="filter-tag">
              Search: &ldquo;{query}&rdquo;
              <button type="button" onClick={() => setQuery('')} aria-label="Remove search filter"><X size={12} /></button>
            </span>
          )}
          {statusFilter !== 'ALL' && (
            <span className="filter-tag">
              Status: {statusFilter}
              <button type="button" onClick={() => setStatusFilter('ALL')} aria-label="Remove status filter"><X size={12} /></button>
            </span>
          )}
          {agencyFilter !== 'ALL' && (
            <span className="filter-tag">
              Agency: {agencyFilter}
              <button type="button" onClick={() => setAgencyFilter('ALL')} aria-label="Remove agency filter"><X size={12} /></button>
            </span>
          )}
          {evalMethodFilter !== 'ALL' && (
            <span className="filter-tag">
              Method: {evalMethodFilter}
              <button type="button" onClick={() => setEvalMethodFilter('ALL')} aria-label="Remove method filter"><X size={12} /></button>
            </span>
          )}
          {biddersFilter !== 'ALL' && (
            <span className="filter-tag">
              Bidders: {biddersFilter === '0' ? 'No Bids' : `${biddersFilter} Bids`}
              <button type="button" onClick={() => setBiddersFilter('ALL')} aria-label="Remove bidders filter"><X size={12} /></button>
            </span>
          )}
          {sortBy !== 'newest' && (
            <span className="filter-tag">
              Sort: {sortBy.replace('-', ' ')}
              <button type="button" onClick={() => setSortBy('newest')} aria-label="Reset sort"><X size={12} /></button>
            </span>
          )}
          <button type="button" className="text-button" onClick={resetFilters} style={{ fontSize: 'var(--text-xs)' }}>
            Reset all
          </button>
        </div>
      )}

      {error ? (
        <ErrorPanel message={error} onRetry={retry} />
      ) : !data ? (
        <PanelSkeleton />
      ) : (
        <section className="panel">
          <div className="table-caption">
            <b>{filtered.length} {filtered.length === 1 ? 'tender' : 'tenders'} found</b>
            <span>
              {allTenders.length > 0 && filtered.length !== allTenders.length
                ? `Filtered from ${allTenders.length} total active tenders`
                : 'Personalized results for your account'}
            </span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-evidence" style={{ height: 220 }}>
              <FileSearch size={30} />
              <b>No tenders match your filter criteria</b>
              <small>Try adjusting your search query, status, or department filters.</small>
              <button className="secondary" style={{ marginTop: 12 }} onClick={resetFilters}>
                <RotateCcw size={15} /> Reset all filters
              </button>
            </div>
          ) : (
            <>
              <TenderTable rows={pageRows} navigate={navigate} />
              {filtered.length > TENDERS_PAGE_SIZE && (
                <div className="pagination">
                  <span className="pg-info">
                    Showing {(currentPage - 1) * TENDERS_PAGE_SIZE + 1}–{Math.min(currentPage * TENDERS_PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div className="pg-controls">
                    <button disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                      <ChevronLeft size={15} /> Prev
                    </button>
                    <span className="pg-page">Page {currentPage} of {totalPages}</span>
                    <button disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                      Next <ChevronRight size={15} />
                    </button>
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

function TenderDetail({ navigate, userId, tenderId }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string; tenderId: string | null }) {
  const url = tenderId
    ? `/api/data?resource=tender-detail&userId=${encodeURIComponent(userId)}&tenderId=${encodeURIComponent(tenderId)}`
    : `/api/data?resource=tender-detail&userId=${encodeURIComponent(userId)}`
  const { data, error, retry } = useApi<TenderDetailData>(url)
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const { tender, bidders } = data
  return <PageFrame title={tender.title} subtitle={`${tender.id} · ${tender.agency}`} actions={null}>
    <div className="detail-actions"><StatusBadge status={tender.status} /><button className="secondary"><Download size={16}/> Download tender pack</button><button className="primary" onClick={() => navigate('evaluation', { tenderId: tender.id })}><ClipboardCheck size={16}/> Start bid evaluation</button></div>
    <div className="detail-grid">
      <section className="panel"><h2>Tender overview</h2><div className="detail-list">
        <div><span>Published</span><b>{tender.published}</b></div>
        <div><span>Submission deadline</span><b>{new Date(tender.deadlineISO).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} IST</b></div>
        <div><span>Estimated value</span><b>{tender.value}</b></div>
        <div><span>Bid security</span><b>{tender.bidSecurity}</b></div>
        <div><span>Evaluation method</span><b>{tender.evaluationMethod}</b></div>
        <div><span>Review progress</span><b>{tender.checksComplete} of {tender.checksTotal} checks complete</b></div>
      </div></section>
      <section className="panel"><h2>Compliance requirements</h2>{tender.requirements.map(x => <div className="requirement" key={x.name}><span className={x.status === 'Verified' ? 'done' : ''}>{x.status === 'Verified' ? <Check size={13}/> : ''}</span><b>{x.name}</b><small>{x.status === 'Verified' ? 'Verified' : x.status === 'Exception' ? 'Exception raised' : 'Pending review'}</small></div>)}</section>
    </div>
    <section className="panel">
      <div className="panel-head"><div><h2>Submitted bidders</h2><p>{bidders.length} bidders submitted before the deadline</p></div><button className="text-button" onClick={() => navigate('compliance', { tenderId: tender.id })}>View compliance overview <ArrowRight size={15}/></button></div>
      <BidderTable navigate={navigate} rows={bidders.slice(0, 3)} />
    </section>
  </PageFrame>
}

function Evaluation({ navigate, userId, tenderId }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string; tenderId: string | null }) {
  const url = tenderId
    ? `/api/data?resource=evaluation&userId=${encodeURIComponent(userId)}&tenderId=${encodeURIComponent(tenderId)}`
    : `/api/data?resource=evaluation&userId=${encodeURIComponent(userId)}`
  const { data, error, retry } = useApi<EvaluationData>(url)
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const pct = Math.round((data.checksComplete / Math.max(data.checksTotal, 1)) * 100)
  return <PageFrame title="Bid evaluation" subtitle={`${data.tenderId} · ${data.tenderTitle}`} actions={null}>
    <div className="evaluation-head"><div className="progress"><span>Evaluation progress</span><b>{data.checksComplete} <small>/ {data.checksTotal} checks complete</small></b><div><i style={{ width: `${pct}%` }}/></div></div><button className="primary" onClick={()=>navigate('compliance', { tenderId: data.tenderId })}>Continue review <ArrowRight size={16}/></button></div>
    <section className="panel"><div className="panel-head"><div><h2>Bidder evaluation queue</h2><p>Review each submission against the tender requirements.</p></div><select><option>All statuses</option></select></div><BidderTable navigate={navigate} rows={data.bidders}/></section>
  </PageFrame>
}

function Compliance({ navigate, userId, tenderId, bidder }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string; tenderId: string | null; bidder: string | null }) {
  const params = new URLSearchParams({ resource: 'compliance', userId })
  if (tenderId) params.set('tenderId', tenderId)
  if (bidder) params.set('bidder', bidder)
  const { data, error, retry } = useApi<ComplianceData>(`/api/data?${params.toString()}`)
  const [reviewed, setReviewed] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const closeProfile = useCallback(() => setProfileOpen(false), [])

  useEffect(() => { setReviewed(false); setSelected(null); setProfileOpen(false) }, [data?.bidderName])

  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const activeCheck = selected !== null ? data.checks[selected] : null

  return <PageFrame title="Bidder compliance" subtitle={`${data.bidderName} · ${data.tenderId}`} actions={null}>
    <div className="detail-actions">
      <StatusBadge status={reviewed ? 'In Review' : (data.checks.some(c => c.status === 'Exception') ? 'Exception' : data.checks.every(c => c.status === 'Verified') ? 'Verified' : 'Pending')}/>
      <button className="secondary" onClick={() => setProfileOpen(true)}><Eye size={16}/> View bidder profile</button>
      <button className="primary" onClick={()=>setReviewed(true)} disabled={reviewed}><Check size={16}/> {reviewed ? 'Review complete' : 'Mark review complete'}</button>
    </div>
    <div className="compliance-layout">
      <section className="panel">
        <div className="panel-head"><div><h2>Requirement checks</h2><p>{data.docsSubmitted} of {data.docsTotal} documents submitted</p></div><span className="score">{data.scorePct}% compliant</span></div>
        {data.checks.map((c, i) => <button className="check-row" key={c.requirement} style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }} onClick={() => setSelected(i)}>
          <span className={`check-state ${c.status.toLowerCase()}`}><Check size={15}/></span>
          <span><b>{c.requirement}</b><small>{c.note}</small></span>
          <StatusBadge status={reviewed && c.status !== 'Verified' ? 'In Review' : c.status}/>
        </button>)}
      </section>
      <aside className="evidence panel">
        <h2>Evidence panel</h2>
        {activeCheck ? (
          <div>
            <p><b>{activeCheck.requirement}</b></p>
            <p>{activeCheck.note}</p>
            <p className="eyebrow">STATUS</p>
            <StatusBadge status={activeCheck.status} />
          </div>
        ) : (
          <><p>Select a requirement to inspect source evidence and notes.</p><div className="empty-evidence"><FileSearch size={28}/><b>No requirement selected</b><small>Evidence, source details and officer notes will appear here.</small></div></>
        )}
      </aside>
    </div>
    {profileOpen && (
      <Modal
        title={data.bidderName}
        subtitle={`${data.tenderId} · Bidder profile`}
        onClose={closeProfile}
        footer={<button className="primary" onClick={closeProfile}>Close</button>}
      >
        <div className="modal-summary">
          <div><span>Documents</span><b>{data.docsSubmitted}/{data.docsTotal}</b></div>
          <div><span>Compliance</span><b>{data.scorePct}%</b></div>
          <div><span>Verified</span><b>{data.checks.filter(c => c.status === 'Verified').length}/{data.checks.length}</b></div>
        </div>
        <Alert variant={data.checks.some(c => c.status === 'Exception') ? 'danger' : data.checks.every(c => c.status === 'Verified') ? 'success' : 'warning'}>
          {data.checks.some(c => c.status === 'Exception')
            ? 'One or more requirements raised an exception and need officer review.'
            : data.checks.every(c => c.status === 'Verified')
              ? 'All requirement checks passed verification.'
              : 'Some requirement checks are still pending verification.'}
        </Alert>
        <div>
          <p className="eyebrow">Requirement checks</p>
          <div className="modal-checks">
            {data.checks.map(c => (
              <div className="check-row" key={c.requirement}>
                <span className={`check-state ${c.status.toLowerCase()}`}><Check size={15}/></span>
                <span><b>{c.requirement}</b><small>{c.note}</small></span>
                <StatusBadge status={c.status}/>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    )}
  </PageFrame>
}

// ---------------------------------------------------------------------------
// GeM workflow v2 — shared helpers
// ---------------------------------------------------------------------------

type ProcStage = TDV['stage']

const STAGE_BADGE: Record<string, { label: string; cls: string }> = {
  PUBLISHED: { label: 'Accepting submissions', cls: 'status-verified' },
  CORRIGENDUM: { label: 'Corrigendum issued', cls: 'status-in-review' },
  CLOSED: { label: 'Closed — evaluating', cls: 'status-pending' },
  EVALUATED: { label: 'Evaluated', cls: 'status-complete' },
  AUCTION_ACTIVE: { label: 'Live auction', cls: 'status-exception' },
  AUCTION_CLOSED: { label: 'Auction closed', cls: 'status-complete' },
  EVALUATION_FAILED: { label: 'No qualified bidders', cls: 'status-exception' },
  AUCTION_FAILED: { label: 'Auction failed', cls: 'status-exception' },
  AWARDED: { label: 'Awarded', cls: 'status-complete' },
  CANCELLED: { label: 'Cancelled', cls: 'status-exception' },
}

function StageBadge({ stage }: { stage: ProcStage }) {
  const cfg = STAGE_BADGE[stage] ?? { label: stage, cls: 'status-pending' }
  return <span className={`status ${cfg.cls}`}><Clock3 size={12} />{cfg.label}</span>
}

const DOC6_META: Record<DocStatus6, { label: string; cls: string; icon: LucideIcon }> = {
  VERIFIED: { label: 'Verified', cls: 'status-verified', icon: Check },
  WARNING: { label: 'Warning', cls: 'status-in-review', icon: AlertTriangle },
  NON_COMPLIANT: { label: 'Non-compliant', cls: 'status-exception', icon: Ban },
  UNVERIFIED: { label: 'Unverified', cls: 'status-pending', icon: Clock3 },
  NEEDS_REVIEW: { label: 'Needs review', cls: 'status-in-review', icon: RefreshCw },
  NOT_APPLICABLE: { label: 'Not applicable', cls: 'status-pending', icon: Ban },
}

function Doc6Badge({ status }: { status: DocStatus6 }) {
  const meta = DOC6_META[status] ?? DOC6_META.UNVERIFIED
  const Icon = meta.icon
  return <span className={`status ${meta.cls}`}><Icon size={12} />{meta.label}</span>
}

function ClassificationChip({ c }: { c: string }) {
  const cls = c === 'MANDATORY' ? 'risk risk-high' : c === 'CONDITIONAL' ? 'risk risk-medium' : 'risk risk-low'
  return <span className={cls}>{c.toLowerCase()}</span>
}

function fmtCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'closed'
  const s = Math.floor(ms / 1000)
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

async function runAction(body: Record<string, unknown>): Promise<void> {
  await apiFetch('/api/action', { method: 'POST', body })
}

function ElRow({ row }: { row: { label: string; declared: string; status: string } }) {
  return (
    <div className="requirement" key={row.label}>
      <span className={row.status === 'PASS' ? 'done' : ''}>{row.status === 'PASS' ? <Check size={13} /> : ''}</span>
      <b>{row.label}</b>
      <small>{row.declared} — {row.status === 'PASS' ? 'pass' : row.status === 'FAIL' ? 'fail' : 'attention'}</small>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Officer — workflow tenders list + create-tender form
// ---------------------------------------------------------------------------

function WorkflowTenders({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
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
            <td><Clock3 size={14} />{new Date(t.submissionDeadlineISO).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
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

function CreateTender({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
  const [type, setType] = useState('e-reverse-auction')
  const [emdOn, setEmdOn] = useState(true)
  const [valueCr, setValueCr] = useState('2')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const emdBlocked = Number(valueCr) <= 0.05

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null); setBusy(true)
    const f = new FormData(e.currentTarget)
    const eligibility: { key: string; label: string; value: number }[] = []
    const turnover = String(f.get('minTurnoverCr') || '')
    const experience = String(f.get('minYearsExperience') || '')
    if (turnover) eligibility.push({ key: 'minTurnoverCr', label: 'Average annual turnover (last 3 years)', value: Number(turnover) })
    if (experience) eligibility.push({ key: 'minYearsExperience', label: 'Years in similar business', value: Number(experience) })
    if (f.get('netWorthPositive')) eligibility.push({ key: 'netWorthPositive', label: 'Positive net worth', value: 1 })
    const mii = String(f.get('miiMinLocalContentPct') || '')
    if (mii) eligibility.push({ key: 'miiMinLocalContentPct', label: 'Class-I local content (Make in India)', value: Number(mii) })
    const technical: { key: string; label: string; expected: string }[] = []
    for (let i = 1; i <= 3; i++) {
      const label = String(f.get(`techLabel${i}`) || '').trim()
      const expected = String(f.get(`techExpected${i}`) || '').trim()
      if (label && expected) technical.push({ key: `spec${i}`, label, expected })
    }
    try {
      const res = await apiFetch<{ tenderId: string }>('/api/action', {
        method: 'POST',
        body: {
          action: 'createTender',
          title: String(f.get('title') || ''),
          agency: String(f.get('agency') || ''),
          type,
          category: String(f.get('category') || ''),
          product: String(f.get('product') || ''),
          quantity: String(f.get('quantity') || ''),
          unit: String(f.get('unit') || ''),
          location: String(f.get('location') || ''),
          valueCr: Number(valueCr) || 1,
          submissionMinutes: Number(f.get('submissionMinutes') || 5),
          bidValidityDays: Number(f.get('bidValidityDays') || 30),
          emdRequired: emdOn && !emdBlocked,
          emdAmountCr: emdOn && !emdBlocked ? Number(f.get('emdAmountCr') || 0) || undefined : undefined,
          msePreference: !!f.get('msePreference'),
          miiMinLocalContentPct: mii ? Number(mii) : undefined,
          albThresholdPct: Number(f.get('albThresholdPct') || 25),
          eligibility,
          technical,
        },
      })
      setDone(res.tenderId)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the tender')
    } finally { setBusy(false) }
  }

  if (done) {
    return <PageFrame title="Tender published" subtitle="The tender is live on the GeM workflow." actions={null}>
      <section className="panel">
        <div className="empty-evidence" style={{ height: 200 }}><CheckCircle2 size={30} /><b>{done}</b><small>Sellers can now discover it in the marketplace and submit structured claims.</small></div>
        <div className="button-row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <button className="secondary" onClick={() => navigate('tenders')}>View all tenders</button>
          <button className="secondary" onClick={() => navigate('workflow')}>Back to workflow</button>
          <button className="primary" onClick={() => navigate('w-tender', { tenderId: done })}>Open tender <ArrowRight size={15} /></button>
        </div>
      </section>
    </PageFrame>
  }

  return <PageFrame title="Create tender" subtitle="GeM-portal-verified rules are enforced: EMD only above ₹5 L, bid validity 15–180 days." actions={null}>
    {error && <Alert variant="danger">{error}</Alert>}
    <form onSubmit={submit}>
      <div className="detail-grid">
        <section className="panel"><h2>Tender details</h2>
          <Field label="Title" type="text" name="title" placeholder="e.g. Supply of Computer Systems" required />
          <Field label="Agency" type="text" name="agency" defaultValue="Ministry of Digital Transformation" required />
          <label>Procurement type
            <span className="input-wrap"><select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }}>
              {Object.entries(TENDER_TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.description}</option>)}
            </select></span>
          </label>
          <div className="form-grid-2">
            <Field label="Category" type="text" name="category" placeholder="ICT" />
            <Field label="Location" type="text" name="location" placeholder="New Delhi" />
          </div>
          <Field label="Product / scope" type="text" name="product" placeholder="Desktop computer systems" />
          <div className="form-grid-3">
            <Field label="Quantity" type="text" name="quantity" placeholder="1200" />
            <Field label="Unit" type="text" name="unit" placeholder="units" />
            <Field label="Estimated value (₹ Cr)" type="number" name="valueCr" step="0.01" min="0" value={valueCr} onChange={e => setValueCr(e.target.value)} required />
          </div>
        </section>
        <section className="panel"><h2>Deadlines &amp; guarantees</h2>
          <Field label="Submission window (minutes, demo-scaled)" type="number" name="submissionMinutes" min="1" defaultValue={5} required />
          <Field label="Bid validity (days, GeM 15–180)" type="number" name="bidValidityDays" min={15} max={180} defaultValue={30} required />
          <label className="check" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" name="emdRequired" checked={emdOn && !emdBlocked} disabled={emdBlocked} onChange={e => setEmdOn(e.target.checked)} /> Require EMD
          </label>
          {emdBlocked && <Alert variant="warning">EMD applies only when the estimated value exceeds ₹5 Lakh (GeM rule) — disabled for ₹{valueCr} Cr.</Alert>}
          {emdOn && !emdBlocked && <Field label="EMD amount (₹ Cr, default 2% of estimate)" type="number" name="emdAmountCr" step="0.001" min="0" placeholder="0.04" />}
          <label className="check" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" name="msePreference" defaultChecked /> MSE purchase preference (L1 + 15% match option, max 5)
          </label>
          <Field label="MII minimum local content % (optional)" type="number" name="miiMinLocalContentPct" min="0" max="100" placeholder="50" />
          <Field label="Abnormally-low-bid threshold (% below estimate)" type="number" name="albThresholdPct" min="1" max="90" defaultValue={25} />
        </section>
      </div>
      <div className="detail-grid">
        <section className="panel"><h2>Eligibility criteria</h2>
          <p className="eyebrow">Thresholds are checked against seller-declared data</p>
          <div className="form-grid-2">
            <Field label="Min turnover (₹ Cr)" type="number" name="minTurnoverCr" step="0.1" min="0" placeholder="2" />
            <Field label="Min years of experience" type="number" name="minYearsExperience" min="0" placeholder="3" />
          </div>
          <label className="check" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" name="netWorthPositive" defaultChecked /> Require positive net worth
          </label>
        </section>
        <section className="panel"><h2>Technical specifications (golden parameters)</h2>
          <p className="eyebrow">Seller responses must match exactly — mismatches disqualify</p>
          {[1, 2, 3].map(i => (
            <div className="form-grid-2" key={i}>
              <Field label={`Spec ${i} — label`} type="text" name={`techLabel${i}`} placeholder={i === 1 ? 'RAM' : i === 2 ? 'Operating system' : 'Onsite warranty'} />
              <Field label={`Spec ${i} — required value`} type="text" name={`techExpected${i}`} placeholder={i === 1 ? '16 GB DDR4' : i === 2 ? 'Windows 11 Pro' : '3 years'} />
            </div>
          ))}
        </section>
      </div>
      <section className="panel"><h2>Document classification (auto-seeded, GeM catalogue)</h2>
        <div className="mini-list">
          {DEFAULT_DOC_TEMPLATES.map(d => (
            <div key={d.name}>
              <span className="tick"><FileCheck2 size={13} /></span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b>{d.description}</b>
                <ClassificationChip c={d.classification} />
                {d.conditionKey && <small>applies when bidder claims “{d.conditionKey}”</small>}
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="button-row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="secondary" onClick={() => navigate('tenders')}>Cancel</button>
        <button className="primary" type="submit" disabled={busy}>{busy ? 'Publishing…' : 'Publish tender'}</button>
      </div>
    </form>
  </PageFrame>
}

// ---------------------------------------------------------------------------
// Tender detail v2 — role-aware (seller: eligibility + submit flow + clarifications;
// officer: overview + corrigendum editor)
// ---------------------------------------------------------------------------

const CONDITION_WHY: Record<string, string> = {
  emd: 'The tender requires EMD (estimated value above ₹5 Lakh).',
  msme: 'You are registered as MSE — the Udyam certificate activates your EMD exemption / MSE preference claim.',
  startup: 'You are a DPIIT-recognized startup — this activates the turnover/experience waiver claim.',
  reseller: 'You are a reseller/dealer — an OEM authorization form is required.',
  mii: 'You declared a local-content percentage — the Make in India declaration applies.',
}

interface DocClaimFormState { provided: boolean; fileName: string; validTill: string; extracted: Record<string, string> }

function WorkflowTenderDetail({ navigate, user, tenderId }: { navigate: (v: View, o?: NavigateOptions) => void; user: SessionUser; tenderId: string | null }) {
  const url = tenderId ? `/api/data?resource=tender-v2&tenderId=${encodeURIComponent(tenderId)}` : null
  const { data, error, retry } = useApi<TenderDetailV2>(url)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [claims, setClaims] = useState<Record<string, DocClaimFormState>>({})
  const [tech, setTech] = useState<Record<string, string>>({})
  const [financialBid, setFinancialBid] = useState('')
  const isOfficer = user.type === 'officer'

  if (!tenderId) return <ErrorPanel message="No tender selected — open one from the workflow list or marketplace." />
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()

  const t = data
  const emptyClaim: DocClaimFormState = { provided: false, fileName: '', validTill: '', extracted: {} }
  const setClaim = (name: string, patch: Partial<DocClaimFormState>) =>
    setClaims(c => ({ ...c, [name]: { ...emptyClaim, ...c[name], ...patch } }))

  const submitBid = async () => {
    setActionError(null); setBusy(true)
    try {
      await runAction({
        action: 'submitTender',
        tenderId: t.id,
        financialBidCr: Number(financialBid),
        technicalResponse: tech,
        eligibilitySnapshot: t.eligibility?.rows ?? [],
        docs: t.requiredDocs.map(spec => {
          const c = claims[spec.name]
          return {
            docName: spec.name,
            provided: c?.provided ?? false,
            fileName: c?.fileName || undefined,
            validTill: c?.validTill || undefined,
            extracted: c?.extracted ?? {},
          }
        }),
      })
      retry()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Submission failed')
    } finally { setBusy(false) }
  }

  const withdraw = async () => {
    setActionError(null); setBusy(true)
    try { await runAction({ action: 'withdrawBid', tenderId: t.id }); retry() }
    catch (err) { setActionError(err instanceof ApiError ? err.message : 'Withdrawal failed') }
    finally { setBusy(false) }
  }

  const issueCorrigendum = async (form: HTMLFormElement) => {
    const f = new FormData(form)
    setActionError(null); setBusy(true)
    try {
      await runAction({ action: 'issueCorrigendum', tenderId: t.id, note: String(f.get('note') || ''), extendMinutes: Number(f.get('extendMinutes') || 0) })
      retry()
    } catch (err) { setActionError(err instanceof ApiError ? err.message : 'Corrigendum failed') }
    finally { setBusy(false) }
  }

  const openAuctionView = t.stage === 'AUCTION_ACTIVE' || t.stage === 'AUCTION_CLOSED'

  return <PageFrame title={t.title} subtitle={`${t.id} · ${t.agency} · ${t.typeLabel}`} actions={null}>
    {actionError && <Alert variant="danger">{actionError}</Alert>}
    <div className="detail-actions">
      <StageBadge stage={t.stage} />
      {t.emdRequired && <span className="status status-pending"><Wallet size={12} /> EMD ₹{t.emdAmountCr} Cr</span>}
      {t.msePreference && <span className="status status-pending"><Users size={12} /> MSE preference</span>}
      {t.miiMinLocalContentPct != null && <span className="status status-pending"><BadgeCheck size={12} /> MII ≥ {t.miiMinLocalContentPct}%</span>}
      {isOfficer
        ? <button className="primary" onClick={() => navigate('w-eval', { tenderId: t.id })}><ClipboardCheck size={16} /> Evaluation &amp; award</button>
        : openAuctionView && <button className="primary" onClick={() => navigate('w-auction', { tenderId: t.id })}><Gavel size={16} /> Live auction</button>}
    </div>

    <section className="panel"><h2>Timeline</h2>
      <div className="mini-list steps">
        {t.timeline.map(s => (
          <div key={s.stage}>
            <span className={`tick ${s.state === 'active' ? 'tick-active' : s.state === 'skipped' ? 'tick-skipped' : ''}`}>{s.state === 'done' ? <Check size={13} /> : s.state === 'active' ? '●' : s.state === 'skipped' ? '–' : '○'}</span>
            <div><b>{s.label}</b><small>{s.state === 'active' ? 'current stage' : s.state === 'done' ? 'completed' : s.state === 'skipped' ? 'not applicable' : 'upcoming'}</small></div>
          </div>
        ))}
      </div>
      {!isOfficer && <Alert variant={t.stage === 'PUBLISHED' || t.stage === 'CORRIGENDUM' ? 'info' : 'warning'}><b>{t.nextMove.label}.</b> {t.nextMove.detail}</Alert>}
    </section>

    {t.corrigenda.length > 0 && (
      <section className="panel"><h2>Corrigenda</h2>
        {t.corrigenda.map(c => (
          <Alert key={c.version} variant="warning" title={`v${c.version}`}>
            {c.note} {c.deadlineChanged && '— submission deadline extended.'} <small>({new Date(c.createdAtISO).toLocaleString('en-IN')})</small>
          </Alert>
        ))}
      </section>
    )}

    <div className="detail-grid">
      <section className="panel"><h2>Tender overview</h2><div className="detail-list">
        <div><span>Estimated value</span><b>{t.valueLabel ?? '—'}</b></div>
        <div><span>Submission deadline</span><b>{new Date(t.submissionDeadlineISO).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} IST</b></div>
        <div><span>Closes in</span><b>{t.stage === 'PUBLISHED' || t.stage === 'CORRIGENDUM' ? fmtCountdown(t.submissionDeadlineISO) : '—'}</b></div>
        <div><span>Bid validity required</span><b>{t.bidValidityDays} days</b></div>
        {t.auctionEndISO && <div><span>Auction ends</span><b>{new Date(t.auctionEndISO).toLocaleTimeString('en-IN')} ({fmtCountdown(t.auctionEndISO)})</b></div>}
        {t.awardedToCompanyName && <div><span>Awarded to</span><b>{t.awardedToCompanyName}{t.iWon ? ' — you won' : ''}</b></div>}
      </div></section>

      {!isOfficer && t.eligibility && (
        <section className="panel"><h2>Your eligibility (declared data, pre-check)</h2>
          <span className={`status ${t.eligibility.overall === 'qualified' ? 'status-verified' : t.eligibility.overall === 'not_eligible' ? 'status-exception' : 'status-in-review'}`}>
            {t.eligibility.overall === 'qualified' ? 'Qualified' : t.eligibility.overall === 'not_eligible' ? 'Not eligible' : 'Needs attention'}
          </span>
          {t.eligibility.rows.map(r => <ElRow key={r.key} row={r} />)}
        </section>
      )}

      {isOfficer && (t.stage === 'PUBLISHED' || t.stage === 'CORRIGENDUM') && (
        <section className="panel"><h2>Issue corrigendum</h2>
          <p className="eyebrow">Amendments require the demo-scaled cutoff before bid end (GeM: ≥7 days)</p>
          <form onSubmit={e => { e.preventDefault(); issueCorrigendum(e.currentTarget) }}>
            <label>Amendment note<textarea name="note" rows={2} required placeholder="e.g. Quantity revised from 1000 to 1200 units" style={{ width: '100%' }} /></label>
            <Field label="Extend deadline by (minutes, 0 = keep)" type="number" name="extendMinutes" min="0" defaultValue={0} />
            <button className="primary" type="submit" disabled={busy}><ScrollText size={15} /> Publish corrigendum</button>
          </form>
        </section>
      )}
    </div>

    <section className="panel"><h2>Required documents (classification per GeM rules)</h2>
      <div className="mini-list">
        {t.requiredDocs.map(d => {
          const submitted = t.mySubmission && t.mySubmission.docsTotal > 0
          void submitted
          return (
            <div key={d.name}>
              <span className="tick"><FileCheck2 size={13} /></span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <b>{d.description}</b>
                <ClassificationChip c={d.classification} />
                {d.conditionKey && <small>{isOfficer ? `conditional on claim “${d.conditionKey}”` : CONDITION_WHY[d.conditionKey] ?? `applies when you claim “${d.conditionKey}”`}</small>}
              </div>
            </div>
          )
        })}
      </div>
    </section>

    {!isOfficer && (t.stage === 'PUBLISHED' || t.stage === 'CORRIGENDUM') && !t.mySubmission && (
      <section className="panel"><h2>Submit your bid — structured claims</h2>
        <p className="eyebrow">No file bytes: declare doc metadata + structured fields; the deterministic engine verifies them. All verdicts are “system-verified from declared data”.</p>
        <Field label="Financial bid (₹ Cr)" type="number" step="0.0001" min="0.0001" value={financialBid} onChange={e => setFinancialBid(e.target.value)} placeholder="e.g. 1.85" required />
        {t.technicalReqs.length > 0 && (
          <div><p className="side-card-title">Technical responses (must match required values)</p>
            {t.technicalReqs.map(r => (
              <div className="form-grid-2" key={r.key}>
                <Field label={r.label} type="text" value={tech[r.key] ?? ''} onChange={e => setTech(s => ({ ...s, [r.key]: e.target.value }))} placeholder={`required: ${r.expected}`} />
              </div>
            ))}
          </div>
        )}
        <div><p className="side-card-title">Document claims</p>
          {t.requiredDocs.map(spec => {
            const c = claims[spec.name] ?? { provided: false, fileName: '', validTill: '', extracted: {} }
            const ex = (k: string, label: string, ph: string) => (
              <Field key={k} label={label} type="text" value={c.extracted[k] ?? ''} onChange={e => setClaim(spec.name, { extracted: { ...c.extracted, [k]: e.target.value } })} placeholder={ph} />
            )
            return (
              <div key={spec.name} className="claim-row">
                <label className="check" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={c.provided} onChange={e => setClaim(spec.name, { provided: e.target.checked })} /> <b>{spec.description}</b> <ClassificationChip c={spec.classification} />
                </label>
                {c.provided && (
                  <div className="form-grid-2">
                    <Field label="File name (metadata only)" type="text" value={c.fileName} onChange={e => setClaim(spec.name, { fileName: e.target.value })} placeholder="scan.pdf" />
                    <Field label="Valid till (optional)" type="date" value={c.validTill} onChange={e => setClaim(spec.name, { validTill: e.target.value })} />
                    {spec.name === 'gstin' && ex('number', 'GSTIN', '07AAECN1234E1ZP')}
                    {spec.name === 'pan' && ex('number', 'PAN', 'AAECN1234E')}
                    {spec.name === 'turnover' && ex('udin', 'UDIN (18 digits)', '251234567890123456')}
                    {spec.name === 'turnover' && ex('certDate', 'Certificate date', '2026-08-01')}
                    {spec.name === 'udyam' && ex('number', 'Udyam number', 'UDYAM-07-00-0012345')}
                    {spec.name === 'udyam' && ex('nicCode', 'NIC code', '46')}
                    {spec.name === 'emd' && ex('validTill', 'BG valid till', '2026-12-01')}
                    {spec.name === 'emd' && ex('claimPeriodDays', 'Claim period (days ≥45)', '60')}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="button-row" style={{ justifyContent: 'flex-end' }}>
          <button className="primary" disabled={busy || !financialBid} onClick={submitBid}>{busy ? 'Submitting…' : 'Submit bid'}</button>
        </div>
      </section>
    )}

    {!isOfficer && t.mySubmission && (
      <section className="panel"><h2>Your submission</h2>
        <div className="detail-list">
          <div><span>Submitted</span><b>{new Date(t.mySubmission.submittedAtISO).toLocaleString('en-IN')}</b></div>
          <div><span>Financial bid</span><b>{t.mySubmission.financialBidCr != null ? `₹${t.mySubmission.financialBidCr} Cr` : '—'}</b></div>
          <div><span>Documents provided</span><b>{t.mySubmission.docsProvided} / {t.mySubmission.docsTotal}</b></div>
          {t.mySubmission.resultStatus && <div><span>Result</span><b className="linkish" onClick={() => navigate('w-tender', { tenderId: t.id })}>{t.mySubmission.resultStatus}{t.mySubmission.rank ? ` — rank ${t.mySubmission.rank}` : ''} · {t.mySubmission.compliancePct ?? 0}% compliant</b></div>}
        </div>
        {t.mySubmission.flags.length > 0 && (
          <div>{t.mySubmission.flags.map((f, i) => <Alert key={i} variant={f.severity === 'CRITICAL' ? 'danger' : f.severity === 'WARNING' ? 'warning' : 'info'} title={f.kind}>{f.note}</Alert>)}</div>
        )}
        {(t.stage === 'PUBLISHED' || t.stage === 'CORRIGENDUM') && <button className="secondary" disabled={busy} onClick={withdraw}><Ban size={15} /> Withdraw bid {t.emdRequired ? '(EMD forfeited)' : ''}</button>}
      </section>
    )}

    {!isOfficer && t.clarifications.length > 0 && (
      <section className="panel"><h2>Clarifications on your bid</h2>
        {t.clarifications.map(c => (
          <Alert key={c.id} variant={c.status === 'PENDING' ? 'warning' : 'info'} title={c.status === 'PENDING' ? `Respond by ${new Date(c.respondByISO).toLocaleTimeString('en-IN')}` : 'Answered'}>
            <b>Officer:</b> {c.question}{c.response && <span> — <b>You:</b> {c.response}</span>}
          </Alert>
        ))}
        <button className="secondary" onClick={() => navigate('clarifications')}><MessagesSquare size={15} /> Open clarification centre</button>
      </section>
    )}
  </PageFrame>
}

// ---------------------------------------------------------------------------
// Officer — evaluation table with 6-state doc statuses, flags, review gate, award
// ---------------------------------------------------------------------------

function EvalDetailV2({ navigate, tenderId }: { navigate: (v: View, o?: NavigateOptions) => void; tenderId: string | null }) {
  const url = tenderId ? `/api/data?resource=evaluation-v2&tenderId=${encodeURIComponent(tenderId)}` : null
  const { data, error, retry } = useApi<EvalV2>(url)
  const [drill, setDrill] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [clarFor, setClarFor] = useState<EvaluationRow | null>(null)

  if (!tenderId) return <ErrorPanel message="No tender selected — open one from the workflow list." />
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const d = data
  const drillData = d.rows.find(r => r.companyId === drill) ? drill : null

  const act = async (body: Record<string, unknown>) => {
    setActionError(null); setBusy(true)
    try { await runAction(body); retry() }
    catch (err) { setActionError(err instanceof ApiError ? err.message : 'Action failed') }
    finally { setBusy(false) }
  }

  const statusCls = (s: string) => s === 'qualified' ? 'status-verified' : s === 'awarded' ? 'status-complete' : s === 'requires_review' ? 'status-in-review' : 'status-exception'

  return <PageFrame title="Evaluation & award" subtitle={`${d.tenderId} · ${d.tenderTitle}`} actions={<button className="secondary" onClick={() => navigate('w-tender', { tenderId: d.tenderId })}><Eye size={15} /> Tender</button>}>
    {actionError && <Alert variant="danger">{actionError}</Alert>}
    <div className="detail-actions">
      <StageBadge stage={d.stage} />
      {d.pendingClarifications > 0 && <span className="status status-in-review"><MessagesSquare size={12} /> {d.pendingClarifications} clarification(s) pending — tech eval blocked</span>}
      {d.lowestCr != null && <span className="status status-pending">L1 ₹{d.lowestCr} Cr</span>}
    </div>
    {d.awardBlockedReason && d.stage !== 'EVALUATED' && d.stage !== 'AUCTION_CLOSED' && <Alert variant="info">{d.awardBlockedReason}</Alert>}
    {d.stage === 'EVALUATION_FAILED' || d.stage === 'AUCTION_FAILED' ? (
      <Alert variant="danger" title="Zero qualified bidders">
        Officer decision required: cancel the tender or re-publish with corrected criteria.
        <div className="button-row" style={{ marginTop: 8 }}>
          <button className="secondary" disabled={busy} onClick={() => act({ action: 'cancelTender', tenderId: d.tenderId, reason: 'Zero qualified bidders' })}>Cancel tender</button>
        </div>
      </Alert>
    ) : null}

    <section className="panel">
      <div className="table-caption"><b>{d.rows.length} evaluated bids</b><span>Deterministic verdicts — every row is system-verified from declared data with officer override</span></div>
      {d.rows.length === 0
        ? <div className="empty-evidence" style={{ height: 160 }}><FileSearch size={26} /><b>No evaluations yet</b><small>Evaluation runs automatically after the deadline lock.</small></div>
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

    {d.mseMatches.length > 0 && (
      <section className="panel"><h2>MSE purchase preference — match options (L1 + 15%, GeM rule)</h2>
        <div className="mini-list">
          {d.mseMatches.map(m => (
            <div key={m.companyId}>
              <span className="tick"><Users size={13} /></span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>{m.companyName}</b><small>₹{m.financialCr} Cr — match L1 by purchasing from this MSE instead</small>
                {d.canAward && <button className="secondary" disabled={busy} onClick={() => act({ action: 'awardTender', tenderId: d.tenderId, companyId: m.companyId, epbgStatus: 'verified', note: 'MSE purchase-preference match award (L1+15% band)' })}>Award via match</button>}
              </div>
            </div>
          ))}
        </div>
      </section>
    )}

    {d.canAward && d.rows.some(r => ['qualified', 'awarded'].includes(r.status)) && (
      <section className="panel"><h2>Award decision (officer gate)</h2>
        <p className="eyebrow">Pick a qualified bidder — L1 is pre-selected; ePBG status is recorded on the audit chain.</p>
        <div className="mini-list">
          {d.rows.filter(r => ['qualified', 'awarded'].includes(r.status)).map(r => (
            <div key={r.id}>
              <span className="tick"><Check size={13} /></span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>{r.companyName}</b><small>{r.rank ? `L${r.rank}` : ''} · ₹{r.financialCr} Cr · {r.compliancePct}%</small>
                <select id={`epbg-${r.id}`} defaultValue="verified" style={{ width: 140 }}>
                  <option value="verified">ePBG: verified</option>
                  <option value="non-verified">ePBG: non-verified</option>
                </select>
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
        <section className="panel"><div className="panel-head"><div><h2>Drill-down — {dd.companyName}</h2><p>6-state document statuses, triangulation, flags and clarifications</p></div><button className="icon-button" onClick={() => setDrill(null)}><X size={16} /></button></div>
          {row.status === 'requires_review' && (
            <Alert variant="warning" title="Review gate (human-in-the-loop, GFR)">
              <div className="button-row" style={{ marginTop: 8 }}>
                <button className="primary" disabled={busy} onClick={() => act({ action: 'officerDecision', evaluationId: row.id, decision: 'approve', note: 'Approved after human review' })}><Check size={14} /> Approve</button>
                <button className="secondary" disabled={busy} onClick={() => act({ action: 'officerDecision', evaluationId: row.id, decision: 'reject', note: 'Rejected after human review' })}><Ban size={14} /> Reject</button>
                <button className="secondary" disabled={busy} onClick={() => setClarFor(row)}><MessagesSquare size={14} /> Ask clarification</button>
              </div>
            </Alert>
          )}
          {row.status === 'qualified' && (
            <div className="button-row" style={{ marginBottom: 8 }}>
              <button className="secondary" disabled={busy} onClick={() => setClarFor(row)}><MessagesSquare size={14} /> Ask clarification</button>
            </div>
          )}
          <div className="detail-grid">
            <section><p className="side-card-title">Documents (6-state)</p>
              <div className="mini-list">
                {dd.docs.map(doc => (
                  <div key={doc.docName}>
                    <span className="tick"><FileCheck2 size={13} /></span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <b>{doc.label}</b><ClassificationChip c={doc.classification} /><Doc6Badge status={doc.status} />
                      <small>{doc.note}</small>
                    </div>
                  </div>
                ))}
              </div>
              <p className="side-card-title">Triangulation (CA vs GSTR-3B vs P&amp;L, ≤10%)</p>
              <Doc6Badge status={dd.triangulation.status} /> <small>{dd.triangulation.note}</small>
            </section>
            <aside><p className="side-card-title">Eligibility (declared data)</p>
              {dd.eligibilityRows.map(r => <ElRow key={r.key} row={r} />)}
              <p className="side-card-title">Technical</p>
              <p>{dd.technical.passed}/{dd.technical.total} golden parameters matched</p>
              {dd.technical.failures.map(f => <Alert key={f} variant="danger">{f}</Alert>)}
              <p className="side-card-title">Flags</p>
              {dd.flags.length === 0 ? <p>No forensic flags — cartel radar and ALB clean.</p> : dd.flags.map((f, i) => <Alert key={i} variant={f.severity === 'CRITICAL' ? 'danger' : f.severity === 'WARNING' ? 'warning' : 'info'} title={f.kind}>{f.note}</Alert>)}
              <p className="side-card-title">Reasons</p>
              {dd.reasons.map(r => <p key={r}><small>{r}</small></p>)}
              {dd.clarifications.length > 0 && <><p className="side-card-title">Clarifications</p>{dd.clarifications.map(c => <Alert key={c.id} variant={c.status === 'PENDING' ? 'warning' : 'info'}>{c.question} — {c.response ?? 'pending'}</Alert>)}</>}
            </aside>
          </div>
        </section>
      )
    })()}

    {clarFor && (
      <Modal title={`Ask clarification — ${clarFor.companyName}`} subtitle="Technical evaluation is blocked while pending (GeM rule)" onClose={() => setClarFor(null)}
        footer={<button className="secondary" onClick={() => setClarFor(null)}>Close</button>}>
        <form onSubmit={e => {
          e.preventDefault()
          const f = new FormData(e.currentTarget)
          if (!clarFor.submissionId) return
          act({ action: 'askClarification', submissionId: clarFor.submissionId, question: String(f.get('question') || '') }).then(() => setClarFor(null))
        }}>
          <label>Question<textarea name="question" rows={3} required placeholder="e.g. Clarify the UDIN on your turnover certificate" style={{ width: '100%' }} /></label>
          <button className="primary" type="submit" disabled={busy}>Send — respond-by window 10 min (demo)</button>
        </form>
      </Modal>
    )}
  </PageFrame>
}

// ---------------------------------------------------------------------------
// Seller — live e-reverse auction room
// ---------------------------------------------------------------------------

function AuctionRoom({ tenderId }: { tenderId: string | null }) {
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
      {a.endsAtISO && (a.stage === 'AUCTION_ACTIVE') && <span className="status status-exception"><Timer size={12} /> ends in {fmtCountdown(a.endsAtISO)}</span>}
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
        : <div className="mini-list">{a.recentBids.map((b, i) => (
          <div key={i}>
            <span className="tick"><Gavel size={13} /></span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <b>₹{b.amountCr} Cr</b><small>{b.anonymous} · {new Date(b.atISO).toLocaleTimeString('en-IN')}{b.mine ? ' — you' : ''}</small>
            </div>
          </div>
        ))}</div>}
    </section>
  </PageFrame>
}

// ---------------------------------------------------------------------------
// Clarification centre (officer queue / seller respond)
// ---------------------------------------------------------------------------

interface ClarRow { id: string; tenderId: string; tenderTitle: string; stage: string; companyName: string; question: string; response: string | null; askedAtISO: string; respondByISO: string; status: string }

function ClarificationCenter({ user }: { user: SessionUser }) {
  const { data, error, retry } = useApi<{ clarifications: ClarRow[] }>('/api/data?resource=clarifications', user.type === 'officer' ? undefined : 5000)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})

  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const rows = data.clarifications
  const pending = rows.filter(c => c.status === 'PENDING')

  const respond = async (id: string) => {
    setErr(null); setBusy(true)
    try { await runAction({ action: 'respondClarification', clarificationId: id, response: draft[id] ?? '' }); retry() }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Response failed') }
    finally { setBusy(false) }
  }

  return <PageFrame title="Clarification centre" subtitle={user.type === 'officer' ? 'Open questions block technical evaluation until answered (GeM rule).' : 'Answer officer questions so your bid can be evaluated.'} actions={null}>
    {err && <Alert variant="danger">{err}</Alert>}
    {rows.length === 0
      ? <section className="panel"><div className="empty-evidence" style={{ height: 180 }}><MessagesSquare size={28} /><b>No clarifications</b><small>{user.type === 'officer' ? 'Ask one from the evaluation drill-down.' : 'Nothing to answer — you are all caught up.'}</small></div></section>
      : <section className="panel"><div className="table-caption"><b>{rows.length} item(s)</b><span>{pending.length} pending response</span></div>
        <div className="mini-list">
          {rows.map(c => (
            <div key={c.id}>
              <span className="tick"><MessagesSquare size={13} /></span>
              <div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <b>{user.type === 'officer' ? c.companyName : c.tenderTitle}</b>
                  <span className={`status ${c.status === 'PENDING' ? 'status-in-review' : 'status-verified'}`}>{c.status.toLowerCase()}</span>
                  {c.status === 'PENDING' && <small>respond by {new Date(c.respondByISO).toLocaleTimeString('en-IN')}</small>}
                </div>
                <small><b>Q:</b> {c.question}</small>
                {c.response && <small><b>A:</b> {c.response}</small>}
                {user.type === 'seller' && c.status === 'PENDING' && (
                  <div className="button-row" style={{ marginTop: 6 }}>
                    <input value={draft[c.id] ?? ''} onChange={e => setDraft(d => ({ ...d, [c.id]: e.target.value }))} placeholder="Your response…" style={{ flex: 1 }} />
                    <button className="primary" disabled={busy || !(draft[c.id] ?? '').trim()} onClick={() => respond(c.id)}>Send</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>}
  </PageFrame>
}

// ---------------------------------------------------------------------------
// Seller — GeM marketplace (discovery with eligibility pre-check)
// ---------------------------------------------------------------------------

function Marketplace({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
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
                <span className="status status-pending"><Timer size={12} /> {fmtCountdown(t.submissionDeadlineISO)}</span>
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

// ---------------------------------------------------------------------------
// Hash-chain audit explorer (client-visible chain verification)
// ---------------------------------------------------------------------------

function AuditExplorer() {
  const { data, error, retry } = useApi<AuditData>('/api/data?resource=audit')
  const [expanded, setExpanded] = useState<number | null>(null)
  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  return <PageFrame title="Audit explorer — hash chain" subtitle="Every action is chained with SHA-256: SHA256(id + ts + actor + action + payload + prevHash)." actions={<button className="secondary" onClick={retry}><RefreshCw size={15} /> Re-verify chain</button>}>
    <Alert variant={data.chainValid ? 'success' : 'danger'} title={data.chainValid ? 'Chain verified — intact' : 'TAMPER DETECTED'}>
      {data.chainValid
        ? `All ${data.total} entries hash-link correctly. Mutating any row in the database makes verification fail here.`
        : data.chainMessage}
    </Alert>
    <section className="panel"><div className="table-caption"><b>{data.entries.length} entries (newest first)</b><span>Click a row to inspect hash linkage</span></div>
      <div className="table-wrap"><table><thead><tr><th>#</th><th>When</th><th>Actor</th><th>Action</th><th>Tender</th><th>Hash → prev</th></tr></thead><tbody>
        {data.entries.map(e => (
          <>
            <tr key={e.seq} onClick={() => setExpanded(expanded === e.seq ? null : e.seq)} style={{ cursor: 'pointer' }}>
              <td>{e.seq}</td>
              <td><Clock3 size={13} />{new Date(e.tsISO).toLocaleTimeString('en-IN')}</td>
              <td>{e.actorName} <small>({e.actorRole.toLowerCase()})</small></td>
              <td><b>{e.action}</b></td>
              <td>{e.tenderId ?? '—'}</td>
              <td><small>{e.hashShort} ← {e.prevHashShort}</small></td>
            </tr>
            {expanded === e.seq && (
              <tr key={`${e.seq}-meta`}><td colSpan={6}><pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(e.meta, null, 2)}</pre></td></tr>
            )}
          </>
        ))}
      </tbody></table></div>
    </section>
  </PageFrame>
}

const OVERVIEW: Record<string, { icon: LucideIcon; title: string; subtitle: string; overview: string; features: [string, string][]; links: [View, string, LucideIcon][]; reports?: boolean }> = {
  documents: {
    icon: FileCheck2,
    title: 'Document verification',
    subtitle: 'Verify submitted documents against authorized sources.',
    overview: 'Track document completeness for every submission and surface anything that needs attention before evaluation.',
    features: [
      ['Authorized source cross-checks', 'Submitted files are validated against authorized registries and records.'],
      ['Clear exception flags', 'Missing, expired, or inconsistent documents are highlighted automatically.'],
      ['Per-bidder completeness', 'See exactly which documents each bidder has submitted.'],
    ],
    links: [['compliance', 'Open bidder compliance', Users], ['tenders', 'Browse tenders', FileText], ['dashboard', 'Back to dashboard', BarChart3]],
  },
  reports: {
    icon: BookOpen,
    title: 'Reports',
    subtitle: 'Generate compliance summaries and procurement activity reports.',
    overview: 'Produce audit-ready summaries of verification activity, exceptions, and outcomes across your tenders.',
    features: [
      ['Compliance summaries', 'Roll up verification results by tender or bidder.'],
      ['Activity over time', 'Understand throughput and turnaround across periods.'],
      ['Export-ready output', 'Formatted for records, review, and accountability.'],
    ],
    links: [['dashboard', 'View activity dashboard', BarChart3], ['audit', 'Open audit trail', History]],
    reports: true,
  },
  audit: {
    icon: History,
    title: 'Audit trail',
    subtitle: 'A complete, tamper-evident record of platform activity.',
    overview: 'Every verification action is time-stamped and immutable, giving you full traceability for accountability.',
    features: [
      ['Time-stamped actions', 'Each check and decision is recorded with who acted and when.'],
      ['Immutable history', 'Records cannot be altered after the fact.'],
      ['Full traceability', 'Follow any outcome back to its supporting evidence.'],
    ],
    links: [['reports', 'Go to reports', BookOpen], ['dashboard', 'Back to dashboard', BarChart3]],
  },
  'my-bids': {
    icon: FileText,
    title: 'My bids',
    subtitle: 'Track your submitted bids and their current status.',
    overview: 'Follow each submission from draft to outcome, and act on anything that needs attention before a deadline.',
    features: [
      ['Live status tracking', 'See where each bid stands at a glance.'],
      ['Deadline awareness', 'Know what needs action before closing dates.'],
      ['Document readiness', 'Confirm your compliance documents are complete.'],
    ],
    links: [['opportunities', 'Find opportunities', Search], ['compliance', 'Check compliance status', Users], ['dashboard', 'Back to dashboard', BarChart3]],
  },
  opportunities: {
    icon: Search,
    title: 'Tender opportunities',
    subtitle: 'Discover and track open procurement opportunities.',
    overview: 'Browse open tenders that match your registration and eligibility, and start a submission when you are ready.',
    features: [
      ['Relevant opportunities', 'Focus on tenders you are eligible to bid on.'],
      ['Key dates upfront', 'Deadlines and requirements are shown clearly.'],
      ['One place to act', 'Move from discovery to submission smoothly.'],
    ],
    links: [['tenders', 'Browse all tenders', FileText], ['my-bids', 'View my bids', FileText], ['dashboard', 'Back to dashboard', BarChart3]],
  },
}

function OverviewPage({ view, navigate }: { view: View; navigate: (v: View, o?: NavigateOptions) => void }) {
  const { user } = useContext(SessionContext)
  const cfg = OVERVIEW[view] ?? OVERVIEW.documents
  const Icon = cfg.icon
  return (
    <PageFrame title={cfg.title} subtitle={cfg.subtitle} role={user?.type ?? 'officer'} actions={null}>
      <div className="overview-grid">
        <section className="panel">
          <div className="overview-hero"><div className="circle-icon"><Icon /></div><div><h2>Overview</h2><p>{cfg.overview}</p></div></div>
          <p className="side-card-title">What you can do here</p>
          <div className="mini-list">
            {cfg.features.map(([t, d]) => <div key={t}><span className="tick"><Check size={13} /></span><div><b>{t}</b><small>{d}</small></div></div>)}
          </div>
        </section>
        <aside className="panel">
          <p className="side-card-title">Quick actions</p>
          <div className="quick-links">
            {cfg.links.map(([target, label, LI]) => <button key={target} onClick={() => navigate(target)}><span><span className="qi"><LI size={16} /></span>{label}</span><ChevronRight size={16} className="arrow" /></button>)}
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}><Alert variant="info">Everything shown reflects your account and permissions.</Alert></div>
        </aside>
      </div>
      {cfg.reports && (
        <div className="report-cards">
          <button className="report-card" onClick={() => navigate('dashboard')}><div className="circle-icon"><ShieldCheck /></div><b>Compliance summary</b><p>Verification outcomes rolled up by tender and bidder.</p></button>
          <button className="report-card" onClick={() => navigate('dashboard')}><div className="circle-icon"><BarChart3 /></div><b>Verification activity</b><p>Checks completed and turnaround over time.</p></button>
          <button className="report-card" onClick={() => navigate('audit')}><div className="circle-icon"><AlertTriangle /></div><b>Exceptions report</b><p>Flagged items requiring officer review.</p></button>
        </div>
      )}
    </PageFrame>
  )
}

function AboutPage({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
  const { user } = useContext(SessionContext)
  const steps: [string, string, string][] = [
    ['1', 'Tender requirements', 'Eligibility criteria, technical specifications, and terms are captured.'],
    ['2', 'Bid documents', 'Bidders submit the documents required for evaluation.'],
    ['3', 'Verification', 'Information is checked against authorized sources.'],
    ['4', 'Compliance review', 'Exceptions are highlighted for officer review with evidence.'],
  ]
  return (
    <PageFrame title="How BidSure works" subtitle="A transparent, evidence-based workflow for structured procurement verification." eyebrow="ABOUT BIDSURE" actions={user ? null : <button className="primary" onClick={() => navigate('login')}><LockKeyhole size={16} /> Sign in</button>}>
      <div className="stack">
        <div className="overview-grid">
          <section className="panel">
            <div className="panel-head"><div><h2>From tender requirements to confident decisions</h2><p>Four connected stages keep every verification accountable.</p></div></div>
            <div className="mini-list steps">
              {steps.map(([n, t, d]) => <div key={t}><span className="tick">{n}</span><div><b>{t}</b><small>{d}</small></div></div>)}
            </div>
          </section>
          <aside className="panel">
            <div className="overview-hero"><div className="circle-icon"><ShieldCheck /></div><div><h2>Why it matters</h2><p>Structured, evidence-based checks make procurement decisions faster, fairer, and fully auditable.</p></div></div>
            <div className="quick-links">
              <button onClick={() => navigate(user ? 'dashboard' : 'login')}><span><span className="qi"><LogIn size={16} /></span>{user ? 'Go to dashboard' : 'Sign in to get started'}</span><ChevronRight size={16} className="arrow" /></button>
              <button onClick={() => navigate('help')}><span><span className="qi"><HelpCircle size={16} /></span>Visit the help centre</span><ChevronRight size={16} className="arrow" /></button>
            </div>
          </aside>
        </div>
        <section className="panel">
          <div className="panel-head"><div><h2>Built for transparent verification</h2><p>The pillars behind every review.</p></div></div>
          <div className="pillar-grid">
            <Pillar icon={<FileSearch />} title="Requirement Analysis" text="Identify eligibility and compliance requirements from tender documents." />
            <Pillar icon={<FileCheck2 />} title="Bid Verification" text="Verify bidder information and documents against authorized sources." />
            <Pillar icon={<ShieldCheck />} title="Evidence-Based Review" text="Highlight missing information, inconsistencies and exceptions for officers." />
          </div>
        </section>
      </div>
    </PageFrame>
  )
}

function SupportPage({ view, navigate }: { view: View; navigate: (v: View, o?: NavigateOptions) => void }) {
  const { user } = useContext(SessionContext)
  const isSupport = view === 'support'
  const faqs: [string, string][] = [
    ['How do I sign in?', 'Officers sign in with an official email and employee ID; sellers use their business email and registration details.'],
    ['Which documents are verified?', 'Registration, tax, financial capacity, OEM authorization, experience references, and debarment declarations — cross-checked against authorized sources.'],
    ['How are exceptions handled?', 'Any missing or inconsistent item is flagged for officer review with supporting evidence and notes.'],
    ['Is my data secure?', 'Sessions are protected and every action is recorded in a tamper-evident audit trail.'],
  ]
  return (
    <PageFrame title={isSupport ? 'Support' : 'Help centre'} subtitle={isSupport ? 'Get help and reach the BidSure team.' : 'Guidance for using the BidSure platform.'} eyebrow="HELP & SUPPORT" role={user?.type ?? 'officer'} actions={null}>
      <div className="stack">
        <div className="overview-grid">
          <section className="panel">
            <div className="panel-head"><div><h2>Frequently asked questions</h2><p>Quick answers to the most common questions.</p></div></div>
            <div className="faq">{faqs.map(([q, a]) => <div className="faq-item" key={q}><b>{q}</b><p>{a}</p></div>)}</div>
          </section>
          <aside className="panel">
            <div className="overview-hero"><div className="circle-icon"><HelpCircle /></div><div><h2>Still need help?</h2><p>Reach our team and we will get back to you.</p></div></div>
            <div className="quick-links">
              <button onClick={() => navigate(user ? 'dashboard' : 'home')}><span><span className="qi"><ArrowRight size={16} /></span>{user ? 'Back to dashboard' : 'Back to home'}</span><ChevronRight size={16} className="arrow" /></button>
              <button onClick={() => navigate('about')}><span><span className="qi"><BookOpen size={16} /></span>How BidSure works</span><ChevronRight size={16} className="arrow" /></button>
            </div>
          </aside>
        </div>
        <div>
          <p className="side-card-title">Contact the team</p>
          <div className="contact-grid">
            <div className="contact-card"><div className="circle-icon"><Mail /></div><span>Email</span><b>support@bidsure.gov</b></div>
            <div className="contact-card"><div className="circle-icon"><Phone /></div><span>Helpline</span><b>1800-BID-SURE</b></div>
            <div className="contact-card"><div className="circle-icon"><Clock3 /></div><span>Hours</span><b>Mon–Fri, 9:00–18:00 IST</b></div>
          </div>
        </div>
      </div>
    </PageFrame>
  )
}

function GenericPage({ view, navigate }: { view: View; navigate: (v: View, o?: NavigateOptions) => void }) {
  if (view === 'about') return <AboutPage navigate={navigate} />
  if (view === 'help' || view === 'support') return <SupportPage view={view} navigate={navigate} />
  return <OverviewPage view={view} navigate={navigate} />
}

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
    window.history.pushState({ view: v }, '', window.location.pathname)
  }, [])

  const signIn = useCallback((u: SessionUser) => {
    setUser(u)
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(u))
  }, [])

  const signOut = useCallback(() => {
    setUser(null)
    storeToken(null)
    sessionStorage.removeItem(SESSION_KEY)
  }, [])

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY)
      if (raw) setUser(JSON.parse(raw))
    } catch {
      sessionStorage.removeItem(SESSION_KEY)
    }
    setReady(true)
  }, [])

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state && typeof e.state.view === 'string') {
        setView(e.state.view as View)
      }
    }
    window.history.replaceState({ view: 'home' }, '', window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const sessionValue = useMemo(() => ({ user, signIn, signOut }), [user, signIn, signOut])

  if (!ready) return null

  if (view === 'login') {
    return <SessionContext.Provider value={sessionValue}><Login navigate={navigate} signIn={signIn} /></SessionContext.Provider>
  }

  const officerViews = ['dashboard', 'workflow', 'w-tender', 'w-eval', 'w-auction', 'w-create', 'clarifications', 'tenders', 'tender', 'evaluation', 'compliance', 'documents', 'reports', 'audit', 'about', 'help']
  const sellerViews = ['dashboard', 'marketplace', 'w-tender', 'w-auction', 'clarifications', 'my-bids', 'opportunities', 'compliance', 'documents', 'tenders', 'tender', 'about', 'help', 'support']

  if (user && ['dashboard', 'workflow', 'w-tender', 'w-eval', 'w-auction', 'w-create', 'clarifications', 'marketplace', 'tenders', 'tender', 'evaluation', 'compliance', 'documents', 'reports', 'audit', 'about', 'help', 'my-bids', 'opportunities', 'support'].includes(view)) {
    const allowed = user.type === 'officer' ? officerViews : sellerViews
    const guardedView = (allowed.includes(view) ? view : 'dashboard') as View
    return (
      <SessionContext.Provider value={sessionValue}>
        <AppShell view={guardedView} navigate={navigate}>
          {guardedView === 'dashboard' ? (user.type === 'officer' ? <OfficerDashboard navigate={navigate} userId={user.id} /> : <SellerDashboard navigate={navigate} userId={user.id} />)
            : guardedView === 'workflow' ? <WorkflowTenders navigate={navigate} />
            : guardedView === 'w-create' ? <CreateTender navigate={navigate} />
            : guardedView === 'w-tender' ? <WorkflowTenderDetail navigate={navigate} user={user} tenderId={selectedTenderId} />
            : guardedView === 'w-eval' ? <EvalDetailV2 navigate={navigate} tenderId={selectedTenderId} />
            : guardedView === 'w-auction' ? <AuctionRoom tenderId={selectedTenderId} />
            : guardedView === 'clarifications' ? <ClarificationCenter user={user} />
            : guardedView === 'marketplace' ? <Marketplace navigate={navigate} />
            : guardedView === 'audit' && user.type === 'officer' ? <AuditExplorer />
            : guardedView === 'tenders' ? <Tenders navigate={navigate} userId={user.id} />
            : guardedView === 'tender' ? <TenderDetail navigate={navigate} userId={user.id} tenderId={selectedTenderId} />
            : guardedView === 'evaluation' ? <Evaluation navigate={navigate} userId={user.id} tenderId={selectedTenderId} />
            : guardedView === 'compliance' ? <Compliance navigate={navigate} userId={user.id} tenderId={selectedTenderId} bidder={selectedBidder} />
            : <GenericPage view={guardedView} navigate={navigate} />}
        </AppShell>
      </SessionContext.Provider>
    )
  }

  return (
    <SessionContext.Provider value={sessionValue}>
      <div className="public-site">
        <PublicHeader view={view} navigate={navigate} />
        <main>{view === 'home' ? <Home navigate={navigate} /> : <GenericPage view={view} navigate={navigate} />}</main>
        <PublicFooter />
      </div>
    </SessionContext.Provider>
  )
}
