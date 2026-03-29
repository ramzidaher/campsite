# Broadcast channels

## Glossary

- **Broadcast channel** — A row in `public.broadcast_channels` tied to one `departments` row. It is the **routing key** for targeted (“specific”) broadcasts: who receives a sent post depends on `user_subscriptions` for that `channel_id`, with exceptions below.
- **`broadcasts.channel_id`** — Set for non–org-wide sends; must reference a `broadcast_channels` row for the same `dept_id` as the broadcast. Org-wide sends use `is_org_wide = true` and keep `channel_id` null.
- **`user_subscriptions`** — `(user_id, channel_id)` with `subscribed` boolean. Members opt in or out per channel (registration and **Settings → Broadcast channels**).

Historical note: before migration `20260430270000_rename_broadcast_channels.sql`, the table was `dept_categories` and columns were `cat_id`.

## Delivery rules (sent posts)

Visibility and notification fan-out use `public.user_should_receive_sent_broadcast(p_user_id, b)` (security definer). For `b.status = 'sent'`, in order:

1. Wrong org or inactive profile → false (creator still sees their own sends).
2. **Mandatory** → true for the target audience.
3. **Org-wide** → true for active org members.
4. Creator → true.
5. **Org admin / super admin** → true.
6. If `team_id` is set, user must be in that team (`user_dept_teams`); otherwise false.
7. Otherwise requires `channel_id` and a matching `user_subscriptions` row with `subscribed = true`.

Feed visibility uses `broadcast_visible_to_reader`, which for sent rows delegates to `user_should_receive_sent_broadcast`.

## Product surfaces

- **Compose** — Picks department + channel (unless org-wide). Copy should say “channel”, not “tag”.
- **Admin → Departments** — Org admins maintain the list of channels per department.
- **Registration** — Join flow stores chosen channels in `register_subscriptions` metadata as `{ channel_id, subscribed }` (legacy `cat_id` is still accepted server-side).
- **Settings** — Members can toggle `user_subscriptions` after join.

## Related migrations

- Core table: `supabase/migrations/20250325120001_phase1_core_platform.sql` (original `dept_categories` / `user_subscriptions`).
- Org-wide + teams: `supabase/migrations/20260430250000_broadcast_org_wide_teams.sql`.
- Rename to `broadcast_channels` / `channel_id`: `supabase/migrations/20260430270000_rename_broadcast_channels.sql`.
