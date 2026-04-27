# CampSite Frontend Full Feature Test Inventory

Last updated: 2026-04-26
Scope: Frontend-first manual + QA test inventory across the full SaaS
Coverage target: From landing page and public flows to locked/closed org states

## How to use this file

- This is a feature inventory + testing checklist (not just route list).
- Each area is broken into:
  - **Main feature**
  - **Sub-features**
  - **Tiny sub-features (micro interactions and edge UI states)**
  - **Access control matrix focus**
  - **Frontend test checklist**
- Status key: `[ ]` not tested, `[~]` in progress, `[x]` passed, `[!]` failed/bug

## Role and Access Profiles to test every applicable feature with

- **Public (unauthenticated)**
- **Candidate (public jobs auth domain)**
- **Employee (standard logged-in user)**
- **Manager**
- **HR**
- **Finance**
- **Admin**
- **Founder / elevated internal (where route exists)**
- **Suspended/Locked org user states**

---

## 1) Public Marketing + Legal Surface

### Main feature: Landing page and public brand experience

#### Sub-features
- Hero section and CTAs
- Product/solution cards
- Footer navigation clusters
- Public navigation responsiveness

#### Tiny sub-features
- Link hover/focus states
- Mobile menu open/close behavior
- CTA click targets and keyboard activation
- Placeholder link behavior (`#` should not remain in production)
- Footer legal links integrity

#### Access control focus
- Public only
- Logged-in users hitting landing page (expected redirect or accessible behavior)

#### Frontend test checklist
- [ ] Landing loads without console errors
- [ ] All CTAs navigate to valid destinations
- [ ] No dead anchors or placeholder links
- [ ] Keyboard-only navigation works for all interactive elements
- [ ] Mobile and desktop layouts are visually consistent
- [ ] Footer links map to real pages

### Main feature: Legal and compliance pages

#### Sub-features
- Privacy page
- Terms page
- Data processing/legal detail page
- Cookie/legal references from marketing

#### Tiny sub-features
- Cross-linking among legal pages
- Scroll-to-section anchor links (if present)
- Browser back-button behavior

#### Access control focus
- Public visibility
- Authenticated users can still access legal docs

#### Frontend test checklist
- [ ] `privacy`, `terms`, and data processing pages render correctly
- [ ] All legal links from marketing/nav/footer resolve correctly
- [ ] No missing route or 404 legal links

---

## 2) Public Candidate Portal (Jobs domain)

### Main feature: Jobs listing and discovery

#### Sub-features
- Jobs list page
- Job detail page
- Job search/filter/sort (if present)

#### Tiny sub-features
- Empty jobs state
- Expired/closed job visual treatment
- Content fallback quality (no placeholder copy)
- Job card keyboard accessibility

#### Access control focus
- Public + Candidate
- Authenticated internal users hitting public jobs routes

#### Frontend test checklist
- [ ] Jobs list renders with stable loading states
- [ ] Job detail route works for valid slug
- [ ] Invalid/removed slug shows clean error/empty state
- [ ] Apply CTA states are correct (open/closed/auth required)

### Main feature: Candidate authentication

#### Sub-features
- Candidate login
- Candidate register
- Forgot password
- Session/account continuity

#### Tiny sub-features
- Validation errors and copy quality
- Wrong credentials messages
- Password reset form UX and success state
- Redirect destination after auth

#### Access control focus
- Candidate user type only
- Ensure internal employee/admin sessions do not break public auth UX

#### Frontend test checklist
- [ ] Login/register forms validate fields and show inline errors
- [ ] Forgot password flow completes with clear state transitions
- [ ] Post-login redirect is correct and deterministic
- [ ] Logged-out state fully clears protected candidate screens

### Main feature: Candidate application journey

#### Sub-features
- Apply form flow
- Candidate “My applications” list
- Candidate application detail/status page
- Offer sign flow via token route

#### Tiny sub-features
- Required field highlighting
- Resume/attachment UI behavior (if present)
- Duplicate application prevention messaging
- Invalid/expired offer token handling
- Signature confirmation state

#### Access control focus
- Public unauthenticated (prompt/login)
- Candidate owner-only access to their application pages
- Token security behavior for offer-sign

