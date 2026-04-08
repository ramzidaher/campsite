/**
 * Phase 5 — Custom Role Builder: permission picker + API contract for the frontend.
 *
 * `GET /api/admin/custom-roles` returns `permission_picker.items[]` using this shape.
 * Only permissions with `assignable_into_custom_role: true` should be offered in the picker
 * for the current viewer (server-computed). Founder-only catalog keys are never assignable
 * unless the viewer is a platform founder (not exposed in normal tenant admin UI).
 */

export const CUSTOM_ROLE_PICKER_SCHEMA_VERSION = 1 as const;

export type PermissionPickerItem = {
  key: string;
  label: string;
  description: string;
  is_founder_only: boolean;
  /** Viewer may include this key when building or editing a custom role (subset of their effective grants). */
  assignable_into_custom_role: boolean;
};

export type CustomRoleResponse = {
  id: string;
  key: string;
  label: string;
  description: string;
  /** Always false for this API — system roles are not returned from custom-role endpoints. */
  is_system: false;
  is_archived: boolean;
  permission_keys: string[];
};

export type CustomRolesListResponse = {
  schema_version: typeof CUSTOM_ROLE_PICKER_SCHEMA_VERSION;
  custom_roles: CustomRoleResponse[];
  permission_picker: {
    schema_version: typeof CUSTOM_ROLE_PICKER_SCHEMA_VERSION;
    items: PermissionPickerItem[];
  };
};
