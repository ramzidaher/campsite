-- Campsite — initial database extensions and storage buckets.
-- All tenant tables in later migrations MUST enable RLS from creation.

create extension if not exists "uuid-ossp" with schema extensions;

-- pg_cron runs in the `cron` schema on hosted Supabase; extension must be allowed by project.
create extension if not exists pg_cron with schema extensions;

-- Storage buckets (public read optional — tighten in Phase 1+)
insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('user-avatars', 'user-avatars', true)
on conflict (id) do nothing;

-- Placeholder policies: authenticated users can upload to their org prefix later.
-- For Phase 0, deny object access by default except public buckets if needed.
create policy "Public read org logos"
on storage.objects for select
to public
using (bucket_id = 'org-logos');

create policy "Public read user avatars"
on storage.objects for select
to public
using (bucket_id = 'user-avatars');
