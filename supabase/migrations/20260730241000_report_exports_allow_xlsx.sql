-- Allow Excel exports in report_exports audit rows (UI already sends format=xlsx).

alter table public.report_exports drop constraint if exists report_exports_format_check;

alter table public.report_exports
  add constraint report_exports_format_check check (format in ('csv', 'pdf', 'xlsx'));
