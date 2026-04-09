# HR manual test scenarios (detailed)

Step-by-step checks for CampSite’s HR area. Written for **manual QA** after `**npm run seed-qa-full`** — see `[QA_SEED_AND_SCENARIOS.md](QA_SEED_AND_SCENARIOS.md)` for setup, migrations, and troubleshooting.

**Default password (unless overridden):** `CampSiteQA2026!`  
**QA org:** `campsite-qa-lab` — **CampSite QA Lab**

---

## How to use this document


| Mode      | Time    | What to do                                                                 |
| --------- | ------- | -------------------------------------------------------------------------- |
| **Smoke** | ~20 min | Run only the lines marked **[Smoke]** in each section (one path per area). |
| **Full**  | ~2–3 hr | Complete every numbered step; fill in **Pass / Fail / Notes** as you go.   |


**Tip:** Finish one area before switching accounts so you stay oriented. When steps say “open HR,” use the sidebar **HR** links or go directly to the URL shown.

---

## Personas (who logs in for what)


| Label                 | Email                                  | Use for                                                                                             |
| --------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Org admin**         | `campsite-qa-orgadmin@example.com`     | Full HR directory, all employee files, recruitment admin, onboarding admin, org-wide leave if shown |
| **Jane (manager)**    | `campsite-qa-jane-trueman@example.com` | **Activities** manager; Darcey’s line manager; scoped HR views                                      |
| **Darcey (staff)**    | `campsite-qa-darcey-james@example.com` | **Activities**; reports to Jane — leave submit, own performance/onboarding                          |
| **Isla (other dept)** | `campsite-qa-isla-thorpe@example.com`  | **Events** — isolation checks vs Activities                                                         |


Seeded context that matters for HR:

- Sample **HR records** exist for **Jane, Darcey, and Isla** (after seed).
- **Darcey** reports to **Jane** (leave approval tests).

---

## 1. HR directory & employee records

**Goal:** HR can see the people overview; opening a person shows the right file; edits only when allowed.

### 1.1 Org admin — full directory **[Smoke]**

1. Log in as **Org admin**.
2. Open `**/hr/records`** (or **Employee records** in the HR section).
3. **Expect:** Page loads without error. You see a list of members and summary-style stats (if shown).
4. **Expect:** You can filter or search (if the UI offers it) without the page breaking.
5. **Expect:** Rows link to individual employee files (names or “open” actions work).

**Pass / Fail / Notes:** _______________

### 1.2 Org admin — open an employee file **[Smoke]**

1. Still as **Org admin**, open **Darcey**’s file from the directory (path will look like `**/hr/records/darceys-user-id`** — use the link from the list).
2. **Expect:** File loads. You see employment / HR fields (contract-style info, dates, etc. as built).
3. If an **audit / history** section exists for changes, **expect:** it loads or shows “none” — not an error.
4. **Optional:** Change a non-critical field **if** the UI allows save — **expect:** save succeeds or you see a clear validation message (not a blank failure).

**Pass / Fail / Notes:** _______________

### 1.3 Jane (manager) — scoped directory **[Smoke]**

1. Log out. Log in as **Jane**.
2. Open `**/hr/records`**.
3. **Expect:** Page loads. The list should reflect **people Jane is allowed to see** (typically her dept / hierarchy — **not necessarily every person in the org**).
4. **Expect:** **Darcey** appears (same department / report).
5. Open **Darcey**’s file.
6. **Expect:** File loads. If Jane is view-only, **expect:** no edit controls (or disabled save). If she can manage records for visible people, editing behavior should match your policy.

**Pass / Fail / Notes:** _______________

### 1.4 Member missing an HR record (optional deep check)

1. As **Org admin**, pick someone in the directory who shows **no HR record** (filter “missing” if available).
2. Open their row / file.
3. **Expect:** You can **create** the HR file (or see a clear empty state with a **Create** action). Completing the flow leaves them as “has record.”

**Pass / Fail / Notes:** _______________

---

## 2. Org chart

**Goal:** Reporting lines match setup; sensitive masking behaves when a viewer cannot see a manager.

### 2.1 Org admin — full tree **[Smoke]**

1. Log in as **Org admin**.
2. Open `**/hr/org-chart`**.
3. **Expect:** Chart renders. **James Hann** (CEO from seed) or top-level structure appears consistent with seed.
4. **Expect:** **Jane** appears under Activities / SLT as seeded; **Darcey** under Jane’s branch if that’s how `reports_to` was seeded.
5. Pan/zoom/collapse (if any) works without console errors.

