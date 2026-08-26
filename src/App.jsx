import './App.css'
import Admin from './Admin.jsx'
import Portal from './Portal.jsx'

function App() {
  if (window.location.pathname.startsWith('/admin')) return <Admin />
  if (window.location.pathname.startsWith('/portal')) return <Portal />

  return (
    <main>
      <nav className="topbar" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Penny Lane HOA home"><span className="brand-mark">PL</span><span>Penny Lane <em>HOA</em></span></a>
        <div className="nav-links"><a href="#updates">Community</a><a href="#resources">Resources</a><a href="#contact">Contact</a></div>
        <a className="nav-button" href="/portal">Resident portal <span aria-hidden="true">↗</span></a>
      </nav>
      <section className="hero" id="top">
        <div className="hero-copy"><p className="eyebrow">Penny Lane Estates Homeowners Association <span></span> Lindale, Texas</p><h1>A good place<br /><i>to come home to.</i></h1><p className="hero-intro">A connected, cared-for community in Lindale, Texas. Find neighborhood news, helpful forms, and the people who keep Penny Lane moving.</p><div className="hero-actions"><a className="button button-dark" href="#updates">See what&apos;s happening <span aria-hidden="true">↓</span></a><a className="text-link" href="#contact">Get in touch <span aria-hidden="true">→</span></a></div></div>
        <div className="hero-image" role="img" aria-label="Tree-lined neighborhood street at golden hour"><div className="image-note"><span className="pin">+</span><span>Our little corner<br />of the world</span></div></div><div className="hero-stamp">Neighbors<br /><strong>since</strong><br />1987</div>
      </section>
      <section className="intro-band"><p className="section-label">The neighborhood brief</p><p className="intro-copy">Penny Lane is more than a street address. It&apos;s Saturday walks, porch hellos, and a shared commitment to making this place feel like home.</p><span className="scroll-cue" aria-hidden="true">↓</span></section>
      <section className="content-section" id="updates"><div className="section-heading"><p className="section-label">From around the lane</p><h2>In the know.</h2></div><div className="update-layout"><article className="featured-update"><div className="update-date">08 <span>SEP</span></div><div><p className="tag">Board update</p><h3>Fall meeting &amp; neighborhood potluck</h3><p>Join us under the oaks for our quarterly meeting, followed by an easygoing evening together. Bring a dish if you can.</p><a className="arrow-link" href="#contact">Read the details <span aria-hidden="true">↗</span></a></div></article><div className="small-updates"><article><p className="tag">Maintenance</p><h3>Pool closes for the season on October 1.</h3><a href="#contact">View calendar <span aria-hidden="true">→</span></a></article><article><p className="tag">Good to know</p><h3>New: download the 2026 community directory.</h3><a href="#resources">Open resources <span aria-hidden="true">→</span></a></article></div></div></section>
      <section className="resources-section" id="resources"><div className="section-heading"><p className="section-label">Make yourself at home</p><h2>Useful things,<br /><i>close at hand.</i></h2></div><div className="resource-grid"><a href="#contact" className="resource-card"><span className="card-number">01</span><h3>Pay assessments</h3><p>Manage your account and keep dues on track.</p><span className="card-arrow">↗</span></a><a href="#contact" className="resource-card"><span className="card-number">02</span><h3>Request a review</h3><p>Start an exterior change request with the board.</p><span className="card-arrow">↗</span></a><a href="#contact" className="resource-card"><span className="card-number">03</span><h3>Find a document</h3><p>Rules, minutes, budgets, and other shared files.</p><span className="card-arrow">↗</span></a></div></section>
      <footer id="contact"><div><p className="section-label">Keep the conversation going</p><h2>Have a question?<br /><i>We&apos;re nearby.</i></h2></div><div className="footer-contact"><p>Reach the board at</p><a href="mailto:hello@pennylanehoa.org">hello@pennylanehoa.org</a><p className="copyright">© 2026 Penny Lane Estates HOA <span>•</span> Lindale, TX</p></div></footer>
    </main>
  )
}

export default App
