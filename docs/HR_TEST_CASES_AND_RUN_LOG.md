# HR manual QA  printable test checklist & run log

**Print tips:** Use your browser’s Print → Save as PDF. For fewer split sections, enable “Background graphics” if headings look faint. Each major area starts on a new page (if your print engine honors page breaks).

**Setup (before any manual test):**

- [ ] Database migrations applied: `npm run supabase:db:push`
- [ ] Root `.env` has `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (e.g. `http://localhost:3000`)
- [ ] Seed run: `npm run seed-qa-full`
- [ ] Optional: open `scripts/qa-seed-output.json` for user UUIDs after seed (gitignored; paths differ if you re-seed)
- [ ] App running: `npm run dev` (repo root or `apps/web`)
- [ ] Active org for QA personas: **CampSite QA Lab** · slug `campsite-qa-lab`

**Default password (unless `CAMPSITE_QA_PASSWORD` overrides):** `CampSiteQA2026!`

**Persona quick reference (copy when logging in):**

| Label | Email |
| ----- | ----- |
| Org admin | `campsite-qa-orgadmin@example.com` |
| Jane (manager, Activities) | `campsite-qa-jane-trueman@example.com` |
| Darcey (staff, reports to Jane) | `campsite-qa-darcey-james@example.com` |
| Isla (Events) | `campsite-qa-isla-thorpe@example.com` |

**Seeded facts that matter:** HR records exist for Jane, Darcey, and Isla. Darcey reports to Jane (leave approval flow).

**How to use checkbox columns:** Check each micro-step as you complete it. At the bottom of each test, mark overall Pass/Fail and add notes. For **smoke** runs, you may skip tests not marked **[Smoke]**.

---

## Route index (bookmark or type in address bar)

| Area | URL path |
| ---- | -------- |
| HR directory | `/hr/records` |
| Employee file | `/hr/records/{userId}` |
| Org chart | `/hr/org-chart` |
| Leave (staff) | `/leave` |
| Leave (org) | `/hr/leave` |
| Performance (hub) | `/hr/performance` |
| Performance (staff) | `/performance` |
| Onboarding (hub) | `/hr/onboarding` |
| Onboarding (staff) | `/onboarding` |
| Recruitment | `/hr/recruitment` |
| Jobs | `/hr/jobs` |
| Applications | `/hr/applications` |
| Interviews | `/hr/interviews` |
| Offer templates | `/hr/offer-templates` |

---

## Automated checks (optional  not a substitute for UI)

These validate wiring/policy in-repo; run from machine with Node and deps installed.

### TC-INFRA-001  HR routes respond when unauthenticated (no 5xx)

**Goal:** Unauthenticated requests hit HR-related paths and get a login redirect, not a server error.

**Where:** Local base URL from `NEXT_PUBLIC_SITE_URL` (example: `http://127.0.0.1:3000`). Dev server must be running.

**Paths to probe (each should redirect toward login, typically HTTP 307/302):**

- [ ] `GET /hr/records`
- [ ] `GET /hr/org-chart`
- [ ] `GET /leave`
- [ ] `GET /hr/leave`
- [ ] `GET /hr/performance`
- [ ] `GET /performance`
- [ ] `GET /hr/onboarding`
- [ ] `GET /onboarding`
- [ ] `GET /hr/recruitment`
- [ ] `GET /hr/jobs`
- [ ] `GET /hr/applications`
- [ ] `GET /hr/interviews`
- [ ] `GET /hr/offer-templates`

**Expected:** No `500` / blank error page; browser or `curl -I` shows redirect to `/login?next=…` (or equivalent).

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________ **Notes:** ________________________________

---

### TC-AUTO-DEPT-ISO  Department isolation policy unit tests (Jest)

**Goal:** `departmentIsolationPolicy` helpers behave (overlap, org-admin bypass, manager mask primitives).

**Command (from `apps/web`):** `npm test -- --testPathPatterns=departmentIsolationPolicy`

- [ ] Command completes with exit code 0
- [ ] Test output shows all tests in that file passed

