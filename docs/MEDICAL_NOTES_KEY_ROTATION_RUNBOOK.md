# Medical Notes Encryption Key Rotation Runbook

This runbook rotates `MEDICAL_NOTES_ENCRYPTION_KEY` safely for encrypted medical and occupational health notes.

## Prerequisites

- `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- Old key: `MEDICAL_NOTES_ENCRYPTION_KEY_OLD`
- New key: `MEDICAL_NOTES_ENCRYPTION_KEY_NEW`
- New key must be base64 for 32 bytes

## Rotation script

- Script: `scripts/rotate-medical-notes-key.mjs`
- NPM command: `npm run security:medical-notes:rotate-key`

## Safe execution sequence

1) Generate a new key:

```bash
openssl rand -base64 32
```

2) Dry run:

```bash
MEDICAL_NOTES_ENCRYPTION_KEY_OLD="<old>" \
MEDICAL_NOTES_ENCRYPTION_KEY_NEW="<new>" \
npm run security:medical-notes:rotate-key
```

3) Execute:

```bash
ROTATE_EXECUTE=true \
MEDICAL_NOTES_ENCRYPTION_KEY_OLD="<old>" \
MEDICAL_NOTES_ENCRYPTION_KEY_NEW="<new>" \
npm run security:medical-notes:rotate-key
```

4) Cut over:

Set `MEDICAL_NOTES_ENCRYPTION_KEY=<new>` in all environments and redeploy.

5) Verify:

- Open HR medical notes UI.
- Reveal one record with reason and confirm decrypt works.
- Confirm reveal event appears in medical note event timeline.

## Scoped/testing options

- `ROTATE_ORG_ID="<org-uuid>"`
- `ROTATE_LIMIT=10`

## Security notes

- Treat old and new keys as secrets.
- Never commit keys.
- Rotate from a secure environment only.
