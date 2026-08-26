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

The production site is deployed as a Cloudflare Worker with static assets. Authenticate Wrangler once, then deploy:

```sh
npx wrangler login
npm run cf:deploy
```

Cloudflare resource bindings for D1, R2, email, and payment secrets will be added as the resident portal and administration features are implemented. Local secrets belong in `.dev.vars`, which is excluded from Git.