#### Frontend test checklist
- [ ] Apply form submission success and failure paths are clear
- [ ] Candidate sees only their own applications
- [ ] Status page updates accurately after state changes
- [ ] Offer-sign token errors are user-friendly and secure

---

## 3) Core Auth + Session for Main SaaS

### Main feature: Main app authentication

#### Sub-features
- Login
- Register
- Register completion page
- Forgot password
- Set password
- Auth callback/session-choice flows

#### Tiny sub-features
- Email/password validation states
- Multi-tab session behavior
- Redirect chain correctness after callback
- Auth error banners and retry actions

#### Access control focus
- Unauthenticated user protection for all main routes
- Role bootstrap (first login role assignment UX)

#### Frontend test checklist
- [ ] All auth pages render with proper validation
- [ ] Callback and set-password flows complete without dead ends
- [ ] Unauthorized route visit redirects cleanly to login
- [ ] Session-choice behavior is deterministic

---

## 4) Shell, Navigation, and Global App Experience

### Main feature: App shell + top bar + sidebar

#### Sub-features
- Sidebar nav by role
- Top bar actions
- Command/search palette (if present)
- Notification badges and quick links

#### Tiny sub-features
- Active route highlighting
- Collapsed nav behavior
- Icon-only tooltips
- Responsive nav breakpoints
- Focus ring visibility

#### Access control focus
- Each role sees only allowed sections
- Forbidden pages do not appear in nav

#### Frontend test checklist
- [ ] Navigation visibility differs correctly by role
- [ ] Route highlighting and breadcrumbs are accurate
- [ ] Shell remains stable during rapid route transitions
- [ ] No nav item routes to unauthorized page

### Main feature: Global fallback and org state pages

#### Sub-features
- Pending
- Org locked
- Trial ended
- Subscription suspended
- Maintenance mode

#### Tiny sub-features
- Return/navigation options
- Support/upgrade CTA routing
- Role-specific messaging content

#### Access control focus
- Correct trigger of state pages based on org/account conditions

#### Frontend test checklist
- [ ] Each org state page renders with complete messaging and CTAs
- [ ] Users cannot bypass locked/suspended conditions via direct route typing
- [ ] Transition into and out of state pages behaves correctly

---

## 5) Dashboard and Personal Workspace

### Main feature: Dashboard home

#### Sub-features
- KPI/summary cards
- Recent activity panels
- Role-specific widgets

#### Tiny sub-features
- Skeleton loading states
- Empty widgets
- Partial-data rendering without full page crash

#### Access control focus
- Widget visibility by role
- No leakage of unauthorized org metrics

#### Frontend test checklist
- [ ] Dashboard loads with realistic latency gracefully
- [ ] Widgets hide/show by role as expected
- [ ] Data refresh actions do not duplicate/flicker

### Main feature: Profile and settings

#### Sub-features
- Personal profile page
- Profile HR view (if role-limited)
- Settings pages (including discount tiers path where present)

#### Tiny sub-features
- Avatar upload/edit controls (if present)
- Input validation and save feedback
- Unsaved changes warning behaviors

#### Access control focus
- Own profile vs others’ profile boundaries
- Settings sections by role

#### Frontend test checklist
- [ ] Profile updates persist and show clear success/error feedback
- [ ] Unauthorized settings sections are hidden and blocked
- [ ] Deep links into settings remain stable

---

## 6) Calendar + Events + RSVP + Notifications

### Main feature: Calendar workspace

#### Sub-features
- Calendar views (month/week/day/list as implemented)
- Event creation/editing
- Manual event forms
- RSVP interactions
- Calendar filters

#### Tiny sub-features
- Date/time picker keyboard support
- Timezone display consistency
- Recurrence form details (if present)
- Event edit conflict/error UI

#### Access control focus
- Role-based create/edit permissions
- Read-only calendar contexts

#### Frontend test checklist
- [ ] Event create/edit/delete lifecycle works
- [ ] RSVP state transitions are reflected immediately
- [ ] Filter combinations do not produce broken states
- [ ] Known stubs (e.g., Google sync) are tracked as open gaps

### Main feature: Notifications center

#### Sub-features
- Notifications home
- Segment pages (calendar, leave, recruitment, hr-metrics, applications)
- Read/unread state