**Overall:** ☐ Pass ☐ Fail ☐ Skipped **Date:** _______________ **Tester:** _______________ **Notes:** ________________________________

---

<div style="page-break-after: always;"></div>

## Section 1  HR directory and employee records

**Section goal:** HR sees people overview; employee file opens correctly; edits only when policy allows.

### TC-HR-1.1  Org admin: full directory **[Smoke]**

**Persona:** Org admin  `campsite-qa-orgadmin@example.com`  
**Primary URL:** `/hr/records` (or HR nav → Employee records)

**Steps**

- [ ] Log out any other session; log in as **Org admin** with the QA password
- [ ] Confirm you are in org **CampSite QA Lab** (or expected QA org)
- [ ] Open `/hr/records` from the address bar **or** sidebar **HR** → employee records
- [ ] **Expected:** Page loads with **no** error screen, **no** unhandled blank content
- [ ] **Expected:** A **list** of members (or empty state only if truly no data  unlikely after seed)
- [ ] **Expected:** If the UI shows **summary / stats** (counts, etc.), they render without layout break
- [ ] If search exists: enter a short query that should match someone (e.g. part of a seeded name)
- [ ] **Expected:** Search does **not** break the page; results update or show “none” clearly
- [ ] If filters exist: apply one filter (e.g. department or role if offered); clear or reset if offered
- [ ] **Expected:** Filter interaction does **not** crash; list updates or shows empty state sensibly
- [ ] Click a **person’s name** or an explicit **Open / View** control on a row
- [ ] **Expected:** Navigation goes to an employee file URL shaped like `/hr/records/{userId}` (UUID or id per product)
- [ ] Return to directory (back link or `/hr/records`) so the next test starts from the list

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  
________________________________________________________________________________  

---

### TC-HR-1.2  Org admin: open an employee file (Darcey) **[Smoke]**

**Persona:** Org admin  `campsite-qa-orgadmin@example.com`  
**Primary URL:** `/hr/records` then open **Darcey James** (seeded staff)

**Steps**

- [ ] Still logged in as **Org admin**
- [ ] Open `/hr/records`
- [ ] Locate **Darcey** in the list (search/filter if helpful)
- [ ] Open Darcey’s row (name link or action) so URL is `/hr/records/{darceyUserId}`
- [ ] **Expected:** File page **loads** without permission error for org admin
- [ ] **Expected:** Employment / HR fields visible (contract-style info, dates, job title, etc.  whatever the product shows)
- [ ] Scroll the full page; confirm **no** partial render or missing sections that look like a failed load
- [ ] If an **audit** or **change history** block exists: open or expand it
- [ ] **Expected:** Section loads **or** shows an explicit empty / “no history” state  **not** stack trace or generic error
- [ ] **Optional:** If editable fields exist, change one **non-critical** field (e.g. internal note) and save
- [ ] **Expected:** Save **succeeds** with confirmation **or** a **clear validation** message (not silent failure / stuck spinner)

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  
________________________________________________________________________________  

---

### TC-HR-1.3  Jane (manager): scoped directory **[Smoke]**

**Persona:** Jane  `campsite-qa-jane-trueman@example.com`  
**Primary URL:** `/hr/records`

**Steps**

- [ ] Log out; log in as **Jane** with QA password
- [ ] Confirm org **CampSite QA Lab**
- [ ] Open `/hr/records`
- [ ] **Expected:** Page loads without error
- [ ] **Expected:** List reflects **only** people Jane is allowed to see (dept / hierarchy  usually **not** entire org)
- [ ] **Expected:** **Darcey** appears (same dept / report line per seed)
- [ ] Open **Darcey**’s file from the list
- [ ] **Expected:** File loads
- [ ] **Expected:** If Jane is **view-only**, edit/save controls are absent or disabled
- [ ] **Expected:** If Jane **can** edit per policy, edits (if any) behave consistently with org rules (save or validation, not silent fail)

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  
________________________________________________________________________________  

---

### TC-HR-1.4  Org admin: member missing HR record (optional deep)

