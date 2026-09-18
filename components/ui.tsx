'use client'

import React from 'react'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Check, CheckCircle2, Clock3, Info, RefreshCw,
  RotateCcw, ShieldCheck, X,
} from 'lucide-react'
import type { Status } from '@/lib/types'
import type { DocStatus6 } from '@/lib/types'
import type { LucideIcon } from 'lucide-react'
import { ToastContext, type ToastItem, type ToastVariant } from '@/components/types'

// ---------------------------------------------------------------------------
// Toast system
// ---------------------------------------------------------------------------

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer)
      timersRef.current.clear()
    }
  }, [])

  const addToast = useCallback((variant: ToastVariant, message: string, timeout = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setToasts(prev => [...prev, { id, variant, message, timeout }])
    if (timeout > 0) {
      const timer = setTimeout(() => {
        timersRef.current.delete(id)
        setToasts(prev => prev.filter(t => t.id !== id))
      }, timeout)
      timersRef.current.set(id, timer)
    }
  }, [])
  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])
  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts, removeToast }: { toasts: ToastItem[]; removeToast: (id: string) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map(t => {
        const Icon = t.variant === 'success' ? CheckCircle2 : t.variant === 'error' ? AlertTriangle : t.variant === 'warning' ? AlertTriangle : Info
        return (
          <div key={t.id} className={`toast toast-${t.variant}`} role="alert">
            <Icon size={16} />
            <span>{t.message}</span>
            <button type="button" className="icon-button" aria-label="Dismiss" onClick={() => removeToast(t.id)}><X size={14} /></button>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({ title, subtitle, onClose, children, footer, size }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'lg'
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      // Focus trap: Tab cycles within the dialog
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus() }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus() }
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Auto-focus the first focusable element in the dialog
    requestAnimationFrame(() => {
      const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-"])'
      )
      firstFocusable?.focus()
    })
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  const sizeClass = size === 'sm' ? 'modal-sm' : size === 'lg' ? 'modal-lg' : ''
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div ref={dialogRef} className={`modal ${sizeClass}`.trim()} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
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

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger', onConfirm, onCancel }: {
  title: string; message: string; confirmLabel?: string; cancelLabel?: string; variant?: 'danger' | 'warning'
  onConfirm: () => void; onCancel: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel} size="sm"
      footer={<>
        <button type="button" className="secondary" onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className={variant === 'danger' ? 'danger-btn' : 'primary'} onClick={onConfirm}>{confirmLabel}</button>
      </>}>
      <p>{message}</p>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

export function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode; title: string; description: string; action?: React.ReactNode
}) {
  return (
    <div className="empty-page">
      <div className="circle-icon" style={{ width: 62, height: 62 }}>{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page transition wrapper
// ---------------------------------------------------------------------------

export function PageTransition({ children, view }: { children: React.ReactNode; view: string }) {
  return <div key={view} className="page-transition">{children}</div>
}

// ---------------------------------------------------------------------------
// Data freshness indicator
// ---------------------------------------------------------------------------

export function FreshnessIndicator({ lastUpdated }: { lastUpdated: Date | null }) {
  if (!lastUpdated) return null
  const [label, setLabel] = useState('just now')
  useEffect(() => {
    const tick = () => {
      const seconds = Math.floor((Date.now() - lastUpdated.getTime()) / 1000)
      if (seconds < 10) setLabel('just now')
      else if (seconds < 60) setLabel(`${seconds}s ago`)
      else setLabel(`${Math.floor(seconds / 60)}m ago`)
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [lastUpdated])
  return <span className="freshness"><RefreshCw size={12} /> Updated {label}</span>
}

// ---------------------------------------------------------------------------
// Skeletons
// ---------------------------------------------------------------------------

export function PanelSkeleton() {
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

export function LoadingPanel({ label = 'Loading your data…' }: { label?: string } = {}) {
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

// ---------------------------------------------------------------------------
// Error panel
// ---------------------------------------------------------------------------

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
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

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger'

export function Alert({ variant = 'info', title, children }: { variant?: AlertVariant; title?: string; children: React.ReactNode }) {
  const Icon = variant === 'success' ? CheckCircle2 : variant === 'info' ? Info : AlertTriangle
  return (
    <div className={`alert alert-${variant}`} role={variant === 'danger' ? 'alert' : undefined}>
      <Icon size={16} />
      <div>{title && <b>{title}</b>}<span>{children}</span></div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

export function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="brand-mark"><ShieldCheck size={compact ? 22 : 28} strokeWidth={1.7} /></span><span><strong>BidSure</strong>{!compact && <small>Bid Compliance Verification Platform</small>}</span></div>
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

export function StatusBadge({ status }: { status: Status }) {
  const Icon = status === 'Verified' || status === 'Complete' ? Check : status === 'Exception' ? AlertTriangle : status === 'In Review' ? RefreshCw : Clock3
  return <span className={`status status-${status.toLowerCase().replace(' ', '-')}`}><Icon size={12} />{status}</span>
}

// ---------------------------------------------------------------------------
// Form field
// ---------------------------------------------------------------------------

export function Field({ label, icon, ...props }: { label: string; icon?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      {label}
      <span className="input-wrap">{icon}<input {...props} /></span>
    </label>
  )
}

// ---------------------------------------------------------------------------
// Highlight (search match)
// ---------------------------------------------------------------------------

export function Highlight({ text, query }: { text: string; query: string }) {
  const parts = useMemo(() => {
    if (!query.trim()) return null
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${escaped})`, 'gi')
    return text.split(regex)
  }, [text, query])
  if (!parts) return <>{text}</>
  const regex = useMemo(() => new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), [query])
  return <>{parts.map((part, i) => regex.test(part) ? <mark key={i} className="search-highlight">{part}</mark> : part)}</>
}

// ---------------------------------------------------------------------------
// Stage badge (GeM workflow v2)
// ---------------------------------------------------------------------------

type ProcStage = 'PUBLISHED' | 'CORRIGENDUM' | 'CLOSED' | 'EVALUATED' | 'AUCTION_ACTIVE' | 'AUCTION_CLOSED' | 'EVALUATION_FAILED' | 'AUCTION_FAILED' | 'AWARDED' | 'CANCELLED'

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

export function StageBadge({ stage }: { stage: ProcStage }) {
  const cfg = STAGE_BADGE[stage] ?? { label: stage, cls: 'status-pending' }
  return <span className={`status ${cfg.cls}`}><Clock3 size={12} />{cfg.label}</span>
}

// ---------------------------------------------------------------------------
// 6-state document status badge
// ---------------------------------------------------------------------------

export const DOC6_META: Record<DocStatus6, { label: string; cls: string; icon: LucideIcon }> = {
  VERIFIED: { label: 'Verified', cls: 'status-verified', icon: Check },
  WARNING: { label: 'Warning', cls: 'status-in-review', icon: AlertTriangle },
  NON_COMPLIANT: { label: 'Non-compliant', cls: 'status-exception', icon: AlertTriangle },
  UNVERIFIED: { label: 'Unverified', cls: 'status-pending', icon: Clock3 },
  NEEDS_REVIEW: { label: 'Needs review', cls: 'status-in-review', icon: RefreshCw },
  NOT_APPLICABLE: { label: 'Not applicable', cls: 'status-pending', icon: AlertTriangle },
}

export function Doc6Badge({ status }: { status: DocStatus6 }) {
  const meta = DOC6_META[status] ?? DOC6_META.UNVERIFIED
  const Icon = meta.icon
  return <span className={`status ${meta.cls}`}><Icon size={12} />{meta.label}</span>
}

// ---------------------------------------------------------------------------
// Classification chip
// ---------------------------------------------------------------------------

export function ClassificationChip({ c }: { c: string }) {
  const cls = c === 'MANDATORY' ? 'risk risk-high' : c === 'CONDITIONAL' ? 'risk risk-medium' : 'risk risk-low'
  return <span className={cls}>{c.toLowerCase()}</span>
}

// ---------------------------------------------------------------------------
// Countdown formatter
// ---------------------------------------------------------------------------

export function fmtCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return 'closed'
  const s = Math.floor(ms / 1000)
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

// ---------------------------------------------------------------------------
// Action helper
// ---------------------------------------------------------------------------

import { apiFetch } from '@/lib/api'

export async function runAction(body: Record<string, unknown>): Promise<void> {
  await apiFetch('/api/action', { method: 'POST', body })
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

export function Stat({ label, value, change, icon, warn, danger, onClick }: {
  label: string; value: string; change: string; icon: React.ReactNode; warn?: boolean; danger?: boolean; onClick?: () => void
}) {
  const cls = `stat${danger ? ' is-danger' : warn ? ' is-warn' : ''}${onClick ? ' clickable' : ''}`
  const inner = (
    <>
      <div className={`stat-icon ${warn ? 'warn' : ''} ${danger ? 'danger' : ''}`}>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={danger ? 'red' : ''}>{change}</small>
    </>
  )
  return onClick
    ? <button type="button" className={cls} onClick={onClick} aria-label={`${label}: ${value}. View details`}>{inner}</button>
    : <div className={cls}>{inner}</div>
}

// ---------------------------------------------------------------------------
// Eligibility row
// ---------------------------------------------------------------------------

export function ElRow({ row }: { row: { label: string; declared: string; status: string } }) {
  return (
    <div className="requirement" key={row.label}>
      <span className={row.status === 'PASS' ? 'done' : ''}>{row.status === 'PASS' ? <Check size={13} /> : ''}</span>
      <b>{row.label}</b>
      <small>{row.declared} — {row.status === 'PASS' ? 'pass' : row.status === 'FAIL' ? 'fail' : 'attention'}</small>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Error Boundary (class component)
// ---------------------------------------------------------------------------

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('BidSure render error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      const err = this.state.error
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center',
          background: 'var(--bg, #f8f9fa)', color: 'var(--fg, #1a1a1a)',
        }}>
          <div style={{ maxWidth: 480 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ color: 'var(--muted, #666)', marginBottom: 20 }}>
              BidSure encountered an unexpected error and couldn't render this page.
            </p>
            {err && (
              <pre style={{
                textAlign: 'left', fontSize: 12, padding: 12, borderRadius: 8,
                background: 'var(--surface, #fff)', border: '1px solid var(--border, #ddd)',
                overflow: 'auto', maxHeight: 120, marginBottom: 20,
              }}>
                {err.message}
              </pre>
            )}
            <button
              onClick={() => { window.location.hash = '#/dashboard'; window.location.reload() }}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'var(--primary, #2563eb)', color: '#fff', fontSize: 14, fontWeight: 600,
              }}
            >
              Reload BidSure
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
