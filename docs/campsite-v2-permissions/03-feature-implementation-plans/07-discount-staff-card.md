# 07 — Staff discount card, verification, and tiers

## 1. Product intent

- **Every active member** can view their **discount card** UI for their org (branding, tier display).
- **Verification (scan):** Only **`canVerifyStaffDiscountQr`** roles may open the scanner and validate others’ QR codes (`packages/types/src/roles.ts`: org admin, manager, duty manager).
- **Tier configuration:** **Org admins** define discount tiers (`/admin/discount`, `/settings/discount-tiers`).
- **Audit:** **Scan activity** visible in **`/admin/scan-logs`** (org admin only in current web gates).

## 2. Shared types

**File:** `packages/types/src/roles.ts`

```ts
export function canVerifyStaffDiscountQr(role: string | null | undefined): boolean {
  return isOrgAdminRole(role) || role === 'manager' || role === 'duty_manager';
}
```

**Edge allowlist (must stay aligned):** `supabase/functions/_shared/staff_discount_verifier_roles.ts` — `isStaffDiscountVerifierRole()` used by **`staff-discount-verify`**.

**Any change** to who may scan must update:

- `canVerifyStaffDiscountQr` in types
- `_shared/staff_discount_verifier_roles.ts` + verify function
- Web route gates (`/discount/scan`)

**Note:** `scan_logs` **insert** is **service role** from the Edge Function only; authenticated clients cannot mutate (`scan_logs_deny_mutations`).

## 3. Backend — Tables and RLS

**Base migration:** `supabase/migrations/20250328000001_phase4_discounts.sql`

**v2 roles + org admin scan read / tier CRUD:** `20260329120000_v2_profile_roles.sql`

**Legacy `super_admin` parity with `org_admin`:** `20260407120000_discount_scan_logs_super_admin_alignment.sql` (`scan_logs` select, `discount_tiers` insert/update/delete)

| Table | Purpose |
|-------|---------|
| `discount_tiers` | Per-org tier rules keyed by `role` |
| `scan_logs` | Audit rows for each verification attempt |
| `staff_qr_tokens` | Issued tokens (no direct client access) |

**Expectations:**

- **`discount_tiers`:** org members **select** same org; **write** org admin + legacy super_admin (after alignment migration).
- **`scan_logs`:** no client **insert/update**; **select** org admin + legacy super_admin, same org.
- **Card / tier display** uses org-scoped reads.

## 4. Backend — Edge Functions

| Function | Path | Role |
|----------|------|------|
| Token issuance | `supabase/functions/staff-discount-token/index.ts` | Active member in org — mints QR payload |
| Verify | `supabase/functions/staff-discount-verify/index.ts` | **`isStaffDiscountVerifierRole`** then validates token; inserts **`scan_logs`** via service client |

**Shared crypto:** `supabase/functions/_shared/staff_qr_crypto.ts`

**Verifier roles shared module:** `supabase/functions/_shared/staff_discount_verifier_roles.ts`

## 5. Frontend (`apps/web`)

### 5.1 Discount card

**File:** `apps/web/src/app/(main)/discount/page.tsx`

- Server: active profile; `canScan = canVerifyStaffDiscountQr(profile.role)`.
- Renders `DiscountCardClient` with `canScan` prop.

### 5.2 Scanner

**File:** `apps/web/src/app/(main)/discount/scan/page.tsx`

- Server gate: **`canVerifyStaffDiscountQr`** else `redirect('/discount')`.
- Client: `DiscountScannerClient.tsx` — calls Edge verify with user JWT.

### 5.3 Admin discount rules

**File:** `apps/web/src/app/(main)/admin/discount/page.tsx`

- Gate: **`canManageOrgSettings`** (org admin via `adminGates`).

### 5.4 Scan logs

**File:** `apps/web/src/app/(main)/admin/scan-logs/page.tsx`

- Gate: **`isOrgAdminRole`** (stricter than generic admin section — intentional for PII-heavy log).

### 5.5 Settings — discount tiers

**File:** `apps/web/src/app/(main)/settings/discount-tiers/page.tsx`

- Gate: **`isOrgAdminRole`**; others `redirect('/settings')`.
- Client: `DiscountTiersClient.tsx`.

### 5.6 Profile settings link

**File:** `apps/web/src/components/ProfileSettings.tsx`

- Shows link to discount tiers when `isOrgAdminRole` (client check); route still server-gates.

## 6. Verification checklist

- [x] Coordinator **cannot** hit `/discount/scan` — server **`canVerifyStaffDiscountQr`** redirect.
- [x] Edge verify rejects non-verifier roles — **`isStaffDiscountVerifierRole`** before processing.
- [x] **`scan_logs`:** service role insert from Edge; **`org_id`** on rows; select policy same org + org admin / super_admin.
- [x] Tier changes: **`discount_tiers`** client CRUD from admin/settings UIs; card reloads from Supabase on navigation/refresh (no special cache layer in app).

## 7. Automated tests (`npm run test --workspace=@campsite/web`)

- `src/lib/__tests__/staffDiscountQr.test.ts` — `canVerifyStaffDiscountQr`.

## 8. Implementation order (new discount rule)

1. SQL: tiers schema + RLS; `npm run supabase:db:push`.
2. Edge: verify/token logic + `_shared/staff_discount_verifier_roles.ts`.
3. `canVerifyStaffDiscountQr` + web route gates.
4. Admin UI for configuration.
5. Update this plan.
