# Campsite  Access Levels & Permissions Specification
### Version 2.0  Updated with role × department broadcast stacking

---

## Core Permission Model

Campsite uses a *two-layer permission system*:


Final permission = Role baseline  +  Department toggles


- *Role baseline*  what you can always do, regardless of department
- *Department toggles*  additional powers the Org Admin unlocks per department

Both layers stack. An HR Manager gets their Manager baseline PLUS whatever the HR department has been granted. An Engagement Coordinator gets their Coordinator baseline but nothing extra, because Engagement hasn't been given additional toggles.

This means the same role behaves differently in different departments  intentionally.

---

## Role Hierarchy

| Role | Scope | Approves |
|---|---|---|
| CGS Founder | All orgs  platform level | Org Admins |
| Org Admin | Full org | Managers |
| Manager | Assigned dept(s) | Coordinators |
| Coordinator | Assigned dept | Administrators, DMs, CSAs |
| Administrator | Own data |  |
| Duty Manager | Own data + QR scanning |  |
| CSA | Own data |  |

> *White-label note:* "Duty Manager" and "CSA" are USSU-specific display names. In the white-label system these are configurable per org via org_role_labels. The underlying permission codes duty_manager and csa remain fixed.

---

## Broadcast Permissions in Full

### Role baseline (always applies, regardless of department)

| Permission | Org Admin | Manager | Coordinator | Administrator | Duty Manager | CSA |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| View broadcast feed | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Send to own department | ✓ | ✓ | ✓ | Draft only | Draft only | Draft only |
| Send without approval (own posts) | ✓ | ✓ | ✓ |  |  |  |
| Approve pending broadcasts | ✓ | ✓ (dept) |  |  |  |  |
| Delete own broadcasts | ✓ | ✓ | ✓ |  |  |  |
| Edit own broadcasts | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Schedule broadcasts | ✓ | ✓ | ✓ |  |  |  |

### Department toggles (Org Admin enables per department)

These are *off by default* for all departments. Org Admin turns them on per department. When enabled, they apply to the roles listed.

| Permission key | What it unlocks | Applies to |
|---|---|---|
| send_org_wide | Send broadcasts to the entire organisation (not just own dept). Still respects recipient subscription preferences unless marked mandatory. | Manager, Coordinator |
| send_no_approval | Coordinator's own broadcasts skip Manager approval and send directly | Coordinator only |
| edit_others_broadcasts | Edit broadcasts written by other users (any author, any dept) | Manager, Coordinator |
| delete_dept_broadcasts | Delete any broadcast within their own department, regardless of who wrote it | Manager, Coordinator |
| delete_org_broadcasts | Delete any broadcast across the entire organisation  the strongest moderation power | Manager only |
| pin_broadcasts | Pin a broadcast to the top of the feed for all subscribers | Manager only |
| mandatory_broadcast | Mark a broadcast as mandatory  delivered to all users in the target group regardless of their subscription preferences | Manager only |

### How they stack  concrete examples

*HR Manager* (HR dept has: send_org_wide, delete_org_broadcasts, edit_others_broadcasts, pin_broadcasts, mandatory_broadcast):
- Can send to entire org ✓ (role = Manager, dept = send_org_wide)
- Can delete any broadcast org-wide ✓ (role = Manager, dept = delete_org_broadcasts)
- Can edit others' broadcasts ✓ (dept toggle)
- Can pin broadcasts ✓ (dept toggle)
- Can send mandatory broadcasts ✓ (dept toggle)
- Can approve broadcast drafts ✓ (role baseline  Manager always approves)

*HR Coordinator* (same HR dept toggles):
- Can send to entire org ✓ (dept = send_org_wide, Coordinator eligible)
- Can delete org-wide ✗ (delete_org_broadcasts = Manager only, role not sufficient)
- Can edit others' broadcasts ✓ (dept toggle, Coordinator eligible)
- Can skip approval on own posts ✓ (dept = send_no_approval)
- Can pin broadcasts ✗ (pin_broadcasts = Manager only)
- Can approve others' drafts ✗ (role baseline  Coordinators never approve)

*Engagement Manager* (Engagement dept has no extra toggles):
- Can send to entire org ✗ (dept toggle not granted)
- Can delete org-wide ✗ (dept toggle not granted)
- Can send to own dept ✓ (role baseline)
- Can approve drafts from their dept ✓ (role baseline)

