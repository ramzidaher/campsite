-- Security hardening for introspection views.
-- Avoid SECURITY DEFINER view behavior in exposed schema.

alter view public.db_fk_delete_action_audit
  set (security_invoker = true);

alter view public.db_fk_missing_index_audit
  set (security_invoker = true);
