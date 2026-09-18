'use client'

import { Clock3, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import type { View, NavigateOptions } from '@/components/types'
import { useApi } from '@/components/hooks'
import { ErrorPanel, LoadingPanel, Alert } from '@/components/ui'
import { PageFrame } from '@/components/layout'
import type { AuditData } from '@/lib/types'

export function AuditExplorer() {
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
          <tr key={e.seq}>
            <td>{e.seq}</td>
            <td><Clock3 size={13} />{new Date(e.tsISO).toLocaleTimeString('en-IN')}</td>
            <td>{e.actorName} <small>({e.actorRole.toLowerCase()})</small></td>
            <td><b>{e.action}</b></td>
            <td>{e.tenderId ?? '—'}</td>
            <td><small>{e.hashShort} ← {e.prevHashShort}</small></td>
          </tr>
        ))}
      </tbody></table></div>
    </section>
  </PageFrame>
}
