import { useEffect, useState } from 'react'
import { api } from './api.js'
import './Portal.css'

const emptyForms = {
  property: { address: '', phaseName: 'New Development' },
  announcement: { title: '', body: '', audience: 'members' },
  event: { title: '', description: '', startsAt: '', endsAt: '', audience: 'members', eventType: 'community' },
  document: { title: '', description: '', url: '', category: 'General', audience: 'members' },
}

function dateTime(value) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }

export default function Admin() {
  const [tab, setTab] = useState('accounts')
  const [user, setUser] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [data, setData] = useState({ properties: [], announcements: [], events: [], documents: [], reservations: [] })
  const [forms, setForms] = useState(emptyForms)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    const [{ user: currentUser }, { users }, dashboard] = await Promise.all([api('/api/auth/session'), api('/api/admin/users'), api('/api/admin/dashboard')])
    setUser(currentUser); setAccounts(users); setData(dashboard)
  }

  useEffect(() => {
    Promise.all([api('/api/auth/session'), api('/api/admin/users'), api('/api/admin/dashboard')])
      .then(([{ user: currentUser }, { users }, dashboard]) => { setUser(currentUser); setAccounts(users); setData(dashboard) })
      .catch((requestError) => setError(requestError.message))
  }, [])

  async function updateAccount(id, status) {
    setError('')
    try { await api(`/api/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load() }
    catch (requestError) { setError(requestError.message) }
  }

  async function submit(kind, endpoint, event) {
    event.preventDefault(); setError(''); setNotice('')
    try {
      const payload = { ...forms[kind] }
      if (payload.startsAt) payload.startsAt = new Date(payload.startsAt).toISOString()
      if (payload.endsAt) payload.endsAt = new Date(payload.endsAt).toISOString()
      await api(`/api/admin/${endpoint}`, { method: 'POST', body: JSON.stringify(payload) })
      setForms({ ...forms, [kind]: emptyForms[kind] }); setNotice('Saved successfully.'); await load()
    } catch (requestError) { setError(requestError.message) }
  }

  function updateForm(kind, field, value) { setForms({ ...forms, [kind]: { ...forms[kind], [field]: value } }) }
  const tabs = ['accounts', 'properties', 'announcements', 'events', 'documents', 'reservations']

  return <div className="portal-shell admin-shell">
    <header className="portal-header"><a className="brand" href="/"><span className="brand-mark">PL</span><span>Penny Lane <em>HOA</em></span></a><div className="admin-nav"><a href="/portal">Resident portal</a><a href="/">Community site</a></div></header>
    <main className="admin-main">
      <header><div><p className="portal-kicker">Administration</p><h1>Community operations</h1></div>{user && <p>Signed in as {user.firstName} {user.lastName}</p>}</header>
      <nav className="workspace-tabs" aria-label="Administration sections">{tabs.map((item) => <button type="button" key={item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); setError(''); setNotice('') }}>{item}</button>)}</nav>
      {notice && <p className="form-notice" role="status">{notice}</p>}{error && <p className="form-error" role="alert">{error}</p>}
      {tab === 'accounts' && <div className="account-table"><div className="account-row account-head"><span>Name</span><span>Property</span><span>Status</span><span>Action</span></div>{accounts.map((account) => <div className="account-row" key={account.id}><span><strong>{account.firstName} {account.lastName}</strong><small>{account.email}</small></span><span>{account.address}</span><span className={`status status-${account.status}`}>{account.status}</span><span className="account-actions">{account.status !== 'active' && <button type="button" onClick={() => updateAccount(account.id, 'active')}>Approve</button>}{account.status === 'active' && account.id !== user?.id && <button type="button" onClick={() => updateAccount(account.id, 'suspended')}>Suspend</button>}{account.status === 'pending' && <button type="button" className="quiet-action" onClick={() => updateAccount(account.id, 'rejected')}>Reject</button>}</span></div>)}</div>}
      {tab === 'properties' && <Workspace title="Add property" form={<form onSubmit={(event) => submit('property', 'properties', event)}><label>Street address<input required placeholder="800 Abbey Rd" value={forms.property.address} onChange={(event) => updateForm('property', 'address', event.target.value)} /></label><label>Phase<input required value={forms.property.phaseName} onChange={(event) => updateForm('property', 'phaseName', event.target.value)} /></label><button className="primary-button">Add property</button></form>} rows={data.properties.map((item) => <DataRow key={item.id} title={item.address} detail={item.phase} meta={item.status} />)} />}
      {tab === 'announcements' && <Workspace title="Post announcement" form={<form onSubmit={(event) => submit('announcement', 'announcements', event)}><label>Title<input required value={forms.announcement.title} onChange={(event) => updateForm('announcement', 'title', event.target.value)} /></label><label>Message<textarea required value={forms.announcement.body} onChange={(event) => updateForm('announcement', 'body', event.target.value)} /></label><Audience value={forms.announcement.audience} onChange={(value) => updateForm('announcement', 'audience', value)} /><button className="primary-button">Publish</button></form>} rows={data.announcements.map((item) => <DataRow key={item.id} title={item.title} detail={dateTime(item.publishedAt)} meta={item.audience} />)} />}
      {tab === 'events' && <Workspace title="Add calendar event" form={<form onSubmit={(event) => submit('event', 'events', event)}><label>Title<input required value={forms.event.title} onChange={(event) => updateForm('event', 'title', event.target.value)} /></label><label>Description<textarea value={forms.event.description} onChange={(event) => updateForm('event', 'description', event.target.value)} /></label><div className="field-row"><label>Starts<input required type="datetime-local" value={forms.event.startsAt} onChange={(event) => updateForm('event', 'startsAt', event.target.value)} /></label><label>Ends<input required type="datetime-local" value={forms.event.endsAt} onChange={(event) => updateForm('event', 'endsAt', event.target.value)} /></label></div><Audience value={forms.event.audience} onChange={(value) => updateForm('event', 'audience', value)} /><button className="primary-button">Add event</button></form>} rows={data.events.map((item) => <DataRow key={item.id} title={item.title} detail={dateTime(item.startsAt)} meta={item.eventType} />)} />}
      {tab === 'documents' && <Workspace title="Add document link" form={<form onSubmit={(event) => submit('document', 'documents', event)}><label>Title<input required value={forms.document.title} onChange={(event) => updateForm('document', 'title', event.target.value)} /></label><label>HTTPS file link<input required type="url" value={forms.document.url} onChange={(event) => updateForm('document', 'url', event.target.value)} /></label><label>Category<input required value={forms.document.category} onChange={(event) => updateForm('document', 'category', event.target.value)} /></label><Audience value={forms.document.audience} onChange={(value) => updateForm('document', 'audience', value)} /><button className="primary-button">Add document</button></form>} rows={data.documents.map((item) => <DataRow key={item.id} title={item.title} detail={item.category} meta={item.audience} />)} />}
      {tab === 'reservations' && <div className="data-list">{data.reservations.map((item) => <DataRow key={item.id} title={item.eventName} detail={`${item.residentName} · ${dateTime(item.startsAt)}`} meta={item.status} />)}{data.reservations.length === 0 && <p className="empty-state">No clubhouse reservations yet.</p>}</div>}
    </main>
  </div>
}

function Audience({ value, onChange }) { return <label>Visibility<select value={value} onChange={(event) => onChange(event.target.value)}><option value="members">Members only</option><option value="public">Public</option></select></label> }
function Workspace({ title, form, rows }) { return <div className="workspace-grid"><section className="editor-panel"><h2>{title}</h2>{form}</section><section className="data-list">{rows}{rows.length === 0 && <p className="empty-state">Nothing has been added yet.</p>}</section></div> }
function DataRow({ title, detail, meta }) { return <div className="data-row"><div><strong>{title}</strong><small>{detail}</small></div><span>{meta}</span></div> }
