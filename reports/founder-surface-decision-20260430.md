# Founder Surface Decision (WS4.1)
**Date:** 2026-04-30  
**Status:** DECIDED  
**Target:** `apps/web/src/app/(founders)/founders/page.tsx`

---

## Decision

Adopt **Option 1** from remediation plan:

- treat the founders surface as an **intentional special back-office plane**
- do **not** force full normalization into the standard route-family model at this stage

This exception is now explicit and documented.

---

## Rationale

The founders surface is materially different from normal client-facing workspaces:

1. It is gated by `requirePlatformFounder(...)` (platform superuser boundary).
2. It aggregates cross-org/platform control-plane data (not single-org operational UX).
3. It has intentionally broad founder RPC fan-out for administrative visibility.
4. Its user audience is internal and tightly limited.

Normalizing this route to mirror standard org-scoped workspace patterns now would increase risk and scope without clear client-facing balance gains.

---

## Guardrails For This Exception

To keep this exception safe and maintainable:

- Access boundary remains strict (`requirePlatformFounder`).
- Any new founders data paths must preserve explicit authz gating first.
- Founders-specific behavior must not be reused as a pattern for client-facing routes.
- Changes to founders route should include targeted smoke checks for:
  - access denial for non-founders
  - core founder dashboard load
  - failure behavior when one or more platform RPCs fail

---

## Revisit Criteria

Reopen normalization decision if any of these become true:

- founders route is opened to broader non-founder user roles
- founders UI becomes customer-visible support tooling
- control-plane reads are split into routable sub-surfaces needing shared consistency guarantees

---

## Program Impact

WS4.1 is complete with a documented intentional exception.

Remaining structural cleanup for Green readiness is primarily:

- WS1.4 profile decomposition (architecture simplification)
