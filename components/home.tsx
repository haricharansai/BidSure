'use client'

import { ChevronRight, FileCheck2, FileSearch, FileText, LockKeyhole, ShieldCheck } from 'lucide-react'
import type { View } from '@/components/types'

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

export function Home({ navigate }: { navigate: (v: View) => void }) {
  return <>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">DIGITAL PROCUREMENT ASSURANCE</p>
        <h1>Simplifying Bid<br /><em>Compliance Verification</em></h1>
        <p className="lede">An integrated platform for verifying bidder credentials, documents and tender requirements through transparent, evidence-based compliance checks.</p>
        <div className="button-row">
          <button type="button" className="primary hero-login" onClick={() => navigate('login')}>
            <LockKeyhole size={18} /> Login
            <span className="hero-tooltip">
              <span>Officer&apos;s Login</span>
              <span>Seller&apos;s Login</span>
            </span>
          </button>
          <button type="button" className="secondary" onClick={() => navigate('about')}><span className="play">▶</span> How It Works</button>
        </div>
        <div className="hero-trust">
          <div><ShieldCheck size={16} /> Government-grade security</div>
          <div><FileCheck2 size={16} /> Evidence-based checks</div>
          <div><FileText size={16} /> Full audit trail</div>
        </div>
      </div>
      <ProcessGraphic />
    </section>
    <section className="pillars">
      <h2>One platform for structured bid verification</h2>
      <div className="pillar-grid">
        <Pillar icon={<FileSearch />} title="Requirement Analysis" text="Identify eligibility and compliance requirements from tender documents." />
        <Pillar icon={<FileCheck2 />} title="Bid Verification" text="Verify bidder information and submitted documents against available authorized verification sources." />
        <Pillar icon={<ShieldCheck />} title="Evidence-Based Review" text="Highlight missing information, inconsistencies and exceptions for procurement officers." />
      </div>
    </section>
    <section className="capabilities">
      <h2>Built for transparent procurement verification</h2>
      <div className="cap-grid">
        {([
          ['Bidder identity & registration verification', 'identity'],
          ['Document completeness and consistency', 'docs'],
          ['Financial & experience eligibility', 'financial'],
          ['OEM and technical compliance', 'tech'],
          ['Local-content requirements', 'local'],
          ['Blacklisting/debarment checks', 'debar'],
          ['Evidence and audit trail', 'audit'],
        ] as [string, string][]).map(([t, k]) => <div className="cap" key={k}><span><ShieldCheck /></span><b>{t}</b></div>)}
      </div>
    </section>
  </>
}

function ProcessGraphic() {
  const steps: [string, React.ReactNode, string][] = [
    ['Tender Requirements', <FileText key="f1" />, 'Eligibility criteria, technical specifications, and terms'],
    ['Bid Documents', <FileSearch key="f2" />, 'Documents submitted by bidders for evaluation'],
    ['Verification', <ShieldCheck key="f3" />, 'Information verified against authorized sources'],
    ['Compliance Review', <FileCheck2 key="f4" />, 'Exceptions highlighted for procurement officer review'],
  ]
  return <div className="process">{steps.map(([title, icon, text], i) => <div className="process-step" key={title as string}><b>{title}</b><div className={`doc doc-${i}`}><span>{icon}</span><i /><i /><i /><i /></div><p>{text}</p>{i < 3 && <ChevronRight className="step-arrow" />}</div>)}</div>
}

function Pillar({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="pillar"><div className="circle-icon">{icon}</div><div><h3>{title}</h3><p>{text}</p></div></div>
}
