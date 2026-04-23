-- Cleanup: remove parent-org guard triggers that had no parent columns to validate.
-- These were effectively no-ops and add avoidable write overhead.

drop trigger if exists payroll_wagesheet_reviews_parent_org_match_trg on public.payroll_wagesheet_reviews;
drop trigger if exists wagesheet_lines_parent_org_match_trg on public.wagesheet_lines;
