/** PostgREST may return `staff_resource_folders` as an object or a single-element array. */
export function parseStaffResourceFolderEmbed(v: unknown): { id: string; name: string } | null {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const x = v[0];
    if (!x || typeof x !== 'object') return null;
    return {
      id: String((x as { id: unknown }).id),
      name: String((x as { name: unknown }).name ?? ''),
    };
  }
  if (typeof v === 'object' && v !== null && 'id' in v) {
    const o = v as { id: unknown; name: unknown };
    return { id: String(o.id), name: String(o.name ?? '') };
  }
  return null;
}
