import { useEffect, useState } from 'react'
import { api } from './api.js'
import './Portal.css'

const emptyForms = {
  property: { address: '', phaseName: 'New Development' },
  publicUpdate: {
    title: '',
    body: '',
    audience: 'public',
    notifyResidents: false,
  },
  announcement: {
    title: '',
    body: '',
    audience: 'members',
    notifyResidents: true,
  },
  event: {
    title: '',
    description: '',
    startsAt: '',
    endsAt: '',
    audience: 'members',
    eventType: 'community',
    notifyResidents: true,
  },
  document: {
    title: '',
    description: '',
    url: '',
    category: 'General',
    audience: 'members',
  },
}

function dateTime(value) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function localDateTime(value) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date - offset).toISOString().slice(0, 16)
}

async function optimizePhoto(file) {
  const image = await createImageBitmap(file)
  const scale = Math.min(1, 2000 / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, width, height)
  image.close()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84))
  if (!blob) throw new Error('This image could not be prepared for upload.')
  return {
    file: new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, {
      type: 'image/webp',
    }),
    width,
    height,
  }
}

export default function Admin() {
  const [tab, setTab] = useState('overview')
  const [user, setUser] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [data, setData] = useState({
    properties: [],
    announcements: [],
    events: [],
    documents: [],
    reservations: [],
    messages: [],
    photos: [],
    guests: [],
    poolCards: [],
    clubhouse: null,
    blackouts: [],
  })
  const [forms, setForms] = useState(emptyForms)
  const [editing, setEditing] = useState(null)
  const [documentMode, setDocumentMode] = useState('upload')
  const [documentFile, setDocumentFile] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [propertyQuery, setPropertyQuery] = useState('')

  async function load() {
    const [{ user: currentUser }, { users }, dashboard] = await Promise.all([api('/api/auth/session'), api('/api/admin/users'), api('/api/admin/dashboard')])
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
      await api(`/api/admin/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await load()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function updateAccountProfile(id, profile) {
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(profile),
      })
      setNotice('Resident record updated.')
      await load()
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    }
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
        method: isEditing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
      setForms({ ...forms, [kind]: emptyForms[kind] })
      setEditing(null)
      setNotice('Saved successfully.')
      await load()
    } catch (requestError) {
      setError(requestError.message)
    }
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
        method: isEditing ? 'PUT' : 'POST',
        body: form,
      })
      setForms({ ...forms, document: emptyForms.document })
      setDocumentFile(null)
      setEditing(null)
      setNotice('Document uploaded successfully.')
      await load()
    } catch (requestError) {
      setError(requestError.message)
    }
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
    if (kind === 'document') {
      setDocumentMode(item.storageKey ? 'upload' : 'link')
      setDocumentFile(null)
    }
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
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function setPropertyStatus(id, status) {
    setError('')
    try {
      await api(`/api/admin/properties/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await load()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function decideReservation(id, decision, reason = '', override = {}) {
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/reservations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, reason, ...override }),
      })
      setNotice(decision === 'approve' ? 'Reservation approved and added to the members calendar.' : 'Reservation denied and the resident was notified.')
      await load()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function decideDeposit(id, action, reason = '') {
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/reservations/${id}/deposit`, { method: 'POST', body: JSON.stringify({ action, reason }) })
      setNotice(action === 'refund' ? '$96.80 refund submitted to Stripe.' : 'The deposit was marked as retained.')
      await load()
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    }
  }

  async function saveClubhouseSettings(settings) {
    setError('')
    setNotice('')
    try {
      await api('/api/admin/clubhouse/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      })
      setNotice('Clubhouse controls saved.')
      await load()
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    }
  }

  async function addBlackout(blackout) {
    setError('')
    setNotice('')
    try {
      await api('/api/admin/clubhouse/blackouts', {
        method: 'POST',
        body: JSON.stringify({
          ...blackout,
          startsAt: new Date(blackout.startsAt).toISOString(),
          endsAt: new Date(blackout.endsAt).toISOString(),
        }),
      })
      setNotice('Blackout period added.')
      await load()
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    }
  }

  async function updateMessage(id, status, adminNotes) {
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, adminNotes }),
      })
      setNotice('Message updated.')
      await load()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function replyToMessage(id, reply) {
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/messages/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ reply }),
      })
      setNotice('Reply emailed and added to the property communication history.')
      await load()
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    }
  }

  async function uploadPhoto(form, sourceFile) {
    setError('')
    setNotice('')
    try {
      const optimized = await optimizePhoto(sourceFile)
      const body = new FormData()
      body.append('file', optimized.file)
      body.append('width', optimized.width)
      body.append('height', optimized.height)
      body.append('altText', form.altText)
      body.append('caption', form.caption)
      await api('/api/admin/gallery', { method: 'POST', body })
      setNotice('Photo optimized and uploaded.')
      await load()
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    }
  }

  async function updatePhoto(id, photo) {
    setError('')
    try {
      await api(`/api/admin/gallery/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(photo),
      })
      await load()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const tabs = ['overview', 'accounts', 'properties', 'access', 'in the know', 'announcements', 'events', 'documents', 'photos', 'reservations', 'messages']
  const normalizedPropertyQuery = propertyQuery.trim().toLowerCase()
  const visibleProperties = data.properties.filter((property) => `${property.address} ${property.residentNames || ''}`.toLowerCase().includes(normalizedPropertyQuery))

  return (
    <div className="portal-shell admin-shell">
      <header className="portal-header">
        <a className="brand" href="/">
          <span className="brand-mark">PL</span>
          <span>
            Penny Lane <em>HOA</em>
          </span>
        </a>
        <nav className="portal-view-nav" aria-label="Switch portal view">
          <a href="/portal">Resident portal</a>
          <a className="active" href="/admin">
            Administration
          </a>
        </nav>
      </header>
      <main className="admin-main">
        <header>
          <div>
            <p className="portal-kicker">Administration</p>
            <h1>Community operations</h1>
          </div>
          {user && (
            <p>
              Signed in as {user.firstName} {user.lastName}
            </p>
          )}
        </header>
        <nav className="workspace-tabs" aria-label="Administration sections">
          {tabs.map((item) => (
            <button
              type="button"
              key={item}
              className={tab === item ? 'active' : ''}
              onClick={() => {
                setTab(item)
                setEditing(null)
                setError('')
                setNotice('')
              }}
            >
              {item}
            </button>
          ))}
        </nav>
        {notice && (
          <p className="form-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {tab === 'overview' && <AdminOverview accounts={accounts} data={data} onOpen={setTab} />}

        {tab === 'accounts' && (
          <section>
            <div className="account-tools">
              <p>{accounts.length} resident accounts</p>
              <a className="quiet-button" href="/api/admin/users.csv">
                Download CSV
              </a>
            </div>
            <div className="resident-admin-list">
              {accounts.map((account) => (
                <AccountReview key={`${account.id}:${account.role}:${account.isBoardMember}:${account.isAccMember}`} account={account} currentUser={user} properties={data.properties} onStatus={updateAccount} onSave={updateAccountProfile} />
              ))}
            </div>
          </section>
        )}

        {tab === 'properties' && selectedProperty && <PropertyDetail propertyId={selectedProperty} isSuperAdmin={user?.role === 'super_admin'} onBack={() => setSelectedProperty(null)} />}
        {tab === 'properties' && !selectedProperty && (
          <Workspace
            title="Add property"
            listHeader={
              <div className="property-search">
                <label>
                  Find a property
                  <input type="search" placeholder="Search address or resident name" value={propertyQuery} onChange={(event) => setPropertyQuery(event.target.value)} />
                </label>
                <span>
                  {visibleProperties.length} of {data.properties.length} properties
                </span>
              </div>
            }
            form={
              <form onSubmit={(event) => submit('property', 'properties', event)}>
                <label>
                  Street address
                  <input required placeholder="800 Abbey Rd" value={forms.property.address} onChange={(event) => updateForm('property', 'address', event.target.value)} />
                </label>
                <label>
                  Phase
                  <input required value={forms.property.phaseName} onChange={(event) => updateForm('property', 'phaseName', event.target.value)} />
                </label>
                <button className="primary-button">Add property</button>
              </form>
            }
            rows={visibleProperties.map((item) => (
              <DataRow
                key={item.id}
                title={item.address}
                detail={item.residentNames ? `${item.phase} | ${item.residentNames}` : item.phase}
                meta={item.status}
                onOpen={() => setSelectedProperty(item.id)}
                actions={
                  <select aria-label={`Status for ${item.address}`} value={item.status} onChange={(event) => setPropertyStatus(item.id, event.target.value)}>
                    <option value="active">Active</option>
                    <option value="planned">Planned</option>
                    <option value="inactive">Inactive</option>
                  </select>
                }
              />
            ))}
          />
        )}

        {tab === 'access' && <AccessWorkspace guests={data.guests} poolCards={data.poolCards} />}

        {tab === 'in the know' && (
          <Workspace
            title={editing?.kind === 'publicUpdate' ? 'Edit public update' : 'Add public update'}
            form={
              <form onSubmit={(event) => submit('publicUpdate', 'announcements', event)}>
                <p className="form-context">Public updates appear in the homepage In the Know section alongside public calendar events.</p>
                <label>
                  Title
                  <input required maxLength="140" value={forms.publicUpdate.title} onChange={(event) => updateForm('publicUpdate', 'title', event.target.value)} />
                </label>
                <label>
                  Message
                  <textarea required maxLength="5000" value={forms.publicUpdate.body} onChange={(event) => updateForm('publicUpdate', 'body', event.target.value)} />
                </label>
                {editing?.kind !== 'publicUpdate' && (
                  <label className="rules-check">
                    <input type="checkbox" checked={forms.publicUpdate.notifyResidents} onChange={(event) => updateForm('publicUpdate', 'notifyResidents', event.target.checked)} />
                    <span>Email residents who subscribe to announcements.</span>
                  </label>
                )}
                <FormActions editing={editing?.kind === 'publicUpdate'} label="Publish update" onCancel={() => stopEditing('publicUpdate')} />
              </form>
            }
            rows={data.announcements
              .filter((item) => item.audience === 'public')
              .map((item) => (
                <DataRow key={item.id} title={item.title} detail={dateTime(item.publishedAt)} meta="homepage" actions={<RowActions onEdit={() => beginEdit('publicUpdate', item)} onDelete={() => remove('announcements', item.id, 'Delete this public update?')} />} />
              ))}
          />
        )}

        {tab === 'announcements' && (
          <Workspace
            title={editing?.kind === 'announcement' ? 'Edit announcement' : 'Post announcement'}
            form={
              <form onSubmit={(event) => submit('announcement', 'announcements', event)}>
                <label>
                  Title
                  <input required value={forms.announcement.title} onChange={(event) => updateForm('announcement', 'title', event.target.value)} />
                </label>
                <label>
                  Message
                  <textarea required value={forms.announcement.body} onChange={(event) => updateForm('announcement', 'body', event.target.value)} />
                </label>
                <Audience value={forms.announcement.audience} onChange={(value) => updateForm('announcement', 'audience', value)} />
                {editing?.kind !== 'announcement' && (
                  <label className="rules-check">
                    <input type="checkbox" checked={forms.announcement.notifyResidents} onChange={(event) => updateForm('announcement', 'notifyResidents', event.target.checked)} />
                    <span>Email residents who subscribe to announcements.</span>
                  </label>
                )}
                <FormActions editing={editing?.kind === 'announcement'} label="Publish" onCancel={() => stopEditing('announcement')} />
              </form>
            }
            rows={data.announcements
              .filter((item) => item.audience === 'members')
              .map((item) => (
                <DataRow key={item.id} title={item.title} detail={dateTime(item.publishedAt)} meta={item.audience} actions={<RowActions onEdit={() => beginEdit('announcement', item)} onDelete={() => remove('announcements', item.id, 'Delete this announcement?')} />} />
              ))}
          />
        )}

        {tab === 'events' && (
          <Workspace
            title={editing?.kind === 'event' ? 'Edit calendar event' : 'Add calendar event'}
            form={
              <form onSubmit={(event) => submit('event', 'events', event)}>
                <label>
                  Title
                  <input required value={forms.event.title} onChange={(event) => updateForm('event', 'title', event.target.value)} />
                </label>
                <label>
                  Description
                  <textarea value={forms.event.description} onChange={(event) => updateForm('event', 'description', event.target.value)} />
                </label>
                <div className="field-row">
                  <label>
                    Starts
                    <input required type="datetime-local" value={forms.event.startsAt} onChange={(event) => updateForm('event', 'startsAt', event.target.value)} />
                  </label>
                  <label>
                    Ends
                    <input required type="datetime-local" value={forms.event.endsAt} onChange={(event) => updateForm('event', 'endsAt', event.target.value)} />
                  </label>
                </div>
                <label>
                  Event type
                  <select value={forms.event.eventType} onChange={(event) => updateForm('event', 'eventType', event.target.value)}>
                    <option value="community">Community event</option>
                    <option value="meeting">HOA meeting</option>
                  </select>
                </label>
                <Audience value={forms.event.audience} onChange={(value) => updateForm('event', 'audience', value)} />
                {editing?.kind !== 'event' && (
                  <label className="rules-check">
                    <input type="checkbox" checked={forms.event.notifyResidents} onChange={(event) => updateForm('event', 'notifyResidents', event.target.checked)} />
                    <span>Email residents who subscribe to event notices.</span>
                  </label>
                )}
                <FormActions editing={editing?.kind === 'event'} label="Add event" onCancel={() => stopEditing('event')} />
              </form>
            }
            rows={data.events.map((item) => (
              <DataRow
                key={item.id}
                title={item.title}
                detail={dateTime(item.startsAt)}
                meta={item.status}
                actions={
                  <div className="row-actions">
                    {item.eventType !== 'clubhouse' && (
                      <>
                        <button type="button" onClick={() => beginEdit('event', item)}>
                          Edit
                        </button>
                        <button type="button" onClick={() => remove('events', item.id, 'Cancel this calendar event?')}>
                          Cancel
                        </button>
                      </>
                    )}
                    {user?.role === 'super_admin' && (
                      <button type="button" className="row-delete" onClick={() => remove('events', `${item.id}/permanent`, 'Permanently delete this event and any linked reservation history? This cannot be undone.')}>
                        Delete permanently
                      </button>
                    )}
                  </div>
                }
              />
            ))}
          />
        )}

        {tab === 'documents' && (
          <Workspace
            title={editing?.kind === 'document' ? 'Edit document' : 'Add document'}
            form={
              <form onSubmit={submitDocument}>
                <label>
                  Storage
                  <select value={documentMode} disabled={editing?.kind === 'document'} onChange={(event) => setDocumentMode(event.target.value)}>
                    <option value="upload">Upload to this site</option>
                    <option value="link">External HTTPS link</option>
                  </select>
                </label>
                <label>
                  Title
                  <input required value={forms.document.title} onChange={(event) => updateForm('document', 'title', event.target.value)} />
                </label>
                <label>
                  Description
                  <textarea value={forms.document.description} onChange={(event) => updateForm('document', 'description', event.target.value)} />
                </label>
                {documentMode === 'upload' ? (
                  <label>
                    {editing?.kind === 'document' ? 'Replacement file' : 'File'}
                    <input required type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={(event) => setDocumentFile(event.target.files[0] || null)} />
                    <span>PDF, Word, Excel, JPEG, or PNG. Maximum 15 MB.</span>
                  </label>
                ) : (
                  <label>
                    HTTPS file link
                    <input required type="url" value={forms.document.url} onChange={(event) => updateForm('document', 'url', event.target.value)} />
                  </label>
                )}
                <label>
                  Category
                  <input required value={forms.document.category} onChange={(event) => updateForm('document', 'category', event.target.value)} />
                </label>
                <Audience value={forms.document.audience} onChange={(value) => updateForm('document', 'audience', value)} />
                <FormActions editing={editing?.kind === 'document'} label={documentMode === 'upload' ? 'Upload document' : 'Add document'} onCancel={() => stopEditing('document')} />
              </form>
            }
            rows={data.documents.map((item) => (
              <DataRow key={item.id} title={item.title} detail={`${item.category}${item.originalName ? ` | ${item.originalName}` : ''}`} meta={item.audience} actions={<RowActions onEdit={() => beginEdit('document', item)} onDelete={() => remove('documents', item.id, 'Delete this document?')} />} />
            ))}
          />
        )}

        {tab === 'photos' && <PhotoManager photos={data.photos} onUpload={uploadPhoto} onUpdate={updatePhoto} onDelete={(id) => remove('gallery', id, 'Delete this photo permanently?')} />}

        {tab === 'reservations' && (
          <div>
            <ClubhouseControls settings={data.clubhouse} blackouts={data.blackouts} onSave={saveClubhouseSettings} onAddBlackout={addBlackout} onDeleteBlackout={(id) => remove('clubhouse/blackouts', id, 'Remove this clubhouse blackout period?')} />
            <div className="reservation-admin-list">
              {data.reservations.map((item) => (
                <ReservationReview key={item.id} item={item} onDecide={decideReservation} onDeposit={user?.role === 'super_admin' ? decideDeposit : null} onCancel={() => remove('reservations', item.id, 'Cancel this clubhouse reservation?')} onDelete={user?.role === 'super_admin' ? () => remove('reservations', `${item.id}/permanent`, 'Permanently delete this reservation and its calendar event? This cannot be undone.') : null} />
              ))}
              {data.reservations.length === 0 && <p className="empty-state">No clubhouse reservation requests yet.</p>}
            </div>
          </div>
        )}
        {tab === 'messages' && (
          <div className="message-admin-list">
            {data.messages.map((item) => (
              <MessageReview key={item.id} item={item} onUpdate={updateMessage} onReply={replyToMessage} onDelete={user?.role === 'super_admin' ? () => remove('messages', item.id, 'Permanently delete this message conversation and its communication history?') : null} />
            ))}
            {data.messages.length === 0 && <p className="empty-state">No contact messages yet.</p>}
          </div>
        )}
      </main>
    </div>
  )
}

function AdminOverview({ accounts, data, onOpen }) {
  const items = [
    {
      label: 'Pending accounts',
      value: accounts.filter((item) => item.status === 'pending').length,
      tab: 'accounts',
    },
    {
      label: 'Unread messages',
      value: data.messages.filter((item) => item.status === 'new').length,
      tab: 'messages',
    },
    {
      label: 'Reservation requests',
      value: data.reservations.filter((item) => item.status === 'pending').length,
      tab: 'reservations',
    },
    {
      label: 'Active guests',
      value: data.guests.filter((item) => item.status === 'active').length,
      tab: 'access',
    },
    {
      label: 'Lost or stolen cards',
      value: data.poolCards.filter((item) => ['lost', 'stolen'].includes(item.status)).length,
      tab: 'access',
    },
  ]
  return (
    <section className="admin-overview">
      <div className="overview-metrics">
        {items.map((item) => (
          <button type="button" onClick={() => onOpen(item.tab)} key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
            <small>Open {item.tab}</small>
          </button>
        ))}
      </div>
      <div className="overview-recent">
        <section>
          <h2>Next reservations</h2>
          {data.reservations
            .filter((item) => ['pending', 'approved'].includes(item.status))
            .slice(0, 5)
            .map((item) => (
              <div className="data-row" key={item.id}>
                <div>
                  <strong>{item.eventName}</strong>
                  <small>
                    {item.residentName} | {dateTime(item.startsAt)}
                  </small>
                </div>
                <span className={`status status-${item.status}`}>{item.status}</span>
              </div>
            ))}
          {data.reservations.length === 0 && <p className="empty-state">No reservation activity.</p>}
        </section>
        <section>
          <h2>Recent messages</h2>
          {data.messages.slice(0, 5).map((item) => (
            <div className="data-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {item.category} | {dateTime(item.createdAt)}
                </small>
              </div>
              <span className={`status status-${item.status}`}>{item.status}</span>
            </div>
          ))}
          {data.messages.length === 0 && <p className="empty-state">No recent messages.</p>}
        </section>
      </div>
    </section>
  )
}

function ClubhouseControls({ settings, blackouts, onSave, onAddBlackout, onDeleteBlackout }) {
  const [form, setForm] = useState(
    settings || {
      opensAt: '08:00',
      closesAt: '23:00',
      cleanupBufferMinutes: 60,
      advanceDays: 90,
      maxActivePerHousehold: 2,
    },
  )
  const emptyBlackout = { title: '', startsAt: '', endsAt: '', notes: '' }
  const [blackout, setBlackout] = useState(emptyBlackout)
  return (
    <section className="clubhouse-controls">
      <div className="clubhouse-settings">
        <h2>Reservation controls</h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            await onSave({
              ...form,
              cleanupBufferMinutes: Number(form.cleanupBufferMinutes),
              advanceDays: Number(form.advanceDays),
              maxActivePerHousehold: Number(form.maxActivePerHousehold),
            })
          }}
        >
          <label>
            Opens
            <input required type="time" value={form.opensAt} onChange={(event) => setForm({ ...form, opensAt: event.target.value })} />
          </label>
          <label>
            Closes
            <input required type="time" value={form.closesAt} onChange={(event) => setForm({ ...form, closesAt: event.target.value })} />
          </label>
          <label>
            Cleanup buffer
            <input required type="number" min="0" max="240" value={form.cleanupBufferMinutes} onChange={(event) => setForm({ ...form, cleanupBufferMinutes: event.target.value })} />
            <span>Minutes before and after reservations.</span>
          </label>
          <label>
            Advance window
            <input required type="number" min="1" max="365" value={form.advanceDays} onChange={(event) => setForm({ ...form, advanceDays: event.target.value })} />
            <span>Maximum days in advance.</span>
          </label>
          <label>
            Household limit
            <input required type="number" min="1" max="10" value={form.maxActivePerHousehold} onChange={(event) => setForm({ ...form, maxActivePerHousehold: event.target.value })} />
            <span>Pending and approved requests.</span>
          </label>
          <button className="primary-button">Save controls</button>
        </form>
      </div>
      <div className="blackout-manager">
        <h2>Blackout periods</h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (await onAddBlackout(blackout)) setBlackout(emptyBlackout)
          }}
        >
          <label>
            Title
            <input required maxLength="140" value={blackout.title} onChange={(event) => setBlackout({ ...blackout, title: event.target.value })} />
          </label>
          <div className="field-row">
            <label>
              Starts
              <input required type="datetime-local" value={blackout.startsAt} onChange={(event) => setBlackout({ ...blackout, startsAt: event.target.value })} />
            </label>
            <label>
              Ends
              <input required type="datetime-local" value={blackout.endsAt} onChange={(event) => setBlackout({ ...blackout, endsAt: event.target.value })} />
            </label>
          </div>
          <label>
            Notes
            <input maxLength="1000" value={blackout.notes} onChange={(event) => setBlackout({ ...blackout, notes: event.target.value })} />
          </label>
          <button className="primary-button">Add blackout</button>
        </form>
        <div className="blackout-list">
          {blackouts.map((item) => (
            <article key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <small>
                  {dateTime(item.startsAt)} to {dateTime(item.endsAt)}
                </small>
              </div>
              <button type="button" className="row-delete" onClick={() => onDeleteBlackout(item.id)}>
                Remove
              </button>
            </article>
          ))}
          {blackouts.length === 0 && <p className="empty-state">No blackout periods configured.</p>}
        </div>
      </div>
    </section>
  )
}

