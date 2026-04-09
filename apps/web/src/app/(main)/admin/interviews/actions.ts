'use server';

import {
  createInterviewSlotEventsForPanelists,
  deleteInterviewCalendarEvents,
  patchInterviewEventsBooked,
  patchInterviewEventsCompleted,
} from '@/lib/interviews/calendarTokens';
import { sendInterviewScheduledEmail } from '@/lib/recruitment/sendInterviewScheduledEmail';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { revalidatePath } from 'next/cache';

export type InterviewActionResult = { ok: true } | { ok: false; error: string };

function relOne<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

async function requireOrgPermission(permissionKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null as null, profile: null as null, orgId: null as null };

  const { data: profile } = await supabase.from('profiles').select('id, org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return { supabase, user, profile: null as null, orgId: null as null };
  }
  const { data: allowed } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: permissionKey,
    p_context: {},
  });
  if (!allowed) {
    return { supabase, user, profile: null as null, orgId: null as null };
  }

  return { supabase, user, profile, orgId: profile.org_id as string };
}

export type InterviewSlotRow = {
  id: string;
  job_listing_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

export async function listAvailableInterviewSlotsForJob(jobListingId: string): Promise<
  { ok: true; slots: InterviewSlotRow[] } | { ok: false; error: string }
> {
  const jid = jobListingId?.trim();
  if (!jid) return { ok: false, error: 'Missing job.' };

  const { supabase, orgId } = await requireOrgPermission('interviews.book_slot');
  if (!orgId) return { ok: false, error: 'Not allowed.' };

  const { data, error } = await supabase
    .from('interview_slots')
    .select('id, job_listing_id, title, starts_at, ends_at, status')
    .eq('org_id', orgId)
    .eq('job_listing_id', jid)
    .eq('status', 'available')
    .order('starts_at', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, slots: (data ?? []) as InterviewSlotRow[] };
}

export async function createInterviewSlot(fields: {
  jobListingId: string;
  title: string;
  startsAtIso: string;
  endsAtIso: string;
  panelistProfileIds: string[];
}): Promise<InterviewActionResult & { warnings?: string[] }> {
  const { supabase, profile, orgId, user } = await requireOrgPermission('interviews.create_slot');
  if (!profile || !orgId || !user) return { ok: false, error: 'Not allowed.' };

  const jobId = fields.jobListingId?.trim();
  if (!jobId) return { ok: false, error: 'Choose a job listing.' };
  const title = fields.title?.trim() || 'Interview';
  const panelists = [...new Set(fields.panelistProfileIds.map((id) => id.trim()).filter(Boolean))];
  if (panelists.length === 0) {
    return { ok: false, error: 'Select at least one panel member.' };
  }

  const start = new Date(fields.startsAtIso);
  const end = new Date(fields.endsAtIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: 'Invalid start / end time.' };
  }

  const { data: job, error: jobErr } = await supabase
    .from('job_listings')
    .select('id, title, org_id')
    .eq('id', jobId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (jobErr || !job) return { ok: false, error: 'Job listing not found.' };

  const { data: panelRows } = await supabase
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .in('id', panelists);
  const validIds = new Set((panelRows ?? []).map((r) => r.id as string));
  for (const p of panelists) {
    if (!validIds.has(p)) return { ok: false, error: 'One or more panelists are not in your organisation.' };
  }

  const { data: orgRow } = await supabase.from('organisations').select('timezone, name').eq('id', orgId).single();
  const timeZone = (orgRow?.timezone as string | null)?.trim() || 'UTC';
  const orgName = (orgRow?.name as string | null)?.trim() || 'CampSite';

  const { data: inserted, error: insErr } = await supabase
    .from('interview_slots')
    .insert({
      org_id: orgId,
      job_listing_id: jobId,
      title,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: 'available',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (insErr || !inserted?.id) return { ok: false, error: insErr?.message ?? 'Could not create slot.' };
  const slotId = inserted.id as string;

  const { error: panErr } = await supabase.from('interview_slot_panelists').insert(
    panelists.map((profile_id) => ({ slot_id: slotId, profile_id }))
  );
  if (panErr) {
    await supabase.from('interview_slots').delete().eq('id', slotId);
    return { ok: false, error: panErr.message };
  }

  const jobTitle = (job.title as string)?.trim() || 'Role';
  const startsIso = start.toISOString();
  const endsIso = end.toISOString();
  const summary = `[${orgName}] Interview slot (available): ${jobTitle}`;
  const description = `CampSite interview panel slot — available for booking.\nJob: ${jobTitle}\n\nPanel members will see updates when a candidate is scheduled.`;

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    revalidatePath('/admin/interviews');
    revalidatePath('/hr/interviews');
    return { ok: true, warnings: ['Google Calendar is not configured on the server; slot saved without calendar events.'] };
  }

  let createdEvents: Array<{ profileId: string; eventId: string }> = [];
  try {
    createdEvents = await createInterviewSlotEventsForPanelists({
      admin,
      panelistUserIds: panelists,
      timeZone,
      startsAtIso: startsIso,
      endsAtIso: endsIso,
      summary,
      description,
    });
  } catch (e) {
    console.error('[interviews] calendar insert', e);
  }

  if (createdEvents.length) {
    await admin.from('interview_slot_google_events').insert(
      createdEvents.map((e) => ({
        slot_id: slotId,
        profile_id: e.profileId,
        event_id: e.eventId,
        calendar_id: 'primary',
      }))
    );
  }

  const warnings: string[] = [];
  if (createdEvents.length < panelists.length) {
    warnings.push(
      `${panelists.length - createdEvents.length} panelist(s) have no Google Calendar connected — add events manually or ask them to connect Calendar in Settings.`
    );
  }

  revalidatePath('/admin/interviews');
  revalidatePath('/hr/interviews');
  revalidatePath(`/admin/jobs/${jobId}/applications`);
  revalidatePath(`/hr/jobs/${jobId}/applications`);
  return warnings.length ? { ok: true, warnings } : { ok: true };
}

export async function bulkCreateInterviewSlots(fields: {
  jobListingId: string;
  title: string;
  slots: Array<{ startsAtIso: string; endsAtIso: string }>;
  panelistProfileIds: string[];
}): Promise<InterviewActionResult & { created?: number; warnings?: string[] }> {
  const { supabase, profile, orgId, user } = await requireOrgPermission('interviews.create_slot');
  if (!profile || !orgId || !user) return { ok: false, error: 'Not allowed.' };

  const jobId = fields.jobListingId?.trim();
  if (!jobId) return { ok: false, error: 'Choose a job listing.' };
  if (!fields.slots.length) return { ok: false, error: 'No slots to create.' };

  const title = fields.title?.trim() || 'Interview';
  const panelists = [...new Set(fields.panelistProfileIds.map((id) => id.trim()).filter(Boolean))];
  if (panelists.length === 0) return { ok: false, error: 'Select at least one panel member.' };

  const { data: job } = await supabase
    .from('job_listings').select('id, title').eq('id', jobId).eq('org_id', orgId).maybeSingle();
  if (!job) return { ok: false, error: 'Job listing not found.' };

  const { data: panelRows } = await supabase
    .from('profiles').select('id').eq('org_id', orgId).eq('status', 'active').in('id', panelists);
  const validIds = new Set((panelRows ?? []).map((r) => r.id as string));
  for (const p of panelists) {
    if (!validIds.has(p)) return { ok: false, error: 'One or more panelists are not in your organisation.' };
  }

  const slotInserts = fields.slots.map((s) => ({
    org_id: orgId,
    job_listing_id: jobId,
    title,
    starts_at: s.startsAtIso,
    ends_at: s.endsAtIso,
    status: 'available' as const,
    created_by: user.id,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from('interview_slots').insert(slotInserts).select('id');
  if (insErr || !inserted?.length) return { ok: false, error: insErr?.message ?? 'Could not create slots.' };

  const panelistInserts = inserted.flatMap((s) =>
    panelists.map((profile_id) => ({ slot_id: s.id as string, profile_id }))
  );
  const { error: panErr } = await supabase.from('interview_slot_panelists').insert(panelistInserts);
  if (panErr) {
    await supabase.from('interview_slots').delete().in('id', inserted.map((s) => s.id as string));
    return { ok: false, error: panErr.message };
  }

  // Try Google Calendar sync (best-effort, non-blocking)
  const warnings: string[] = [];
  try {
    const { data: orgRow } = await supabase.from('organisations').select('timezone, name').eq('id', orgId).single();
    const timeZone = (orgRow?.timezone as string | null)?.trim() || 'UTC';
    const orgName = (orgRow?.name as string | null)?.trim() || 'Organisation';
    const jobTitle = (job.title as string)?.trim() || 'Role';
    const admin = createServiceRoleClient();
    let syncedCount = 0;
    for (const slot of inserted) {
      const slotData = fields.slots[inserted.indexOf(slot)];
      if (!slotData) continue;
      const summary = `[${orgName}] Interview slot (available): ${jobTitle}`;
      const description = `CampSite interview panel slot — available for booking.\nJob: ${jobTitle}`;
      try {
        const events = await createInterviewSlotEventsForPanelists({
          admin,
          panelistUserIds: panelists,
          timeZone,
          startsAtIso: slotData.startsAtIso,
          endsAtIso: slotData.endsAtIso,
          summary,
          description,
        });
        if (events.length) {
          syncedCount += events.length;
          await admin.from('interview_slot_google_events').insert(
            events.map((e) => ({ slot_id: slot.id as string, profile_id: e.profileId, event_id: e.eventId, calendar_id: 'primary' }))
          );
        }
      } catch { /* per-slot failure is non-fatal */ }
    }
    const expectedEvents = inserted.length * panelists.length;
    if (syncedCount < expectedEvents) {
      warnings.push(`${expectedEvents - syncedCount} calendar event(s) could not sync — panelists can add manually.`);
    }
  } catch { /* Google Calendar not configured — fine */ }

  revalidatePath('/admin/interviews');
  revalidatePath('/hr/interviews');
  revalidatePath(`/admin/jobs/${jobId}/applications`);
  return { ok: true, created: inserted.length, warnings: warnings.length ? warnings : undefined };
}

export async function completeInterviewSlot(slotId: string): Promise<InterviewActionResult> {
  const id = slotId?.trim();
  if (!id) return { ok: false, error: 'Missing slot.' };

  const { supabase, orgId } = await requireOrgPermission('interviews.complete_slot');
  if (!orgId) return { ok: false, error: 'Not allowed.' };

  const { data: slot, error: fetchErr } = await supabase
    .from('interview_slots')
    .select('id, org_id, title, status')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (fetchErr || !slot) return { ok: false, error: 'Slot not found.' };
  const st = slot.status as string;
  if (st === 'completed') return { ok: true };
  if (st !== 'booked') {
    return { ok: false, error: 'Only booked interview slots can be marked completed.' };
  }

  const { data: evs } = await supabase
    .from('interview_slot_google_events')
    .select('profile_id, event_id')
    .eq('slot_id', id);

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    /* skip calendar */
  }

  if (admin && evs?.length) {
    const events = (evs as Array<{ profile_id: string; event_id: string }>).map((e) => ({
      profileId: e.profile_id,
      eventId: e.event_id,
    }));
    const summary = `[Done] ${(slot.title as string)?.trim() || 'Interview'}`;
    try {
      await patchInterviewEventsCompleted({ admin, events, summary });
    } catch (e) {
      console.error('[interviews] complete patch', e);
    }
  }

  const { error: upErr } = await supabase
    .from('interview_slots')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .eq('status', 'booked');
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath('/admin/interviews');
  revalidatePath('/hr/interviews');
  return { ok: true };
}

export async function cancelAvailableInterviewSlot(slotId: string): Promise<InterviewActionResult> {
  const id = slotId?.trim();
  if (!id) return { ok: false, error: 'Missing slot.' };

  const { supabase, orgId } = await requireOrgPermission('interviews.create_slot');
  if (!orgId) return { ok: false, error: 'Not allowed.' };

  const { data: slot } = await supabase
    .from('interview_slots')
    .select('id, status')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (!slot) return { ok: false, error: 'Slot not found.' };
  if ((slot.status as string) !== 'available') {
    return { ok: false, error: 'Only available slots can be cancelled.' };
  }

  const { data: evs } = await supabase
    .from('interview_slot_google_events')
    .select('profile_id, event_id')
    .eq('slot_id', id);

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    /* skip */
  }

  if (admin && evs?.length) {
    const events = (evs as Array<{ profile_id: string; event_id: string }>).map((e) => ({
      profileId: e.profile_id,
      eventId: e.event_id,
    }));
    try {
      await deleteInterviewCalendarEvents({ admin, events });
    } catch (e) {
      console.error('[interviews] cancel delete', e);
    }
  }

  const { error: delErr } = await supabase.from('interview_slots').delete().eq('id', id).eq('org_id', orgId);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath('/admin/interviews');
  return { ok: true };
}

export async function bookInterviewForApplication(opts: {
  applicationId: string;
  slotId: string;
  jobListingId: string;
  joiningInstructions: string;
  portalMessage: string;
}): Promise<InterviewActionResult> {
  const appId = opts.applicationId?.trim();
  const slotId = opts.slotId?.trim();
  const jobListingId = opts.jobListingId?.trim();
  if (!appId || !slotId || !jobListingId) return { ok: false, error: 'Missing data.' };

  const { supabase, profile, orgId, user } = await requireOrgPermission('interviews.book_slot');
  if (!profile || !orgId || !user) return { ok: false, error: 'Not allowed.' };

  const joining = opts.joiningInstructions?.trim() ?? '';
  const portalMsg = opts.portalMessage?.trim() ?? joining;

  if (joining) {
    const { data: canManageInterview } = await supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'interviews.manage',
      p_context: {},
    });
    if (!canManageInterview) {
      return {
        ok: false,
        error:
          'You do not have permission to set joining instructions. Book the slot without notes, or ask someone with interview admin access.',
      };
    }
  }

  const { data: slot, error: slotErr } = await supabase
    .from('interview_slots')
    .select('id, org_id, job_listing_id, title, starts_at, ends_at, status')
    .eq('id', slotId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (slotErr || !slot) return { ok: false, error: 'Interview slot not found.' };
  if ((slot.status as string) !== 'available') return { ok: false, error: 'That slot is no longer available.' };
  if ((slot.job_listing_id as string) !== jobListingId) {
    return { ok: false, error: 'This slot is for a different job listing.' };
  }

  const { data: app, error: appErr } = await supabase
    .from('job_applications')
    .select(
      'id, candidate_name, candidate_email, portal_token, job_listing_id, job_listings(title), organisations(name)'
    )
    .eq('id', appId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (appErr || !app) return { ok: false, error: 'Application not found.' };
  if ((app.job_listing_id as string) !== jobListingId) {
    return { ok: false, error: 'Application does not match this job.' };
  }

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return { ok: false, error: 'Server cannot update records (service role missing).' };
  }

  const { data: updatedSlot, error: lockErr } = await admin
    .from('interview_slots')
    .update({ status: 'booked', updated_at: new Date().toISOString() })
    .eq('id', slotId)
    .eq('org_id', orgId)
    .eq('status', 'available')
    .select('id')
    .maybeSingle();

  if (lockErr || !updatedSlot) {
    return { ok: false, error: 'Could not book slot (it may have just been taken).' };
  }

  const { error: appUpErr } = await admin
    .from('job_applications')
    .update({
      interview_slot_id: slotId,
      interview_joining_instructions: joining || null,
    })
    .eq('id', appId)
    .eq('org_id', orgId);

  if (appUpErr) {
    await admin
      .from('interview_slots')
      .update({ status: 'available', updated_at: new Date().toISOString() })
      .eq('id', slotId);
    return { ok: false, error: appUpErr.message };
  }

  const { error: rpcErr } = await supabase.rpc('set_job_application_stage', {
    p_application_id: appId,
    p_new_stage: 'interview_scheduled',
  });

  if (rpcErr) {
    await admin.from('job_applications').update({ interview_slot_id: null, interview_joining_instructions: null }).eq('id', appId);
    await admin
      .from('interview_slots')
      .update({ status: 'available', updated_at: new Date().toISOString() })
      .eq('id', slotId);
    return { ok: false, error: rpcErr.message ?? 'Could not update stage.' };
  }

  const { data: orgRow } = await supabase.from('organisations').select('timezone, name').eq('id', orgId).single();
  const timeZone = (orgRow?.timezone as string | null)?.trim() || 'UTC';
  const jl = relOne(app.job_listings as { title: string } | { title: string }[] | null);
  const orgFromApp = relOne(app.organisations as { name: string } | { name: string }[] | null);
  const orgName =
    orgFromApp?.name?.trim() || (orgRow?.name as string | undefined)?.trim() || 'Organisation';
  const jlTitle = jl?.title?.trim() || 'Role';

  const { data: evs } = await supabase
    .from('interview_slot_google_events')
    .select('profile_id, event_id')
    .eq('slot_id', slotId);

  const startsAt = new Date(slot.starts_at as string);
  const endsAt = new Date(slot.ends_at as string);
  const candName = (app.candidate_name as string)?.trim() || 'Candidate';
  const candEmail = (app.candidate_email as string)?.trim() || '';
  const summary = `Interview: ${candName} — ${String(jlTitle).trim()}`;
  const desc =
    `CampSite — Booked interview.\nCandidate: ${candName} (${candEmail})\nJob: ${String(jlTitle).trim()}\n\n` +
    (joining ? `Joining details:\n${joining}` : '');

  if (evs?.length) {
    const events = (evs as Array<{ profile_id: string; event_id: string }>).map((e) => ({
      profileId: e.profile_id,
      eventId: e.event_id,
    }));
    try {
      await patchInterviewEventsBooked({
        admin,
        events,
        timeZone,
        startsAtIso: startsAt.toISOString(),
        endsAtIso: endsAt.toISOString(),
        summary,
        description: desc,
        candidateEmail: candEmail,
      });
    } catch (e) {
      console.error('[interviews] book patch calendars', e);
    }
  }

  const { data: canNotifyRow } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'applications.notify_candidate',
    p_context: {},
  });
  const canNotifyCandidate = !!canNotifyRow;

  if (portalMsg && canNotifyCandidate) {
    const { error: msgErr } = await supabase.from('job_application_messages').insert({
      org_id: orgId,
      job_application_id: appId,
      body: portalMsg,
      created_by: user.id,
    });
    if (msgErr) {
      console.error('[interviews] book portal message', msgErr);
    }
  }

  const startsLabel = startsAt.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
  const endsLabel = endsAt.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });

  if (canNotifyCandidate) {
    await sendInterviewScheduledEmail({
      candidateEmail: candEmail,
      candidateName: candName,
      orgName: String(orgName).trim() || 'Organisation',
      jobTitle: String(jlTitle).trim(),
      startsAtLabel: startsLabel,
      endsAtLabel: endsLabel,
      joiningInstructions: joining,
      portalToken: app.portal_token as string,
    });
  }

  revalidatePath(`/admin/jobs/${jobListingId}/applications`);
  revalidatePath('/admin/applications');
  revalidatePath('/admin/interviews');
  revalidatePath(`/hr/jobs/${jobListingId}/applications`);
  revalidatePath('/hr/applications');
  revalidatePath('/hr/interviews');
  return { ok: true };
}
