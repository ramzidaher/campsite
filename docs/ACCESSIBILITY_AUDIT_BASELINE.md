# Accessibility audit baseline (WCAG 2.2 AA + selected AAA)

This baseline inventory maps known and likely issues before remediation work.

## Severity scale

- **Blocker**: User cannot complete a key journey with keyboard/screen reader.
- **High**: Journey is possible but error-prone or confusing with assistive tech.
- **Medium**: Noticeable usability/accessibility debt; workaround exists.
- **Low**: Polish and consistency improvements.

## Inventory

| Area | Key files | Primary WCAG criteria | Severity | Owner |
|---|---|---|---|---|
| Global shell landmarks and skip navigation | `apps/web/src/components/AppShell.tsx`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/(main)/layout.tsx` | 2.4.1 Bypass Blocks, 1.3.1 Info and Relationships, 2.4.3 Focus Order | Blocker | Frontend platform |
| Auth/public layout semantics consistency | `apps/web/src/app/(auth)/layout.tsx`, `apps/web/src/app/(public)/layout.tsx` | 1.3.1, 2.4.6 Headings and Labels | High | Frontend platform |
| Sidebar and topbar control naming/state | `apps/web/src/components/AppShell.tsx`, `apps/web/src/components/shell/AppTopBar.tsx` | 4.1.2 Name Role Value, 2.1.1 Keyboard | High | Frontend platform |
| Modal/dialog focus management | `apps/web/src/components/admin/AdminDepartmentsClient.tsx`, `apps/web/src/components/broadcasts/BroadcastBackdropPicker.tsx`, `packages/ui/src/Dialog.tsx` | 2.1.2 No Keyboard Trap, 2.4.3, 4.1.2 | Blocker | Frontend platform + feature owners |
| Form field labeling and errors | `packages/ui/src/Input.tsx`, `apps/web/src/components/ProfileSettings.tsx`, admin/rota forms | 3.3.1 Error Identification, 3.3.2 Labels or Instructions, 1.3.1 | High | Frontend platform + feature owners |
| Non-semantic interactive cards and rows | `apps/web/src/components/admin/AdminDepartmentsClient.tsx` | 2.1.1 Keyboard, 4.1.2 | High | Admin feature |
| Search/notification popovers announcements | `apps/web/src/components/shell/AppTopBar.tsx` | 4.1.3 Status Messages, 1.3.1 | Medium | Frontend platform |
| Focus-visible consistency and contrast | shared shell + feature controls | 2.4.7 Focus Visible, 1.4.11 Non-text Contrast | High | Design system |
| Rota controls and filter affordances | `apps/web/src/components/rota/RotaClient.tsx` | 2.4.6, 4.1.2, 3.3.2 | Medium | Rota feature |
| Broadcast backdrop chooser button/image naming | `apps/web/src/components/broadcasts/BroadcastBackdropPicker.tsx` | 1.1.1 Non-text Content, 4.1.2 | Medium | Broadcasts feature |

## Sprint verification checklist

- Keyboard-only walkthrough succeeds for dashboard, broadcasts, rota, profile settings, admin departments.
- Screen reader walkthrough succeeds for same flows (NVDA + VoiceOver).
- No critical/serious violations from automated accessibility checks on changed surfaces.