function AccessWorkspace({ guests, poolCards }) {
  const [view, setView] = useState('guests')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [weekFromToday] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
  const source = view === 'guests' ? guests : poolCards
  const filtered = source.filter((item) => {
    const haystack = Object.values(item).join(' ').toLowerCase()
    const endingSoon = view === 'guests' && item.status === 'active' && item.endsOn >= today && item.endsOn <= weekFromToday
    return (status === 'all' || item.status === status || (status === 'Ending within 7 days' && endingSoon)) && haystack.includes(query.trim().toLowerCase())
  })
  const statuses = view === 'guests' ? ['active', 'Ending within 7 days', 'expired', 'revoked'] : ['active', 'lost', 'stolen', 'returned', 'deactivated']
  return (
    <section className="access-workspace">
      <header>
        <div className="calendar-modes">
          <button
            type="button"
            className={view === 'guests' ? 'active' : ''}
            onClick={() => {
              setView('guests')
              setStatus('all')
            }}
          >
            Guests
          </button>
          <button
            type="button"
            className={view === 'cards' ? 'active' : ''}
            onClick={() => {
              setView('cards')
              setStatus('all')
            }}
          >
            Pool cards
          </button>
        </div>
        <div className="access-actions">
          <a className="quiet-button" href={view === 'guests' ? '/api/admin/guests.csv' : '/api/admin/pool-cards.csv'}>
            Download CSV
          </a>
        </div>
      </header>
      <div className="access-filters">
        <label>
          Search
          <input type="search" placeholder={view === 'guests' ? 'Guest, resident, or property' : 'Card ID, resident, or property'} value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            {statuses.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <span>{filtered.length} records</span>
      </div>
      <div className="access-list">
        {view === 'guests'
          ? filtered.map((item) => (
              <article className="access-row" key={item.id}>
                <div>
                  <strong>{item.guestName}</strong>
                  <small>
                    {item.address} | Registered by {item.registeredByName}
                  </small>
                </div>
                <div>
                  <small>
                    {item.startsOn} through {item.endsOn}
                  </small>
                  <span className={`status status-${item.status}`}>{item.status}</span>
                </div>
              </article>
            ))
          : filtered.map((item) => (
              <article className="access-row" key={item.id}>
                <div>
                  <strong>{item.cardNumber}</strong>
                  <small>
                    {item.address}
                    {item.assignedName ? ` | ${item.assignedName}` : ' | Property card'}
                  </small>
                </div>
                <div>
                  <small>{item.notes || `Issued ${dateTime(item.issuedAt)}`}</small>
                  <span className={`status status-${item.status}`}>{item.status}</span>
                </div>
              </article>
            ))}
        {filtered.length === 0 && <p className="empty-state">No matching records.</p>}
      </div>
    </section>
  )
}

function Audience({ value, onChange }) {
  return (
    <label>
      Visibility
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="members">Members only</option>
        <option value="public">Public</option>
      </select>
    </label>
  )
}

function Workspace({ title, form, rows, listHeader = null }) {
  return (
    <div className="workspace-grid">
      <section className="editor-panel">
        <h2>{title}</h2>
        {form}
      </section>
      <section className="data-list">
        {listHeader}
        {rows}
        {rows.length === 0 && <p className="empty-state">No matching records.</p>}
      </section>
    </div>
  )
}

function FormActions({ editing, label, onCancel }) {
  return (
    <div className="form-actions">
      <button className="primary-button">{editing ? 'Save changes' : label}</button>
      {editing && (
        <button type="button" className="quiet-button" onClick={onCancel}>
          Cancel editing
        </button>
      )}
    </div>
  )
}

function RowActions({ onEdit, onDelete, deleteLabel = 'Delete' }) {
  return (
    <div className="row-actions">
      <button type="button" onClick={onEdit}>
        Edit
      </button>
      <button type="button" className="row-delete" onClick={onDelete}>
        {deleteLabel}
      </button>
    </div>
  )
}

function DataRow({ title, detail, meta, actions, onOpen }) {
  return (
    <div className="data-row">
      <div>
        {onOpen ? (
          <button type="button" className="row-title-button" onClick={onOpen}>
            {title}
          </button>
        ) : (
          <strong>{title}</strong>
        )}
        <small>{detail}</small>
      </div>
      <span>{meta}</span>
      {actions}
    </div>
  )
}

function ReservationReview({ item, onDecide, onDeposit, onCancel, onDelete }) {
  const [reason, setReason] = useState('')
  const [overrideConflicts, setOverrideConflicts] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [depositReason, setDepositReason] = useState('')
  return (
    <article className={`reservation-review ${item.status === 'pending' ? 'is-pending' : ''}`}>
      <header>
        <div>
          <strong>{item.eventName}</strong>
          <small>
            {item.residentName} | {item.address}
          </small>
        </div>
        <span className={`status status-${item.status}`}>{item.status}</span>
      </header>
      <dl>
        <div>
          <dt>Schedule</dt>
          <dd>
            {dateTime(item.startsAt)} to {dateTime(item.endsAt)}
          </dd>
        </div>
        <div>
          <dt>Event</dt>
          <dd>{item.eventType}</dd>
        </div>
        <div>
          <dt>Attendance</dt>
          <dd>{item.attendeeCount}</dd>
        </div>
        <div>
          <dt>Cleaning</dt>
          <dd>{item.cleaningMethod === 'professional' ? 'Professional cleaner' : 'Resident will clean'}</dd>
        </div>
      </dl>
      {item.notes && (
        <p>
          <strong>Notes:</strong> {item.notes}
        </p>
      )}
      {item.decisionReason && (
        <p className="decision-reason">
          <strong>Decision reason:</strong> {item.decisionReason}
        </p>
      )}
      {item.overrideReason && (
        <p className="override-note">
          <strong>Availability override:</strong> {item.overrideReason}
        </p>
      )}
      <div className="deposit-admin-status"><strong>Security deposit</strong><span className={`status status-${item.depositStatus}`}>{item.depositStatus?.replace('_', ' ')}</span><small>$100.00 charge | $3.20 nonrefundable fee | $96.80 refundable</small>{item.depositDecisionReason && <p>{item.depositDecisionReason}</p>}</div>
      {item.depositStatus === 'held' && onDeposit && <div className="deposit-actions"><label>Reason or inspection note<textarea maxLength="1000" value={depositReason} onChange={(event) => setDepositReason(event.target.value)} /></label><button type="button" className="primary-button" onClick={() => onDeposit(item.id, 'refund', depositReason)}>Refund $96.80</button><button type="button" className="row-delete" disabled={!depositReason.trim()} onClick={() => onDeposit(item.id, 'retain', depositReason)}>Retain deposit</button></div>}
      {item.status === 'pending' && (
        <>
          <div className="override-controls">
            <label className="rules-check">
              <input type="checkbox" checked={overrideConflicts} onChange={(event) => setOverrideConflicts(event.target.checked)} />
              <span>
                <strong>Override availability rules</strong>
                <small>Use only when approving despite operating hours, a blackout, cleanup buffer, or another approved reservation.</small>
              </span>
            </label>
            {overrideConflicts && (
              <label>
                Required override reason
                <textarea required maxLength="1000" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />
              </label>
            )}
          </div>
          <div className="decision-controls">
            <button
              type="button"
              className="primary-button"
              disabled={overrideConflicts && !overrideReason.trim()}
              onClick={() =>
                onDecide(item.id, 'approve', '', {
                  overrideConflicts,
                  overrideReason,
                })
              }
            >
              {overrideConflicts ? 'Approve with override' : 'Approve'}
            </button>
            <label>
              Reason required to deny
              <textarea maxLength="1000" value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <button type="button" className="row-delete" disabled={!reason.trim()} onClick={() => onDecide(item.id, 'deny', reason)}>
              Deny request
            </button>
          </div>
        </>
      )}
      {item.status === 'approved' && (
        <button type="button" className="row-delete" onClick={onCancel}>
          Cancel reservation
        </button>
      )}
      {onDelete && (
        <button type="button" className="row-delete permanent-delete" onClick={onDelete}>
          Delete permanently
        </button>
      )}
    </article>
  )
}

function MessageReview({ item, onUpdate, onReply, onDelete }) {
  const [notes, setNotes] = useState(item.adminNotes || '')
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  return (
    <article className={`message-review status-border-${item.status}`}>
      <header>
        <div>
          <strong>{item.name}</strong>
          <small>
            <a href={`mailto:${item.email}`}>{item.email}</a>
            {item.phone ? ` | ${item.phone}` : ''}
            {item.address ? ` | ${item.address}` : ''}
          </small>
        </div>
        <span className={`status status-${item.status}`}>{item.status}</span>
      </header>
      <p className="message-category">
        {item.source} | {item.category} | {dateTime(item.createdAt)}
      </p>
      <div className="message-thread admin-message-thread">
        <div className="thread-entry from-resident">
          <small>{item.name}</small>
          <p>{item.message}</p>
          <time>{dateTime(item.createdAt)}</time>
        </div>
        {(item.replies || []).map((entry) => (
          <div className={`thread-entry from-${entry.authorRole}`} key={entry.id}>
            <small>{entry.authorRole === 'admin' ? 'HOA administrator' : item.name}</small>
            <p>{entry.body}</p>
            <time>{dateTime(entry.createdAt)}</time>
          </div>
        ))}
      </div>
      <label>
        Reply to resident
        <textarea maxLength="5000" value={reply} onChange={(event) => setReply(event.target.value)} />
      </label>
      <button
        type="button"
        className="primary-button message-reply-button"
        disabled={sending || !reply.trim()}
        onClick={async () => {
          setSending(true)
          if (await onReply(item.id, reply)) setReply('')
          setSending(false)
        }}
      >
        {sending ? 'Sending...' : item.source === 'Resident portal' ? 'Send portal and email reply' : 'Email reply'}
      </button>
      <label>
        Internal notes
        <textarea maxLength="3000" value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <div className="row-actions">
        <button type="button" onClick={() => onUpdate(item.id, 'read', notes)}>
          Mark read
        </button>
        <button type="button" onClick={() => onUpdate(item.id, 'closed', notes)}>
          Close
        </button>
        {item.status === 'closed' && (
          <button type="button" onClick={() => onUpdate(item.id, 'read', notes)}>
            Reopen
          </button>
        )}
        {onDelete && (
          <button type="button" className="row-delete" onClick={onDelete}>
            Delete permanently
          </button>
        )}
      </div>
    </article>
  )
}

function residentTypeLabel(value) {
  if (value === 'tenant') return 'Renter'
  if (value === 'household_member') return 'Household member'
  return 'Property owner'
}

function AccountReview({ account, currentUser, properties, onStatus, onSave }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
    phone: account.phone || '',
    propertyId: account.propertyId,
    residentType: account.residentType,
    role: account.role,
    isBoardMember: Boolean(account.isBoardMember),
    isAccMember: Boolean(account.isAccMember),
    isTreasurer: Boolean(account.isTreasurer),
    isAmenitiesCoordinator: Boolean(account.isAmenitiesCoordinator),
    isPresident: Boolean(account.isPresident),
    isVicePresident: Boolean(account.isVicePresident),
    isSecretary: Boolean(account.isSecretary),
  })
  const update = (field, value) => setForm({ ...form, [field]: value })
  return (
    <article className="account-review">
      <header>
        <div>
          <strong>
            {account.firstName} {account.lastName}
          </strong>
          <small>
            {account.email} | {account.address}
          </small>
        </div>
        <div>
          <span className={`status status-${account.status}`}>{account.status}</span>
          <span className="account-type">{residentTypeLabel(account.residentType)}</span>
          {account.role !== 'resident' && <span className="account-role">{account.role === 'super_admin' ? 'Super administrator' : 'Administrator'}</span>}
          {account.isBoardMember && <span className="committee-role">Board member</span>}
          {account.isAccMember && <span className="committee-role">ACC Committee</span>}
          {account.isTreasurer && <span className="committee-role">Treasurer</span>}
          {account.isPresident && <span className="committee-role">President</span>}
          {account.isVicePresident && <span className="committee-role">Vice President</span>}
          {account.isSecretary && <span className="committee-role">Secretary</span>}
          {account.isAmenitiesCoordinator && <span className="committee-role">Amenities Coordinator</span>}
        </div>
      </header>
      {editing ? (
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (await onSave(account.id, form)) setEditing(false)
          }}
        >
          <div className="field-row">
            <label>
              First name
              <input required value={form.firstName} onChange={(event) => update('firstName', event.target.value)} />
            </label>
            <label>
              Last name
              <input required value={form.lastName} onChange={(event) => update('lastName', event.target.value)} />
            </label>
          </div>
          <div className="field-row">
            <label>
              Email
              <input required type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(event) => update('phone', event.target.value)} />
            </label>
          </div>
          <label>
            Property
            <select value={form.propertyId} onChange={(event) => update('propertyId', Number(event.target.value))}>
              {properties.map((property) => (
                <option value={property.id} key={property.id}>
                  {property.address} ({property.status})
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label>
              Property relationship
              <select value={form.residentType} onChange={(event) => update('residentType', event.target.value)}>
                <option value="owner">Property owner</option>
                <option value="tenant">Renter</option>
                <option value="household_member">Household member</option>
              </select>
            </label>
            <label>
              Access role
              <select value={form.role} disabled={currentUser?.role !== 'super_admin' || account.id === currentUser?.id} onChange={(event) => update('role', event.target.value)}>
                <option value="resident">Resident</option>
                <option value="admin">Administrator</option>
                {currentUser?.role === 'super_admin' && <option value="super_admin">Super administrator</option>}
              </select>
            </label>
          </div>
          {currentUser?.role === 'super_admin' && (
            <div className="committee-options">
              <label className="rules-check">
                <input type="checkbox" checked={form.isBoardMember} onChange={(event) => update('isBoardMember', event.target.checked)} />
                <span>Board member</span>
              </label>
              <label className="rules-check">
                <input type="checkbox" checked={form.isAccMember} onChange={(event) => update('isAccMember', event.target.checked)} />
                <span>ACC Committee member</span>
              </label>
              <label className="rules-check">
                <input type="checkbox" checked={form.isTreasurer} onChange={(event) => update('isTreasurer', event.target.checked)} />
                <span>Treasurer</span>
              </label>
              <label className="rules-check">
                <input type="checkbox" checked={form.isPresident} onChange={(event) => update('isPresident', event.target.checked)} />
                <span>President</span>
              </label>
              <label className="rules-check">
                <input type="checkbox" checked={form.isVicePresident} onChange={(event) => update('isVicePresident', event.target.checked)} />
                <span>Vice President</span>
              </label>
              <label className="rules-check">
                <input type="checkbox" checked={form.isSecretary} onChange={(event) => update('isSecretary', event.target.checked)} />
                <span>Secretary</span>
              </label>
              <label className="rules-check">
                <input type="checkbox" checked={form.isAmenitiesCoordinator} onChange={(event) => update('isAmenitiesCoordinator', event.target.checked)} />
                <span>Amenities Coordinator</span>
              </label>
            </div>
          )}
          <div className="form-actions">
            <button className="primary-button">Save resident</button>
            <button type="button" className="quiet-button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="account-review-actions">
          <button type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
          {account.status !== 'active' && (
            <button type="button" onClick={() => onStatus(account.id, 'active')}>
              Approve
            </button>
          )}
          {account.status === 'active' && account.id !== currentUser?.id && (
            <button type="button" onClick={() => onStatus(account.id, 'suspended')}>
              Suspend
            </button>
          )}
          {account.status === 'pending' && (
            <button type="button" className="row-delete" onClick={() => onStatus(account.id, 'rejected')}>
              Reject
            </button>
          )}
          {currentUser?.role === 'super_admin' && account.id !== currentUser.id && account.status === 'active' && account.role === 'resident' && (
            <button type="button" className="role-button" onClick={() => onSave(account.id, { ...form, role: 'admin' })}>
              Make administrator
            </button>
          )}
          {currentUser?.role === 'super_admin' && account.role === 'admin' && (
            <button type="button" className="row-delete" onClick={() => onSave(account.id, { ...form, role: 'resident' })}>
              Remove administrator
            </button>
          )}
          {currentUser?.role === 'super_admin' && (
            <button
              type="button"
              onClick={() =>
                onSave(account.id, {
                  ...form,
                  isBoardMember: !account.isBoardMember,
                })
              }
            >
              {account.isBoardMember ? 'Remove from board' : 'Add to board'}
            </button>
          )}
          {currentUser?.role === 'super_admin' && (
            <button
              type="button"
              onClick={() =>
                onSave(account.id, {
                  ...form,
                  isAccMember: !account.isAccMember,
                })
              }
            >
              {account.isAccMember ? 'Remove from ACC' : 'Add to ACC'}
            </button>
          )}
        </div>
      )}
    </article>
  )
}