**Persona:** Org admin  `campsite-qa-orgadmin@example.com`  
**Primary URL:** `/hr/records`

**Steps**

- [ ] Log in as **Org admin**
- [ ] Open `/hr/records`
- [ ] If UI offers filter for **missing HR record** (or similar): enable it and pick someone listed
- [ ] If no filter: manually find a member you know has **no** HR file (from seed notes or admin tools)
- [ ] Open that member’s row / file
- [ ] **Expected:** Clear **empty state** with **Create** HR file (or equivalent wizard entry)
- [ ] Complete minimal **create** flow per product
- [ ] **Expected:** After save, member shows as **having** an HR record (directory badge or revisit file shows data)

**Overall:** ☐ Pass ☐ Fail ☐ N/A (no missing-record path in UI)  
**Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

<div style="page-break-after: always;"></div>

## Section 2  Org chart

**Section goal:** Reporting lines match seed; manager masking does not leak names where forbidden.

### TC-HR-2.1  Org admin: full tree **[Smoke]**

**Persona:** Org admin  `campsite-qa-orgadmin@example.com`  
**Primary URL:** `/hr/org-chart`

**Steps**

- [ ] Log in as **Org admin**
- [ ] Open `/hr/org-chart` (HR nav or direct URL)
- [ ] **Expected:** Chart **renders** (nodes and edges or equivalent), not infinite loading
- [ ] **Expected:** Top of tree consistent with seed (e.g. **James Hann** as CEO or your seeded root)
- [ ] Locate **Jane** (Activities / SLT as seeded)
- [ ] **Expected:** **Darcey** appears under Jane’s branch if `reports_to` was seeded that way
- [ ] If pan / zoom / collapse exists: use each once
- [ ] **Expected:** No broken UI; open devtools console optionally  note any **errors** in notes if seen

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-2.2  Jane: scoped chart **[Smoke]**

**Persona:** Jane  `campsite-qa-jane-trueman@example.com`  
**Primary URL:** `/hr/org-chart`

**Steps**

- [ ] Log in as **Jane**
- [ ] Open `/hr/org-chart`
- [ ] **Expected:** Chart loads; structure is **coherent** for people Jane may see
- [ ] **Optional:** If any node shows **masked** manager (hidden label): read surrounding labels on same page
- [ ] **Expected:** Restricted manager name does **not** appear elsewhere on the page (tooltip, list, sidebar)

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

<div style="page-break-after: always;"></div>

## Section 3  Leave (time off)

**Section goal:** Staff submit; manager approves direct reports; status visible to submitter; outsiders cannot approve wrong people.

### TC-HR-3.1  Darcey: submit leave **[Smoke]**

**Persona:** Darcey  `campsite-qa-darcey-james@example.com`  
**Primary URL:** `/leave`

**Steps**

- [ ] Log in as **Darcey**
- [ ] Open `/leave` (or **Time off** from HR/staff nav if shown)
- [ ] **Expected:** Leave hub loads without error
- [ ] Start **new request** flow
- [ ] Choose **future** start/end dates (no accidental past-only validation failure)
- [ ] Choose leave **type** if the form requires it
- [ ] Enter a short **reason / note** if optional field exists
- [ ] Submit the request
- [ ] **Expected:** Request appears as **pending** (or equivalent status)
- [ ] **Expected:** **Single** row for this submission (unless you intentionally submitted twice)
- [ ] Note approximate **time** and **date range** for approver test: _______________

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-3.2  Jane: approve Darcey’s leave **[Smoke]**

**Persona:** Jane  `campsite-qa-jane-trueman@example.com`  
**Primary URL:** `/leave` or manager approvals surface (follow product nav)

**Steps**

- [ ] Log in as **Jane**
- [ ] Open the screen where **pending approvals** or **team leave** appears
- [ ] **Expected:** **Darcey**’s pending request from TC-HR-3.1 is **visible**
- [ ] Open detail if needed; choose **Approve**
- [ ] Confirm any confirmation dialog if shown
- [ ] **Expected:** Request moves to **approved** OR leaves pending list with clear **history** / status elsewhere

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-3.3  Darcey: sees approved outcome

