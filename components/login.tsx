'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Building2, CheckCircle2, Fingerprint, Hash, LockKeyhole, LogIn, Mail,
  ShieldCheck, UserRound,
} from 'lucide-react'
import { ApiError, apiFetch, storeToken } from '@/lib/api'
import type { View, NavigateOptions } from '@/components/types'
import { Field, Alert, Logo } from '@/components/ui'
import { ThemeToggle } from '@/components/hooks'

export function Login({ navigate, signIn }: { navigate: (v: View, o?: NavigateOptions) => void; signIn: (u: import('@/lib/types').SessionUser) => void }) {
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
