import { useEffect, useMemo, useState } from 'react'
import './App.css'

export default function GoverningDocuments() {
  const [documents, setDocuments] = useState([])
  const [activeId, setActiveId] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/auth/session')
      .then((response) => response.json())
      .then(({ user }) => fetch(user ? '/api/portal/governing-documents' : '/api/public/governing-documents'))
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load governing documents.')))
      .then((result) => {
        const items = result.documents || []
        setDocuments(items)
        const requested = new URLSearchParams(window.location.search).get('document')
        setActiveId(items.find((item) => item.slug === requested)?.id || items[0]?.id || '')
      })
      .catch((requestError) => setError(requestError.message))
  }, [])

  const active = documents.find((item) => item.id === activeId) || documents[0]
  const sections = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return active?.sections || []
    return (active?.sections || []).filter((section) =>
      `${section.sectionLabel || ''} ${section.title} ${section.body}`.toLowerCase().includes(normalized))
  }, [active, query])

  function selectDocument(document) {
    setActiveId(document.id)
    setQuery('')
    window.history.replaceState(null, '', `/governing-documents?document=${encodeURIComponent(document.slug)}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return <main className="governing-page" id="top">
    <nav className="topbar" aria-label="Governing documents navigation">
      <a className="public-logo" href="/" aria-label="Penny Lane HOA home"><img src="/penny-lane-logo.png" alt="Penny Lane" /></a>
      <div className="nav-links"><a href="/">Home</a><a href="/governing-documents">Governing documents</a></div>
      <a className="nav-button" href="/portal">Resident portal <span aria-hidden="true">&#8599;</span></a>
    </nav>
    <header className="governing-hero">
      <p className="section-label">Community reference</p>
      <h1>Governing<br /><i>documents.</i></h1>
      <p>Search and navigate the bylaws, covenants, rules, and amendments that guide Penny Lane Estates.</p>
    </header>
    {error && <p className="governing-state" role="alert">{error}</p>}
    {!error && documents.length === 0 && <p className="governing-state">No governing documents have been published yet.</p>}
    {active && <>
      <nav className="governing-tabs" aria-label="Choose governing document">
        {documents.map((document) => <button type="button" className={document.id === active.id ? 'active' : ''} onClick={() => selectDocument(document)} key={document.id}>{document.title}</button>)}
      </nav>
      <div className="governing-layout">
        <aside className="governing-index">
          <label htmlFor="governing-search">Search this document</label>
          <input id="governing-search" type="search" placeholder="Article, section, or phrase" value={query} onChange={(event) => setQuery(event.target.value)} />
          <nav aria-label={`${active.title} sections`}>
            {sections.map((section) => <a href={`#${section.slug}`} key={section.id}><span>{section.sectionLabel}</span>{section.title}</a>)}
            {sections.length === 0 && <p>No matching sections.</p>}
          </nav>
        </aside>
        <article className="governing-document">
          <header>
            <p className="section-label">{active.documentType}</p>
            <h2>{active.title}</h2>
            {active.summary && <p>{active.summary}</p>}
            <dl>
              {active.effectiveDate && <div><dt>Effective</dt><dd>{new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${active.effectiveDate}T00:00:00Z`))}</dd></div>}
              {active.recordingInfo && <div><dt>Recording information</dt><dd>{active.recordingInfo}</dd></div>}
            </dl>
            {active.sourceUrl && <a className="governing-download" href={active.sourceUrl}>Download original document <span aria-hidden="true">&#8595;</span></a>}
          </header>
          <p className="governing-disclaimer"><strong>Reference copy:</strong> This online text is provided for convenient reference. If it differs from the officially recorded or adopted document, the official document controls.</p>
          <div className="governing-sections">
            {sections.map((section) => <section id={section.slug} key={section.id}>
              {section.sectionLabel && <p>{section.sectionLabel}</p>}
              <h3>{section.title}</h3>
              <div>{section.body}</div>
              <a href="#top" aria-label="Return to the document index">Back to index</a>
            </section>)}
          </div>
        </article>
      </div>
    </>}
    <footer className="governing-footer"><a href="/">Penny Lane Estates HOA</a><span>Lindale, Texas</span></footer>
  </main>
}
