# Rota feature  product spec & discovery

**Last updated:** 2026-03-29 (Phase 3: draft/publish, org TZ, Sheets target rota, reminders)  
**Technical reference:** [06-rota.md](./campsite-v2-permissions/03-feature-implementation-plans/06-rota.md) (tables, RLS, routes, files)

This file is the **product story** for rota: who it serves, what they do, and what rules we enforce. Implementation details stay in **06-rota.md** unless we deliberately change behaviour.

**How we use it:** Answers from discovery are folded into §1–§6 and §8; anything still fuzzy stays in **§7 (follow-ups)**.

**Rota** (core) vs **leave / pattern modules:** For v1 we lean toward **separate** surfaces or modules for **annual leave** and **9-day fortnight**-style scheduling, rather than forcing everything into one rota entity  see §4.A and §5.

---

## 1. One-line summary

**Rota** is a **configurable schedule surface** in the org: not only classic **shifts**, but other schedule types camps run in practice  e.g. **activities**, **annual leave**, **reception desk** rotas, **9-day fortnight** (or similar patterns), and other templates we add over time.

If you are **on** a rota (invited / assigned), those commitments show in **your schedule**. You can **request changes**: e.g. swap with someone else, or ask the **rota owner / managers** directly. **Final approval** is **org-wide**: **any** user in the org with role **`manager`** or **`duty_manager`** may approve (see §5)  they do not need to manage that rota’s department or be the creator.

---

## 2. What already exists in the product (baseline)

_From the current app/docs  will need to evolve for configurable rota types, invitations, and swap/request flows._

| Area | Today (high level) |
|------|---------------------|
| **Data** | `rota_shifts`-centric model (org, department, assignee, times, labels, notes, source, …) |
| **Staff** | `/rota`  my / team / full-org patterns (role-gated) |
| **Admin** | `/admin/rota`, `/admin/rota-import` (Sheets) |
| **Permissions** | RLS + helpers tuned to **shifts** and dept/org roles  **will be revised** once this spec is implemented |

**Gap vs this spec:** today there is no first-class **rota type** (shifts vs leave vs reception…), no **invite** model separate from “rows in a table,” and no **swap / change request** workflow. Notifications are not yet wired as **must-have** for rota v1.

---

## 3. Personas & goals

| Persona | Primary goal on rota | Notes |
|--------|------------------------|--------|
| Anyone **invited / assigned** | See their commitments in **my schedule**; **request** swaps or changes | Core staff experience |
| **Org admin** | Create/configure rotas; manage org-wide visibility; resolve requests as needed | |
| **Manager** (`manager` role) | Create and manage rotas (per product intent) | Dept manager in codebase |
| **Coordinator** | Create and manage rotas | |
| **Rota creator** | **Whoever created** the rota can manage it (alongside org admin / manager / coordinator) | **Org admin** may **transfer** or **revoke** ownership (see §5). |
| **CSA** (`csa`) | _No_ create/manage rotas (per v1 intent) | May still appear **on** a rota as assignee |
| **Duty manager** (`duty_manager`) | _No_ **create/manage** rota definitions | **Can** give **final approval** **org-wide** (with `manager`); see §5 |
| **Administrator** / **society_leader** | **No** create/manage rotas; when **assigned**, they see items and may **request a change** only (same class as other non-manager staff for rota power) | |

---

## 4. Core workflows (v1 vs later)

| # | Workflow | Status | Notes |
|---|-----------|--------|--------|
| A | **Configurable rota kinds** (shifts, activities, reception, …) | **v1 (concept)** | Ship incrementally. **Annual leave** and **9-day fortnight**-style patterns: **likely separate modules** for v1 (not the same core “rota” entity); see §5. |
| B | **Invited / assigned** → entries appear in **my schedule** | **v1** | |
| C | **Request change**: swap with another person **or** message / request **rota creator / managers** | **v1** | **Swap:** peer **accepts**, then **any org `manager` or `duty_manager`** may give **final approval** (**org-wide**, not dept-scoped). |
| D | **Create / edit / delete** rotas and assignments in **app** | **v1** | Sheets import **not** v1 |
| E | **Open slots** (unfilled) | **v1** | Staff can see/claim or managers can fill; details at build time |
| F | **Google Sheets import** | **Later** | Explicitly out of v1 product focus |
| G | **Notifications** for rota (assigned, changed, requests, reminders) | **Must-have v1** | Align with push/notification workstream |
| H | **Mobile** | **v1** | **Yes** to full Q4-style scope: **my schedule**, **team** where relevant, **request / swap**, not “notifications only” |
| I | **Department vs sub-team** scoping | **Flexible** | “Both / any”  no hard constraint; implementation can attach to dept, sub-team, or both |

---

## 5. Rules & edge cases

