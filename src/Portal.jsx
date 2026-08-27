import { useEffect, useRef, useState } from 'react'
import { api } from './api.js'
import './Portal.css'

const emptyRegistration = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  address: '',
}

const TURNSTILE_SITE_KEY = '0x4AAAAAAEcUDgznRsbFwnFc'
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

export function TurnstileWidget({ onToken, resetKey }) {
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

function authNotice(status) {
  if (status === 'not_registered') return 'That Google account is not registered yet. Submit a resident access request first.'
  if (status === 'pending') return 'Your resident registration is still awaiting HOA approval.'
  return ''
}

function authError(status) {
  if (status === 'rejected' || status === 'suspended') return 'This resident account is not currently active.'
  if (status === 'google_failed') return 'Google sign-in could not be completed. Please try again.'
  return ''
}

function ResidentHome({ user, onLogout }) {
  const [tab, setTab] = useState('overview')
  const [data, setData] = useState({ announcements: [], events: [], documents: [], reservations: [], messages: [], guests: [] })
  const emptyReservation = { eventName: '', eventType: '', startsAt: '', endsAt: '', attendeeCount: '1', cleaningMethod: 'self', notes: '', rulesAcknowledged: false }
  const [reservation, setReservation] = useState(emptyReservation)
  const [message, setMessage] = useState({ category: 'general', message: '' })
  const [sendingMessage, setSendingMessage] = useState(false)
  const [guest, setGuest] = useState({ guestName: '', startsOn: '', endsOn: '', poolResponsibilityAcknowledged: false })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preferences, setPreferences] = useState({ notifyAnnouncements: Boolean(user.notifyAnnouncements), notifyEvents: Boolean(user.notifyEvents) })

  async function load() { setData(await api('/api/portal/dashboard')) }
  useEffect(() => { api('/api/portal/dashboard').then(setData).catch((requestError) => setError(requestError.message)) }, [])

  async function reserve(event) {
    event.preventDefault(); setError(''); setNotice('')
    try {
      await api('/api/portal/reservations', { method: 'POST', body: JSON.stringify({ ...reservation, attendeeCount: Number(reservation.attendeeCount), startsAt: new Date(reservation.startsAt).toISOString(), endsAt: new Date(reservation.endsAt).toISOString() }) })
      setReservation(emptyReservation)
      setNotice('Your request was submitted for administrator review. You will receive an email after a decision is made.')
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  async function cancel(id) {
    setError('')
    try { await api(`/api/portal/reservations/${id}`, { method: 'DELETE' }); await load() }
    catch (requestError) { setError(requestError.message) }
  }

  async function savePreferences(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      await api('/api/portal/preferences', { method: 'PATCH', body: JSON.stringify(preferences) })
      setNotice('Notification preferences saved.')
    } catch (requestError) { setError(requestError.message) }
  }

  async function sendMessage(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setSendingMessage(true)
    try {
      await api('/api/portal/messages', { method: 'POST', body: JSON.stringify(message) })
      setMessage({ category: 'general', message: '' })
      setNotice('Your message was sent to the HOA administrators.')
      await load()
    } catch (requestError) { setError(requestError.message) }
    setSendingMessage(false)
  }

  async function registerGuest(event) {
    event.preventDefault(); setError(''); setNotice('')
    try {
      await api('/api/portal/guests', { method: 'POST', body: JSON.stringify(guest) })
      setGuest({ guestName: '', startsOn: '', endsOn: '', poolResponsibilityAcknowledged: false })
      setNotice('Your guest has been registered with the HOA.')
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  async function revokeGuest(id) {
    setError(''); setNotice('')
    try { await api(`/api/portal/guests/${id}`, { method: 'DELETE' }); setNotice('Guest registration revoked.'); await load() }
    catch (requestError) { setError(requestError.message) }
  }

  const tabs = ['overview', 'calendar', 'documents', 'reserve', 'guests', 'messages', 'settings']
  const dateTime = (value) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const dateOnly = (value) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
  return <div className="portal-shell"><PortalHeader /><main className="resident-dashboard">
    <header className="dashboard-heading"><div><p className="portal-kicker">Resident portal</p><h1>Welcome, {user.firstName}.</h1><p className="portal-lead">{user.address}, Lindale, TX 75771</p></div><div className="dashboard-actions">{user.role !== 'resident' && <a className="primary-button" href="/admin">Administration</a>}<button type="button" className="secondary-button" onClick={onLogout}>Sign out</button></div></header>
    <nav className="workspace-tabs" aria-label="Resident portal sections">{tabs.map((item) => <button type="button" key={item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); setError(''); setNotice('') }}>{item}</button>)}</nav>
    {notice && <p className="form-notice" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    {tab === 'overview' && <div className="dashboard-columns"><section><h2>Announcements</h2>{data.announcements.map((item) => <article className="announcement" key={item.id}><small>{dateTime(item.publishedAt)}</small><h3>{item.title}</h3><p>{item.body}</p></article>)}{data.announcements.length === 0 && <p className="empty-state">No member announcements yet.</p>}</section><section><h2>Coming up</h2>{data.events.slice(0, 5).map((item) => <div className="data-row" key={item.id}><div><strong>{item.title}</strong><small>{dateTime(item.startsAt)}</small></div><span>{item.eventType}</span></div>)}{data.events.length === 0 && <p className="empty-state">No upcoming events.</p>}</section></div>}
    {tab === 'calendar' && <CalendarView events={data.events} />}
    {tab === 'documents' && <section className="document-list">{data.documents.map((item) => <a href={item.url} target="_blank" rel="noreferrer" key={item.id}><div><strong>{item.title}</strong><small>{item.description || item.category}</small></div><span>{item.category}</span></a>)}{data.documents.length === 0 && <p className="empty-state">No member documents have been added.</p>}</section>}
    {tab === 'reserve' && <div className="reservation-layout"><section className="editor-panel"><h2>Clubhouse request</h2><p className="form-context">Requests are reviewed by an HOA administrator and are not official until approved.</p><form onSubmit={reserve}><label>Event name<input required maxLength="140" value={reservation.eventName} onChange={(event) => setReservation({ ...reservation, eventName: event.target.value })} /></label><label>Type of event<input required maxLength="100" placeholder="Birthday, family gathering, meeting" value={reservation.eventType} onChange={(event) => setReservation({ ...reservation, eventType: event.target.value })} /></label><div className="field-row"><label>Starts<input required type="datetime-local" value={reservation.startsAt} onChange={(event) => setReservation({ ...reservation, startsAt: event.target.value })} /></label><label>Ends<input required type="datetime-local" value={reservation.endsAt} onChange={(event) => setReservation({ ...reservation, endsAt: event.target.value })} /></label></div><label>Expected attendees<input required type="number" min="1" max="65" value={reservation.attendeeCount} onChange={(event) => setReservation({ ...reservation, attendeeCount: event.target.value })} /><span>Maximum 65 under the clubhouse fire-safety limit.</span></label><label>Cleaning plan<select value={reservation.cleaningMethod} onChange={(event) => setReservation({ ...reservation, cleaningMethod: event.target.value })}><option value="self">I will clean the clubhouse</option><option value="professional">I will use a professional cleaner</option></select></label><label>Additional details<textarea maxLength="1500" value={reservation.notes} onChange={(event) => setReservation({ ...reservation, notes: event.target.value })} /></label><ClubhouseRules /><label className="rules-check"><input required type="checkbox" checked={reservation.rulesAcknowledged} onChange={(event) => setReservation({ ...reservation, rulesAcknowledged: event.target.checked })} /><span>I have read and agree to the Reservation Agreement and cleaning checklist. I accept responsibility for the clubhouse, grounds, guests, damages, and the $100 reservation deposit.</span></label><button className="primary-button">Submit request</button></form></section><section className="reservation-history"><h2>Your reservation history</h2>{data.reservations.map((item) => <article className="reservation-record" key={item.id}><header><div><strong>{item.eventName}</strong><small>{dateTime(item.startsAt)} to {dateTime(item.endsAt)}</small></div><span className={`status status-${item.status}`}>{item.status}</span></header><p>{item.eventType} | {item.attendeeCount} attendees | {item.cleaningMethod === 'professional' ? 'Professional cleaner' : 'Self-cleaning'}</p>{item.decisionReason && <p className="decision-reason"><strong>Decision reason:</strong> {item.decisionReason}</p>}{['pending', 'approved'].includes(item.status) && <button type="button" className="quiet-button" onClick={() => cancel(item.id)}>Cancel request</button>}</article>)}{data.reservations.length === 0 && <p className="empty-state">You have no reservation requests.</p>}</section></div>}
    {tab === 'guests' && <div className="guest-registration-layout"><section className="editor-panel"><h2>Register a guest</h2><p className="form-context">Register a guest staying at your residence so the HOA knows when they are authorized to use the pool.</p><form onSubmit={registerGuest}><label>Guest name<input required maxLength="160" value={guest.guestName} onChange={(event) => setGuest({ ...guest, guestName: event.target.value })} /></label><div className="field-row"><label>Arrival date<input required type="date" value={guest.startsOn} onChange={(event) => setGuest({ ...guest, startsOn: event.target.value })} /></label><label>Departure date<input required type="date" min={guest.startsOn} value={guest.endsOn} onChange={(event) => setGuest({ ...guest, endsOn: event.target.value })} /></label></div><label className="rules-check"><input required type="checkbox" checked={guest.poolResponsibilityAcknowledged} onChange={(event) => setGuest({ ...guest, poolResponsibilityAcknowledged: event.target.checked })} /><span>I accept responsibility for this guest and their unsupervised access to the pool during the dates listed above.</span></label><button className="primary-button">Register guest</button></form></section><section className="guest-history"><h2>Your guest registrations</h2>{data.guests.map((item) => <article className="guest-record" key={item.id}><header><div><strong>{item.guestName}</strong><small>{dateOnly(item.startsOn)} through {dateOnly(item.endsOn)}</small></div><span className={`status status-${item.status}`}>{item.status}</span></header><p>Registered {dateTime(item.createdAt)} | Pool responsibility acknowledged</p>{item.status === 'active' && <button type="button" className="quiet-button" onClick={() => revokeGuest(item.id)}>Revoke registration</button>}</article>)}{data.guests.length === 0 && <p className="empty-state">You have no guest registrations.</p>}</section></div>}
    {tab === 'messages' && <div className="resident-message-layout"><section className="editor-panel"><h2>Message the HOA</h2><p className="form-context">Your account and property will be included automatically.</p><form onSubmit={sendMessage}><label>Topic<select value={message.category} onChange={(event) => setMessage({ ...message, category: event.target.value })}><option value="general">General question</option><option value="maintenance">Community maintenance</option><option value="architectural">Architectural review</option><option value="board">HOA board</option></select></label><label>Message<textarea required maxLength="5000" value={message.message} onChange={(event) => setMessage({ ...message, message: event.target.value })} /></label><button className="primary-button" disabled={sendingMessage}>{sendingMessage ? 'Sending...' : 'Send message'}</button></form></section><section className="resident-message-history"><h2>Your messages</h2>{data.messages.map((item) => <article className="resident-message-record" key={item.id}><header><span>{item.category}</span><span className={`status status-${item.status}`}>{item.status}</span></header><p>{item.message}</p><time>{dateTime(item.createdAt)}</time></article>)}{data.messages.length === 0 && <p className="empty-state">You have not sent any messages.</p>}</section></div>}
    {tab === 'settings' && <section className="settings-panel"><h2>Email notifications</h2><p>Choose which optional community updates are emailed to you. Account security and reservation decisions are always sent.</p><form onSubmit={savePreferences}><label><input type="checkbox" checked={preferences.notifyAnnouncements} onChange={(event) => setPreferences({ ...preferences, notifyAnnouncements: event.target.checked })} /><span><strong>Announcements</strong><small>Board notices and community updates</small></span></label><label><input type="checkbox" checked={preferences.notifyEvents} onChange={(event) => setPreferences({ ...preferences, notifyEvents: event.target.checked })} /><span><strong>Events</strong><small>New meetings and community events</small></span></label><button className="primary-button">Save preferences</button></form></section>}
  </main></div>
}

function CalendarView({ events }) {
  const [view, setView] = useState('month')
  const [month, setMonth] = useState(() => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1) })
  const dateTime = (value) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(month)
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const gridStart = new Date(first)
  gridStart.setDate(1 - first.getDay())
  const days = Array.from({ length: 42 }, (_, index) => { const date = new Date(gridStart); date.setDate(gridStart.getDate() + index); return date })
  const sameDay = (value, date) => { const eventDate = new Date(value); return eventDate.getFullYear() === date.getFullYear() && eventDate.getMonth() === date.getMonth() && eventDate.getDate() === date.getDate() }

  return <section className="calendar-workspace"><header className="calendar-toolbar"><div className="calendar-modes"><button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button><button type="button" className={view === 'agenda' ? 'active' : ''} onClick={() => setView('agenda')}>Agenda</button></div>{view === 'month' && <div className="month-controls"><button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>&larr;</button><strong>{monthLabel}</strong><button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>&rarr;</button></div>}</header>{view === 'month' ? <div className="month-calendar"><div className="weekday-row">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{days.map((day) => { const dayEvents = events.filter((item) => sameDay(item.startsAt, day)); return <div className={`month-day ${day.getMonth() !== month.getMonth() ? 'outside' : ''}`} key={day.toISOString()}><time>{day.getDate()}</time>{dayEvents.slice(0, 3).map((item) => <a href={`/api/events/${item.id}.ics`} className={`calendar-chip type-${item.eventType}`} key={item.id} title={`${item.title} - download calendar file`}>{item.eventType === 'clubhouse' ? 'Reserved' : item.title}</a>)}{dayEvents.length > 3 && <small>+{dayEvents.length - 3} more</small>}</div> })}</div></div> : <div className="data-list">{events.map((item) => <div className="calendar-row" key={item.id}><time>{dateTime(item.startsAt)}</time><div><strong>{item.title}</strong><p>{item.description}</p></div><span>{item.eventType}</span><a className="calendar-download" href={`/api/events/${item.id}.ics`} title="Add to calendar">Add</a></div>)}{events.length === 0 && <p className="empty-state">No upcoming events.</p>}</div>}</section>
}