#### Tiny sub-features
- Badge count updates
- Scroll/pagination behavior
- Empty notification feed state

#### Access control focus
- Notification categories by role
- Only relevant events visible per user scope

#### Frontend test checklist
- [ ] Notification pages render per role without unauthorized categories
- [ ] Read/unread state updates correctly in UI
- [ ] Badge counts sync with list contents

---

## 7) Broadcasts + Internal Communication

### Main feature: Broadcast feed/detail/edit

#### Sub-features
- Broadcast listing
- Broadcast detail view
- Broadcast create/edit (where route exists)
- Replies/comments interactions

#### Tiny sub-features
- Rich text rendering/format consistency
- Reply input validation and character limits
- Edit permission UI hints

#### Access control focus
- Author/edit rights
- Audience visibility boundaries

#### Frontend test checklist
- [ ] Create/edit/detail list consistency
- [ ] Unauthorized edit attempts are blocked in UI and route level
- [ ] Reply counts and ordering remain correct after refresh

---

## 8) Attendance / Time / Payroll-adjacent Flows

### Main feature: Attendance clock

#### Sub-features
- Clock in/out
- Attendance status panel
- Break/start/end interactions (if supported)

#### Tiny sub-features
- Rapid multi-click protection
- Offline or delayed request feedback
- Time display precision and updates

#### Access control focus
- Employee self-service vs manager/admin visibility controls

#### Frontend test checklist
- [ ] Clock actions update status immediately and correctly
- [ ] Duplicate action prevention works
- [ ] Error states are recoverable with clear retry paths

### Main feature: Timesheets

#### Sub-features
- Timesheet list
- Timesheet detail/review
- Approval/rejection flows

#### Tiny sub-features
- Bulk action checkboxes
- Inline row status chips
- Rejection reason UX

#### Access control focus
- Employee own timesheets
- Manager/HR/Finance review permissions

#### Frontend test checklist
- [ ] Timesheet lifecycle states render correctly
- [ ] Approve/reject actions reflect in UI and counts
- [ ] Unauthorized actions are hidden/disabled

### Main feature: Wagesheets

#### Sub-features
- Wagesheet listing and summary
- Payroll period selection
- Detail drill-down

#### Tiny sub-features
- Currency formatting consistency
- Rounding and totals display
- Export action availability (if present)

#### Access control focus
- Finance/admin visibility restrictions

#### Frontend test checklist
- [ ] Totals and subtotals display consistently
- [ ] Filters and period switching refresh correctly
- [ ] Non-finance users cannot access restricted wage views

### Main feature: Rota

#### Sub-features
- Shift schedule view
- Rota editing tools
- Rota import (admin route)

#### Tiny sub-features
- Drag/drop behavior (if present)
- Shift conflict banners
- Import validation feedback granularity

#### Access control focus
- Editing rights by role and scope

#### Frontend test checklist
- [ ] Rota changes appear in correct time windows
- [ ] Import flow reports partial/full errors clearly
- [ ] Unauthorized edit controls are not exposed

---

## 9) Manager Workspace

### Main feature: Manager dashboard and operational pages

#### Sub-features
- Manager home/system overview
- Manager departments/teams/sub-teams
- Manager recruitment
- Manager org chart route

#### Tiny sub-features
- Scoped data labels
- Team selector persistence
- No-data behavior for managers with limited scope

#### Access control focus
- Manager limited to assigned departments/teams
- No HR/Admin-only controls visible

#### Frontend test checklist
- [ ] Manager-only pages load with scoped data
- [ ] Manager cannot access admin-only actions via direct URL
- [ ] Team/dept context switching updates all widgets consistently

---

## 10) HR Workspace (People Operations)

### Main feature: HR hub and people records

#### Sub-features
- HR home
- Records list and individual record page
- Custom fields management

#### Tiny sub-features
- Record search/filter UX
- Custom field create/edit/delete micro-states
- Validation for field types and required flags

#### Access control focus
- HR/admin visibility vs manager/employee restrictions
- Sensitive record sections hidden by role

#### Frontend test checklist
- [ ] HR records pages render and filter reliably
- [ ] Sensitive fields are not exposed to unauthorized roles
- [ ] CRUD feedback is clear and immediate

