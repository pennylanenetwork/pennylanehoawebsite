import { useEffect, useState } from 'react'
import { api } from './api.js'
import './Portal.css'

export default function Admin() {
  const [user, setUser] = useState(null)
  const [accounts, setAccounts] = useState([])
  const [error, setError] = useState('')

  async function load() {
    try {
      const [{ user: currentUser }, { users }] = await Promise.all([
        api('/api/auth/session'),
        api('/api/admin/users'),
      ])
      setUser(currentUser)
      setAccounts(users)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => {
    Promise.all([api('/api/auth/session'), api('/api/admin/users')])
      .then(([{ user: currentUser }, { users }]) => {
        setUser(currentUser)
        setAccounts(users)
      })
      .catch((requestError) => setError(requestError.message))
  }, [])

  async function updateAccount(id, status) {
    setError('')
    try {
      await api(`/api/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
      await load()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="portal-shell admin-shell">
      <header className="portal-header">
        <a className="brand" href="/"><span className="brand-mark">PL</span><span>Penny Lane <em>HOA</em></span></a>
        <div className="admin-nav"><a href="/portal">Resident portal</a><a href="/">Community site</a></div>
      </header>
      <main className="admin-main">
        <header><div><p className="portal-kicker">Administration</p><h1>Resident accounts</h1></div>{user && <p>Signed in as {user.firstName} {user.lastName}</p>}</header>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="account-table" role="table" aria-label="Resident accounts">
          <div className="account-row account-head" role="row"><span>Name</span><span>Property</span><span>Status</span><span>Action</span></div>
          {accounts.map((account) => (
            <div className="account-row" role="row" key={account.id}>
              <span><strong>{account.firstName} {account.lastName}</strong><small>{account.email}</small></span>
              <span>{account.address}</span>
              <span className={`status status-${account.status}`}>{account.status}</span>
              <span className="account-actions">
                {account.status !== 'active' && <button type="button" onClick={() => updateAccount(account.id, 'active')}>Approve</button>}
                {account.status === 'active' && <button type="button" onClick={() => updateAccount(account.id, 'suspended')}>Suspend</button>}
                {account.status === 'pending' && <button type="button" className="quiet-action" onClick={() => updateAccount(account.id, 'rejected')}>Reject</button>}
              </span>
            </div>
          ))}
          {!error && accounts.length === 0 && <p className="empty-state">No resident accounts have been submitted.</p>}
        </div>
      </main>
    </div>
  )
}
