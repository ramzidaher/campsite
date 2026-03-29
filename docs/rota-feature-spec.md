# Rota feature — product spec & discovery

**Branch:** `feature/rota`  
**Last updated:** 2026-03-29  
**Related technical plan:** [06-rota.md](./campsite-v2-permissions/03-feature-implementation-plans/06-rota.md) (routes, RLS, tables, file map)

This document is the **source of truth for what the rota feature should do** from a product and behaviour perspective. It is updated as we answer questions below.

---

## 1. One-line summary

_To fill:_ What is “rota” in one sentence for a camp director vs a counsellor?

---

## 2. Personas & goals

| Persona | Primary goal on rota |
|--------|------------------------|
| Staff / counsellor | _TBD_ |
| Department manager | _TBD_ |
| Org admin | _TBD_ |
| _Others?_ | _TBD_ |

---

## 3. Core workflows (happy path)

_To refine with answers:_

1. **Viewing:** Who sees what (my shifts only vs my team vs whole camp)?
2. **Creating / editing:** Who can add or change shifts? Draft vs published?
3. **Notifications:** Reminders, swap requests, “you’re on” alerts — which matter for v1?
4. **Import:** Google Sheets only for admins, or also CSV / API later?
5. **Mobile:** Same capabilities as web or read-only / subset?

---

## 4. Rules & edge cases

Document decisions here as we agree them.

| Topic | Decision |
|-------|----------|
| Overlapping shifts for one person | _TBD_ |
| Shifts with no assignee (“open shifts”) | _TBD_ |
| Cross-department coverage | _TBD_ |
| Time zones / “camp day” boundaries | _TBD_ |
| Historical vs future-only edits | _TBD_ |
| Sub-teams vs departments on the rota | _TBD_ |

---

## 5. Out of scope (for first slice)

_Explicit “not now” list to avoid scope creep._

- _TBD_

---

## 6. Open questions (conversation backlog)

_Tracking questions we still need to answer._

- [ ] _See §7 in chat — first pass from discovery_

---

## 7. Decision log

| Date | Decision | Notes |
|------|----------|--------|
| 2026-03-29 | Work happens on git branch `feature/rota` | |

---

## 8. Implementation notes (link-out)

The codebase already has substantial rota plumbing (see **06-rota.md**): `rota_shifts`, RLS, `/rota`, `/admin/rota`, Sheets import. This spec should **confirm or override** intended behaviour before we change or extend that implementation.
