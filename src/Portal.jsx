import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import './Portal.css'

const emptyRegistration = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
  password: '',
}

const TURNSTILE_SITE_KEY = '0x4AAAAAAEcUDgznRsbFwnFc'
const TURNSTILE_VERIFY_URL = 'https://turnstile-siteverify-plhoa.plhoa-website.workers.dev'
let turnstileScript

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (turnstileScript) return turnstileScript
  turnstileScript = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => resolve(window.turnstile)
    script.onerror = () => reject(new Error('Cloudflare verification could not load.'))
    document.head.appendChild(script)
  })
  return turnstileScript
}

function TurnstileWidget({ onToken, resetKey }) {
  const container = useRef(null)
  const callback = useRef(onToken)
  const widgetId = useRef(null)

  useEffect(() => {
    callback.current = onToken
  }, [onToken])

  useEffect(() => {
    let active = true
    loadTurnstile().then((turnstile) => {
      if (!active || !container.current) return
      widgetId.current = turnstile.render(container.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action: 'turnstile-spin-v1',
        callback: (token) => callback.current(token),
        'expired-callback': () => callback.current(''),
        'error-callback': () => callback.current(''),
      })
    }).catch(() => callback.current(''))
    return () => {
      active = false
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
    }
  }, [])

  useEffect(() => {
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
  }, [resetKey])

  return <div className="turnstile-slot" ref={container} data-action="turnstile-spin-v1" />
}

async function verifyTurnstile(token) {
  if (!token) throw new Error('Complete the Cloudflare verification first.')
  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.success !== true) throw new Error('Cloudflare could not verify this request. Please try again.')
}

function PortalHeader() {
  return (
    <header className="portal-header">
      <a className="brand" href="/" aria-label="Penny Lane HOA home">
        <span className="brand-mark">PL</span>
        <span>Penny Lane <em>HOA</em></span>
      </a>
      <a className="portal-back" href="/">Back to community site</a>
    </header>
  )
}

function ResidentHome({ user, onLogout }) {
  return (
    <div className="portal-shell">
      <PortalHeader />
      <main className="resident-home">
        <div>
          <p className="portal-kicker">Resident portal</p>
          <h1>Welcome, {user.firstName}.</h1>
          <p className="portal-lead">Your account is connected to {user.address}, Lindale, TX 75771.</p>
        </div>
        <section className="resident-status" aria-label="Account status">
          <span>Account</span><strong>Approved resident</strong>
          <span>Access</span><strong>Member resources</strong>
          {user.role !== 'resident' && <a href="/admin">Open administration</a>}
          <button type="button" className="secondary-button" onClick={onLogout}>Sign out</button>
        </section>
      </main>
    </div>
  )
}

export default function Portal() {
  const [mode, setMode] = useState('login')
  const [registration, setRegistration] = useState(emptyRegistration)
  const [login, setLogin] = useState({ email: '', password: '' })
  const [user, setUser] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loginTurnstile, setLoginTurnstile] = useState('')
  const [registrationTurnstile, setRegistrationTurnstile] = useState('')
  const [loginReset, setLoginReset] = useState(0)
  const [registrationReset, setRegistrationReset] = useState(0)

  useEffect(() => {
    api('/api/auth/session').then(({ user: currentUser }) => setUser(currentUser)).catch(() => {})
  }, [])

  async function submitLogin(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await verifyTurnstile(loginTurnstile)
      const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(login) })
      setUser(result.user)
    } catch (requestError) {
      setError(requestError.message)
      setLoginTurnstile('')
      setLoginReset((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  async function submitRegistration(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await verifyTurnstile(registrationTurnstile)
      await api('/api/auth/register', { method: 'POST', body: JSON.stringify(registration) })
      setRegistration(emptyRegistration)
      setNotice('Your request was received. An HOA administrator will verify your residency before portal access is enabled.')
      setMode('login')
    } catch (requestError) {
      setError(requestError.message)
      setRegistrationTurnstile('')
      setRegistrationReset((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }

  if (user) return <ResidentHome user={user} onLogout={logout} />

  return (
    <div className="portal-shell">
      <PortalHeader />
      <main className="auth-layout">
        <section className="auth-intro">
          <p className="portal-kicker">For Penny Lane residents</p>
          <h1>Welcome<br /><i>to the neighborhood.</i></h1>
          <p>Sign in for member announcements, documents, events, and clubhouse reservations.</p>
        </section>
        <section className="auth-panel">
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>Register</button>
          </div>
          {notice && <p className="form-notice" role="status">{notice}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {mode === 'login' ? (
            <form onSubmit={submitLogin}>
              <label>Email address<input required type="email" autoComplete="email" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} /></label>
              <label>Password<input required type="password" autoComplete="current-password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label>
              <TurnstileWidget onToken={setLoginTurnstile} resetKey={loginReset} />
              <button className="primary-button" disabled={busy || !loginTurnstile}>{busy ? 'Signing in...' : 'Sign in'}</button>
            </form>
          ) : (
            <form onSubmit={submitRegistration}>
              <div className="field-row">
                <label>First name<input required autoComplete="given-name" maxLength="80" value={registration.firstName} onChange={(event) => setRegistration({ ...registration, firstName: event.target.value })} /></label>
                <label>Last name<input required autoComplete="family-name" maxLength="80" value={registration.lastName} onChange={(event) => setRegistration({ ...registration, lastName: event.target.value })} /></label>
              </div>
              <label>Property address<input required autoComplete="street-address" maxLength="160" placeholder="Street address" value={registration.address} onChange={(event) => setRegistration({ ...registration, address: event.target.value })} /></label>
              <label>Email address<input required type="email" autoComplete="email" maxLength="254" value={registration.email} onChange={(event) => setRegistration({ ...registration, email: event.target.value })} /></label>
              <label>Phone number <span>Optional</span><input type="tel" autoComplete="tel" maxLength="30" value={registration.phone} onChange={(event) => setRegistration({ ...registration, phone: event.target.value })} /></label>
              <label>Password <span>At least 12 characters</span><input required type="password" autoComplete="new-password" minLength="12" maxLength="128" value={registration.password} onChange={(event) => setRegistration({ ...registration, password: event.target.value })} /></label>
              <TurnstileWidget onToken={setRegistrationTurnstile} resetKey={registrationReset} />
              <button className="primary-button" disabled={busy || !registrationTurnstile}>{busy ? 'Submitting...' : 'Request resident access'}</button>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
