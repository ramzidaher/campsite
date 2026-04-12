-- Linter 0003 (auth_rls_initplan): wrap auth.*() in RLS policy expressions as scalar subqueries
-- so Postgres treats them as initplans instead of re-evaluating per row.
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Recreates each policy on public.* from pg_policies with transformed USING / WITH CHECK text.
-- Does not change semantics; only adds (select ...) around auth.uid / auth.role / auth.jwt.

create or replace function pg_temp._wrap_auth_rls_expr(p_sql text)
returns text
language plpgsql
immutable
set search_path to pg_catalog, public
as $$
declare
  v text := coalesce(p_sql, '');
begin
  if v = '' then
    return p_sql;
  end if;
  -- Preserve already-optimized forms
  v := replace(v, '(select auth.uid())', E'\x01UID\x01');
  v := replace(v, '(select auth.role())', E'\x01ROLE\x01');
  v := replace(v, '(select auth.jwt())', E'\x01JWT\x01');
  v := replace(v, 'auth.uid()', '(select auth.uid())');
  v := replace(v, 'auth.role()', '(select auth.role())');
  v := replace(v, 'auth.jwt()', '(select auth.jwt())');
  v := replace(v, E'\x01UID\x01', '(select auth.uid())');
  v := replace(v, E'\x01ROLE\x01', '(select auth.role())');
  v := replace(v, E'\x01JWT\x01', '(select auth.jwt())');
  return v;
end;
$$;

do $body$
declare
  r record;
  v_new_qual text;
  v_new_with text;
  v_sql text;
  v_roles text;
  v_as text;
begin
  for r in
    select *
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  loop
    v_new_qual := pg_temp._wrap_auth_rls_expr(r.qual);
    v_new_with := pg_temp._wrap_auth_rls_expr(r.with_check);

    if v_new_qual is not distinct from r.qual
       and v_new_with is not distinct from r.with_check then
      continue;
    end if;

    v_as := case
      when lower(trim(both from r.permissive::text)) like 'restrictive%' then 'as restrictive '
      else 'as permissive '
    end;

    if r.roles is null or cardinality(r.roles) = 0 then
      v_roles := '';
    else
      select ' to ' || string_agg(
        case
          when rol::text in ('public', 'PUBLIC') then 'public'
          else quote_ident(rol::text)
        end,
        ', '
      )
      into v_roles
      from unnest(r.roles) as rol;
    end if;

    execute format(
      'drop policy if exists %I on %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );

    v_sql :=
      format(
        'create policy %I on %I.%I %sfor %s',
        r.policyname,
        r.schemaname,
        r.tablename,
        v_as,
        r.cmd
      )
      || coalesce(v_roles, '')
      || case
           when v_new_qual is not null and btrim(v_new_qual) <> '' then
             ' using (' || v_new_qual || ')'
           else ''
         end
      || case
           when v_new_with is not null and btrim(v_new_with) <> '' then
             ' with check (' || v_new_with || ')'
           else ''
         end;

    execute v_sql;
  end loop;
end;
$body$;

drop function pg_temp._wrap_auth_rls_expr(text);
