'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, apiFetch } from '@/lib/api'
import { Moon, Sun } from 'lucide-react'
import type { View, NavigateOptions } from '@/components/types'

// ---------------------------------------------------------------------------
// useApi — generic data-fetching hook with polling + retry
// ---------------------------------------------------------------------------

export function useApi<T>(url: string | null, pollMs?: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const lastUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!url) { lastUrlRef.current = null; return }
    const urlChanged = lastUrlRef.current !== url
    lastUrlRef.current = url
    const controller = new AbortController()
    if (urlChanged) setData(null)
    setError(null)
    apiFetch<T>(url, { signal: controller.signal })
      .then(d => { if (!controller.signal.aborted) setData(d) })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof ApiError ? e.message : 'Something went wrong')
      })
    return () => controller.abort()
  }, [url, nonce])

  useEffect(() => {
    if (!url || !pollMs) return
    const id = window.setInterval(() => setNonce(n => n + 1), pollMs)
    return () => window.clearInterval(id)
  }, [url, pollMs])

  const retry = useCallback(() => setNonce(n => n + 1), [])
  return { data, error, retry, refresh: retry }
}

// ---------------------------------------------------------------------------
// useTheme — light/dark theme toggle
// ---------------------------------------------------------------------------

export function useTheme() {
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

// ---------------------------------------------------------------------------
// ThemeToggle button
// ---------------------------------------------------------------------------

export function ThemeToggle({ className = '' }: { className?: string }) {
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

// ---------------------------------------------------------------------------
// useKeyboardShortcuts — g+d, g+t, etc.
// ---------------------------------------------------------------------------

export function useKeyboardShortcuts(navigate: (v: View, opts?: NavigateOptions) => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) return
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const onGKey = (e2: KeyboardEvent) => {
          document.removeEventListener('keydown', onGKey)
          if (e2.key === 'd') navigate('dashboard')
          else if (e2.key === 't') navigate('tenders')
          else if (e2.key === 'e') navigate('evaluation')
          else if (e2.key === 'c') navigate('compliance')
          else if (e2.key === 'r') navigate('reports')
          else if (e2.key === 'a') navigate('audit')
        }
        document.addEventListener('keydown', onGKey, { once: true })
        setTimeout(() => document.removeEventListener('keydown', onGKey), 800)
        return
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        navigate('help')
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigate])
}
