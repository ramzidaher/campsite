import { REPORT_FIELD_BY_KEY } from './catalog';
import type { ReportConfig, ReportFilter, ReportFilterOperator } from './types';

const ALLOWED_DOMAINS = new Set(['hr', 'finance']);
const ALLOWED_VISIBILITY = new Set(['private', 'roles', 'org']);
const ALLOWED_FILTER_OPS = new Set<ReportFilterOperator>([
  'equals',
  'not_equals',
  'contains',
  'is_empty',
  'before',
  'after',
  'between',
  'greater_than',
  'less_than',
]);

function asStringList(value: unknown, max = 25) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean).slice(0, max);
}

function toFilter(input: unknown): ReportFilter | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Partial<ReportFilter>;
  const field = String(raw.field ?? '');
  const op = String(raw.op ?? '') as ReportFilterOperator;
  if (!field || !REPORT_FIELD_BY_KEY.has(field)) return null;
  if (!ALLOWED_FILTER_OPS.has(op)) return null;
  return {
    field,
    op,
    value: raw.value ?? null,
    valueTo: raw.valueTo ?? null,
  };
}

export function sanitizeReportConfig(input: unknown, domains: string[]): ReportConfig {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<ReportConfig>;
  const normalizedDomains = domains.filter((domain): domain is 'hr' | 'finance' => ALLOWED_DOMAINS.has(domain));
  const domainSet = new Set(normalizedDomains);
  const fields = asStringList(raw.fields, 80).filter((fieldKey) => {
    const def = REPORT_FIELD_BY_KEY.get(fieldKey);
    return Boolean(def && domainSet.has(def.domain));
  });
  const filters = (Array.isArray(raw.filters) ? raw.filters : [])
    .map((filterEntry) => toFilter(filterEntry))
    .filter((filter): filter is ReportFilter => Boolean(filter))
    .filter((filter) => {
      const def = REPORT_FIELD_BY_KEY.get(filter.field);
      return Boolean(def && domainSet.has(def.domain));
    })
    .slice(0, 40);

  const sort = (Array.isArray(raw.sort) ? raw.sort : [])
    .map((entry) => {
      const field = String(entry?.field ?? '');
      const def = REPORT_FIELD_BY_KEY.get(field);
      if (!def || !domainSet.has(def.domain)) return null;
      return { field, direction: entry?.direction === 'desc' ? 'desc' : 'asc' } as const;
    })
    .filter((entry): entry is { field: string; direction: 'asc' | 'desc' } => Boolean(entry))
    .slice(0, 4);
  const groupBy = asStringList(raw.groupBy, 4).filter((field) => REPORT_FIELD_BY_KEY.has(field));

  return {
    domains: normalizedDomains.length ? normalizedDomains : ['hr'],
    fields,
    filters,
    filterMode: raw.filterMode === 'or' ? 'or' : 'and',
    sort,
    groupBy,
    quickFilters: asStringList(raw.quickFilters, 12),
  };
}

export function parseReportDomains(input: unknown) {
  const domains = asStringList(input, 2).filter((domain) => ALLOWED_DOMAINS.has(domain));
  return domains.length ? domains : ['hr'];
}

export function parseVisibility(input: unknown) {
  const candidate = String(input ?? 'private');
  if (!ALLOWED_VISIBILITY.has(candidate)) return 'private';
  return candidate as 'private' | 'roles' | 'org';
}

export function parseSharedRoleKeys(input: unknown) {
  return asStringList(input, 25);
}