**Persona:** Darcey  `campsite-qa-darcey-james@example.com`  
**Primary URL:** `/leave`

**Steps**

- [ ] Log in as **Darcey** again
- [ ] Open `/leave`
- [ ] Locate the request approved in TC-HR-3.2
- [ ] **Expected:** Status shows **approved** (or equivalent label)

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-3.4  Isla: cannot approve Jane’s leave (negative)

**Persona:** Isla  `campsite-qa-isla-thorpe@example.com`

**Steps**

- [ ] Log in as **Isla**
- [ ] Navigate to the same **approvals / team leave** areas used in TC-HR-3.2
- [ ] Search or scroll for **Jane** as approvable report
- [ ] **Expected:** Jane does **not** appear as someone Isla can approve **or** no approval powers for that relationship
- [ ] **Expected:** No UI path to approve Jane’s leave without authorization

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-3.5  Org admin: org-wide leave view (if present)

**Persona:** Org admin  `campsite-qa-orgadmin@example.com`  
**Primary URL:** `/hr/leave`

**Steps**

- [ ] Log in as **Org admin**
- [ ] Open `/hr/leave` if link exists in HR nav (if missing, note N/A)
- [ ] **Expected:** Broader list or allowance tools load
- [ ] **Expected:** No crash / white screen

**Overall:** ☐ Pass ☐ Fail ☐ N/A **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

<div style="page-break-after: always;"></div>

## Section 4  Performance reviews

**Section goal:** Cycles manageable at hub; staff see self; managers see team within scope.

### TC-HR-4.1  Org admin: cycles hub **[Smoke]**

**Persona:** Org admin  `campsite-qa-orgadmin@example.com`  
**Primary URL:** `/hr/performance`

**Steps**

- [ ] Log in as **Org admin**
- [ ] Open `/hr/performance`
- [ ] **Expected:** List or hub loads without error
- [ ] If list is **empty**: use UI to **create cycle** (name + dates as required)
- [ ] **Expected:** After create, cycle appears in list
- [ ] Open the cycle → URL should resemble `/hr/performance/{cycleId}`
- [ ] **Expected:** Detail page loads

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-4.2  Darcey: own performance **[Smoke]**

**Persona:** Darcey  `campsite-qa-darcey-james@example.com`  
**Primary URL:** `/performance`

**Steps**

- [ ] Log in as **Darcey**
- [ ] Open `/performance`
- [ ] **Expected:** Page loads
- [ ] **Expected:** You see **your** review items **or** a helpful **empty state** (next steps)
- [ ] **Expected:** Not a raw **permission denied** unless Darcey truly has no access by design

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-4.3  Jane: team / direct reports

**Persona:** Jane  `campsite-qa-jane-trueman@example.com`  
**Primary URL:** `/performance` (+ cycle detail if needed)

**Steps**

- [ ] Log in as **Jane**
- [ ] Open `/performance`
- [ ] Navigate to **Darcey**’s review if the product exposes a manager path
- [ ] **Expected:** Darcey’s review opens if policy allows managers to act
- [ ] Attempt to open a **non-report** peer’s review (someone outside Jane’s scope)
- [ ] **Expected:** No access, redirect, or empty  **not** full content for arbitrary org members

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

<div style="page-break-after: always;"></div>

## Section 5  Onboarding

**Section goal:** Templates and runs work; assignee completes tasks; admin sees progress.

### TC-HR-5.1  Org admin: templates and runs **[Smoke]**

**Persona:** Org admin  `campsite-qa-orgadmin@example.com`  
**Primary URL:** `/hr/onboarding`

**Steps**

- [ ] Log in as **Org admin**
- [ ] Open `/hr/onboarding`
- [ ] **Expected:** Hub loads
- [ ] If **no template**: create one (title + **at least one** task)
- [ ] **Start a run** (or assign run) for **Darcey** per product flow
- [ ] **Expected:** Run appears in a list
- [ ] Open run detail: `/hr/onboarding/{runId}`
- [ ] **Expected:** Tasks visible on run page

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Run ID or URL (for TC-HR-5.2):** ________________________________________________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-5.2  Darcey: complete a task; admin sees progress **[Smoke]**

