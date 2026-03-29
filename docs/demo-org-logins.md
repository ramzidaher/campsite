# Demo org logins (Demo Access Lab)

**Org slug:** `demo-access-lab`  
**Shared password (all accounts):** `DemoAccess2026!`

> If you run `npm run seed-demo-org` again, emails get a **new random tag**. Replace this file from the script output, or run `npm run seed-demo-org -- --plan` to preview emails without writing to the DB.

| Role | Label (seed) | Email | Password |
|------|----------------|-------|----------|
| org_admin | Org Admin (primary) | demo.org-admin-primary.5pmmv8@example.com | DemoAccess2026! |
| org_admin | Org Admin (secondary) | demo.org-admin-secondary.5pmmv8@example.com | DemoAccess2026! |
| manager | Manager — Ops | demo.manager-ops.5pmmv8@example.com | DemoAccess2026! |
| manager | Manager — Programs | demo.manager-programs.5pmmv8@example.com | DemoAccess2026! |
| manager | Manager — Guest | demo.manager-guest.5pmmv8@example.com | DemoAccess2026! |
| manager | Manager — Ops + Programs | demo.manager-ops-programs.5pmmv8@example.com | DemoAccess2026! |
| coordinator | Coordinator — Ops | demo.coordinator-ops.5pmmv8@example.com | DemoAccess2026! |
| coordinator | Coordinator — Programs | demo.coordinator-programs.5pmmv8@example.com | DemoAccess2026! |
| coordinator | Coordinator — Ops (overlap) | demo.coordinator-ops-overlap.5pmmv8@example.com | DemoAccess2026! |
| duty_manager | Duty manager — Guest | demo.duty-manager-guest.5pmmv8@example.com | DemoAccess2026! |
| duty_manager | Duty manager — Programs | demo.duty-manager-programs.5pmmv8@example.com | DemoAccess2026! |
| administrator | Administrator — Ops | demo.administrator-ops.5pmmv8@example.com | DemoAccess2026! |
| administrator | Administrator — Programs | demo.administrator-programs.5pmmv8@example.com | DemoAccess2026! |
| csa | CSA — Ops A | demo.csa-ops-a.5pmmv8@example.com | DemoAccess2026! |
| csa | CSA — Ops B | demo.csa-ops-b.5pmmv8@example.com | DemoAccess2026! |
| csa | CSA — Programs | demo.csa-programs.5pmmv8@example.com | DemoAccess2026! |
| csa | CSA — Guest | demo.csa-guest.5pmmv8@example.com | DemoAccess2026! |
| society_leader | Society leader | demo.society-leader.5pmmv8@example.com | DemoAccess2026! |

**Login URL:** `/login` on your web app.

Override password next seed: set `CAMPSITE_DEMO_PASSWORD` before `npm run seed-demo-org`.