function PhotoManager({ photos, onUpload, onUpdate, onDelete }) {
  const [file, setFile] = useState(null)
  const [form, setForm] = useState({ altText: '', caption: '' })
  const [busy, setBusy] = useState(false)

  async function submit(event) {
    event.preventDefault()
    if (!file) return
    const formElement = event.currentTarget
    setBusy(true)
    if (await onUpload(form, file)) {
      setFile(null)
      setForm({ altText: '', caption: '' })
      formElement.reset()
    }
    setBusy(false)
  }

  async function move(index, direction) {
    const other = photos[index + direction]
    if (!other) return
    const current = photos[index]
    await onUpdate(current.id, { ...current, sortOrder: other.sortOrder })
    await onUpdate(other.id, { ...other, sortOrder: current.sortOrder })
  }

  const atLimit = photos.length >= 15
  return (
    <div className="photo-workspace">
      <section className="editor-panel">
        <h2>Add carousel photo</h2>
        <p className="form-context">{photos.length} of 15 photos stored. Hidden photos count toward the limit. Delete an existing photo before uploading when the gallery is full.</p>
        <form onSubmit={submit}>
          <label>
            Photo
            <input required disabled={atLimit} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files[0] || null)} />
            <span>Images are resized and optimized before upload.</span>
          </label>
          <label>
            Alternative text
            <input required disabled={atLimit} maxLength="300" value={form.altText} onChange={(event) => setForm({ ...form, altText: event.target.value })} />
            <span>Briefly describe what is visible for residents using screen readers.</span>
          </label>
          <label>
            Caption
            <textarea disabled={atLimit} maxLength="500" value={form.caption} onChange={(event) => setForm({ ...form, caption: event.target.value })} />
          </label>
          <button className="primary-button" disabled={busy || atLimit}>
            {atLimit ? '15-photo limit reached' : busy ? 'Optimizing...' : 'Upload photo'}
          </button>
        </form>
      </section>
      <section className="photo-list">
        {photos.map((photo, index) => (
          <PhotoEditor key={photo.id} photo={photo} canMoveUp={index > 0} canMoveDown={index < photos.length - 1} onMoveUp={() => move(index, -1)} onMoveDown={() => move(index, 1)} onUpdate={onUpdate} onDelete={() => onDelete(photo.id)} />
        ))}
        {photos.length === 0 && <p className="empty-state">No carousel photos have been uploaded.</p>}
      </section>
    </div>
  )
}