**Personas:** Darcey then Org admin

**Steps**

- [ ] Log in as **Darcey**
- [ ] Open `/onboarding`
- [ ] **Expected:** Run from TC-HR-5.1 is **visible**
- [ ] **Complete one task** (checkbox, form submit, etc.)
- [ ] **Expected:** UI shows task done or progress updated locally
- [ ] Log out; log in as **Org admin**
- [ ] Open the **same** run: `/hr/onboarding/{runId}`
- [ ] **Expected:** Progress reflects Darcey’s completion (percentage, checklist, or task status)

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

<div style="page-break-after: always;"></div>

## Section 6  Recruitment (pipeline)

**Section goal:** Request → approval → job → applications/interviews. **Recruitment is not fully pre-seeded:** run setup once per fresh DB.

### TC-HR-6.0  One-time recruitment setup **[Smoke for recruitment]**

**Persona:** Org admin  `campsite-qa-orgadmin@example.com`

**Steps**

- [ ] Log in as **Org admin**
- [ ] Open `/hr/recruitment`
- [ ] **Create** a recruitment **request** (title, department, fields as required)
- [ ] **Submit** form; resolve validation if any
- [ ] **Approve** the request (same user if allowed; otherwise use second approver per workflow)
- [ ] Open `/hr/jobs`
- [ ] **Create job** linked to the **approved** request
- [ ] **Expected:** Job saves; appears in jobs list
- [ ] **Record job URL or ID** here: ________________________________________________

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-6.1  Job listings **[Smoke]**

**Persona:** Org admin  `campsite-qa-orgadmin@example.com`  
**Primary URL:** `/hr/jobs`

**Steps**

- [ ] Log in as **Org admin**
- [ ] Open `/hr/jobs`
- [ ] **Expected:** Test job from TC-HR-6.0 appears
- [ ] Open **Edit** for that job
- [ ] **Expected:** URL like `/hr/jobs/{id}/edit` loads without error

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-6.2  Applications pipeline

**Primary URL:** `/hr/applications` or `/hr/jobs/{id}/applications`

**Steps**

- [ ] Log in as **Org admin**
- [ ] Open applications view from hub or job row
- [ ] **Expected:** Table or pipeline loads
- [ ] If test applications exist: try **stage** change
- [ ] If product allows **add candidate**: add one; otherwise note N/A

**Overall:** ☐ Pass ☐ Fail ☐ N/A **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-6.3  Interviews

**Primary URL:** `/hr/interviews`

**Steps**

- [ ] Log in as **Org admin**
- [ ] Open `/hr/interviews`
- [ ] **Expected:** Schedule loads **or** explicit empty state
- [ ] If **create slot / book** exists: run minimally
- [ ] **Expected:** No HTTP 500 / error boundary

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-6.4  Offer templates

**Primary URLs:** `/hr/offer-templates`, `/hr/offer-templates/new`, `/hr/offer-templates/{id}/edit`

**Steps**

- [ ] Log in as **Org admin**
- [ ] Open `/hr/offer-templates`
- [ ] **Expected:** List loads
- [ ] Open **new** template route
- [ ] **Expected:** `/hr/offer-templates/new` loads
- [ ] If you have an existing template id: open edit
- [ ] **Expected:** `/hr/offer-templates/{id}/edit` loads

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

<div style="page-break-after: always;"></div>

## Section 7  Department isolation (HR data)

**Section goal:** Events user (Isla) must not see Activities-only sensitive rows/paths that Jane sees, per isolation rules.

### TC-HR-7.1  Compare Jane vs Isla on directory **[Smoke]**

**Personas:** Jane, then Isla  
**Primary URL:** `/hr/records`

**Steps**

- [ ] Log in as **Jane**
- [ ] Open `/hr/records`
- [ ] On paper or notes: list **2–3 Activities-only** names visible (colleagues not in Events):  
  1. ____________________ 2. ____________________ 3. ____________________
