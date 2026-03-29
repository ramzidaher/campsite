-- Re-assert privileges after CREATE OR REPLACE on user_should_receive_sent_broadcast
-- (20260430250000). Keeps service_role fan-out and security posture aligned with 20260331210000.

revoke all on function public.user_should_receive_sent_broadcast(uuid, public.broadcasts) from public;
grant execute on function public.user_should_receive_sent_broadcast(uuid, public.broadcasts) to service_role;
