'use client'

import { useMemo, useState, useEffect } from 'react'
import {
  ArrowRight, BadgeCheck, BarChart3, Bell, BookOpen, Building2, Check, ChevronDown, ChevronRight,
  ClipboardCheck, Clock3, Download, FileCheck2, FileSearch, FileText, HelpCircle, History, LockKeyhole,
  LogIn, Menu, Search, Settings2, ShieldCheck, SlidersHorizontal, UserRound, Users, X, XCircle, Eye,
} from 'lucide-react'

type View = 'home' | 'about' | 'help' | 'login' | 'dashboard' | 'tenders' | 'tender' | 'evaluation' | 'compliance' | 'documents' | 'reports' | 'audit' | 'my-bids' | 'opportunities' | 'support'
type Role = 'officer' | 'seller'
type Status = 'Verified' | 'Pending' | 'Exception' | 'In Review' | 'Complete'

const tenders = [
  { id: 'GOV/ICT/2026/041', title: 'Supply and installation of secure network infrastructure', agency: 'Ministry of Digital Transformation', deadline: '12 Sep 2026', bidders: 8, status: 'In Review' as Status, value: '₹18.4 Cr' },
  { id: 'PWD/INFRA/2026/019', title: 'Construction of regional public health centres', agency: 'Public Works Department', deadline: '20 Sep 2026', bidders: 12, status: 'Pending' as Status, value: '₹42.8 Cr' },
  { id: 'EDU/TECH/2026/008', title: 'Digital classroom equipment and support services', agency: 'Department of Education', deadline: '05 Oct 2026', bidders: 5, status: 'Complete' as Status, value: '₹9.6 Cr' },
  { id: 'HEALTH/PHARMA/2026/032', title: 'Annual supply of essential medicines', agency: 'National Health Authority', deadline: '28 Sep 2026', bidders: 16, status: 'Exception' as Status, value: '₹27.2 Cr' },
]
const bidders = [
  { name: 'Nexora Systems Pvt. Ltd.', reg: 'CIN U72900DL2014PTC...', docs: '14 / 14', status: 'Verified' as Status, risk: 'Low' },
  { name: 'Apex Infrastructure Ltd.', reg: 'CIN U45201MH2010PLC...', docs: '12 / 14', status: 'Exception' as Status, risk: 'Medium' },
  { name: 'CivicGrid Technologies', reg: 'CIN U72200KA2018PTC...', docs: '14 / 14', status: 'Verified' as Status, risk: 'Low' },
  { name: 'Harborline Solutions', reg: 'CIN U74999TN2016PTC...', docs: '11 / 14', status: 'Pending' as Status, risk: 'High' },
]

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="brand-mark"><ShieldCheck size={compact ? 22 : 28} strokeWidth={1.7} /></span><span><strong>BidSure</strong>{!compact && <small>Bid Compliance Verification Platform</small>}</span></div>
}
function StatusBadge({ status }: { status: Status }) { return <span className={`status status-${status.toLowerCase().replace(' ', '-')}`}><span />{status}</span> }
function PublicHeader({ view, navigate }: { view: View; navigate: (v: View) => void }) {
  return <><div className="utility"><div><b>Government Procurement</b><span>•</span> Digital Verification Platform</div><div className="utility-links"><span>Skip to main content</span><span>|</span><span>A-</span><span>A</span><span>A+</span><span>◉</span><span>English⌄</span></div></div><header className="public-header"><Logo /><nav><button className={view === 'home' ? 'active' : ''} onClick={() => navigate('home')}>Home</button><button className={view === 'about' ? 'active' : ''} onClick={() => navigate('about')}>About</button><button onClick={() => navigate('about')}>How It Works</button><button className={view === 'help' ? 'active' : ''} onClick={() => navigate('help')}>Help</button></nav><div className="header-actions"><button className="icon-button" aria-label="Profile"><UserRound size={19} /></button><button className="language">◎ &nbsp; English⌄</button><button className="primary small" onClick={() => navigate('login')}><LockKeyhole size={16} /> Login</button></div><button className="mobile-menu" aria-label="Menu"><Menu /></button></header></>
}
function PublicFooter() { return <footer className="public-footer"><div><Logo compact /><p>© 2026 BidSure. All rights reserved.</p></div><div className="footer-links"><span>About</span><span>Help</span><span>Accessibility</span><span>Privacy</span><span>Terms</span></div><p>For authorized government procurement users</p></footer> }
function Home({ navigate }: { navigate: (v: View) => void }) {
  return <><section className="hero"><div className="hero-copy"><p className="eyebrow">DIGITAL PROCUREMENT ASSURANCE</p><h1>Simplifying Bid<br /><em>Compliance Verification</em></h1><p className="lede">An integrated platform for verifying bidder credentials, documents and tender requirements through transparent, evidence-based compliance checks.</p><div className="button-row"><button className="primary relative" onClick={() => navigate('login')}>
<LockKeyhole size={18} /> Login
<span className="absolute left-0 top-full mt-1 w-24 rounded-md bg-navy px-2 py-1 text-xs text-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 z-10">
<span className="block">Officer's Login</span>
<span className="block mt-1">Seller's Login</span>
</span>
</button><button className="secondary" onClick={() => navigate('about')}><span className="play">▶</span> How It Works</button></div></div><ProcessGraphic /></section><section className="pillars"><h2>One platform for structured bid verification</h2><div className="pillar-grid"><Pillar icon={<FileSearch />} title="Requirement Analysis" text="Identify eligibility and compliance requirements from tender documents." /><Pillar icon={<FileCheck2 />} title="Bid Verification" text="Verify bidder information and submitted documents against available authorized verification sources." /><Pillar icon={<ShieldCheck />} title="Evidence-Based Review" text="Highlight missing information, inconsistencies and exceptions for procurement officers." /></div></section><section className="capabilities"><h2>Built for transparent procurement verification</h2><div className="cap-grid">{[['♙','Bidder identity & registration verification'],['▣','Document completeness and consistency'],['₹','Financial & experience eligibility'],['⚙','OEM and technical compliance'],['⌁','Local-content requirements'],['⊘','Blacklisting/debarment checks'],['▤','Evidence and audit trail']].map(([i,t]) => <div className="cap" key={t}><span>{i}</span><b>{t}</b></div>)}</div></section></>
}
function ProcessGraphic() { const steps = [['Tender Requirements','☑','Eligibility criteria, technical specifications, and terms'],['Bid Documents','▤','Documents submitted by bidders for evaluation'],['Verification','✓','Information verified against authorized sources'],['Compliance Review','●','Exceptions highlighted for procurement officer review']]; return <div className="process">{steps.map(([title, icon, text], i) => <div className="process-step" key={title}><b>{title}</b><div className={`doc doc-${i}`}><span>{icon}</span><i /><i /><i /><i /></div><p>{text}</p>{i < 3 && <ChevronRight className="step-arrow" />}</div>)}</div> }
function Pillar({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="pillar"><div className="circle-icon">{icon}</div><div><h3>{title}</h3><p>{text}</p></div></div> }
function Login({ navigate, role, setRole }: { navigate: (v: View) => void; role: Role | null; setRole: (r: Role) => void }) {
  const [loginType, setLoginType] = useState<'officer' | 'seller'>('seller')

  useEffect(() => {
    const ref = document.referrer
    if (ref && !ref.includes('bid-sure')) {
      sessionStorage.setItem('returnAfterLogin', ref)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setRole(loginType)
    const stored = sessionStorage.getItem('returnAfterLogin')
    let returnTo: View = 'dashboard'
    if (stored) {
      const path = stored.replace(window.location.origin, '').replace(/^\//, '')
      const validViews: View[] = ['dashboard', 'tenders', 'tender', 'evaluation', 'compliance', 'documents', 'reports', 'audit']
      if (validViews.includes(path as View)) {
        returnTo = path as View
      }
      sessionStorage.removeItem('returnAfterLogin')
    }
    navigate(returnTo)
  }

  return (
    <main className="login-page">
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
            <button
              type="button"
              className={loginType === 'seller' ? 'active' : ''}
              onClick={() => setLoginType('seller')}
            >
              Seller Login
            </button>
            <button
              type="button"
              className={loginType === 'officer' ? 'active' : ''}
              onClick={() => setLoginType('officer')}
            >
              Officer Login
            </button>
          </div>
          {loginType === 'officer' ? (
            <>
              <label>
                Official email address
                <input type="email" placeholder="name@department.gov" required />
              </label>
              <label>
                Password
                <input type="password" placeholder="Enter your password" required />
              </label>
              <label>
                Department
                <input type="text" placeholder="e.g. Ministry of Digital Transformation" required />
              </label>
              <label>
                Employee ID
                <input type="text" placeholder="e.g. EMP-2024-00142" required />
              </label>
            </>
          ) : (
            <>
              <label>
                Business email address
                <input type="email" placeholder="contact@company.com" required />
              </label>
              <label>
                Password
                <input type="password" placeholder="Enter your password" required />
              </label>
              <label>
                Company Name
                <input type="text" placeholder="e.g. Nexora Systems Pvt. Ltd." required />
              </label>
              <label>
                Registration Number
                <input type="text" placeholder="e.g. CIN U72900DL2014PTC" required />
              </label>
              <label>
                TIN
                <input type="text" placeholder="e.g. TIN-07ABCDE1234F" required />
              </label>
            </>
          )}
          <div className="form-line">
            <label className="check">
              <input type="checkbox" /> Remember me
            </label>
            <button type="button" className="text-button">
              Forgot password?
            </button>
          </div>
          <button className="primary wide" type="submit">
            <LogIn size={18} /> {loginType === 'officer' ? 'Sign in to portal' : 'Sign in as seller'}
          </button>
          <button type="button" className="back-link" onClick={() => navigate('home')}>
            ← Return to BidSure home
          </button>
        </form>
      </div>
    </main>
  )
}
function AppShell({ view, navigate, role, children }: { view: View; navigate: (v: View) => void; role: Role; children: React.ReactNode }) {
  const officerNav = [['dashboard','Dashboard',BarChart3],['tenders','Tenders',FileText],['evaluation','Bid Evaluation',ClipboardCheck],['compliance','Bidder Compliance',Users],['documents','Document Verification',FileCheck2],['reports','Reports',BookOpen],['audit','Audit Trail',History]] as const
  const sellerNav = [['dashboard','Dashboard',BarChart3],['my-bids','My Bids',FileText],['opportunities','Tender Opportunities',Search],['compliance','Compliance Status',Users],['documents','Documents',FileCheck2],['support','Support',HelpCircle]] as const
  const nav = role === 'officer' ? officerNav : sellerNav
  const isOfficer = role === 'officer'
  return <div className="app-shell"><aside><Logo compact /><div className="officer"><span className="avatar">{isOfficer ? 'AM' : 'NX'}</span><span><b>{isOfficer ? 'Arun Mehta' : 'Nexora Systems'}</b><small>{isOfficer ? 'Procurement Officer' : 'Registered Seller'}</small></span><ChevronDown size={15} /></div><nav className="side-nav">{nav.map(([id,label,Icon]) => <button key={id} className={view === id ? 'selected' : ''} onClick={() => navigate(id as View)}><Icon size={18} />{label}</button>)}</nav><div className="side-bottom"><button><Settings2 size={17} />Settings</button><button onClick={() => navigate('home')}><LogIn size={17} />Sign out</button></div></aside><main className="app-main"><div className="app-top"><button className="mobile-menu"><Menu /></button><div className="breadcrumbs"><span>BidSure</span><ChevronRight size={14} /><b>{view === 'dashboard' ? 'Dashboard' : view[0].toUpperCase() + view.slice(1)}</b></div><div className="top-actions"><button className="icon-button"><Bell size={19} /><i /></button><span className="avatar">{isOfficer ? 'AM' : 'NX'}</span></div></div>{children}</main></div>
}
function OfficerDashboard({ navigate }: { navigate: (v: View) => void }) { return <PageFrame title="Good morning, Arun" subtitle="Here’s what needs your attention today."><div className="stats"><Stat label="Active tenders" value="24" change="+3 this month" icon={<FileText />} /><Stat label="Bids under review" value="86" change="12 require action" icon={<ClipboardCheck />} warn /><Stat label="Exceptions flagged" value="17" change="5 new today" icon={<ShieldCheck />} danger /><Stat label="Verified this month" value="142" change="+18.2% vs last month" icon={<BadgeCheck />} /></div><div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h2>Recent tenders</h2><p>Latest procurement activity across your departments</p></div><button className="text-button" onClick={() => navigate('tenders')}>View all <ArrowRight size={15} /></button></div><TenderTable rows={tenders.slice(0,3)} navigate={navigate} /></section><section className="panel attention"><div className="panel-head"><div><h2>Needs attention</h2><p>Items requiring officer review</p></div></div>{[['Apex Infrastructure Ltd.','Missing financial capacity certificate','Exception'],['HEALTH/PHARMA/2026/032','3 bidder exceptions require review','Pending'],['Bid security document','Verification source unavailable','Exception']].map(([a,b,c]) => <button className="attention-row" key={a}><span className="attention-icon">!</span><span><b>{a}</b><small>{b}</small></span><StatusBadge status={c as Status} /></button>)}</section></div><section className="panel activity"><div className="panel-head"><div><h2>Verification activity</h2><p>Checks completed across all active tenders</p></div><select><option>Last 30 days</option></select></div><div className="bars">{[45,62,52,70,58,85,72,64,90,76,82,94].map((n,i) => <div key={i}><span style={{height: `${n}%`}} /><small>{['May 25','Jun 01','Jun 08','Jun 15','Jun 22','Jun 29','Jul 06','Jul 13','Jul 20','Jul 27','Aug 03','Aug 10'][i]}</small></div>)}</div></section></PageFrame> }
function SellerDashboard({ navigate }: { navigate: (v: View) => void }) { return <PageFrame title="Welcome back, Nexora" subtitle="Track your bids and discover new opportunities." role="seller"><div className="stats"><Stat label="Active bids" value="12" change="3 pending response" icon={<FileText />} /><Stat label="Win rate" value="34%" change="+5% this quarter" icon={<BarChart3 />} /><Stat label="Documents verified" value="28" change="All up to date" icon={<BadgeCheck />} /><Stat label="Open opportunities" value="8" change="2 closing soon" icon={<Search />} warn /></div><div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h2>My recent bids</h2><p>Track the status of your submitted bids</p></div><button className="text-button" onClick={() => navigate('tenders')}>View all <ArrowRight size={15} /></button></div><TenderTable rows={tenders.slice(0,3)} navigate={navigate} /></section><section className="panel attention"><div className="panel-head"><div><h2>Upcoming deadlines</h2><p>Actions required before deadline</p></div></div>{[['GOV/ICT/2026/041','Submit technical proposal — 3 days left','Pending'],['PWD/INFRA/2026/019','Upload financial capacity certificate','Pending'],['EDU/TECH/2026/008','Sign OEM authorization letter','Pending']].map(([a,b,c]) => <button className="attention-row" key={a}><span className="attention-icon">!</span><span><b>{a}</b><small>{b}</small></span><StatusBadge status={c as Status} /></button>)}</section></div><section className="panel activity"><div className="panel-head"><div><h2>Bid performance</h2><p>Your submission and win activity</p></div><select><option>Last 6 months</option></select></div><div className="bars">{[30,45,38,52,48,60,55,42,68,58,72,80].map((n,i) => <div key={i}><span style={{height: `${n}%`}} /><small>{['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i]}</small></div>)}</div></section></PageFrame> }
function Stat({ label,value,change,icon,warn,danger }: {label:string,value:string,change:string,icon:React.ReactNode,warn?:boolean,danger?:boolean}) { return <div className="stat"><div className={`stat-icon ${warn?'warn':''} ${danger?'danger':''}`}>{icon}</div><span>{label}</span><strong>{value}</strong><small className={danger?'red':''}>{change}</small></div> }
function PageFrame({ title,subtitle,children,role = 'officer' }: {title:string;subtitle:string;children:React.ReactNode;role?:Role}) { return <div className="page-content"><div className="page-title"><div><p className="eyebrow">{role === 'seller' ? 'SELLER WORKSPACE' : 'OFFICER WORKSPACE'}</p><h1>{title}</h1><p>{subtitle}</p></div><button className="primary"><Download size={16} /> Export report</button></div>{children}</div> }
function TenderTable({ rows, navigate }: { rows: typeof tenders; navigate: (v: View) => void }) { return <div className="table-wrap"><table><thead><tr><th>Tender reference</th><th>Title</th><th>Deadline</th><th>Bidders</th><th>Status</th><th /></tr></thead><tbody>{rows.map(t => <tr key={t.id} onClick={() => navigate('tender')}><td><b className="linkish">{t.id}</b><small>{t.agency}</small></td><td>{t.title}</td><td><Clock3 size={14} />{t.deadline}</td><td>{t.bidders}</td><td><StatusBadge status={t.status} /></td><td><ChevronRight size={17} /></td></tr>)}</tbody></table></div> }
function Tenders({ navigate }: { navigate: (v: View) => void }) { const [query,setQuery] = useState(''); const filtered = useMemo(() => tenders.filter(t => `${t.id} ${t.title} ${t.agency}`.toLowerCase().includes(query.toLowerCase())), [query]); return <PageFrame title="Tenders" subtitle="Manage procurement opportunities and review progress."><div className="toolbar"><div className="search"><Search size={17} /><input placeholder="Search tenders by reference or title" value={query} onChange={e => setQuery(e.target.value)} /></div><button className="filter"><SlidersHorizontal size={16}/> Filters <span>2</span></button><button className="primary"><FileText size={16}/> New tender</button></div><section className="panel"><div className="table-caption"><b>{filtered.length} active tenders</b><span>Last updated today at 09:42</span></div><TenderTable rows={filtered} navigate={navigate} /></section></PageFrame> }
function TenderDetail({ navigate }: { navigate: (v: View) => void }) { const tender=tenders[0]; return <PageFrame title={tender.title} subtitle={`${tender.id} · ${tender.agency}`}><div className="detail-actions"><StatusBadge status="In Review" /><button className="secondary"><Download size={16}/> Download tender pack</button><button className="primary" onClick={() => navigate('evaluation')}><ClipboardCheck size={16}/> Start bid evaluation</button></div><div className="detail-grid"><section className="panel"><h2>Tender overview</h2><div className="detail-list"><div><span>Published</span><b>18 Aug 2026</b></div><div><span>Submission deadline</span><b>12 Sep 2026, 17:00 IST</b></div><div><span>Estimated value</span><b>{tender.value}</b></div><div><span>Bid security</span><b>₹36.8 Lakhs</b></div><div><span>Evaluation method</span><b>Two-stage — technical & financial</b></div><div><span>Review progress</span><b>42 of 86 checks complete</b></div></div></section><section className="panel"><h2>Compliance requirements</h2>{['Bidder registration & identity','Technical capability and experience','Financial capacity','OEM authorization','Local-content declaration','Debarment screening'].map((x,i)=><div className="requirement" key={x}><span className={i<4?'done':''}>{i<4?<Check size={13}/>:''}</span><b>{x}</b><small>{i<4?'Verified':'Pending review'}</small></div>)}</section></div><section className="panel"><div className="panel-head"><div><h2>Submitted bidders</h2><p>8 bidders submitted before the deadline</p></div><button className="text-button" onClick={() => navigate('compliance')}>View compliance overview <ArrowRight size={15}/></button></div><BidderTable navigate={navigate} rows={bidders.slice(0,3)} /></section></PageFrame> }
function BidderTable({ navigate, rows }: {navigate:(v:View)=>void;rows:typeof bidders}) { return <div className="table-wrap"><table><thead><tr><th>Bidder</th><th>Registration</th><th>Documents</th><th>Risk</th><th>Status</th><th /></tr></thead><tbody>{rows.map(b=><tr key={b.name} onClick={()=>navigate('compliance')}><td><b>{b.name}</b></td><td>{b.reg}</td><td>{b.docs}</td><td><span className={`risk risk-${b.risk.toLowerCase()}`}>{b.risk}</span></td><td><StatusBadge status={b.status}/></td><td><ChevronRight size={17}/></td></tr>)}</tbody></table></div> }
function Evaluation({ navigate }: { navigate:(v:View)=>void }) { return <PageFrame title="Bid evaluation" subtitle={`${tenders[0].id} · Technical compliance review`}><div className="evaluation-head"><div className="progress"><span>Evaluation progress</span><b>42 <small>/ 86 checks complete</small></b><div><i style={{width:'49%'}}/></div></div><button className="primary" onClick={()=>navigate('compliance')}>Continue review <ArrowRight size={16}/></button></div><section className="panel"><div className="panel-head"><div><h2>Bidder evaluation queue</h2><p>Review each submission against the tender requirements.</p></div><select><option>All statuses</option></select></div><BidderTable navigate={navigate} rows={bidders}/></section></PageFrame> }
function Compliance({ navigate }: {navigate:(v:View)=>void}) { const [reviewed,setReviewed]=useState(false); return <PageFrame title="Bidder compliance" subtitle="Apex Infrastructure Ltd. · GOV/ICT/2026/041"><div className="detail-actions"><StatusBadge status={reviewed?'In Review':'Exception'}/><button className="secondary"><Eye size={16}/> View bidder profile</button><button className="primary" onClick={()=>setReviewed(true)}><Check size={16}/> Mark review complete</button></div><div className="compliance-layout"><section className="panel"><div className="panel-head"><div><h2>Requirement checks</h2><p>12 of 14 documents submitted</p></div><span className="score">71% compliant</span></div>{[['Company registration certificate','Verified','Verified'],['Tax clearance certificate','Verified','Verified'],['Financial capacity statement','Exception','Missing required threshold'],['OEM authorization letter','Pending','Source unavailable'],['Past experience references','Verified','Verified'],['Debarment declaration','Verified','No matches found']].map(([a,b,c])=><div className="check-row" key={a}><span className={`check-state ${b.toLowerCase()}`}><Check size={15}/></span><span><b>{a}</b><small>{c}</small></span><StatusBadge status={b as Status}/><button className="icon-button"><ChevronRight size={16}/></button></div>)}</section><aside className="evidence panel"><h2>Evidence panel</h2><p>Select a requirement to inspect source evidence and notes.</p><div className="empty-evidence"><FileSearch size={28}/><b>No requirement selected</b><small>Evidence, source details and officer notes will appear here.</small></div></aside></div></PageFrame> }
function GenericPage({ view, navigate }: {view:View;navigate:(v:View)=>void}) { const config:Record<string,[string,string]>={documents:['Document verification','Review submitted documents against authorized verification sources.'],reports:['Reports','Generate compliance summaries and procurement activity reports.'],audit:['Audit trail','A complete, tamper-evident record of platform activity.'],about:['How BidSure works','A transparent workflow for structured, evidence-based procurement verification.'],help:['Help centre','Guidance for authorized procurement officers using BidSure.'],'my-bids':['My Bids','Track your submitted bids and their current status.'],opportunities:['Tender Opportunities','Discover and track open procurement opportunities.'],support:['Support','Get help and contact the BidSure support team.']}; const [title,subtitle]=config[view] || config.documents; return <PageFrame title={title} subtitle={subtitle}><section className="panel empty-page"><div className="circle-icon"><BookOpen /></div><h2>{view==='about'?'From tender requirements to confident decisions':'Your workspace is ready'}</h2><p>BidSure brings requirements, documents, authorized sources and review notes together in one accountable workflow.</p><button className="primary" onClick={()=>navigate(view==='about'?'tenders':'dashboard')}>Continue <ArrowRight size={16}/></button></section></PageFrame> }
export default function Page() {
  const [view, setView] = useState<View>('home')
  const [role, setRole] = useState<Role | null>(null)
  const navigate = (v: View) => {
    setView(v)
    window.history.pushState({ view: v }, '', window.location.pathname)
  }

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

  const officerViews = ['dashboard', 'tenders', 'tender', 'evaluation', 'compliance', 'documents', 'reports', 'audit'] as View[]
  const sellerViews = ['dashboard', 'tenders', 'tender', 'compliance', 'documents', 'about', 'help', 'my-bids', 'opportunities', 'support'] as View[]

  const roleGuard = (v: View) => {
    if (!role) return v
    if (role === 'officer' && !officerViews.includes(v)) return 'dashboard'
    if (role === 'seller' && !sellerViews.includes(v)) return 'dashboard'
    return v
  }

  if (view === 'login') return <Login navigate={navigate} role={role} setRole={setRole} />
  
  if (role && ['dashboard', 'tenders', 'tender', 'evaluation', 'compliance', 'documents', 'reports', 'audit', 'about', 'help'].includes(view)) {
    const guardedView = roleGuard(view)
    const DashboardComponent = role === 'officer' ? OfficerDashboard : SellerDashboard
    return (
      <AppShell view={guardedView} navigate={navigate} role={role}>
        {guardedView === 'dashboard' ? <DashboardComponent navigate={navigate} /> : guardedView === 'tenders' ? <Tenders navigate={navigate} /> : guardedView === 'tender' ? <TenderDetail navigate={navigate} /> : guardedView === 'evaluation' ? <Evaluation navigate={navigate} /> : guardedView === 'compliance' ? <Compliance navigate={navigate} /> : guardedView === 'about' || guardedView === 'help' ? <GenericPage view={guardedView} navigate={navigate} /> : <DashboardComponent navigate={navigate} />}
      </AppShell>
    )
  }
  
  return (
    <div className="public-site">
      <PublicHeader view={view} navigate={navigate} />
      <main>{view === 'home' ? <Home navigate={navigate} /> : <GenericPage view={view} navigate={navigate} />}</main>
      <PublicFooter />
    </div>
  )
}
