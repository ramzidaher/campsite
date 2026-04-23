-- Stage 1 OAuth token hardening for google_connections (additive, backwards-compatible).
-- Keeps current plaintext columns for compatibility while introducing encrypted-at-rest fields.

alter table public.google_connections
  add column if not exists access_token_encrypted text,
  add column if not exists refresh_token_encrypted text,
  add column if not exists token_encryption_kid text,
  add column if not exists token_encrypted_at timestamptz;

comment on column public.google_connections.access_token_encrypted is
  'Encrypted OAuth access token payload (application/KMS managed).';

comment on column public.google_connections.refresh_token_encrypted is
  'Encrypted OAuth refresh token payload (application/KMS managed).';

comment on column public.google_connections.token_encryption_kid is
  'Key identifier used for token encryption, for rotation support.';

comment on column public.google_connections.token_encrypted_at is
  'Timestamp when encrypted token fields were last written.';

-- Optional migration-friendly index to help track transition coverage.
create index if not exists google_connections_token_encrypted_at_idx
  on public.google_connections (token_encrypted_at)
  where token_encrypted_at is not null;
