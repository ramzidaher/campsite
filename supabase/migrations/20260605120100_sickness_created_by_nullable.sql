-- Allow created_by to become null if the creating profile is removed (matches ON DELETE SET NULL).

alter table public.sickness_absences
  alter column created_by drop not null;