### Main feature: HR leave, absence, attendance settings

#### Sub-features
- Leave management
- Absence reporting
- Attendance settings

#### Tiny sub-features
- Status badge transitions
- Date overlap warnings
- Approver selection validation

#### Access control focus
- Leave approval chain and role-specific controls

#### Frontend test checklist
- [ ] Leave requests/approvals display correct action controls
- [ ] Absence reports handle empty and high-volume states
- [ ] Settings changes provide deterministic confirmation

### Main feature: HR performance and one-on-ones

#### Sub-features
- Performance cycles
- Performance review detail pages
- One-on-ones list and meeting detail

#### Tiny sub-features
- Rating input controls
- Draft vs submitted review states
- Private notes visibility boundaries

#### Access control focus
- Reviewer/reviewee/HR/admin view differences

#### Frontend test checklist
- [ ] Review workflows cannot skip mandatory states
- [ ] Privacy boundaries for notes/comments are respected in UI
- [ ] One-on-one pages enforce participant visibility

### Main feature: HR hiring and recruitment ops

#### Sub-features
- Hiring hub
- Requests (list/new/detail)
- Jobs list/edit/applications/interviews/templates
- Offer templates create/edit

#### Tiny sub-features
- Candidate stage chips and transitions
- Interview scheduling microcopy and validation
- Template version/preview behavior
- Empty pipeline states and CTAs

#### Access control focus
- HR/Admin recruitment powers vs Manager limited scope

#### Frontend test checklist
- [ ] Request -> job -> application -> interview transitions are visible and consistent
- [ ] Stage changes update counters and lists correctly
- [ ] Placeholder copy is removed from publishable candidate-facing views

### Main feature: HR onboarding

#### Sub-features
- Onboarding hub
- Onboarding run detail
- Admin HR onboarding mirror routes

#### Tiny sub-features
- Task checklist progress bars
- Assignee status chips
- Due date badge states

#### Access control focus
- HR/Admin manage vs other roles read/no access

#### Frontend test checklist
- [ ] Onboarding run pages handle all statuses
- [ ] Progress/state updates are reflected immediately
- [ ] Unauthorized users cannot open run details

### Main feature: HR org chart and HR metric alerts

#### Sub-features
- HR org chart view
- HR metric alerts page

#### Tiny sub-features
- Presence/status indicators
- Alert threshold labels and explanation text

#### Access control focus
- HR/admin access boundaries

#### Frontend test checklist
- [ ] Org chart renders with stable layout under larger org trees
- [ ] Alerts page supports empty/triggered states correctly

---

## 11) Admin Workspace (full control surface)

### Main feature: Admin home and system setup

#### Sub-features
- Admin dashboard/home
- Admin settings and org settings
- Admin system overview
- Admin integrations

#### Tiny sub-features
- Integration status badges
- Settings save banners and error handling
- Unsaved change prompts

#### Access control focus
- Admin-only route protection

#### Frontend test checklist
- [ ] Non-admin users are redirected/blocked from all admin routes
- [ ] Admin settings flows provide clear success/failure states
- [ ] Integration cards display actionable error states

### Main feature: Admin people and org structure

#### Sub-features
- Admin users
- Roles
- Teams
- Sub-teams
- Departments
- Categories

#### Tiny sub-features
- Add/edit modal validation
- Permission override chip rendering
- Table sorting/filtering/pagination controls

#### Access control focus
- Only admins can mutate organization structure

#### Frontend test checklist
- [ ] Create/edit/delete operations are reflected instantly in lists
- [ ] Permission override UI displays effective rights clearly
- [ ] Large list states remain usable (search/sort/paginate)

### Main feature: Admin HR mirror features

#### Sub-features
- Admin HR hub and user detail pages
- Admin HR custom fields
- Admin HR onboarding
- Admin HR performance + performance detail
- Admin HR one-on-ones
- Admin HR absence reporting
- Admin HR metric alerts
- Admin HR org chart

#### Tiny sub-features
- Context switch between admin and hr mirrors
- Action controls parity check with HR pages
- Breadcrumb/path consistency

#### Access control focus
- Admin broader visibility over HR domain features

#### Frontend test checklist
- [ ] Admin HR routes match expected controls and states
- [ ] No broken parity behavior between HR and admin mirror views

