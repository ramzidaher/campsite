# Demo org — test flow (checklist)

**Setup:** Run `npm run seed-demo-org`, save the printed **emails** + password (`DemoAccess2026!` by default). Org slug `demo-access-lab`, org name `Demo Access Lab`. Use **incognito / separate profiles** per user when comparing.

---

## Flow 1 — Org admin baseline

| Step | Login as | Do | Check |
|------|----------|-----|--------|
| 1 | **Org Admin (primary)** | Open app after login | Sidebar has **Admin** (no standalone **Approvals**) |
| 2 | same | **Admin → All members** | Seeded users listed |
| 3 | same | **Admin → Departments** | Operations, Programs, Guest Services, Alumni Society |
| 4 | same | **Admin → Pending approval** | Empty until Flow 5 (seed is all `active`) |
| 5 | same | **Discount Card** | Scanner / verify UI present |
| 6 | same | Visit `/admin/users`, `/manager` | Users OK; `/manager` redirects away |

---

## Flow 2 — Manager (repeat per manager account)

Accounts: **Manager — Ops**, **Manager — Programs**, **Manager — Guest**, **Manager — Ops + Programs**.

| Step | Login as | Do | Check |
|------|----------|-----|--------|
| 1 | e.g. **Manager — Ops** | Sidebar | **Manager** + **Approvals**; no **Admin** |
| 2 | same | **Manager → Overview** (`/manager`) | Page loads |
| 3 | same | **Manager → Department rota** / `/rota` | Works for managed depts |
| 4 | same | **Approvals** / `/pending-approvals` | Empty until Flow 5 |
| 5 | same | **Discount Card** | Verify / scan UI present |
| 6 | **Manager — Guest** only | **Approvals** after Flow 5 | Must **not** see pending user who only picked **Operations** |

---

## Flow 3 — Coordinator

Accounts: **Coordinator — Ops**, **Coordinator — Programs**, **Coordinator — Ops (overlap)**.

| Step | Login as | Do | Check |
|------|----------|-----|--------|
| 1 | any coordinator | Sidebar | **Approvals** only; no **Admin**, no **Manager** |
| 2 | **Coordinator — Ops** | `/pending-approvals` after Flow 5 | Sees pending user on **Operations** |
| 3 | **Coordinator — Programs** | same | Does **not** see Ops-only pending user |
| 4 | both Ops coordinators | same pending Ops user | Both can see same row (overlap test) |

---

## Flow 4 — Staff roles (broadcast + discount)

| Step | Login as | Do | Check |
|------|----------|-----|--------|
| 1 | **CSA — Ops A** or **Duty manager — Guest** | **Broadcasts** | Can draft; submit for **pending approval** (not full send path) |
| 2 | **Administrator — Ops** | **Broadcasts** | Broader send / status options than CSA (per product) |
| 3 | **CSA** / **Administrator** | **Discount Card** | No verify scanner (card only) |
| 4 | **Duty manager — Programs** | **Discount Card** | Verify / scan UI present |

---

## Flow 5 — Member approval (needs extra user)

Seed has **no** pending members; queue stays empty until this.

| Step | Who | Do | Check |
|------|-----|-----|--------|
| 1 | New incognito | `/register?org=demo-access-lab`, sign up, pick **Operations** only | User stays **pending** / limited access |
| 2 | **Ops manager** or **Ops coordinator** | **Approvals** | New user appears |
| 3 | **Guest manager** | **Approvals** | Same user **not** listed |
| 4 | **Org admin** | **Admin → Pending approval** | Same user **is** listed |
| 5 | approver | Approve + assign role | Pending user can use app when active |

---

## Flow 6 — Broadcast approval (two windows)

| Step | Window | Do | Check |
|------|--------|-----|--------|
| 1 | A: **CSA** or **duty manager** (dept matches broadcast) | Create broadcast → submit **pending approval** | Status pending |
| 2 | B: **manager** for that dept or **org admin** | **Broadcasts** (or admin broadcast tools) | Can approve / reject |
| 3 | A | Refresh | Status updated |

---

## Flow 7 — Society leader + calendar

| Step | Login as | Do | Check |
|------|----------|-----|--------|
| 1 | **Society leader** | Sidebar | No Admin / Manager / Approvals |
| 2 | same | **Broadcasts**, **Rota**, **Calendar** | Content scoped to society vs rest of org (RLS) |
| 3 | **org admin** then **manager** then **coordinator** | `/calendar` | Org admin + manager: create/edit per policy; coordinator: as designed |

---

## URL quick probe

After login, hit: `/admin` (admin only), `/manager` (manager only), `/pending-approvals` (manager/coordinator), `/broadcasts`, `/rota`, `/calendar`, `/discount`.

---

## Re-seed

`npm run seed-demo-org -- --plan` = print only. Same slug twice = error; change `CAMPSITE_DEMO_ORG_SLUG` or delete org in Supabase.
