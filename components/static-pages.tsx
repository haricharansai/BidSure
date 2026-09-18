'use client'

import {
  ArrowRight, BookOpen, Eye, HelpCircle, Info, LockKeyhole, LogIn, Mail,
  Phone, ScrollText, Search, ShieldCheck, Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { View, NavigateOptions } from '@/components/types'
import { useSession } from '@/components/types'
import { PageFrame } from '@/components/layout'
import { Alert } from '@/components/ui'

// ---------------------------------------------------------------------------
// Overview pages (documents, reports, audit, my-bids, opportunities)
// ---------------------------------------------------------------------------

const OVERVIEW: Record<string, { icon: LucideIcon; title: string; subtitle: string; overview: string; features: [string, string][]; links: [View, string, LucideIcon][]; reports?: boolean }> = {
  documents: {
    icon: Eye,
    title: 'Document verification',
    subtitle: 'Verify submitted documents against authorized sources.',
    overview: 'Track document completeness for every submission and surface anything that needs attention before evaluation.',
    features: [['Authorized source cross-checks', 'Submitted files are validated against authorized registries and records.'], ['Clear exception flags', 'Missing, expired, or inconsistent documents are highlighted automatically.'], ['Per-bidder completeness', 'See exactly which documents each bidder has submitted.']],
    links: [['compliance', 'Open bidder compliance', Users], ['tenders', 'Browse tenders', BookOpen], ['dashboard', 'Back to dashboard', ShieldCheck]],
  },
  reports: {
    icon: BookOpen,
    title: 'Reports',
    subtitle: 'Generate compliance summaries and procurement activity reports.',
    overview: 'Produce audit-ready summaries of verification activity, exceptions, and outcomes across your tenders.',
    features: [['Compliance summaries', 'Roll up verification results by tender or bidder.'], ['Activity over time', 'Understand throughput and turnaround across periods.'], ['Export-ready output', 'Formatted for records, review, and accountability.']],
    links: [['dashboard', 'View activity dashboard', ShieldCheck], ['audit', 'Open audit trail', ScrollText]],
    reports: true,
  },
  audit: {
    icon: ScrollText,
    title: 'Audit trail',
    subtitle: 'A complete, tamper-evident record of platform activity.',
    overview: 'Every verification action is time-stamped and immutable, giving you full traceability for accountability.',
    features: [['Time-stamped actions', 'Each check and decision is recorded with who acted and when.'], ['Immutable history', 'Records cannot be altered after the fact.'], ['Full traceability', 'Follow any outcome back to its supporting evidence.']],
    links: [['reports', 'Go to reports', BookOpen], ['dashboard', 'Back to dashboard', ShieldCheck]],
  },
  'my-bids': {
    icon: BookOpen,
    title: 'My bids',
    subtitle: 'Track your submitted bids and their current status.',
    overview: 'Follow each submission from draft to outcome, and act on anything that needs attention before a deadline.',
    features: [['Live status tracking', 'See where each bid stands at a glance.'], ['Deadline awareness', 'Know what needs action before closing dates.'], ['Document readiness', 'Confirm your compliance documents are complete.']],
    links: [['opportunities', 'Find opportunities', Search], ['compliance', 'Check compliance status', Users], ['dashboard', 'Back to dashboard', ShieldCheck]],
  },
  opportunities: {
    icon: Search,
    title: 'Tender opportunities',
    subtitle: 'Discover and track open procurement opportunities.',
    overview: 'Browse open tenders that match your registration and eligibility, and start a submission when you are ready.',
    features: [['Relevant opportunities', 'Focus on tenders you are eligible to bid on.'], ['Key dates upfront', 'Deadlines and requirements are shown clearly.'], ['One place to act', 'Move from discovery to submission smoothly.']],
    links: [['tenders', 'Browse all tenders', BookOpen], ['my-bids', 'View my bids', BookOpen], ['dashboard', 'Back to dashboard', ShieldCheck]],
  },
}

function OverviewPage({ view, navigate }: { view: View; navigate: (v: View, o?: NavigateOptions) => void }) {
  const { user } = useSession()
  const cfg = OVERVIEW[view] ?? OVERVIEW.documents
  const Icon = cfg.icon
  return (
    <PageFrame title={cfg.title} subtitle={cfg.subtitle} role={user?.type ?? 'officer'} actions={null}>
      <div className="overview-grid">
        <section className="panel">
          <div className="overview-hero"><div className="circle-icon"><Icon /></div><div><h2>Overview</h2><p>{cfg.overview}</p></div></div>
          <p className="side-card-title">What you can do here</p>
          <div className="mini-list">
            {cfg.features.map(([t, d]) => <div key={t}><span className="tick">✓</span><div><b>{t}</b><small>{d}</small></div></div>)}
          </div>
        </section>
        <aside className="panel">
          <p className="side-card-title">Quick actions</p>
          <div className="quick-links">
            {cfg.links.map(([target, label, LI]) => <button key={target} onClick={() => navigate(target)}><span><span className="qi"><LI size={16} /></span>{label}</span><ArrowRight size={16} className="arrow" /></button>)}
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}><Alert variant="info">Everything shown reflects your account and permissions.</Alert></div>
        </aside>
      </div>
      {cfg.reports && (
        <div className="report-cards">
          <button className="report-card" onClick={() => navigate('dashboard')}><div className="circle-icon"><ShieldCheck /></div><b>Compliance summary</b><p>Verification outcomes rolled up by tender and bidder.</p></button>
          <button className="report-card" onClick={() => navigate('dashboard')}><div className="circle-icon"><ShieldCheck /></div><b>Verification activity</b><p>Checks completed and turnaround over time.</p></button>
          <button className="report-card" onClick={() => navigate('audit')}><div className="circle-icon"><ShieldCheck /></div><b>Exceptions report</b><p>Flagged items requiring officer review.</p></button>
        </div>
      )}
    </PageFrame>
  )
}

