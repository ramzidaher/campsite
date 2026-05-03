alter table public.departments
  add column if not exists color_hex text;

alter table public.departments
  drop constraint if exists departments_color_hex_format;

alter table public.departments
  add constraint departments_color_hex_format
  check (
    color_hex is null
    or color_hex ~ '^#[0-9A-Fa-f]{6}$'
  );
