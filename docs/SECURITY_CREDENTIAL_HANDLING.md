# Credential Artifact Response

When a credential artifact is detected in the workspace (for example browser password exports, `.xlsx` staff exports, or raw secret files), follow this process immediately:

1. Remove the file from the repository working tree.
2. Ensure a matching ignore rule exists in `.gitignore`.
3. Run CI secret scanning (Gitleaks) and confirm no leaked secrets remain in tracked files.
   - Local check: `npm run security:secrets`
4. Rotate any exposed credentials out-of-band (IdP, database, API keys, email providers).
5. Document the rotation ticket/reference in the incident log.

## Notes

- Rotation is an operational task and is not automated in app code.
- Repository protections (CI scan + ignore rules) reduce repeat accidental commits but do not replace rotation.
