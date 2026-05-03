export function normalizeDepartmentColorHex(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? '';
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return null;
  return value.toUpperCase();
}

export function departmentColorTagStyle(colorHex: string | null | undefined):
  | { backgroundColor: string; borderColor: string; color: string }
  | undefined {
  const color = normalizeDepartmentColorHex(colorHex);
  if (!color) return undefined;
  return {
    backgroundColor: `${color}14`,
    borderColor: `${color}33`,
    color,
  };
}