// ---------------------------------------------------------------------------
// About page
// ---------------------------------------------------------------------------

export function AboutPage({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
  const { user } = useSession()
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
              <button onClick={() => navigate(user ? 'dashboard' : 'login')}><span><span className="qi"><LogIn size={16} /></span>{user ? 'Go to dashboard' : 'Sign in to get started'}</span><ArrowRight size={16} className="arrow" /></button>
              <button onClick={() => navigate('help')}><span><span className="qi"><HelpCircle size={16} /></span>Visit the help centre</span><ArrowRight size={16} className="arrow" /></button>
            </div>
          </aside>
        </div>
      </div>
    </PageFrame>
  )
}

// ---------------------------------------------------------------------------
// Support / Help page
// ---------------------------------------------------------------------------

export function SupportPage({ view, navigate }: { view: View; navigate: (v: View, o?: NavigateOptions) => void }) {
  const { user } = useSession()
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
              <button onClick={() => navigate(user ? 'dashboard' : 'home')}><span><span className="qi"><ArrowRight size={16} /></span>{user ? 'Back to dashboard' : 'Back to home'}</span><ArrowRight size={16} className="arrow" /></button>
              <button onClick={() => navigate('about')}><span><span className="qi"><BookOpen size={16} /></span>How BidSure works</span><ArrowRight size={16} className="arrow" /></button>
            </div>
          </aside>
        </div>
        <div>
          <p className="side-card-title">Contact the team</p>
          <div className="contact-grid">
            <div className="contact-card"><div className="circle-icon"><Mail /></div><span>Email</span><b>support@bidsure.gov</b></div>
            <div className="contact-card"><div className="circle-icon"><Phone /></div><span>Helpline</span><b>1800-BID-SURE</b></div>
          </div>
        </div>
      </div>
    </PageFrame>
  )
}

// ---------------------------------------------------------------------------
// Privacy page
// ---------------------------------------------------------------------------