*Engagement Coordinator* (no dept toggles):
- Can send to own dept ✓ (role baseline)
- Everything else: role baseline only  no extra powers

### Org-wide broadcasts and subscription preferences

When a send_org_wide broadcast is sent:
- It is delivered to all users in the org by default
- *It still respects each user's subscription preferences*  if a user is unsubscribed from a category, they won't receive it
- Exception: if the sender has mandatory_broadcast enabled and marks the broadcast as mandatory  it bypasses subscriptions and is delivered to everyone
- Mandatory broadcasts are highlighted differently in the feed (a distinct visual treatment  e.g. a banner or pinned position)

---

## Full Permission Matrix  All Features

### Platform & organisation

| Feature | CGS Founder | Org Admin | Manager | Coordinator | Administrator | DM | CSA |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| View all orgs (platform-wide) | ✓ |  |  |  |  |  |  |
| Create / suspend orgs | ✓ |  |  |  |  |  |  |
| Org settings & branding | ✓ | ✓ |  |  |  |  |  |
| Grant dept broadcast toggles | ✓ | ✓ |  |  |  |  |  |
| Grant custom permissions to managers | ✓ | ✓ |  |  |  |  |  |

### Department & user management

| Feature | CGS Founder | Org Admin | Manager | Coordinator | Administrator | DM | CSA |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Create / edit / archive departments | ✓ | ✓ |  |  |  |  |  |
| Configure dept broadcast categories | ✓ | ✓ |  |  |  |  |  |
| Assign managers to departments | ✓ | ✓ |  |  |  |  |  |
| Approve / reject Managers | ✓ | ✓ |  |  |  |  |  |
| Approve / reject Coordinators | ✓ | ✓ | ✓ (dept) |  |  |  |  |
| Approve / reject Admins, DMs, CSAs | ✓ | ✓ | ✓ (dept) | ✓ (dept) |  |  |  |
| Add / remove / edit users | ✓ | ✓ | ✓ (dept) |  |  |  |  |
| View all users in org | ✓ | ✓ | ✓ (dept) | ✓ (dept) |  |  |  |

### Rota & scheduling

| Feature | CGS Founder | Org Admin | Manager | Coordinator | Administrator | DM | CSA |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| View full org rota | ✓ | ✓ |  |  |  |  |  |
| Manage dept rota (add/edit/delete) | ✓ | ✓ | ✓ (dept) | ✓ (dept) |  |  |  |
| Add own working hours |  |  |  |  | ✓ | ✓ |  |
| View own schedule |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Import from Google Sheets | ✓ | ✓ |  |  |  |  |  |

> CSAs cannot self-log hours  their shifts are managed by their Coordinator or Manager.

### Annual leave & holiday (full HR system)

| Feature | CGS Founder | Org Admin | Manager | Coordinator | Administrator | DM | CSA |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Configure accrual rules & carry-over | ✓ | ✓ |  |  |  |  |  |
| Approve / reject leave requests | ✓ | ✓ | ✓ (dept) |  |  |  |  |
| View all leave across org | ✓ | ✓ | ✓ (dept) |  |  |  |  |
| Submit own leave request |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| View own leave balance & history |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Discounts & vouchers

| Feature | CGS Founder | Org Admin | Manager | Coordinator | Administrator | DM | CSA |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Configure discount tiers (org-wide) | ✓ | ✓ |  |  |  |  |  |
| Create & issue vouchers / event codes | ✓ | ✓ | Toggle |  |  |  |  |
| Announce org-wide discount | ✓ | ✓ | Toggle |  |  |  |  |
| View & use own discount / QR card |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Scan & verify staff QR codes |  | ✓ | ✓ |  |  | ✓ |  |

> "Toggle" = enabled per individual manager by Org Admin only.

---

## Database Implementation

### Department broadcast toggles

