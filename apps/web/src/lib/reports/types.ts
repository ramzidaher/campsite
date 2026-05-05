import type { ReportDomain } from './catalog';

export type ReportFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'is_empty'
  | 'before'
  | 'after'
  | 'between'
  | 'greater_than'
  | 'less_than';

export type ReportFilter = {
  field: string;
  op: ReportFilterOperator;
  value?: string | number | boolean | null;
  valueTo?: string | number | boolean | null;
};

export type ReportConfig = {
  domains: ReportDomain[];
  fields: string[];
  filters: ReportFilter[];
  filterMode: 'and' | 'or';
  sort?: { field: string; direction: 'asc' | 'desc' }[];
  groupBy?: string[];
  quickFilters?: string[];
  /** When non-empty, only include rows whose primary department id matches one of these ids. */
  departmentIds?: string[];
};
