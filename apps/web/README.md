This is the **Campsite** web app: [Next.js](https://nextjs.org) (App Router) under `apps/web`.

## Development

From the monorepo root:

```bash
npm run dev --workspace=@campsite/web
```

Open [http://localhost:3000](http://localhost:3000). Tenancy: use `{slug}.localhost:3000` or `?org=slug` (see root `README.md` and `ARCHITECTURE.md`).

## Production

See the repo root [DEPLOY.md](../../DEPLOY.md) for domains, env vars, Supabase Auth redirect URLs, and build notes.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) for font loading.
