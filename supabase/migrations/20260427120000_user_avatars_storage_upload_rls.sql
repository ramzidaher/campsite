-- Allow authenticated users to manage objects under user-avatars/{their user id}/...
-- Public read already exists from init; inserts were previously unrestricted by omission in app.

drop policy if exists "user_avatars_insert_own" on storage.objects;
drop policy if exists "user_avatars_update_own" on storage.objects;
drop policy if exists "user_avatars_delete_own" on storage.objects;

create policy "user_avatars_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'user-avatars'
  and split_part(name, '/', 1) = (auth.uid())::text
);

create policy "user_avatars_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'user-avatars'
  and split_part(name, '/', 1) = (auth.uid())::text
)
with check (
  bucket_id = 'user-avatars'
  and split_part(name, '/', 1) = (auth.uid())::text
);

create policy "user_avatars_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'user-avatars'
  and split_part(name, '/', 1) = (auth.uid())::text
);
