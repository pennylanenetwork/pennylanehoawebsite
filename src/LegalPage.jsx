import { useEffect } from 'react'

const policies = {
  privacy: {
    label: 'Privacy and data stewardship',
    title: 'Privacy Policy',
    intro: 'This policy explains how Penny Lane Homeowners Association, Inc. collects, uses, protects, and retains information through pennylanehoa.net and the resident portal.',
    sections: [
      ['Information we collect', <><p>We collect information residents, guests, and visitors provide, including names, email addresses, phone numbers, property addresses, account-registration details, household and guest information, messages, clubhouse reservations, pool agreements, and access-card records.</p><p>When financial features are used, we may store transaction identifiers and status information from Stripe, plus customer names, balances, invoice details, and QuickBooks-hosted payment links from QuickBooks Online. We do not receive or store complete payment-card or bank-account numbers.</p><p>The site also uses session cookies and security information needed to authenticate users, prevent abuse, and operate the service. Cloudflare may process network and device information as part of hosting, security, and Turnstile verification.</p></>],
      ['How we use information', <><p>We use information to verify residency, administer portal accounts, communicate with residents, route requests to the appropriate HOA volunteers, manage amenities and reservations, maintain HOA records, display governing information, protect the site, and provide authorized owners with information associated with their property.</p><p>QuickBooks information is used only to show authorized owners their HOA account information and provide links to QuickBooks-hosted invoice pages. It is not used for advertising or sold.</p></>],
      ['Who can access information', <><p>Access is limited according to HOA responsibilities. Super administrators can administer the full system. Board members, committee members, officers, and amenities personnel receive access only to the functions and communications assigned to their roles. Residents can access information associated with their approved account and property.</p><p>We use service providers to operate specific functions, including Cloudflare for hosting, storage, security, and Workers AI; Brevo for transactional email; Google and Yahoo for optional sign-in; Stripe for clubhouse deposits; and Intuit for QuickBooks Online information and hosted payments. These providers process information under their own terms and privacy practices.</p></>],
      ['Cookies and sign-in', <p key="content">The portal uses a necessary session cookie to keep approved users signed in. Optional Google and Yahoo sign-in uses those providers' authorization services. We do not use the portal for third-party behavioral advertising.</p>],
      ['Retention and deletion', <><p>We retain HOA and resident records for as long as reasonably necessary to operate the association, fulfill the purpose for which they were collected, resolve disputes, meet financial or legal obligations, and preserve required association records.</p><p>When QuickBooks is disconnected, the active connection, encrypted OAuth tokens, imported customers, balances, invoices, payment links, and property mappings are removed from the active database after Intuit confirms revocation. Encrypted database backups expire after 30 days. Some audit, financial, reservation, or association records may be retained when required for legitimate HOA, legal, or accounting purposes.</p></>],
      ['Security', <p key="content">We use HTTPS, role-based access, administrator approval, secure session cookies, restricted Cloudflare resources, and encryption for stored QuickBooks OAuth tokens. No system can guarantee absolute security. Suspected unauthorized access should be reported promptly to the HOA.</p>],
      ['Your choices', <><p>Residents can manage direct-message email preferences in portal settings. You may ask the HOA to review or correct your account information, or request deletion where retention is not required. Disconnecting a third-party sign-in provider does not automatically delete the HOA account.</p><p>The portal is intended for adult residents and authorized HOA participants. Minors should not create accounts independently.</p></>],
      ['Policy changes', <p key="content">We may update this policy as the website, HOA practices, or legal requirements change. The effective date shown on this page will be updated when material revisions are published.</p>],
      ['Contact', <p key="content">Privacy questions, correction requests, and security concerns may be sent to <a href="mailto:board@pennylanehoa.net">board@pennylanehoa.net</a>.</p>],
    ],
  },
  terms: {
    label: 'Website and resident portal',
    title: 'Terms of Use',
    intro: 'These terms govern use of pennylanehoa.net and the Penny Lane HOA Resident Portal. Using the site means you agree to follow these terms and applicable HOA rules.',
    sections: [
      ['Eligibility and accounts', <><p>Public portions of the site are available to visitors. Resident features are limited to people whose association with an eligible Penny Lane property has been verified and approved by an HOA administrator.</p><p>You must provide accurate information, protect your sign-in access, and promptly notify the HOA of account misuse or changes in residency. An account is personal and may not be shared. Portal access does not establish ownership, tenancy, voting rights, or membership status.</p></>],
      ['HOA records and governing documents', <><p>The website is an administrative convenience. Recorded governing documents, properly adopted rules, official meeting records, and the HOA's accounting records control if website content differs from an authoritative record.</p><p>Search results, document summaries, and AI-assisted answers are informational navigation aids, not legal interpretations. Residents should consult the source document and obtain professional advice when appropriate.</p></>],
      ['Communications', <p key="content">Portal messages and email notices support HOA communication but do not replace any delivery method required by law or the governing documents. You are responsible for keeping contact information current. Delivery may be delayed by email providers, internet services, or maintenance.</p>],
      ['Clubhouse reservations and deposits', <><p>Reservation requests remain subject to availability, HOA approval, posted rules, and payment of the required security deposit. Approval by an administrator does not finalize a reservation until the required deposit is successfully paid and confirmed.</p><p>Stripe processes clubhouse deposits on its hosted service. The current $3.20 Stripe processing fee is nonrefundable under the reservation agreement. Refund or retention of the refundable portion is governed by the reservation agreement, inspection results, and HOA decisions.</p></>],
      ['Pool access and guests', <p key="content">Residents are responsible for complying with pool rules, safeguarding issued access cards, accurately registering guests, and supervising guests when required. Portal registration does not override posted rules, closures, capacity limits, or an HOA decision to suspend access.</p>],
      ['QuickBooks balances and payments', <><p>When enabled, QuickBooks information is provided as a convenience and may not reflect recent invoices, payments, credits, or adjustments until synchronization completes. QuickBooks and the HOA's official accounting records are authoritative.</p><p>Invoice links open a QuickBooks-hosted page. Intuit, not this website, processes payments made there. The HOA website does not collect complete bank-account or payment-card details.</p></>],
      ['Acceptable use', <p key="content">You may not attempt unauthorized access, impersonate another person, interfere with the site, submit unlawful or misleading content, probe security controls, scrape private information, upload malicious material, or use resident information for solicitation, harassment, or an unrelated purpose.</p>],
      ['Third-party services', <p key="content">The site relies on services operated by Cloudflare, Brevo, Google, Yahoo, Stripe, and Intuit. Their services may be unavailable or governed by separate terms. Links to outside services do not make the HOA responsible for their content, security, availability, or independent actions.</p>],
      ['Availability and responsibility', <p key="content">The HOA may change, suspend, or discontinue website functions and may restrict an account to protect residents, association records, or system security. The site is provided on an as-available basis. To the extent permitted by law, the HOA is not responsible for indirect losses caused by service interruptions, third-party systems, or reliance on information that differs from an authoritative HOA record.</p>],
      ['Changes and applicable law', <p key="content">We may update these terms as services or HOA practices change. Continued use after revised terms are published constitutes acceptance of the revised terms. These terms are governed by applicable Texas law and do not modify rights or duties established by the HOA's governing documents or applicable law.</p>],
      ['Contact', <p key="content">Questions about these terms may be sent to <a href="mailto:board@pennylanehoa.net">board@pennylanehoa.net</a>.</p>],
    ],
  },
}

export default function LegalPage({ type }) {
  const policy = policies[type]
  useEffect(() => {
    document.title = `${policy.title} | Penny Lane HOA`
    return () => { document.title = 'Penny Lane Estates HOA' }
  }, [policy.title])

  return <main className="legal-page">
    <nav className="legal-nav" aria-label="Legal page navigation">
      <a className="public-logo" href="/" aria-label="Penny Lane HOA home"><img src="/penny-lane-logo.png" alt="Penny Lane" /></a>
      <a href="/">Community site</a>
    </nav>
    <header className="legal-hero">
      <p className="section-label">{policy.label}</p>
      <h1>{policy.title}</h1>
      <p>{policy.intro}</p>
      <time dateTime="2026-10-28">Effective October 28, 2026</time>
    </header>
    <div className="legal-layout">
      <aside><strong>On this page</strong><nav>{policy.sections.map(([title], index) => <a href={`#section-${index + 1}`} key={title}>{title}</a>)}</nav></aside>
      <article>{policy.sections.map(([title, content], index) => <section id={`section-${index + 1}`} key={title}><p>{String(index + 1).padStart(2, '0')}</p><h2>{title}</h2><div>{content}</div></section>)}</article>
    </div>
    <footer className="legal-footer"><span>Penny Lane Estates HOA</span><nav><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/portal">Resident portal</a></nav></footer>
  </main>
}