sql
-- Broadcast permission toggles per department
CREATE TABLE dept_broadcast_permissions (
  dept_id     UUID REFERENCES departments(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL CHECK (permission IN (
                'send_org_wide',
                'send_no_approval',
                'edit_others_broadcasts',
                'delete_dept_broadcasts',
                'delete_org_broadcasts',
                'pin_broadcasts',
                'mandatory_broadcast'
              )),
  min_role    TEXT NOT NULL CHECK (min_role IN (
                'manager', 'coordinator'
              )),  -- some toggles are Manager-only
  granted_by  UUID REFERENCES profiles(id),
  granted_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (dept_id, permission)
);


### Permission resolution function

sql
-- Check if a user has a specific broadcast permission
CREATE OR REPLACE FUNCTION user_has_broadcast_permission(
  p_user_id UUID,
  p_permission TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
  v_dept_id UUID;
  v_has_perm BOOLEAN;
BEGIN
  -- Get user role
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;

  -- Org admin always has all permissions
  IF v_role = 'org_admin' THEN RETURN TRUE; END IF;

  -- Get user's primary department
  SELECT dept_id INTO v_dept_id
  FROM user_departments WHERE user_id = p_user_id LIMIT 1;

  -- Check if dept has this toggle AND user's role meets the min_role
  SELECT EXISTS (
    SELECT 1 FROM dept_broadcast_permissions dbp
    WHERE dbp.dept_id = v_dept_id
      AND dbp.permission = p_permission
      AND (
        (dbp.min_role = 'coordinator' AND v_role IN ('manager', 'coordinator'))
        OR
        (dbp.min_role = 'manager' AND v_role = 'manager')
      )
  ) INTO v_has_perm;

  RETURN v_has_perm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


### Broadcast table additions

sql
-- Add mandatory flag to broadcasts
ALTER TABLE broadcasts ADD COLUMN is_mandatory BOOLEAN DEFAULT FALSE;
ALTER TABLE broadcasts ADD COLUMN is_pinned    BOOLEAN DEFAULT FALSE;
ALTER TABLE broadcasts ADD COLUMN is_org_wide  BOOLEAN DEFAULT FALSE;


### RLS policy for broadcast deletion

sql
-- Users can delete a broadcast if:
-- 1. They created it (own broadcast)
-- 2. They have delete_dept_broadcasts for their dept AND the broadcast is in their dept
-- 3. They have delete_org_broadcasts (Manager in a dept with that toggle)
-- 4. They are Org Admin
CREATE POLICY "broadcast_delete" ON broadcasts FOR DELETE USING (
  -- Own broadcast
  created_by = auth.uid()
  OR
  -- Org Admin
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'org_admin'
  OR
  -- delete_dept_broadcasts: user has toggle AND broadcast is in their dept
  (
    user_has_broadcast_permission(auth.uid(), 'delete_dept_broadcasts')
    AND dept_id IN (SELECT dept_id FROM user_departments WHERE user_id = auth.uid())
  )
  OR
  -- delete_org_broadcasts: user has the org-wide delete toggle
  user_has_broadcast_permission(auth.uid(), 'delete_org_broadcasts')
);


### Role labels (white-label display names)

sql
CREATE TABLE org_role_labels (
  org_id        UUID REFERENCES organisations(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,   -- e.g. 'duty_manager'
  display_name  TEXT NOT NULL,   -- e.g. 'Shift Supervisor'
  PRIMARY KEY (org_id, role)
);


---

## Org Admin UI  Broadcast Permission Management

In the Org Admin dashboard under *Settings > Departments > [Department] > Broadcast Permissions*:

Each department has a toggle panel with the following options:


Department: HR

Broadcast permissions
─────────────────────────────────────────────────────────────
Send org-wide broadcasts
  Managers in this dept       [ON ]
  Coordinators in this dept   [ON ]

Skip approval (Coordinators)
  Coordinators send directly  [ON ]

Edit others' broadcasts
  Managers in this dept       [ON ]
  Coordinators in this dept   [ON ]

Delete broadcasts
  Within own dept             [ON ]  (Managers + Coordinators)
  Across entire org           [ON ]  (Managers only)

Pin broadcasts to feed        [ON ]  (Managers only)
Send mandatory broadcasts     [ON ]  (Managers only)
─────────────────────────────────────────────────────────────


Compare with:


Department: Engagement

Broadcast permissions
─────────────────────────────────────────────────────────────
Send org-wide broadcasts
  Managers in this dept       [OFF]
  Coordinators in this dept   [OFF]

Skip approval (Coordinators)
  Coordinators send directly  [OFF]

Edit others' broadcasts
  Managers in this dept       [OFF]
  Coordinators in this dept   [OFF]

Delete broadcasts
  Within own dept             [OFF]
  Across entire org           [OFF]

Pin broadcasts to feed        [OFF]
Send mandatory broadcasts     [OFF]
─────────────────────────────────────────────────────────────



---

Common Ground Studios Ltd  Campsite Permissions Spec v2.0