function PhotoEditor({ photo, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onUpdate, onDelete }) {
  const [form, setForm] = useState({
    altText: photo.altText,
    caption: photo.caption || '',
    status: photo.status,
    sortOrder: photo.sortOrder,
  })
  return (
    <article className="photo-editor">
      <img src={`/api/admin/gallery/${photo.id}/image`} alt={photo.altText} />
      <div>
        <label>
          Alternative text
          <input maxLength="300" value={form.altText} onChange={(event) => setForm({ ...form, altText: event.target.value })} />
        </label>
        <label>
          Caption
          <textarea maxLength="500" value={form.caption} onChange={(event) => setForm({ ...form, caption: event.target.value })} />
        </label>
        <div className="photo-actions">
          <button type="button" title="Move photo earlier" disabled={!canMoveUp} onClick={onMoveUp}>
            &uarr;
          </button>
          <button type="button" title="Move photo later" disabled={!canMoveDown} onClick={onMoveDown}>
            &darr;
          </button>
          <select aria-label="Photo visibility" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="active">Visible</option>
            <option value="hidden">Hidden</option>
          </select>
          <button type="button" onClick={() => onUpdate(photo.id, { ...form, sortOrder: photo.sortOrder })}>
            Save
          </button>
          <button type="button" className="row-delete" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </article>
  )
}