### Main feature: Admin recruitment and jobs

#### Sub-features
- Admin recruitment list and detail
- Admin applications and interviews
- Admin jobs list/edit/applications
- Admin offer templates (new/edit)

#### Tiny sub-features
- Candidate stage actions
- Bulk shortlist/reject microinteractions (if present)
- Job advert preview quality checks

#### Access control focus
- Admin full lifecycle control

#### Frontend test checklist
- [ ] Recruitment pages show coherent state across list/detail/screens
- [ ] Job edit/applications links are consistent and not broken
- [ ] Placeholder content is not shown in public-facing outputs

### Main feature: Admin operations pages

#### Sub-features
- Pending approvals/admin pending
- Notifications admin
- Privacy admin page
- Scan logs
- Discount/admin discount
- Rota import

#### Tiny sub-features
- Filter chips and timestamp formatting
- Log row detail expansion
- Download/export actions (if present)

#### Access control focus
- Highly restricted actions are admin-only

#### Frontend test checklist
- [ ] Operational pages load with clear empty/error/loading states
- [ ] Admin-only action controls are not exposed to non-admin roles

---

## 12) Finance Workspace

### Main feature: Finance hub and specialized pages

#### Sub-features
- Finance home
- Finance timesheets
- Finance wagesheets
- Finance attendance settings

#### Tiny sub-features
- Period selector persistence
- Summary card drill-down behavior
- Cross-linking to source records

#### Access control focus
- Finance + admin access, no unauthorized read

#### Frontend test checklist
- [ ] Finance nav appears only to eligible roles
- [ ] Each finance page renders accurate controls and scope
- [ ] Sensitive payroll information is hidden from unauthorized users

---

## 13) Reports and Analytics Workspace

### Main feature: Reports home

#### Sub-features
- Reports listing
- Create report
- Pin/unpin
- Run report
- Export report

#### Tiny sub-features
- Config builder field validation
- Filter operator controls
- Run status spinners/messages
- Export success/failure toast behavior

#### Access control focus
- Viewer vs manager-capable report users
- Department vs org scope visibility

#### Frontend test checklist
- [ ] Report create/run/export basic flow works
- [ ] Pin/unpin state remains stable across refresh
- [ ] Unauthorized report interactions are blocked in UI

### Main feature: Reports advanced completeness (in progress area)

#### Sub-features
- Edit report
- Archive/unarchive
- Share settings
- Schedule management
- Run history

#### Tiny sub-features
- Role target chips in sharing UI
- Schedule recurrence controls
- Last run/next run badge updates
- Run error details display

#### Access control focus
- Only allowed roles can edit/share/schedule

#### Frontend test checklist
- [ ] Advanced controls exist and are wired for all lifecycle actions
- [ ] Schedule and run history reflect backend state accurately
- [ ] Empty/loading/error states are polished and consistent

---

## 14) Org Chart + Live Presence

### Main feature: Manager/HR/Admin org chart views

#### Sub-features
- Org tree rendering
- Live presence indicators
- Working status indicators

#### Tiny sub-features
- Node hover/expand states
- Presence timestamp recency labels
- Auto-refresh/polling visual stability

#### Access control focus
- Route and API visibility per manager/hr/admin policies

#### Frontend test checklist
- [ ] Org chart remains responsive with deeper hierarchies
- [ ] Presence badges update without noisy flicker
- [ ] Unauthorized users are blocked from org chart routes

---

## 15) Resources and Knowledge

### Main feature: Resource center

#### Sub-features
- Resources list
- New resource creation
- Resource detail page

#### Tiny sub-features
- Category tags
- Attachment preview/download controls
- Search/filter micro-interactions

#### Access control focus
- Visibility/edit rights by role

#### Frontend test checklist
- [ ] Resource create/list/detail path works end-to-end
- [ ] Permissions are correctly reflected in action buttons
- [ ] Broken file/link states are handled cleanly

---

## 16) Discount / Scan / Misc Feature Areas

### Main feature: Discount workflows

#### Sub-features
- Discount page
- Admin discount page
- Discount scan page
- Settings discount tiers

#### Tiny sub-features
- Scan result states
- Tier badge rendering
- Validation and duplicate scan handling