function ClubhouseRules() {
  return <details className="clubhouse-rules" open><summary>Reservation Agreement and cleaning checklist</summary><div><h3>Reservation requirements</h3><ul><li>The reserving adult HOA member must be current on HOA financial obligations, present for the event, and chaperone functions for anyone under 18.</li><li>Requests are normally accepted no more than 90 days in advance, first come first served, with no more than two active reservations per household.</li><li>The clubhouse cannot be subleased, opened to the public, or used for commercial or fundraising activity without prior HOA officer approval.</li><li>No pets, tobacco products, or alcoholic beverages are allowed in the clubhouse, pool area, or surrounding common grounds.</li><li>Access and key pickup must be coordinated with the HOA based on other reservations.</li></ul><h3>Member responsibility</h3><ul><li>The member is responsible for guests, injuries, loss, damage, cleanup, and returning the key promptly.</li><li>The $100 reservation deposit may be forfeited for professional cleaning. Repair costs for damage remain the member's responsibility.</li><li>After the event, remove trash, food, and decorations; clean floors, kitchen, bathrooms, tables, chairs, appliances, counters, grounds, and the vacuum container.</li><li>Set the thermostat to 55 degrees in winter or 85 degrees in summer, turn off lights, and close and lock all exterior and bathroom doors.</li></ul></div></details>
}