| Topic | Decision |
|-------|----------|
| Who can **create / manage** a rota | **Org admin**, **manager**, **coordinator**, and **rota creator** (current owner). **Not** `csa`, **`duty_manager`**, **`administrator`**, or **`society_leader`** for **creating/editing rota definitions**  except `duty_manager` may still **approve** requests (below). |
| Who appears on a rota | People **invited or assigned**; they see items in **their** schedule. **Open slots** (no assignee) are **in v1** for unfilled coverage. |
| **Swap / change requests** | **Swaps:** **(1)** peer **accepts**, **(2)** **final approval** by **any** org member with role **`manager`** or **`duty_manager`** (**org-wide**  not limited to the rota’s department). One approver suffices. **Non-swap** requests (e.g. “can’t work Tuesday”): **same pool and rule**, no peer step unless product adds one later. |
| **Creator vs org admin** | **Org admin** may **transfer** rota ownership to another user and **revoke** / reassign creator rights. |
| **Leave / 9-day fortnight** | **Lean separate** from core rota for v1 (dedicated leave / pattern flows or tables), rather than one overloaded entity  exact split decided at implementation time. |
| Overlapping assignments | **Allow** with **warning** in web UI: list and week grid show an **Overlap** indicator when the same assignee has shifts whose intervals intersect (open shifts excluded from the check). |
| Past vs future edits | **Managers**, **coordinators**, **org_admin**, and **rota owner** may **edit/delete** rota-scoped shifts at any time (including past). **Assignees** do not get blanket edit rights over others’ assignments; they use **swap / change requests** for their own coverage changes. |
| Draft vs published | **`rotas.status`:** `draft` \| `published` (default `published`). **Draft** rotas and their shifts are visible only to users who **`can_manage_rota_assignments`** (org_admin, coordinator, rota owner, scoped managers). **Shift push notifications** are **not** enqueued while the rota is draft. |
| Time zones / camp day | **`organisations.timezone`** (optional IANA). Web rota + calendar shift display and mobile rota use org TZ when set; otherwise **device/browser local**. **Camp day** boundaries remain a follow-up (§7). |

---

## 6. Out of scope (v1)

- **Google Sheets** rota import (revisit after in-app flows are solid).
- _(Add more as we tighten scope.)_

---

## 7. Follow-ups (still to decide)

- **Camp day** cutover rules and org-level “day” boundaries (not implemented; display uses org TZ or local only).
- **Sheets importer:** **`POST /api/admin/rota-sheets-import`** reads **`sheets_mappings.target_rota_id`** and sets **`rota_shifts.rota_id`**; upserts by **`sheets_import_key`**; wizard links **`google_connections`** and column mapping.

Resolved in §5: **draft vs published**, **org timezone display**, **Sheets mapping → target rota** (stored on `sheets_mappings` / sync log for the worker), **shift reminders** (profile `shift_reminder_before_minutes` + queue; see **06-rota.md** / **12-push** doc).

---

## 8. Resolved Q&A (from chat, 2026-03-29)

### Q1  Definition

**Answer:** Rota should be **configurable** for different things: **shifts**, **activities**, **annual leave**, **reception** rotas, **9-day fortnight**-style patterns, etc.

### Q2  Sub-teams vs departments

**Answer:** **Both / any**  not a hard product constraint.

### Q3  Who creates and manages

**Answer:** **Whoever created** the rota, plus **org admin**, **manager**, **coordinator** can create and manage. **CSA** and **duty manager** (`duty_manager`) **cannot** create or manage. _(Interpretation: “DM” = duty manager, not department manager.)_

### Q4  Mobile v1

**Answer:** **Yes**  include **my schedule**, **team** where it applies, and **request to change** (e.g. swap with someone else or ask the creator), not a notifications-only slice.

### Q5  Import vs app

**Answer:** **v1 in the app**; **Sheets import later**  no need to prioritise import for v1.

### Q6  Notifications

**Answer:** **Must-have for v1.**

### Follow-up batch  2026-03-29

**`administrator` / `society_leader`:** Cannot manage rotas; **only** show up when assigned and can **request a change** (no create/edit/delete).

**Swap flow:** **Both**  the **peer accepts**, then **`manager` or `duty_manager`** **final approval** (**org-wide**; see §5).

**Creator vs org admin:** **Yes**  ownership can be **transferred** or **revoked** (org admin).

**Leave / 9-day fortnight:** **Maybe separate**  prefer **separate** modules or surfaces for v1 rather than one unified rota entity.

### Follow-up batch  2026-03-29 (approvers + open slots)

**Final approvers:** **`manager`** and **`duty_manager`**  **any** user in the org with either role may give **final approval** (**org-wide**). **`duty_manager`** still does **not** create/manage rota definitions.

**Open slots:** **In v1** (unfilled positions visible / fillable per build-time UX).

**Approver scope:** **Org-wide**  **any** **`manager`** or **`duty_manager`** in the org may perform **final approval** on swap / change requests (not restricted to the rota’s department).

---

## 9. Decision log

| Date | Decision | Notes |
|------|----------|--------|
| 2026-03-29 | `main` fast-forwarded to include sub-teams + this spec file | Historical. |
| 2026-03-29 | This doc is the living product spec for rota | Technical detail in 06-rota.md until updated. |
| 2026-03-29 | Configurable rota types; flexible dept/sub-team | See §1, §4.I |
| 2026-03-29 | Create/manage: org_admin, manager, coordinator, creator; not csa or duty_manager | See §3–§5 |
| 2026-03-29 | Invited → my schedule; swap or request from creator/managers | See §1, §4.C |
| 2026-03-29 | v1: in-app editing; Sheets later; notifications must-have; mobile per Q4 | See §4–§6 |
| 2026-03-29 | `administrator`, `society_leader`: no manage; assigned only + request change | §3, §5 |
| 2026-03-29 | Swap: peer accept + **`manager` or `duty_manager`** final approval | §4.C, §5 |
| 2026-03-29 | Non-swap requests: same final approver pool as swaps | §5 |
| 2026-03-29 | Org admin can transfer/revoke rota ownership | §5 |
| 2026-03-29 | Leave & 9-day fortnight lean **separate** from core rota v1 | §4.A, §5 |
| 2026-03-29 | **Open slots** in **v1** | §4.E, §5 |
| 2026-03-29 | Final approval: **org-wide**  any `manager` or `duty_manager` in org | §1, §4.C, §5 |

---

## 10. Next implementation-facing step

Translate §1–§6 into: **data model** (rota vs assignment vs type), **RLS** (who sees/edits which rota), **API/UI** (schedule, requests, notifications). Update **06-rota.md** when the technical approach is chosen so migrations and types stay aligned.
