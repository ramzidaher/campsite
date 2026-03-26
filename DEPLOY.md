# Campsite — deployment runbook

## Staging / production checklist

1. **Supabase:** Run all migrations in order on the target project. Verify RLS with a non-admin user per org.
2. **Secrets:** Set `STAFF_QR_SIGNING_SECRET`, service role, and OAuth client secrets in Supabase Edge Function env. No service role in Next.js client env.
3. **Vercel (web):** Connect repo; set `NEXT_PUBLIC_*` and server env vars; assign domains (`campsite.app`, `*.campsite.app`, `admin.campsite.app`).
4. **Edge Functions:** Deploy `supabase functions deploy` for each function used in production.
5. **Mobile:** Configure EAS (`eas.json`), bundle IDs `com.commongroundstudios.campsite`, and store listings (privacy URL: `https://campsite.app/privacy`).

## Migrations

- Add new SQL only under `supabase/migrations/` with a timestamp prefix.
- Test on a branch database before production. Prefer forward-only migrations; document manual rollback steps if a down migration is not automated.

## Web production build (known issue)

`next build` may fail while prerendering the internal `/404` page with **React 19 + Next.js 15.5** (`Minified React error #31`). `npm run typecheck` and `npm run dev` still validate the codebase.

**Mitigations to try before release:**

- Align `react` / `react-dom` / `next` to versions confirmed compatible by the Next.js release notes.
- Temporarily pin React 18 for the web app if required for stable static generation.
- Track upstream issues for App Router + React 19 error pages.

## PWA / service worker

`@ducanh2912/next-pwa` was evaluated; shell caching can be reintroduced once the production build pipeline is green. `public/manifest.json` remains for install metadata; add icons before store-style PWA marketing.

## Security hardening backlog

- **CSP:** Add a strict `Content-Security-Policy` (start with report-only) once all script/style sources are enumerated (Supabase, Sentry, Vercel Analytics).
- **API routes / Edge:** Apply per-IP throttles on anonymous endpoints; staff verify already has per-org limits.
- **npm:** Run `npm audit` at root and in `apps/web` / `apps/mobile`; resolve high issues before launch.

## Monitoring

- Enable Sentry releases via `SENTRY_AUTH_TOKEN` / CI.
- Point Better Uptime or Checkly at `https://{slug}.campsite.app/api/health`, `https://admin.campsite.app/api/health`, and Supabase status as needed.

## CGS platform admin bootstrap

- Insert the first row into `platform_admins` via SQL (service role) or use the bootstrap policy when the table is empty, then add peers from `/platform/admins`.
