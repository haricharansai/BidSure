'use client'

import { Check, ClipboardCheck, Eye, FileSearch } from 'lucide-react'
import { useCallback, useContext, useEffect, useState } from 'react'
import type { View, NavigateOptions } from '@/components/types'
import { SessionContext } from '@/components/types'
import { useApi } from '@/components/hooks'
import { ErrorPanel, LoadingPanel, StatusBadge, Alert, Modal } from '@/components/ui'
import { PageFrame } from '@/components/layout'
import type { ComplianceData } from '@/lib/types'

export function Compliance({ navigate, userId, tenderId, bidder }: { navigate: (v: View, o?: NavigateOptions) => void; userId: string; tenderId: string | null; bidder: string | null }) {
  const { user } = useContext(SessionContext)
  const isOfficer = user?.type === 'officer'
  const params = new URLSearchParams({ resource: 'compliance', userId })
  if (tenderId) params.set('tenderId', tenderId)
  if (bidder) params.set('bidder', bidder)
  const { data, error, retry } = useApi<ComplianceData>(`/api/data?${params.toString()}`)
  const [selected, setSelected] = useState<number | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const closeProfile = useCallback(() => setProfileOpen(false), [])

  useEffect(() => { setSelected(null); setProfileOpen(false) }, [data?.bidderName])

  if (error) return <ErrorPanel message={error} onRetry={retry} />
  if (!data) return LoadingPanel()
  const activeCheck = selected !== null ? data.checks[selected] : null

  return <PageFrame title={isOfficer ? 'Bidder compliance' : 'My compliance status'} subtitle={`${data.bidderName} · ${data.tenderId}`} actions={null}>
    <div className="detail-actions">
      <StatusBadge status={data.checks.some(c => c.status === 'Exception') ? 'Exception' : data.checks.every(c => c.status === 'Verified') ? 'Verified' : 'Pending'} />
      {isOfficer ? (
        <>
          <button className="secondary" onClick={() => setProfileOpen(true)}><Eye size={16} /> View bidder profile</button>
          <button className="primary" onClick={() => navigate('w-eval', { tenderId: data.tenderId })}><ClipboardCheck size={16} /> Open evaluation &amp; review gate</button>
        </>
      ) : (
        <button className="primary" onClick={() => navigate('w-tender', { tenderId: data.tenderId })}><FileSearch size={16} /> View tender &amp; document verification</button>
      )}
    </div>
    <div className="compliance-layout">
      <section className="panel">
        <div className="panel-head"><div><h2>Requirement checks</h2><p>{data.docsSubmitted} of {data.docsTotal} documents submitted</p></div><span className="score">{data.scorePct}% compliant</span></div>
        {data.checks.map((c, i) => <button className="check-row" key={c.requirement} style={{ textAlign: 'left', width: '100%', cursor: 'pointer' }} onClick={() => setSelected(i)}>
          <span className={`check-state ${c.status.toLowerCase()}`}><Check size={15} /></span>
          <span><b>{c.requirement}</b><small>{c.note}</small></span>
          <StatusBadge status={c.status} />
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
          <><p>Select a requirement to inspect source evidence and notes.</p><div className="empty-evidence"><FileSearch size={28} /><b>No requirement selected</b><small>Evidence, source details and officer notes will appear here.</small></div></>
        )}
      </aside>
    </div>
    {profileOpen && (
      <Modal title={data.bidderName} subtitle={`${data.tenderId} · Bidder profile`} onClose={closeProfile} footer={<button className="primary" onClick={closeProfile}>Close</button>}>
        <div className="modal-summary">
          <div><span>Documents</span><b>{data.docsSubmitted}/{data.docsTotal}</b></div>
          <div><span>Compliance</span><b>{data.scorePct}%</b></div>
          <div><span>Verified</span><b>{data.checks.filter(c => c.status === 'Verified').length}/{data.checks.length}</b></div>
        </div>
        <Alert variant={data.checks.some(c => c.status === 'Exception') ? 'danger' : data.checks.every(c => c.status === 'Verified') ? 'success' : 'warning'}>
          {data.checks.some(c => c.status === 'Exception') ? 'One or more requirements raised an exception and need officer review.' : data.checks.every(c => c.status === 'Verified') ? 'All requirement checks passed verification.' : 'Some requirement checks are still pending verification.'}
        </Alert>
        <div>
          <p className="eyebrow">Requirement checks</p>
          <div className="modal-checks">
            {data.checks.map(c => (
              <div className="check-row" key={c.requirement}>
                <span className={`check-state ${c.status.toLowerCase()}`}><Check size={15} /></span>
                <span><b>{c.requirement}</b><small>{c.note}</small></span>
                <StatusBadge status={c.status} />
              </div>
            ))}
          </div>
        </div>
      </Modal>
    )}
  </PageFrame>
}