export default function Portal() {
  const initialAuthStatus = new URLSearchParams(window.location.search).get('auth')
  const [mode, setMode] = useState('login')
  const [registration, setRegistration] = useState(emptyRegistration)
  const [login, setLogin] = useState({ email: '', code: '' })
  const [loginStage, setLoginStage] = useState('request')
  const [user, setUser] = useState(null)
  const [notice, setNotice] = useState(() => authNotice(initialAuthStatus))
  const [error, setError] = useState(() => authError(initialAuthStatus))
  const [busy, setBusy] = useState(false)
  const [loginTurnstile, setLoginTurnstile] = useState('')
  const [registrationTurnstile, setRegistrationTurnstile] = useState('')
  const [loginReset, setLoginReset] = useState(0)
  const [registrationReset, setRegistrationReset] = useState(0)

  useEffect(() => {
    api('/api/auth/session').then(({ user: currentUser }) => setUser(currentUser)).catch(() => {})
    if (initialAuthStatus) window.history.replaceState({}, '', '/portal')
  }, [initialAuthStatus])

  async function requestCode(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/auth/code/request', {
        method: 'POST',
        body: JSON.stringify({ email: login.email, turnstileToken: loginTurnstile }),
      })
      setLoginStage('verify')
      setNotice('If this email belongs to an approved resident, a six-digit sign-in code is on its way.')
    } catch (requestError) {
      setError(requestError.message)
      setLoginTurnstile('')
      setLoginReset((value) => value + 1)
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/auth/code/verify', { method: 'POST', body: JSON.stringify(login) })
      setUser(result.user)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitRegistration(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ ...registration, turnstileToken: registrationTurnstile }),
      })
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
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setNotice('') }}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); setNotice('') }}>Register</button>
          </div>
          {notice && <p className="form-notice" role="status">{notice}</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {mode === 'login' ? (
            <form onSubmit={loginStage === 'request' ? requestCode : verifyCode}>
              {loginStage === 'request' && (
                <>
                  <a className="google-button" href="/api/auth/google/start">Continue with Google</a>
                  <div className="auth-divider"><span>or use email</span></div>
                </>
              )}
              <label>Email address<input required type="email" autoComplete="email" disabled={loginStage === 'verify'} value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} /></label>
              {loginStage === 'request' ? (
                <>
                  <TurnstileWidget onToken={setLoginTurnstile} resetKey={loginReset} />
                  <button className="primary-button" disabled={busy || !loginTurnstile}>{busy ? 'Sending...' : 'Email me a sign-in code'}</button>
                </>
              ) : (
                <>
                  <label>Six-digit code<input required inputMode="numeric" autoComplete="one-time-code" maxLength="6" pattern="[0-9]{6}" value={login.code} onChange={(event) => setLogin({ ...login, code: event.target.value.replace(/\D/g, '').slice(0, 6) })} /></label>
                  <button className="primary-button" disabled={busy || login.code.length !== 6}>{busy ? 'Signing in...' : 'Verify and sign in'}</button>
                  <button type="button" className="secondary-button" onClick={() => { setLoginStage('request'); setLogin({ ...login, code: '' }); setNotice(''); setLoginTurnstile(''); setLoginReset((value) => value + 1) }}>Use a different email</button>
                </>
              )}
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
              <TurnstileWidget onToken={setRegistrationTurnstile} resetKey={registrationReset} />
              <button className="primary-button" disabled={busy || !registrationTurnstile}>{busy ? 'Submitting...' : 'Request resident access'}</button>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}