**Pass / Fail / Notes:** _______________

### 2.2 Jane — scoped chart **[Smoke]**

1. Log in as **Jane**.
2. Open `**/hr/org-chart`**.
3. **Expect:** Chart loads. You still see a coherent tree for people you’re allowed to see.
4. **Optional:** If a node is **masked** (hidden manager name), **expect:** the UI doesn’t leak the restricted name elsewhere on the same page.

**Pass / Fail / Notes:** _______________

---

## 3. Leave (time off)

**Goal:** Staff submit; manager approves direct reports; statuses stay in sync.

### 3.1 Darcey — submit leave **[Smoke]**

1. Log in as **Darcey**.
2. Open `**/leave`** (or **Time off** from staff HR tabs if shown).
3. **Expect:** Leave page loads.
4. Submit a **new request** (pick future dates, type if asked, add a short note).
5. **Expect:** Request appears in “pending” or equivalent; no duplicate rows unless you submitted twice.

**Pass / Fail / Notes:** _______________

### 3.2 Jane — approve Darcey’s leave **[Smoke]**

1. Log in as **Jane**.
2. Open `**/leave`** or the **manager / team** view where approvals live (follow product navigation).
3. **Expect:** You see **Darcey**’s pending request.
4. **Approve** it.
5. **Expect:** Status updates to approved (or disappears from pending with clear history).

**Pass / Fail / Notes:** _______________

### 3.3 Darcey — sees outcome

1. Log in as **Darcey** again.
2. Open `**/leave`**.
3. **Expect:** The request shows **approved** (or equivalent).

**Pass / Fail / Notes:** _______________

### 3.4 Negative — Isla cannot approve Jane’s requests (quick)

1. Log in as **Isla**.
2. Try to find **Jane**’s leave to approve (same screens as above).
3. **Expect:** **No** approval power over Jane, or **Jane** does not appear as an approvable report.

**Pass / Fail / Notes:** _______________

### 3.5 Org-wide leave (if your role shows it)

1. Log in as **Org admin**.
2. Open `**/hr/leave`** if present in HR nav.
3. **Expect:** Broader list or allowance tools load; no crash.

**Pass / Fail / Notes:** _______________

---

## 4. Performance reviews

**Goal:** Cycles exist or can be created; staff see own items; managers see team where allowed.

### 4.1 Org admin — cycles hub **[Smoke]**

1. Log in as **Org admin**.
2. Open `**/hr/performance`**.
3. **Expect:** List loads. If **empty**, use the UI to **create a cycle** (name + dates as required).
4. **Expect:** After create, the new cycle appears in the list and opens to a detail page `**/hr/performance/{cycleId}`**.

**Pass / Fail / Notes:** _______________

### 4.2 Darcey — own performance **[Smoke]**

1. Log in as **Darcey**.
2. Open `**/performance`**.
3. **Expect:** Page loads; you see **your** review(s) or an empty state that explains next steps (not a permission error unless Darcey truly has no access).

**Pass / Fail / Notes:** _______________

### 4.3 Jane — team / direct reports

1. Log in as **Jane**.
2. Open `**/performance`** (and cycle detail if needed).
3. **Expect:** You can open or act on **Darcey**’s review **if** the product gives managers that path; you **cannot** open arbitrary non-reports’ reviews.

**Pass / Fail / Notes:** _______________

---

## 5. Onboarding

**Goal:** Templates and runs work; assignees can complete tasks.

### 5.1 Org admin — templates & runs **[Smoke]**

1. Log in as **Org admin**.
2. Open `**/hr/onboarding`**.
3. **Expect:** Hub loads. If no template exists, **create** one (minimal: title + one task).
4. **Start a run** for **Darcey** (or assign a run if that’s the flow).
5. **Expect:** Run appears in a list; opening `**/hr/onboarding/{runId}`** shows tasks.

**Pass / Fail / Notes:** _______________

### 5.2 Darcey — complete a task **[Smoke]**

1. Log in as **Darcey**.
2. Open `**/onboarding`**.
3. **Expect:** Assigned run visible.
4. **Complete** one task (checkbox / form as built).
5. Log back in as **Org admin**, open the same run.
6. **Expect:** Progress reflects Darcey’s completion.

**Pass / Fail / Notes:** _______________

---