- [ ] Log out; log in as **Isla**
- [ ] Open `/hr/records`
- [ ] **Expected:** Directory **differs** from Jane’s: Isla should **not** see those Activities-only people **if** isolation rules require it
- [ ] If Isla sees **whole org**: record whether that matches **product intent** or file a bug
- [ ] **Optional:** As Jane, copy `/hr/records/{activitiesMemberUserId}` for someone Isla should not see
- [ ] Log in as **Isla**; paste URL in browser
- [ ] **Expected:** **Blocked**, redirect, or sanitized view  **not** full salary/contract for out-of-scope member

**Overall:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

<div style="page-break-after: always;"></div>

## Section 8  Security-sensitive HR-adjacent checks

Run after happy paths above.

### TC-HR-8-A  Jane cannot override Isla incorrectly

**Persona:** Jane  `campsite-qa-jane-trueman@example.com`

**Steps**

- [ ] Log in as **Jane**
- [ ] Open **Admin → All members** (or equivalent member directory)
- [ ] Find **Isla Thorpe**
- [ ] Open member detail; locate **permission overrides** (or role overrides) if present
- [ ] Attempt an override that should be **denied** because Isla is **not** Jane’s report
- [ ] **Expected:** Action **denied** or control **hidden**; **not** silent success

**Overall:** ☐ Pass ☐ Fail ☐ N/A **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-8-B  Jane cannot assign over-privileged role

**Persona:** Jane  `campsite-qa-jane-trueman@example.com`

**Steps**

- [ ] Log in as **Jane**
- [ ] Navigate to **role assignment** for a member Jane **can** manage (e.g. direct report)
- [ ] Attempt to assign a **higher** role than policy allows (e.g. org_admin if disallowed)
- [ ] **Expected:** Clear **error** or blocked UI; **not** success

**Overall:** ☐ Pass ☐ Fail ☐ N/A **Date:** _______________ **Tester:** _______________

**Notes / bugs / screenshot refs:**  
________________________________________________________________________________  

---

### TC-HR-8-C  Invites / hiring RBAC (cross-check doc)

**Steps**

- [ ] Open `docs/RBAC_SECURITY_REVIEW.md` in repo (or printed excerpt)
- [ ] For each **invite** capability you test in staging: record **who** may invite and **which** roles they may set
- [ ] **Expected:** Matches documented policy until known gaps are closed

**Overall:** ☐ Pass ☐ Fail ☐ Skipped **Date:** _______________ **Tester:** _______________

**Notes:**  
________________________________________________________________________________  

---

## Smoke run  master checklist (tick when entire case passed)

Use this page for a **~20 minute** smoke pass (**[Smoke]** only).

- [ ] TC-INFRA-001 (optional)
- [ ] TC-AUTO-DEPT-ISO (optional)
- [ ] TC-HR-1.1
- [ ] TC-HR-1.2
- [ ] TC-HR-1.3
- [ ] TC-HR-2.1
- [ ] TC-HR-2.2
- [ ] TC-HR-3.1
- [ ] TC-HR-3.2
- [ ] TC-HR-4.1
- [ ] TC-HR-4.2
- [ ] TC-HR-5.1
- [ ] TC-HR-5.2
- [ ] TC-HR-6.0 (if testing recruitment)
- [ ] TC-HR-6.1 (if recruitment)
- [ ] TC-HR-7.1

**Smoke sign-off:** ☐ Pass ☐ Fail **Date:** _______________ **Tester:** _______________ **Build/branch:** _______________

---

## Regression summary (optional)

| Date | Tester | Build / branch | Smoke pass? | Full pass? | Failed TC IDs |
| ---- | ------ | -------------- | ----------- | ---------- | ------------- |
| | | | ☐ | ☐ | |

---

## Source

Detailed narrative reference: [`HR_MANUAL_TEST_SCENARIOS.md`](HR_MANUAL_TEST_SCENARIOS.md) · Setup: [`QA_SEED_AND_SCENARIOS.md`](QA_SEED_AND_SCENARIOS.md)
