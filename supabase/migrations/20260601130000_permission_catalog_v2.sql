-- Permission catalog v2: production-grade granular capabilities.

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('members.create', 'Create members', 'Create members directly.', false),
  ('departments.view', 'View departments', 'View department structures.', false),
  ('departments.create', 'Create departments', 'Create departments.', false),
  ('departments.edit', 'Edit departments', 'Update/archive departments.', false),
  ('teams.view', 'View teams', 'View teams and assignments.', false),
  ('teams.create', 'Create teams', 'Create teams.', false),
  ('teams.edit', 'Edit teams', 'Update/archive teams.', false),
  ('broadcasts.view', 'View broadcasts', 'View broadcast feed and detail.', false),
  ('rota.create', 'Create rota', 'Create rota definitions.', false),
  ('rota.edit', 'Edit rota', 'Edit rota definitions and shifts.', false),
  ('discounts.view', 'View discounts', 'View discount rules and cards.', false),
  ('org.settings.view', 'View org settings', 'View organisation settings.', false),
  ('integrations.view', 'View integrations', 'View integrations status.', false),
  ('recruitment.view', 'View recruitment requests', 'View recruitment requests.', false),
  ('recruitment.create_request', 'Create recruitment requests', 'Raise recruitment requests.', false),
  ('recruitment.approve_request', 'Approve recruitment requests', 'Approve/reject recruitment requests.', false),
  ('jobs.view', 'View jobs', 'View job listings.', false),
  ('jobs.create', 'Create jobs', 'Create job listings from requests.', false),
  ('jobs.edit', 'Edit jobs', 'Edit job details and copy.', false),
  ('jobs.publish', 'Publish jobs', 'Publish jobs to public URL.', false),
  ('jobs.archive', 'Archive jobs', 'Archive job listings.', false),
  ('applications.view', 'View applications', 'View candidate applications.', false),
  ('applications.move_stage', 'Move application stage', 'Move candidates through hiring stages.', false),
  ('applications.notify_candidate', 'Notify candidates', 'Send candidate status messages/emails.', false),
  ('applications.add_internal_notes', 'Add internal notes', 'Add internal candidate notes.', false),
  ('offers.view', 'View offers', 'View generated offer letters.', false),
  ('offers.generate', 'Generate offers', 'Generate offer letters from templates.', false),
  ('offers.send_esign', 'Send e-sign offers', 'Send offer letters for e-signature.', false),
  ('offers.view_signed_pdf', 'View signed offer PDFs', 'Download signed offer PDFs.', false),
  ('interviews.view', 'View interviews', 'View interview schedule.', false),
  ('interviews.create_slot', 'Create interview slots', 'Create interview slots.', false),
  ('interviews.book_slot', 'Book interview slots', 'Book slots when scheduling candidates.', false),
  ('interviews.complete_slot', 'Complete interview slots', 'Mark interview slots as completed.', false)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description,
  is_founder_only = excluded.is_founder_only;