function PropertyDetail({ propertyId, onBack, isSuperAdmin }) {
  const [record, setRecord] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const load = () =>
    api(`/api/admin/properties/${propertyId}`)
      .then(setRecord)
      .catch((requestError) => setError(requestError.message))
  useEffect(() => {
    api(`/api/admin/properties/${propertyId}`)
      .then(setRecord)
      .catch((requestError) => setError(requestError.message))
  }, [propertyId])
  async function addPoolCard(values) {
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/properties/${propertyId}/pool-cards`, {
        method: 'POST',
        body: JSON.stringify(values),
      })
      setNotice('Pool card added.')
      await load()
      return true
    } catch (requestError) {
      setNotice(requestError.message)
      return false
    }
  }
  async function updatePoolCard(id, values) {
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/pool-cards/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      })
      setNotice('Pool card updated.')
      await load()
    } catch (requestError) {
      setNotice(requestError.message)
    }
  }
  async function deleteHistory(kind, id) {
    if (!window.confirm('Permanently delete this history record? This cannot be undone.')) return
    setError('')
    setNotice('')
    try {
      await api(`/api/admin/history/${kind}/${id}`, { method: 'DELETE' })
      setNotice('History record deleted.')
      await load()
    } catch (requestError) {
      setError(requestError.message)
    }
  }
  if (error && !record)
    return (
      <div>
        <button type="button" className="quiet-button" onClick={onBack}>
          &larr; Properties
        </button>
        <p className="form-error">{error}</p>
      </div>
    )
  if (!record) return <p className="empty-state">Loading property record...</p>
  const { property, residents: storedResidents, reservations, contacts, communications, poolCards, guests, poolAgreements = [], audit } = record
  const residents = storedResidents.map((resident) => {
    const agreement = poolAgreements.find((item) => item.userId === resident.id)
    return {
      ...resident,
      residentType: `${residentTypeLabel(resident.residentType)}${agreement ? ` | Pool rules signed ${dateTime(agreement.acknowledgedAt)} (v${agreement.rulesVersion})` : ''}`,
    }
  })
  return (
    <section className="property-detail">
      <header>
        <button type="button" className="quiet-button" onClick={onBack}>
          &larr; Properties
        </button>
        <div>
          <p className="portal-kicker">Property record</p>
          <h2>{property.address}</h2>
          <p>
            {property.phase} | {property.city}, {property.state} {property.postalCode} | {property.status}
          </p>
        </div>
      </header>
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="property-summary">
        <span>
          <strong>{residents.length}</strong> registered accounts
        </span>
        <span>
          <strong>{poolCards.filter((card) => card.status === 'active').length}</strong> active pool cards
        </span>
        <span>
          <strong>{guests.filter((guest) => guest.status === 'active').length}</strong> guest registrations
        </span>
        <span>
          <strong>{reservations.length}</strong> reservations
        </span>
      </div>
      <PoolCardManager cards={poolCards} residents={residents} onAdd={addPoolCard} onUpdate={updatePoolCard} />
      <PropertySection title="Registered guests" empty="No guests are registered to this property.">
        {guests.map((guest) => (
          <article className="property-guest" key={guest.id}>
            <div>
              <strong>{guest.guestName}</strong>
              <small>
                {guest.startsOn} through {guest.endsOn} | Registered by {guest.registeredByName}
              </small>
            </div>
            <div>
              <span className={`status status-${guest.status}`}>{guest.status}</span>
              <small>Registered {dateTime(guest.createdAt)}</small>
              <strong>{guest.poolResponsibilityAcknowledged ? 'Resident accepted responsibility for unsupervised pool access' : 'No pool responsibility acknowledgement'}</strong>
            </div>
          </article>
        ))}
      </PropertySection>
      <PropertySection title="Registered residents" empty="No accounts are linked to this property.">
        {residents.map((resident) => (
          <article className="property-resident" key={resident.id}>
            <div>
              <strong>
                {resident.firstName} {resident.lastName}
              </strong>
              <small>
                {resident.email}
                {resident.phone ? ` | ${resident.phone}` : ''}
              </small>
            </div>
            <div>
              <span>{resident.residentType.replace('_', ' ')}</span>
              <span>{resident.role}</span>
              <span>{resident.status}</span>
            </div>
          </article>
        ))}
      </PropertySection>
      <PropertySection title="Communications" empty="No communications are linked to this property.">
        {communications.map((item) => (
          <article className="communication-record" key={item.id}>
            <header>
              <span>
                {item.direction} {item.channel}
              </span>
              <time>{dateTime(item.createdAt)}</time>
            </header>
            <strong>{item.subject}</strong>
            <small>
              {item.correspondent} | {item.deliveryStatus}
            </small>
            {item.summary && <p>{item.summary}</p>}
            {isSuperAdmin && (
              <button type="button" className="row-delete history-delete" onClick={() => deleteHistory('communications', item.id)}>
                Delete record
              </button>
            )}
          </article>
        ))}
      </PropertySection>
      <PropertySection title="Website messages" empty="No website messages are linked to this property.">
        {contacts.map((item) => (
          <article className="communication-record" key={item.id}>
            <header>
              <span>{item.category}</span>
              <time>{dateTime(item.createdAt)}</time>
            </header>
            <strong>
              {item.name} | {item.status}
            </strong>
            <p>{item.message}</p>
          </article>
        ))}
      </PropertySection>
      <PropertySection title="Clubhouse reservations" empty="No clubhouse reservations are linked to this property.">
        {reservations.map((item) => (
          <article className="property-list-row" key={item.id}>
            <div>
              <strong>{item.eventName}</strong>
              <small>
                {item.residentName} | {dateTime(item.startsAt)}
              </small>
            </div>
            <span className={`status status-${item.status}`}>{item.status}</span>
          </article>
        ))}
      </PropertySection>
      <PropertySection title="Record activity" empty="No recorded changes for this property.">
        {audit.map((item) => (
          <article className="property-list-row" key={item.id}>
            <div>
              <strong>{item.action.replaceAll('.', ' ')}</strong>
              <small>
                {item.actorName || 'System'} | {dateTime(item.createdAt)}
              </small>
            </div>
            <div className="history-record-actions">
              <span>{item.targetType}</span>
              {isSuperAdmin && (
                <button type="button" className="row-delete" onClick={() => deleteHistory('audit', item.id)}>
                  Delete record
                </button>
              )}
            </div>
          </article>
        ))}
      </PropertySection>
    </section>
  )
}

function PoolCardManager({ cards, residents, onAdd, onUpdate }) {
  const empty = { cardNumber: '', assignedUserId: '', notes: '' }
  const [form, setForm] = useState(empty)
  return (
    <section className="property-section pool-card-section">
      <h3>Pool access cards</h3>
      <form
        className="pool-card-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (await onAdd(form)) setForm(empty)
        }}
      >
        <label>
          Card ID
          <input required maxLength="100" value={form.cardNumber} onChange={(event) => setForm({ ...form, cardNumber: event.target.value })} />
        </label>
        <label>
          Assigned resident
          <select value={form.assignedUserId} onChange={(event) => setForm({ ...form, assignedUserId: event.target.value })}>
            <option value="">Property only</option>
            {residents.map((resident) => (
              <option value={resident.id} key={resident.id}>
                {resident.firstName} {resident.lastName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <input maxLength="1000" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </label>
        <button className="primary-button">Issue card</button>
      </form>
      <div className="pool-card-list">
        {cards.map((card) => (
          <PoolCardRow card={card} residents={residents} onUpdate={onUpdate} key={card.id} />
        ))}
        {cards.length === 0 && <p className="empty-state">No pool cards are recorded for this property.</p>}
      </div>
    </section>
  )
}

function PoolCardRow({ card, residents, onUpdate }) {
  const [form, setForm] = useState({
    assignedUserId: card.assignedUserId || '',
    status: card.status,
    notes: card.notes || '',
  })
  return (
    <article className="pool-card-row">
      <div>
        <strong>{card.cardNumber}</strong>
        <small>
          Issued {dateTime(card.issuedAt)}
          {card.assignedName ? ` | ${card.assignedName}` : ' | Property card'}
        </small>
      </div>
      <select aria-label={`Assigned resident for card ${card.cardNumber}`} value={form.assignedUserId} onChange={(event) => setForm({ ...form, assignedUserId: event.target.value })}>
        <option value="">Property only</option>
        {residents.map((resident) => (
          <option value={resident.id} key={resident.id}>
            {resident.firstName} {resident.lastName}
          </option>
        ))}
      </select>
      <select aria-label={`Status for card ${card.cardNumber}`} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
        <option value="active">Active</option>
        <option value="lost">Lost</option>
        <option value="stolen">Stolen</option>
        <option value="returned">Returned / removed</option>
        <option value="deactivated">Deactivated</option>
      </select>
      <input aria-label={`Notes for card ${card.cardNumber}`} maxLength="1000" placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
      <button type="button" className="quiet-button" onClick={() => onUpdate(card.id, form)}>
        Save
      </button>
    </article>
  )
}

function PropertySection({ title, empty, children }) {
  return (
    <section className="property-section">
      <h3>{title}</h3>
      {children.length ? children : <p className="empty-state">{empty}</p>}
    </section>
  )
}
