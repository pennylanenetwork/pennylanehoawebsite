import { useEffect, useMemo, useState } from 'react'
import './App.css'

function highlightedText(value, query) {
  const text = String(value || '')
  const term = query.trim()
  if (!term) return text
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matcher = new RegExp(`(${escaped})`, 'gi')
  return text.split(matcher).map((part, index) =>
    part.toLowerCase() === term.toLowerCase() ? <mark key={`${index}-${part}`}>{part}</mark> : part)
}

export default function GoverningDocuments() {
  const [documents, setDocuments] = useState([])
  const [activeId, setActiveId] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const [askError, setAskError] = useState('')
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    fetch('/api/auth/session')
      .then((response) => response.json())
      .then(({ user }) => {
        if (!user) {
          window.location.replace('/portal')
          return new Promise(() => {})
        }
        return fetch('/api/portal/governing-documents')
      })
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
  useEffect(() => {
    if (!active || !window.location.hash) return
    requestAnimationFrame(() => document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView())
  }, [active])
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

  async function askQuestion(event) {
    event.preventDefault()
    if (asking || question.trim().length < 8) return
    setAsking(true)
    setAnswer(null)
    setAskError('')
    try {
      const response = await fetch('/api/portal/governing-documents/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to answer this question.')
      setAnswer(result)
    } catch (requestError) {
      setAskError(requestError.message)
    } finally {
      setAsking(false)
    }
  }

  return <main className="governing-page" id="top">
    <nav className="topbar" aria-label="Governing documents navigation">
      <a className="public-logo" href="/" aria-label="Penny Lane HOA home"><img src="/penny-lane-logo.png" alt="Penny Lane" /></a>
      <div className="nav-links"><a href="/portal">Resident overview</a><a href="/governing-documents">Governing documents</a></div>
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
      <section className="governing-ask" aria-labelledby="governing-ask-title">
        <h2 id="governing-ask-title">Ask the documents</h2>
        <form onSubmit={askQuestion}>
          <label htmlFor="governing-question">Your question</label>
          <div className="governing-ask-input"><input id="governing-question" value={question} maxLength={500} onChange={(event) => setQuestion(event.target.value)} placeholder="What do the covenants say about fences?" /><button type="submit" disabled={asking || question.trim().length < 8}>{asking ? 'Checking...' : 'Ask'}</button></div>
        </form>
        <p>Answers use published documents only. Limit: 10 questions per resident per day. The official documents control.</p>
        {askError && <p role="alert">{askError}</p>}
        {answer && <div className="governing-answer" aria-live="polite"><p>{answer.answer}</p>{answer.sources.length > 0 && <><h3>Relevant sections</h3><ul>{answer.sources.map((source) => <li key={source.url}><a href={source.url}>{source.title}</a></li>)}</ul></>}</div>}
      </section>
      <nav className="governing-tabs" aria-label="Choose governing document">
        {documents.map((document) => <button type="button" className={document.id === active.id ? 'active' : ''} onClick={() => selectDocument(document)} key={document.id}>{document.title}</button>)}
      </nav>
      <div className="governing-layout">
        <aside className="governing-index">
          <label htmlFor="governing-search">Search this document</label>
          <input id="governing-search" type="search" placeholder="Article, section, or phrase" value={query} onChange={(event) => setQuery(event.target.value)} />
          <nav aria-label={`${active.title} sections`}>
            {sections.map((section) => <a href={`#${section.slug}`} key={section.id}><span>{highlightedText(section.sectionLabel, query)}</span>{highlightedText(section.title, query)}</a>)}
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
              {section.sectionLabel && <p>{highlightedText(section.sectionLabel, query)}</p>}
              <h3>{highlightedText(section.title, query)}</h3>
              <div>{highlightedText(section.body, query)}</div>
              <a href="#top" aria-label="Return to the document index">Back to index</a>
            </section>)}
          </div>
        </article>
      </div>
    </>}
    <footer className="governing-footer"><a href="/portal">Resident portal</a><span>Penny Lane Estates HOA</span></footer>
  </main>
}
