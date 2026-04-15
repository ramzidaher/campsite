# Bank Details Encryption Key Rotation Runbook

This runbook rotates `BANK_DETAILS_ENCRYPTION_KEY` safely for payroll bank details.

## Why this matters

`employee_bank_details.encrypted_payload` is encrypted at application layer using AES-256-GCM.  
If you change the key without re-encrypting existing rows, previously stored bank details become unreadable.

## Prerequisites

- `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY`
- Old key: `BANK_DETAILS_ENCRYPTION_KEY_OLD`
- New key: `BANK_DETAILS_ENCRYPTION_KEY_NEW`
- New key must be base64 for **32 bytes**

## Rotation script

Script path:

- `scripts/rotate-bank-details-key.mjs`

NPM command:

- `npm run security:bank-details:rotate-key`

## Safe execution sequence

1) **Prepare new key**

```bash
openssl rand -base64 32
```

2) **Dry run first** (no writes)

```bash
BANK_DETAILS_ENCRYPTION_KEY_OLD="<old>" \
BANK_DETAILS_ENCRYPTION_KEY_NEW="<new>" \
npm run security:bank-details:rotate-key
```

3) **Execute rotation** (writes encrypted_payload updates)

```bash
ROTATE_EXECUTE=true \
BANK_DETAILS_ENCRYPTION_KEY_OLD="<old>" \
BANK_DETAILS_ENCRYPTION_KEY_NEW="<new>" \
npm run security:bank-details:rotate-key
```

4) **Cutover application key**

Set `BANK_DETAILS_ENCRYPTION_KEY=<new>` in:

- local `.env`
- Preview env
- Production env

Then redeploy.

5) **Verification**

- Open payroll bank details UI for one test employee.
- Use reveal flow with reason (should decrypt correctly).
- Run payroll export once (and confirm event log entries).

## Scoped/testing options

- Rotate one org only:

```bash
ROTATE_ORG_ID="<org-uuid>" ...
```

- Limit row count for test run:

```bash
ROTATE_LIMIT=10 ...
```

## Rollback guidance

- If rotation fails before cutover, keep old key active and rerun after fixing the issue.
- If cutover happened but decryption fails, immediately restore old key in env, then investigate.
- Do not delete old key until successful post-rotation validation is complete.

## Security notes

- Treat both old and new keys as secrets.
- Never commit keys into git.
- Execute rotation from a secure environment only.
