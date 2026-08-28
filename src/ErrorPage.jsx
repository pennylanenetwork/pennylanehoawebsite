import { Component } from 'react'

export function SiteErrorPage({ kind = 'not-found' }) {
  const unavailable = kind === 'error'
  return (
    <main className="site-error-page">
      <a className="site-error-brand" href="/" aria-label="Penny Lane HOA home">
        <img src="/penny-lane-logo.png" alt="Penny Lane" />
      </a>
      <section>
        <p className="section-label">{unavailable ? 'Something went wrong' : 'Page not found'}</p>
        <h1>{unavailable ? 'This page is temporarily unavailable.' : 'That address does not lead anywhere.'}</h1>
        <p>{unavailable ? 'Please reload the page. If the problem continues, return to the community website and contact the HOA board.' : 'The page may have moved, or the address may have been entered incorrectly.'}</p>
        <div>
          {unavailable && <button type="button" className="button button-dark" onClick={() => window.location.reload()}>Reload page</button>}
          <a className={unavailable ? 'text-link' : 'button button-dark'} href="/">Return home</a>
          <a className="text-link" href="/portal">Resident portal</a>
        </div>
      </section>
    </main>
  )
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, details) {
    console.error('Application render failed', error, details)
  }

  render() {
    return this.state.failed ? <SiteErrorPage kind="error" /> : this.props.children
  }
}