#### Access control focus
- Employee vs admin discount capability boundaries

#### Frontend test checklist
- [ ] Discount routes render with expected controls by role
- [ ] Scan flows handle invalid and success cases clearly

---

## 17) Founder / Special Internal Areas

### Main feature: Founders page and special roles

#### Sub-features
- Founder dashboard route

#### Tiny sub-features
- Access denied messaging for non-founder users
- Nav visibility for founder-only tools

#### Access control focus
- Founder-only visibility and route guards

#### Frontend test checklist
- [ ] Founder route is inaccessible to non-founder roles
- [ ] Founder-specific navigation appears only when expected

---

## 18) Route-level Access Control Regression Grid

For each major route group, execute same tests with every role profile:

- [ ] Public
- [ ] Candidate
- [ ] Employee
- [ ] Manager
- [ ] HR
- [ ] Finance
- [ ] Admin
- [ ] Founder
- [ ] Locked/suspended org user

### Checks to run on each route

- [ ] Route visible in nav only when allowed
- [ ] Direct URL access blocked when unauthorized
- [ ] API-driven action buttons hidden/disabled correctly
- [ ] No unauthorized data appears in list/detail views
- [ ] Error states do not leak internal identifiers/details

---

## 19) Frontend Tiny-detail QA Sweep (all pages)

### UI micro-behavior checklist

- [ ] Loading states are present and non-jarring
- [ ] Empty states are informative and actionable
- [ ] Error states include clear next action
- [ ] Success states are explicit (toast/banner/inline)
- [ ] Form validation is field-specific and accessible
- [ ] Buttons have disabled/loading states to prevent duplicate submits
- [ ] Keyboard navigation works for all critical interactions
- [ ] Focus is managed after modals/dialogs close
- [ ] Color contrast is acceptable for status chips and small text
- [ ] Responsive behavior at mobile/tablet/desktop breakpoints

### Data presentation checklist

- [ ] Currency/date/time formatting consistent across pages
- [ ] Table headers and sorting interactions are clear
- [ ] Pagination and filters preserve state on refresh/back nav
- [ ] Badge counts and list contents stay in sync
- [ ] Copy quality has no placeholder text in production paths

---

## 20) End-to-end Test Journeys (must-pass scenarios)

### Public-to-candidate funnel

- [ ] Land on landing page -> jobs list -> job detail -> apply -> candidate login/register -> submit application -> view status -> offer sign

### Employee daily ops

- [ ] Login -> dashboard -> attendance clock -> timesheet view -> calendar RSVP -> notifications review -> profile update

### Manager operational flow

- [ ] Login as manager -> system overview -> departments/teams -> org chart -> recruitment view -> approve/review scoped items

### HR people operations flow

- [ ] Login as HR -> records -> leave/absence -> performance cycle -> one-on-ones -> hiring requests/jobs/interviews -> onboarding run

### Admin org operations flow

- [ ] Login as admin -> users/roles/departments/teams -> settings/integrations -> recruitment/jobs -> HR mirror pages -> logs/privacy/notifications

### Finance flow

- [ ] Login as finance -> finance hub -> timesheets -> wagesheets -> attendance settings -> export/report checks

### Reports flow

- [ ] Login with reports-enabled role -> create report -> run -> export -> pin -> (advanced: edit/share/schedule/history when complete)

### Org closure/lock lifecycle flow

- [ ] Normal org -> trial ended or suspended state -> locked page gating -> restricted nav/actions -> restoration path validation

---

## 21) Bug logging template for this test pass

Use one bug ticket per failure with:

- Feature area:
- Role profile:
- Route/page:
- Expected behavior:
- Actual behavior:
- Steps to reproduce:
- Screenshot/video:
- Severity: `P0/P1/P2/P3`
- Regression?: `yes/no`
- Notes:

---

## 22) Sign-off criteria for “frontend fully tested”

- [ ] Every section in this file has been executed at least once
- [ ] All `P0` and `P1` failures are resolved and retested
- [ ] Access-control grid completed for all major route groups
- [ ] End-to-end journeys pass across target roles
- [ ] Placeholder/dead-link/stub items either fixed or formally accepted with documented risk
- [ ] Product + QA + Engineering sign-off recorded