## 6. Recruitment (pipeline)

**Goal:** Request → approval → job → applications/interviews — in order. The QA seed does **not** auto-create listings; **do the setup block once** per fresh DB.

### 6.0 One-time setup (Org admin) **[Smoke for recruitment]**

1. Log in as **Org admin**.
2. Open `**/hr/recruitment`**.
3. **Create** a recruitment **request** (role title, department, etc. as the form asks).
4. **Approve** that request (same user if your workflow allows, or second approver if required).
5. Open `**/hr/jobs`** → **Create job** tied to the **approved** request.
6. **Expect:** Job saves and appears in listings. **Note the job ID** in the URL if you need it for applications.

**Pass / Fail / Notes:** _______________

### 6.1 Job listings **[Smoke]**

1. As **Org admin**, open `**/hr/jobs`**.
2. **Expect:** Your test job appears; **edit** opens `**/hr/jobs/{id}/edit`** without error.

**Pass / Fail / Notes:** _______________

### 6.2 Applications pipeline

1. Open `**/hr/applications`** (or `**/hr/jobs/{id}/applications**` from the job).
2. **Expect:** Pipeline / table loads; stages can be changed if you have test applications (add a test candidate if your product allows).

**Pass / Fail / Notes:** _______________

### 6.3 Interviews

1. Open `**/hr/interviews`**.
2. **Expect:** Schedule loads or empty state; **create slot / book** flows work without 500 errors.

**Pass / Fail / Notes:** _______________

### 6.4 Offer templates

1. Open `**/hr/offer-templates`**.
2. **Expect:** List loads; **new** and **edit** routes work `**/hr/offer-templates/new`**, `**/hr/offer-templates/{id}/edit**`.

**Pass / Fail / Notes:** _______________

---

## 7. Department isolation (HR data)

**Goal:** Someone in **Events** must not see **Activities-only** sensitive HR directory rows that Jane sees.

### 7.1 Compare Jane vs Isla on directory **[Smoke]**

1. Log in as **Jane**. Open `**/hr/records`**. **Note** whether certain Activities-only names appear (e.g. colleagues only in Activities).
2. Log out. Log in as **Isla**.
3. Open `**/hr/records`**.
4. **Expect:** List differs: Isla should **not** see Activities-only people **if** your isolation rules say so. If she sees the **whole org**, document that as product intent or bug.
5. Try to open a **deep link** to an Activities member’s file (copy URL while Jane if you need a user id — optional).
6. **Expect:** Isla is **blocked**, redirected, or sees empty — **not** full salary/contract for someone outside scope.

**Pass / Fail / Notes:** _______________

---

## 8. Security-sensitive HR-adjacent checks

Run these after the happy paths.


| #   | Step                                                                              | Expect                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Jane** → **Admin → All members** → find **Isla** → try **permission overrides** | **Cannot** override Isla if Isla is **not** Jane’s report (subordinate-only).                                                                                                   |
| B   | **Jane** → role assignment for a member                                           | Cannot assign a **higher** role than policy allows — clear error.                                                                                                               |
| C   | **Invites** (if you test hiring): anyone with **invite** power                    | See `[RBAC_SECURITY_REVIEW.md](RBAC_SECURITY_REVIEW.md)` — validate **who** may invite and **which** roles they may set in real life until the documented invite gap is closed. |


**Pass / Fail / Notes:** _______________

---

## Quick route index (bookmark)


| Area                | Typical URL            |
| ------------------- | ---------------------- |
| HR directory        | `/hr/records`          |
| Employee file       | `/hr/records/{userId}` |
| Org chart           | `/hr/org-chart`        |
| Leave (staff)       | `/leave`               |
| Leave (org view)    | `/hr/leave`            |
| Performance (hub)   | `/hr/performance`      |
| Performance (staff) | `/performance`         |
| Onboarding (hub)    | `/hr/onboarding`       |
| Onboarding (staff)  | `/onboarding`          |
| Recruitment         | `/hr/recruitment`      |
| Jobs                | `/hr/jobs`             |
| Applications        | `/hr/applications`     |
| Interviews          | `/hr/interviews`       |
| Offer templates     | `/hr/offer-templates`  |


---

## Regression log (optional)


| Date | Tester | Build / branch | Smoke pass? | Full pass? | Failed scenarios |
| ---- | ------ | -------------- | ----------- | ---------- | ---------------- |
|      |        |                | ☐           | ☐          |                  |


