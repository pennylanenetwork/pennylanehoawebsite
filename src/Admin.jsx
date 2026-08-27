import { useEffect, useState } from 'react'
import { api } from './api.js'
import './Portal.css'

const emptyForms = {
  property: { address: '', phaseName: 'New Development' },
  announcement: { title: '', body: '', audience: 'members' },
  event: { title: '', description: '', startsAt: '', endsAt: '', audience: 'members', eventType: 'community' },
  document: { title: '', description: '', url: '', category: 'General', audience: 'members' },
}

function dateTime(value) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function localDateTime(value) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date - offset).toISOString().slice(0, 16)
}

export default function Admin() {
  const [tab, setTab] = useState('accounts')
  const [user, setUser] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [data, setData] = useState({ properties: [], announcements: [], events: [], documents: [], reservations: [] })
  const [forms, setForms] = useState(emptyForms)
  const [editing, setEditing] = useState(null)
  const [documentMode, setDocumentMode] = useState('upload')
  const [documentFile, setDocumentFile] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    const [{ user: currentUser }, { users }, dashboard] = await Promise.all([
      api('/api/auth/session'), api('/api/admin/users'), api('/api/admin/dashboard'),
    ])
    setUser(currentUser)
    setAccounts(users)
    setData(dashboard)
  }

  useEffect(() => {
    Promise.all([api('/api/auth/session'), api('/api/admin/users'), api('/api/admin/dashboard')])
      .then(([{ user: currentUser }, { users }, dashboard]) => {
        setUser(currentUser)
        setAccounts(users)
        setData(dashboard)
      })
      .catch((requestError) => setError(requestError.message))
  }, [])

  async function updateAccount(id, status) {
    setError('')
    try {
      await api(`/api/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  async function submit(kind, endpoint, event) {
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      const payload = { ...forms[kind] }
      if (payload.startsAt) payload.startsAt = new Date(payload.startsAt).toISOString()
      if (payload.endsAt) payload.endsAt = new Date(payload.endsAt).toISOString()
      const isEditing = editing?.kind === kind
      await api(`/api/admin/${endpoint}${isEditing ? `/${editing.id}` : ''}`, {
        method: isEditing ? 'PATCH' : 'POST', body: JSON.stringify(payload),
      })
      setForms({ ...forms, [kind]: emptyForms[kind] })
      setEditing(null)
      setNotice('Saved successfully.')
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  async function submitDocument(event) {
    if (documentMode === 'link') return submit('document', 'documents', event)
    event.preventDefault()
    setError('')
    setNotice('')
    try {
      if (!documentFile) throw new Error('Choose a document to upload.')
      const form = new FormData()
      for (const [key, value] of Object.entries(forms.document)) {
        if (key !== 'url') form.append(key, value)
      }
      form.append('file', documentFile)
      const isEditing = editing?.kind === 'document'
      await api(`/api/admin/documents${isEditing ? `/${editing.id}` : ''}/upload`, {
        method: isEditing ? 'PUT' : 'POST', body: form,
      })
      setForms({ ...forms, document: emptyForms.document })
      setDocumentFile(null)
      setEditing(null)
      setNotice('Document uploaded successfully.')
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  function updateForm(kind, field, value) {
    setForms({ ...forms, [kind]: { ...forms[kind], [field]: value } })
  }

  function beginEdit(kind, item) {
    const form = { ...item }
    if (form.startsAt) form.startsAt = localDateTime(form.startsAt)
    if (form.endsAt) form.endsAt = localDateTime(form.endsAt)
    setForms({ ...forms, [kind]: { ...emptyForms[kind], ...form } })
    setEditing({ kind, id: item.id })
    if (kind === 'document') { setDocumentMode(item.storageKey ? 'upload' : 'link'); setDocumentFile(null) }
    setError('')
    setNotice('')
  }

  function stopEditing(kind) {
    setForms({ ...forms, [kind]: emptyForms[kind] })
    setEditing(null)
    if (kind === 'document') setDocumentFile(null)
  }

  async function remove(endpoint, id, message) {
    if (!window.confirm(message)) return
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/${endpoint}/${id}`, { method: 'DELETE' })
      setNotice('Updated successfully.')
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  async function setPropertyStatus(id, status) {
    setError('')
    try {
      await api(`/api/admin/properties/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  async function decideReservation(id, decision, reason = '') {
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/reservations/${id}`, { method: 'PATCH', body: JSON.stringify({ decision, reason }) })
      setNotice(decision === 'approve' ? 'Reservation approved and added to the members calendar.' : 'Reservation denied and the resident was notified.')
      await load()
    } catch (requestError) { setError(requestError.message) }
  }

  const tabs = ['accounts', 'properties', 'announcements', 'events', 'documents', 'reservations']

  return <div className="portal-shell admin-shell">
    <header className="portal-header">
      <a className="brand" href="/"><span className="brand-mark">PL</span><span>Penny Lane <em>HOA</em></span></a>
      <div className="admin-nav"><a href="/portal">Resident portal</a><a href="/">Community site</a></div>
    </header>
    <main className="admin-main">
      <header><div><p className="portal-kicker">Administration</p><h1>Community operations</h1></div>{user && <p>Signed in as {user.firstName} {user.lastName}</p>}</header>
      <nav className="workspace-tabs" aria-label="Administration sections">
        {tabs.map((item) => <button type="button" key={item} className={tab === item ? 'active' : ''} onClick={() => { setTab(item); setEditing(null); setError(''); setNotice('') }}>{item}</button>)}
      </nav>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {tab === 'accounts' && <div className="account-table">
        <div className="account-row account-head"><span>Name</span><span>Property</span><span>Status</span><span>Action</span></div>
        {accounts.map((account) => <div className="account-row" key={account.id}>
          <span><strong>{account.firstName} {account.lastName}</strong><small>{account.email}</small></span><span>{account.address}</span>
          <span className={`status status-${account.status}`}>{account.status}</span>
          <span className="account-actions">{account.status !== 'active' && <button type="button" onClick={() => updateAccount(account.id, 'active')}>Approve</button>}{account.status === 'active' && account.id !== user?.id && <button type="button" onClick={() => updateAccount(account.id, 'suspended')}>Suspend</button>}{account.status === 'pending' && <button type="button" className="quiet-action" onClick={() => updateAccount(account.id, 'rejected')}>Reject</button>}</span>
        </div>)}
      </div>}

      {tab === 'properties' && <Workspace title="Add property" form={<form onSubmit={(event) => submit('property', 'properties', event)}>
        <label>Street address<input required placeholder="800 Abbey Rd" value={forms.property.address} onChange={(event) => updateForm('property', 'address', event.target.value)} /></label>
        <label>Phase<input required value={forms.property.phaseName} onChange={(event) => updateForm('property', 'phaseName', event.target.value)} /></label>
        <button className="primary-button">Add property</button>
      </form>} rows={data.properties.map((item) => <DataRow key={item.id} title={item.address} detail={item.phase} meta={item.status} actions={<select aria-label={`Status for ${item.address}`} value={item.status} onChange={(event) => setPropertyStatus(item.id, event.target.value)}><option value="active">Active</option><option value="planned">Planned</option><option value="inactive">Inactive</option></select>} />)} />}

      {tab === 'announcements' && <Workspace title={editing?.kind === 'announcement' ? 'Edit announcement' : 'Post announcement'} form={<form onSubmit={(event) => submit('announcement', 'announcements', event)}>
        <label>Title<input required value={forms.announcement.title} onChange={(event) => updateForm('announcement', 'title', event.target.value)} /></label>
        <label>Message<textarea required value={forms.announcement.body} onChange={(event) => updateForm('announcement', 'body', event.target.value)} /></label>
        <Audience value={forms.announcement.audience} onChange={(value) => updateForm('announcement', 'audience', value)} />
        <FormActions editing={editing?.kind === 'announcement'} label="Publish" onCancel={() => stopEditing('announcement')} />
      </form>} rows={data.announcements.map((item) => <DataRow key={item.id} title={item.title} detail={dateTime(item.publishedAt)} meta={item.audience} actions={<RowActions onEdit={() => beginEdit('announcement', item)} onDelete={() => remove('announcements', item.id, 'Delete this announcement?')} />} />)} />}

      {tab === 'events' && <Workspace title={editing?.kind === 'event' ? 'Edit calendar event' : 'Add calendar event'} form={<form onSubmit={(event) => submit('event', 'events', event)}>
        <label>Title<input required value={forms.event.title} onChange={(event) => updateForm('event', 'title', event.target.value)} /></label>
        <label>Description<textarea value={forms.event.description} onChange={(event) => updateForm('event', 'description', event.target.value)} /></label>
        <div className="field-row"><label>Starts<input required type="datetime-local" value={forms.event.startsAt} onChange={(event) => updateForm('event', 'startsAt', event.target.value)} /></label><label>Ends<input required type="datetime-local" value={forms.event.endsAt} onChange={(event) => updateForm('event', 'endsAt', event.target.value)} /></label></div>
        <label>Event type<select value={forms.event.eventType} onChange={(event) => updateForm('event', 'eventType', event.target.value)}><option value="community">Community event</option><option value="meeting">HOA meeting</option></select></label>
        <Audience value={forms.event.audience} onChange={(value) => updateForm('event', 'audience', value)} />
        <FormActions editing={editing?.kind === 'event'} label="Add event" onCancel={() => stopEditing('event')} />
      </form>} rows={data.events.map((item) => <DataRow key={item.id} title={item.title} detail={dateTime(item.startsAt)} meta={item.status} actions={item.eventType !== 'clubhouse' && <RowActions onEdit={() => beginEdit('event', item)} onDelete={() => remove('events', item.id, 'Cancel this calendar event?')} deleteLabel="Cancel" />} />)} />}

      {tab === 'documents' && <Workspace title={editing?.kind === 'document' ? 'Edit document' : 'Add document'} form={<form onSubmit={submitDocument}>
        <label>Storage<select value={documentMode} disabled={editing?.kind === 'document'} onChange={(event) => setDocumentMode(event.target.value)}><option value="upload">Upload to this site</option><option value="link">External HTTPS link</option></select></label>
        <label>Title<input required value={forms.document.title} onChange={(event) => updateForm('document', 'title', event.target.value)} /></label>
        <label>Description<textarea value={forms.document.description} onChange={(event) => updateForm('document', 'description', event.target.value)} /></label>
        {documentMode === 'upload' ? <label>{editing?.kind === 'document' ? 'Replacement file' : 'File'}<input required type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={(event) => setDocumentFile(event.target.files[0] || null)} /><span>PDF, Word, Excel, JPEG, or PNG. Maximum 15 MB.</span></label> : <label>HTTPS file link<input required type="url" value={forms.document.url} onChange={(event) => updateForm('document', 'url', event.target.value)} /></label>}
        <label>Category<input required value={forms.document.category} onChange={(event) => updateForm('document', 'category', event.target.value)} /></label>
        <Audience value={forms.document.audience} onChange={(value) => updateForm('document', 'audience', value)} />
        <FormActions editing={editing?.kind === 'document'} label={documentMode === 'upload' ? 'Upload document' : 'Add document'} onCancel={() => stopEditing('document')} />
      </form>} rows={data.documents.map((item) => <DataRow key={item.id} title={item.title} detail={`${item.category}${item.originalName ? ` | ${item.originalName}` : ''}`} meta={item.audience} actions={<RowActions onEdit={() => beginEdit('document', item)} onDelete={() => remove('documents', item.id, 'Delete this document?')} />} />)} />}

      {tab === 'reservations' && <div className="reservation-admin-list">{data.reservations.map((item) => <ReservationReview key={item.id} item={item} onDecide={decideReservation} onCancel={() => remove('reservations', item.id, 'Cancel this clubhouse reservation?')} />)}{data.reservations.length === 0 && <p className="empty-state">No clubhouse reservation requests yet.</p>}</div>}
    </main>
  </div>
}

function Audience({ value, onChange }) {
  return <label>Visibility<select value={value} onChange={(event) => onChange(event.target.value)}><option value="members">Members only</option><option value="public">Public</option></select></label>
}

function Workspace({ title, form, rows }) {
  return <div className="workspace-grid"><section className="editor-panel"><h2>{title}</h2>{form}</section><section className="data-list">{rows}{rows.length === 0 && <p className="empty-state">Nothing has been added yet.</p>}</section></div>
}

function FormActions({ editing, label, onCancel }) {
  return <div className="form-actions"><button className="primary-button">{editing ? 'Save changes' : label}</button>{editing && <button type="button" className="quiet-button" onClick={onCancel}>Cancel editing</button>}</div>
}

function RowActions({ onEdit, onDelete, deleteLabel = 'Delete' }) {
  return <div className="row-actions"><button type="button" onClick={onEdit}>Edit</button><button type="button" className="row-delete" onClick={onDelete}>{deleteLabel}</button></div>
}

function DataRow({ title, detail, meta, actions }) {
  return <div className="data-row"><div><strong>{title}</strong><small>{detail}</small></div><span>{meta}</span>{actions}</div>
}

function ReservationReview({ item, onDecide, onCancel }) {
  const [reason, setReason] = useState('')
  return <article className={`reservation-review ${item.status === 'pending' ? 'is-pending' : ''}`}><header><div><strong>{item.eventName}</strong><small>{item.residentName} | {item.address}</small></div><span className={`status status-${item.status}`}>{item.status}</span></header><dl><div><dt>Schedule</dt><dd>{dateTime(item.startsAt)} to {dateTime(item.endsAt)}</dd></div><div><dt>Event</dt><dd>{item.eventType}</dd></div><div><dt>Attendance</dt><dd>{item.attendeeCount}</dd></div><div><dt>Cleaning</dt><dd>{item.cleaningMethod === 'professional' ? 'Professional cleaner' : 'Resident will clean'}</dd></div></dl>{item.notes && <p><strong>Notes:</strong> {item.notes}</p>}{item.decisionReason && <p className="decision-reason"><strong>Decision reason:</strong> {item.decisionReason}</p>}{item.status === 'pending' && <div className="decision-controls"><button type="button" className="primary-button" onClick={() => onDecide(item.id, 'approve')}>Approve</button><label>Reason required to deny<textarea maxLength="1000" value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="button" className="row-delete" disabled={!reason.trim()} onClick={() => onDecide(item.id, 'deny', reason)}>Deny request</button></div>}{item.status === 'approved' && <button type="button" className="row-delete" onClick={onCancel}>Cancel reservation</button>}</article>
}
