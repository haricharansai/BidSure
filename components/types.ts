'use client'

import { createContext, useContext } from 'react'
export type { SessionUser } from '@/lib/types'
import type { SessionUser } from '@/lib/types'

// ---------------------------------------------------------------------------
// View routing
// ---------------------------------------------------------------------------

export type View =
  | 'home' | 'about' | 'help' | 'login' | 'dashboard' | 'tenders' | 'tender'
  | 'evaluation' | 'compliance' | 'documents' | 'reports' | 'audit' | 'my-bids'
  | 'opportunities' | 'support' | 'workflow' | 'w-tender' | 'w-eval' | 'w-auction'
  | 'w-create' | 'clarifications' | 'marketplace' | 'privacy' | 'terms' | 'accessibility'

export interface NavigateOptions { tenderId?: string; bidder?: string }

type NavTenderViews = 'tender' | 'evaluation' | 'compliance' | 'w-tender' | 'w-eval' | 'w-auction'
const TENDER_PARAM_VIEWS: NavTenderViews[] = ['tender', 'evaluation', 'compliance', 'w-tender', 'w-eval', 'w-auction']

export function viewToHash(v: View, tenderId?: string | null, bidder?: string | null): string {
  let hash = `#/${v}`
  if (tenderId) hash += `/${encodeURIComponent(tenderId)}`
  if (bidder) hash += `/${encodeURIComponent(bidder)}`
  return hash
}

export function hashToView(): { view: View; tenderId?: string; bidder?: string } {
  const raw = window.location.hash || '#/'
  const path = raw.replace(/^#\/?/, '')
  if (!path) return { view: 'home' }
  const segments = path.split('/')
  const view = decodeURIComponent(segments[0]) as View
  if (TENDER_PARAM_VIEWS.includes(view as NavTenderViews) && segments.length >= 2) {
    return {
      view,
      tenderId: decodeURIComponent(segments[1]),
      bidder: segments.length >= 3 ? decodeURIComponent(segments[2]) : undefined,
    }
  }
  return { view }
}

// ---------------------------------------------------------------------------
// Session context
// ---------------------------------------------------------------------------

export const SESSION_KEY = 'bidsure.session'
export const VIEW_KEY = 'bidsure.view'
export const TENDER_KEY = 'bidsure.tenderId'
export const BIDDER_KEY = 'bidsure.bidder'

export interface SessionContextValue {
  user: SessionUser | null
  signIn: (user: SessionUser) => void
  signOut: () => void
}

export const SessionContext = createContext<SessionContextValue>({
  user: null,
  signIn: () => {},
  signOut: () => {},
})

export function useSession() {
  return useContext(SessionContext)
}

// ---------------------------------------------------------------------------
// Toast context
// ---------------------------------------------------------------------------

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  variant: ToastVariant
  message: string
  timeout?: number
}

export interface ToastContextValue {
  toasts: ToastItem[]
  addToast: (variant: ToastVariant, message: string, timeout?: number) => void
  removeToast: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
})
