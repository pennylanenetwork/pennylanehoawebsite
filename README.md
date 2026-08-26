# Penny Lane Estates HOA

Public website and resident services for Penny Lane Estates Homeowners Association.

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

Cloudflare resource bindings for D1, R2, email, and payment secrets will be added as the resident portal and administration features are implemented. Local secrets belong in `.dev.vars`, which is excluded from Git.

## Database migrations

D1 schema changes are versioned in `migrations/`. Apply and verify migrations locally before applying them to production:

```sh
npm run db:migrate:local
npm run cf:dev
npm run db:migrate:remote
```

The initial migration creates HOA phases and 101 active properties. Property write operations will be added only after administrator authentication and authorization are available.
