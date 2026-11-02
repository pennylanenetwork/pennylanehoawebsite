# Penny Lane Estates HOA

Public website and resident services for Penny Lane Estates Homeowners Association.

## Current features

- Public HOA information, events, documents, quick links, contact form, and photo gallery
- Approved resident registration with Google, Yahoo, or emailed sign-in codes
- Resident announcements, governing documents and document search, messaging, pool information, guest registration, and clubhouse reservations
- Responsive resident and administration workspaces with a desktop month calendar and adjacent monthly event list that stack on smaller screens
- Stripe-hosted clubhouse security deposits with administrative approval, refund, and retention workflows
- Property, account, pool-card, communications, guest, reservation, website-content, and role management
- Owner-only QuickBooks Online balances, open invoices, 24 months of paid invoice history, product/service descriptions, and Intuit-hosted invoice links

Material releases are recorded in [`CHANGELOG.md`](CHANGELOG.md).

## Local development

```sh
npm install
npm run dev
```

The Vite development server runs at `http://localhost:5173` by default.

## Verification

```sh
npm run lint
npm run build
npm run cf:deploy:dry
```

## Cloudflare deployment

The production site is deployed as a Cloudflare Worker with static assets. Pushes to `main` are built and deployed automatically by Cloudflare Workers Builds. To deploy manually, authenticate Wrangler once, then run:

```sh
npx wrangler login
npm run cf:deploy
```

Cloudflare resource bindings for D1, R2, Turnstile, email, OAuth, and payment services are configured for the resident portal and administration features. Local secrets belong in `.dev.vars`, which is excluded from Git.

The resident governing-documents page also uses the Workers AI binding. It uses a model available on Workers Free, retrieves only published governing sections, and limits questions to 10 per resident and 100 site-wide per UTC day. When the daily AI allowance or a question limit is reached, the ordinary document search remains available. Apply migration `0028_governing_ai_usage.sql` before deploying this feature. The AI binding is not required for the local Vite-only preview; use `npm run cf:dev` to test the Worker endpoint.

QuickBooks Online customer balances can be synchronized and mapped to HOA properties by a super administrator or treasurer. The read-only integration runs automatically twice daily, supports an immediate manual sync, uses encrypted OAuth tokens, and shows mapped billing data only to resident accounts marked as property owners. Paid invoices are retained as a rolling 24-month snapshot based on invoice date and grouped by year in the Dues tab. Intuit connection controls remain restricted to super administrators. Setup, secret names, synchronization, and operating procedures are documented in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## Calendar and clubhouse scheduling

The resident month view shows the calendar beside an event list on desktop and stacks the same content vertically on tablet and mobile. Approved clubhouse reservations appear as reserved periods only after the required deposit is paid. Administrator blackout periods appear by their configured title. All-day blackouts accept inclusive start and end dates without requiring times; timed blackouts are not subject to the public event duration limit.

## Database migrations

D1 schema changes are versioned in `migrations/`. Apply and verify migrations locally before applying them to production:

```sh
npm run db:migrate:local
npm run cf:dev
npm run db:migrate:remote
```

The schema includes HOA phases, properties, resident relationships, and the operational records used by the public site and portals. New schema changes must be added as sequential migrations and applied locally before production.

## Operations

Production deployment ownership, D1 backup and restore procedures, emergency administrative recovery, and monitoring are documented in [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

Email recipients, committee message routing, reservation notifications, and administration permissions are documented in [`docs/ROLES_AND_NOTIFICATIONS.md`](docs/ROLES_AND_NOTIFICATIONS.md).
