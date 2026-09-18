'use client'

import { MessagesSquare } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '@/lib/api'
import type { View, NavigateOptions, SessionUser } from '@/components/types'
import { useApi } from '@/components/hooks'
import { ErrorPanel, LoadingPanel, Alert, runAction } from '@/components/ui'
import { PageFrame } from '@/components/layout'

interface ClarRow { id: string; tenderId: string; tenderTitle: string; stage: string; companyName: string; question: string; response: string | null; askedAtISO: string; respondByISO: string; status: string }

export function ClarificationCenter({ user }: { user: SessionUser }) {
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