export function PrivacyPage({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
  const { user } = useSession()
  return (
    <PageFrame title="Privacy Policy" subtitle="How BidSure collects, uses, and protects your information." eyebrow="LEGAL" actions={user ? null : <button className="primary" onClick={() => navigate('login')}><LockKeyhole size={16} /> Sign in</button>}>
      <div className="stack">
        <section className="panel"><div className="panel-head"><div><h2>Information we collect</h2></div></div>
          <div className="policy-content"><ul>
            <li><b>Account information</b> — Name, email address, department or company name, employee ID, and role.</li>
            <li><b>Tender and bid data</b> — Documents uploaded for verification, compliance check results, and evaluation records.</li>
            <li><b>Activity logs</b> — Actions performed on the platform, timestamps, and audit trail entries.</li>
          </ul></div>
        </section>
        <section className="panel"><div className="panel-head"><div><h2>Data security</h2></div></div>
          <div className="policy-content"><ul>
            <li>End-to-end encrypted sessions</li>
            <li>Tamper-evident audit trail with cryptographic verification</li>
            <li>Role-based access control</li>
          </ul></div>
        </section>
      </div>
    </PageFrame>
  )
}

// ---------------------------------------------------------------------------
// Terms page
// ---------------------------------------------------------------------------

export function TermsPage({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
  const { user } = useSession()
  return (
    <PageFrame title="Terms of Service" subtitle="Rules and responsibilities governing use of the BidSure platform." eyebrow="LEGAL" actions={user ? null : <button className="primary" onClick={() => navigate('login')}><LockKeyhole size={16} /> Sign in</button>}>
      <div className="stack">
        <section className="panel"><div className="panel-head"><div><h2>Acceptance of terms</h2></div></div>
          <div className="policy-content"><p>By using BidSure you agree to these terms. Access is limited to authorized procurement officers and registered sellers.</p></div>
        </section>
        <section className="panel"><div className="panel-head"><div><h2>User responsibilities</h2></div></div>
          <div className="policy-content"><ul>
            <li><b>Officers</b> — Review bids fairly, base decisions on evidence.</li>
            <li><b>Sellers</b> — Submit accurate and genuine documents.</li>
            <li><b>All users</b> — Protect your credentials, do not share access.</li>
          </ul></div>
        </section>
      </div>
    </PageFrame>
  )
}

// ---------------------------------------------------------------------------
// Accessibility page
// ---------------------------------------------------------------------------

export function AccessibilityPage({ navigate }: { navigate: (v: View, o?: NavigateOptions) => void }) {
  const { user } = useSession()
  return (
    <PageFrame title="Accessibility Statement" subtitle="Our commitment to making BidSure usable by everyone." eyebrow="LEGAL" actions={user ? null : <button className="primary" onClick={() => navigate('login')}><LockKeyhole size={16} /> Sign in</button>}>
      <div className="stack">
        <section className="panel"><div className="panel-head"><div><h2>Accessibility features</h2></div></div>
          <div className="policy-content"><ul>
            <li><b>Keyboard navigation</b> — All interactive elements are accessible via keyboard.</li>
            <li><b>Screen reader support</b> — Semantic HTML, ARIA labels, and role attributes.</li>
            <li><b>Colour contrast</b> — Text and interactive elements meet WCAG 2.1 AA contrast ratios.</li>
            <li><b>Resizable text</b> — Use the font-size controls (A−/A/A+) in the utility bar.</li>
            <li><b>Dark mode</b> — Toggle light/dark theme for comfortable viewing.</li>
          </ul></div>
        </section>
      </div>
    </PageFrame>
  )
}

// ---------------------------------------------------------------------------
// Generic page dispatcher
// ---------------------------------------------------------------------------

export function GenericPage({ view, navigate }: { view: View; navigate: (v: View, o?: NavigateOptions) => void }) {
  if (view === 'about') return <AboutPage navigate={navigate} />
  if (view === 'help' || view === 'support') return <SupportPage view={view} navigate={navigate} />
  if (view === 'privacy') return <PrivacyPage navigate={navigate} />
  if (view === 'terms') return <TermsPage navigate={navigate} />
  if (view === 'accessibility') return <AccessibilityPage navigate={navigate} />
  return <OverviewPage view={view} navigate={navigate} />
}
