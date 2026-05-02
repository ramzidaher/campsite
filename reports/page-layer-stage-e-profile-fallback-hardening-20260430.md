# Page Layer Stage E Report — Profile Fallback Contract Hardening
**Date:** 2026-04-30  
**Status:** COMPLETE — explicit partial-data signaling added for profile timeout fallback paths  
**Related workstream:** WS2.2 remediation backlog (`WS2.2-B`)

---

## Scope

File changed:

- `apps/web/src/app/(main)/profile/page.tsx`

---

## Problem

Profile route used many timeout fallbacks with empty substitute payloads for non-critical segments, but did not surface a visible degraded-state marker. This created silent partial behavior.

---

## Change

### 1) Timeout fallback activation tracking in profile route

In `profile/page.tsx`:

- extended `resolveWithTimeout(...)` helper to accept optional `onTimeout` callback
- introduced route-level fallback tracking set:
  - `timeoutFallbackLabels`
- routed timeouted queries through `resolveProfileQueryWithTimeout(...)` wrapper

### 2) Explicit UI signaling for partial profile data

Added a visible amber notice in both:

- interactive mode profile view
- standard profile view

The notice is shown whenever one or more timeout fallbacks activate and includes a short summary of delayed areas.

---

## Verification

Ran:

```bash
cd apps/web && npx tsc --noEmit
```

Result:

- pass

Lint:

- targeted lints on changed file: clean

---

## Balance Impact

- Removes silent-partial behavior on the profile route by making fallback state explicit to the user.
- Aligns profile route behavior with fallback taxonomy policy (`explicit_partial_with_banner` for non-critical fallbacked sections).
