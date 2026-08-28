import { useEffect, useState } from 'react'
import './App.css'
import Admin from './Admin.jsx'
import Portal, { TurnstileWidget } from './Portal.jsx'
import { api } from './api.js'

function PublicUpdates() {
  const [content, setContent] = useState(null)
  useEffect(() => { fetch('/api/public/content').then((response) => response.json()).then(setContent).catch(() => {}) }, [])
  const events = content?.events || []
  const announcements = content?.announcements || []
  const featured = events[0] ? { ...events[0], kind: 'event', date: events[0].startsAt } : announcements[0] ? { ...announcements[0], kind: 'announcement', date: announcements[0].publishedAt } : null
  const secondary = [...events.slice(featured?.kind === 'event' ? 1 : 0).map((item) => ({ ...item, kind: 'event', date: item.startsAt })),
    ...announcements.slice(featured?.kind === 'announcement' ? 1 : 0).map((item) => ({ ...item, kind: 'announcement', date: item.publishedAt }))].slice(0, 2)
  const date = (value) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const day = featured ? new Intl.DateTimeFormat('en-US', { day: '2-digit' }).format(new Date(featured.date)) : '--'
  const month = featured ? new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(featured.date)) : 'TBD'
  return <section className="content-section" id="updates"><div className="section-heading"><p className="section-label">From around the lane</p><h2>In the know.</h2></div><div className="update-layout"><article className="featured-update"><div className="update-date">{day} <span>{month}</span></div><div>{featured ? <><p className="tag">{featured.kind === 'event' ? `${featured.eventType} event` : 'Announcement'}</p><h3>{featured.title}</h3><p>{featured.kind === 'event' ? featured.description : featured.body}</p>{featured.kind === 'event' && <a className="arrow-link" href={`/api/events/${featured.id}.ics`}>Add to calendar <span aria-hidden="true">&#8599;</span></a>}</> : <><p className="tag">Community calendar</p><h3>No public events are currently scheduled.</h3><p>New public events and announcements will appear here when posted.</p></>}</div></article><div className="small-updates">{secondary.map((item) => <article key={`${item.kind}-${item.id}`}><p className="tag">{item.kind === 'event' ? date(item.date) : 'Announcement'}</p><h3>{item.title}</h3>{item.kind === 'event' && <a href={`/api/events/${item.id}.ics`}>Add to calendar</a>}</article>)}{secondary.length === 0 && <article><p className="tag">Good to know</p><h3>Additional public updates will appear here.</h3></article>}</div></div>{content?.documents?.length > 0 && <div className="in-know-documents">{content.documents.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer"><span>{item.category}</span><strong>{item.title}</strong></a>)}</div>}</section>
}

function QuickLinks() {
  const [links, setLinks] = useState([])
  useEffect(() => {
    fetch('/api/public/content')
      .then((response) => response.json())
      .then((body) => setLinks(body.quickLinks || []))
      .catch(() => {})
  }, [])
  return <section className="resources-section" id="quick-links"><div className="section-heading"><p className="section-label">Make yourself at home</p><h2>Quick links,<br /><i>close at hand.</i></h2></div><div className="resource-grid">{links.map((link) => { const external = /^https:\/\//i.test(link.url); return <a href={link.url} className="resource-card" key={link.id} target={external ? '_blank' : undefined} rel={external ? 'noreferrer' : undefined}><h3>{link.title}</h3>{link.description && <p>{link.description}</p>}<span className="card-arrow" aria-hidden="true">&#8599;</span></a> })}</div></section>
}

function CommunityGallery() {
  const [photos, setPhotos] = useState([])
  const [active, setActive] = useState(0)
  useEffect(() => { fetch('/api/public/gallery').then((response) => response.json()).then((body) => setPhotos(body.photos || [])).catch(() => {}) }, [])
  useEffect(() => {
    if (photos.length < 2) return undefined
    const timer = window.setInterval(() => setActive((index) => (index + 1) % photos.length), 7000)
    return () => window.clearInterval(timer)
  }, [photos.length])
  if (photos.length === 0) return null
  const photo = photos[Math.min(active, photos.length - 1)]
  return <section className="gallery-section" aria-label="Community photo gallery"><div className="gallery-heading"><div><p className="section-label">Around the neighborhood</p><h2>Life on Penny Lane.</h2></div><div className="gallery-controls"><button type="button" aria-label="Previous photo" onClick={() => setActive((active - 1 + photos.length) % photos.length)}>&larr;</button><span>{active + 1} / {photos.length}</span><button type="button" aria-label="Next photo" onClick={() => setActive((active + 1) % photos.length)}>&rarr;</button></div></div><figure><img src={`/api/gallery/${photo.id}`} alt={photo.altText} width={photo.width || undefined} height={photo.height || undefined} />{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure><div className="gallery-dots" aria-label="Choose photo">{photos.map((item, index) => <button type="button" className={index === active ? 'active' : ''} aria-label={`Show photo ${index + 1}`} key={item.id} onClick={() => setActive(index)} />)}</div></section>
}

function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', category: 'general', message: '' })
  const [token, setToken] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const update = (field, value) => setForm({ ...form, [field]: value })

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api('/api/contact', { method: 'POST', body: JSON.stringify({ ...form, turnstileToken: token }) })
      setForm({ name: '', email: '', phone: '', category: 'general', message: '' })
      setToken('')
      setResetKey((value) => value + 1)
      setNotice('Your message was sent to the HOA board.')
    } catch (requestError) {
      setError(requestError.message)
      setToken('')
      setResetKey((value) => value + 1)
    } finally { setBusy(false) }
  }

  return <form className="contact-form" onSubmit={submit}><div className="contact-fields"><label>Name<input required maxLength="160" value={form.name} onChange={(event) => update('name', event.target.value)} /></label><label>Email<input required type="email" maxLength="254" value={form.email} onChange={(event) => update('email', event.target.value)} /></label></div><div className="contact-fields"><label>Phone <span>Optional</span><input type="tel" maxLength="30" value={form.phone} onChange={(event) => update('phone', event.target.value)} /></label><label>Topic<select value={form.category} onChange={(event) => update('category', event.target.value)}><option value="general">General question</option><option value="maintenance">Community maintenance</option><option value="architectural">Architectural review</option><option value="board">HOA board</option></select></label></div><label>Message<textarea required maxLength="5000" value={form.message} onChange={(event) => update('message', event.target.value)} /></label><TurnstileWidget onToken={setToken} resetKey={resetKey} />{notice && <p className="contact-notice" role="status">{notice}</p>}{error && <p className="contact-error" role="alert">{error}</p>}<button className="button button-dark" disabled={busy || !token}>{busy ? 'Sending...' : 'Send message'}</button></form>
}

function App() {
  if (window.location.pathname.startsWith('/admin')) return <Admin />
  if (window.location.pathname.startsWith('/portal')) return <Portal />
  return <main>
    <nav className="topbar" aria-label="Main navigation"><a className="brand" href="#top" aria-label="Penny Lane HOA home"><span className="brand-mark">PL</span><span>Penny Lane <em>HOA</em></span></a><div className="nav-links"><a href="#updates">Community</a><a href="#quick-links">Quick links</a><a href="#contact">Contact</a></div><a className="nav-button" href="/portal">Resident portal <span aria-hidden="true">&#8599;</span></a></nav>
    <section className="hero" id="top"><div className="hero-copy"><p className="eyebrow">Penny Lane Estates Homeowners Association <span></span> Lindale, Texas</p><h1>A good place<br /><i>to come home to.</i></h1><p className="hero-intro">A connected, cared-for community in Lindale, Texas. Find neighborhood news, helpful forms, and the people who keep Penny Lane moving.</p><div className="hero-actions"><a className="button button-dark" href="#updates">See what&apos;s happening <span aria-hidden="true">&#8595;</span></a><a className="text-link" href="#contact">Get in touch <span aria-hidden="true">&#8594;</span></a></div></div><div className="hero-image" role="img" aria-label="Tree-lined neighborhood street at golden hour" /><div className="hero-stamp">Neighbors<br /><strong>since</strong><br />1987</div></section>
    <section className="intro-band"><p className="section-label">The neighborhood brief</p><p className="intro-copy">Penny Lane is more than a street address. It&apos;s Saturday walks, porch hellos, and a shared commitment to making this place feel like home.</p><span className="scroll-cue" aria-hidden="true">&#8595;</span></section>
    <PublicUpdates />
    <CommunityGallery />
    <QuickLinks />
    <footer id="contact"><div className="footer-heading"><p className="section-label">Keep the conversation going</p><h2>Have a question?<br /><i>We&apos;re nearby.</i></h2><p>Messages are delivered to the HOA board and retained for follow-up.</p></div><div className="footer-contact"><ContactForm /><p className="copyright">&copy; 2026 Penny Lane Estates HOA <span>&bull;</span> Lindale, TX</p></div></footer>
  </main>
}

export default App
