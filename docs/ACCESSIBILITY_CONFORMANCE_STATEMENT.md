# CampSite accessibility conformance statement

Last updated: 2026-04-13

## Scope

This statement covers the CampSite web application in `apps/web`, including authenticated shell experiences and public/auth route groups.

## Target standard

- Baseline target: WCAG 2.2 AA
- Additional enhancements: selected AAA practices for focus clarity and user guidance text

## Validation approach

- Automated checks
  - `eslint` with `jsx-a11y` recommendations
  - `jest-axe` checks via `npm run test:a11y --workspace @campsite/web`
- Manual checks
  - Keyboard-only navigation across key flows
  - Screen reader runs using NVDA + Chrome and VoiceOver + Safari

## Current status

- Landmark and skip navigation patterns are implemented for shell and route layouts.
- Shared UI primitives include stronger accessibility defaults for button/input/dialog behavior.
- Accessibility-specific QA rows are tracked in `docs/FULL_APP_TEST_CHECKLIST_GRANULAR.csv`.

## Known limitations

- Automated accessibility coverage currently focuses on representative components; it is being expanded over time.
- Full cross-browser assistive technology evidence must be re-run each release cycle.

## Internal maintenance playbook

1. **Before merge**
   - Run `npm run test --workspace @campsite/web -- --runInBand`
   - Run `npm run test:a11y --workspace @campsite/web`
2. **Before release**
   - Execute manual keyboard and screen-reader checks for core journeys.
   - Update checklist rows `G-061` to `G-066` with pass/fail notes.
3. **When adding UI**
   - Prefer semantic HTML/native controls.
   - Ensure focus-visible states and descriptive labels.
   - Add or update `jest-axe` coverage for new interactive components.
