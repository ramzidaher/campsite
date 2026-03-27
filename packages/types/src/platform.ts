/**
 * Cross-tenant operators are authorised via the **`platform_admins`** table (`user_id`), not `profiles.role`.
 * SQL helper: `public.is_platform_admin()`. Do not treat `org_admin` as platform admin.
 */
export const PLATFORM_ADMIN_MEMBERSHIP_TABLE = 'platform_admins' as const;
