# 12 — Push tokens and broadcast notification jobs

**Scope:** This plan covers **database + Edge delivery** and **web-adjacent UX** (e.g. unread indicators). It does **not** document native app clients; token registration UIs live outside these web-only runbooks.

## 1. Product intent

- **Devices** (native or future web push) may register **push tokens** stored in Supabase for outbound notifications.
- **Broadcasts** and related jobs enqueue **notification work** processed asynchronously (Edge Function, cron, or queue table per implementation).
- On **web**, users primarily see **in-app** signals (e.g. unread broadcast counts via RPC), not necessarily push.

## 2. Backend (Supabase)

### 2.1 Tables / policies (phase2 + later)

**Reference (schema + `push_tokens` RLS + jobs table + deny policy + trigger):**  
`supabase/migrations/20250326000001_phase2_broadcasts.sql`

**Follow-up (allow enqueue on `broadcasts` insert as sender):**  
`supabase/migrations/20260326120000_broadcast_notification_jobs_insert_policy.sql`

**Recipient RPC aligned with `broadcast_visible_to_reader` / sent rules:**  
`supabase/migrations/20260331210000_broadcast_sent_visibility_and_notification_recipients.sql`

| Concept | Notes |
|---------|--------|
| `push_tokens` | RLS: **`push_tokens_all_self`** — `FOR ALL` / `TO authenticated` with `user_id = auth.uid()` on `USING` and `WITH CHECK` (no other users’ rows). |
| `broadcast_notification_jobs` | **`broadcast_notification_jobs_deny`** — authenticated cannot read/update/delete. **`broadcast_notification_jobs_insert_own_sent_broadcast`** — authenticated may **insert** only when the row’s `broadcast_id` refers to a **`sent`** broadcast with **`created_by = auth.uid()`** (so the sender’s session can enqueue in the same transaction as insert). **Service role** bypasses RLS for the Edge worker. |

### 2.2 Triggers

- **`broadcasts_queue_notify`** — `AFTER INSERT OR UPDATE` on `public.broadcasts`, function **`public.broadcasts_queue_notify_fn()`** (`SECURITY DEFINER`): when status becomes **`sent`**, inserts into **`broadcast_notification_jobs`** (`ON CONFLICT (broadcast_id) DO NOTHING`), gated on `notifications_sent_at` / transition logic in the function body.

### 2.3 RPCs (fan-out rules)

- **`public.broadcast_notification_recipient_user_ids(p_broadcast_id uuid)`** — **`service_role` only**; implements the same recipient rules as sent visibility (see migration comments). Used by the Edge worker, not the browser.

### 2.4 Edge Function

**Path:** `supabase/functions/process-broadcast-notifications/index.ts`

**Config:** `supabase/config.toml` — `[functions.process-broadcast-notifications]` **`verify_jwt = false`**; caller must send **`Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`** (see function source).

**Responsibilities (current):**

- List pending jobs (`processed_at IS NULL`) with service-role client.
- For each job, call **`broadcast_notification_recipient_user_ids`** and return counts / sample IDs (diagnostic).
- **Next step:** join `push_tokens`, send via Expo/FCM, set `processed_at` / `last_error`.

**When changing recipient rules:** Keep aligned with [04-broadcasts.md](./04-broadcasts.md) visibility and `broadcast_visible_to_reader` / `user_should_receive_sent_broadcast` semantics.

### 2.5 Cron (scheduled sends)

**Same phase2 file:** if `pg_cron` exists, job **`send-scheduled-broadcasts`** runs every minute to flip **`scheduled` → `sent`** when `scheduled_at <= now()`, which then fires the notify trigger path.

## 3. Web frontend (`apps/web`)

- **Unread / badges:** `(main)/layout.tsx` calls **`broadcast_unread_count`** and passes **`unreadBroadcasts`** into `AppShell` (see also `BroadcastFeed.tsx` and `loadDashboardHome` for the same RPC).
- **Push token registration (server):** `POST` **`/api/push-token`** — `apps/web/src/app/api/push-token/route.ts` — session user only; upserts **`push_tokens`** with `user_id` from auth (RLS enforces self-only if the client were used anon incorrectly; route uses server client with user session).
- **Validation helper (tests):** `apps/web/src/lib/push/parsePushTokenBody.ts` — shared parsing for the route body.

## 4. Tests

- `apps/web/src/lib/push/__tests__/parsePushTokenBody.test.ts` — request body validation for `/api/push-token`.

## 5. Verification checklist

- [x] User can only insert/update/delete **their** push token rows under RLS (`push_tokens_all_self`).
- [x] Client cannot read other users’ tokens (same policy scopes all operations to `auth.uid()`).
- [x] Notification job processor uses **service role** Bearer — not anon/browser key (`process-broadcast-notifications/index.ts` + `verify_jwt = false` with explicit service key check).
- [x] Sent broadcast enqueues a job row (`broadcasts_queue_notify_fn`); sender session can insert job via **`broadcast_notification_jobs_insert_own_sent_broadcast`** (see migration). **Staging:** send a broadcast and inspect `broadcast_notification_jobs` for `broadcast_id`.

## 6. Implementation order (change delivery pipeline)

1. SQL: job schema + trigger changes.
2. Edge: processor logic + secrets (provider tokens, etc.).
3. Update [04-broadcasts.md](./04-broadcasts.md) cross-reference if visibility rules change.
