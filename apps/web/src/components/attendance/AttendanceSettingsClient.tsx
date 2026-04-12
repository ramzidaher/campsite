'use client';

import { createClient } from '@/lib/supabase/client';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Site = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  active: boolean;
};

export function AttendanceSettingsClient({ orgId }: { orgId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [sites, setSites] = useState<Site[]>([]);
  const [geoStrict, setGeoStrict] = useState(true);
  const [radius, setRadius] = useState('100');
  const [resubmit, setResubmit] = useState(true);
  const [mgrCorrect, setMgrCorrect] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [siteRadius, setSiteRadius] = useState('');

  const load = useCallback(async () => {
    setErr(null);
    await supabase.rpc('org_attendance_settings_ensure', { p_org_id: orgId });
    const [{ data: s }, { data: o }] = await Promise.all([
      supabase.from('work_sites').select('id, name, lat, lng, radius_m, active').eq('org_id', orgId).order('name'),
      supabase
        .from('org_attendance_settings')
        .select('geo_strict, default_site_radius_m, reject_allows_employee_resubmit, reject_allows_manager_correction')
        .eq('org_id', orgId)
        .maybeSingle(),
    ]);
    setSites((s as Site[]) ?? []);
    if (o) {
      setGeoStrict(Boolean((o as { geo_strict: boolean }).geo_strict));
      setRadius(String((o as { default_site_radius_m: number }).default_site_radius_m ?? 100));
      setResubmit(Boolean((o as { reject_allows_employee_resubmit: boolean }).reject_allows_employee_resubmit));
      setMgrCorrect(Boolean((o as { reject_allows_manager_correction: boolean }).reject_allows_manager_correction));
    }
  }, [orgId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveOrg() {
    setErr(null);
    setMsg(null);
    const { error } = await supabase.rpc('org_attendance_settings_update', {
      p_geo_strict: geoStrict,
      p_default_site_radius_m: Number(radius) || 100,
      p_reject_allows_employee_resubmit: resubmit,
      p_reject_allows_manager_correction: mgrCorrect,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setMsg('Settings saved.');
  }

  async function addSite(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { error } = await supabase.rpc('work_site_upsert', {
      p_id: null,
      p_name: name,
      p_lat: Number(lat),
      p_lng: Number(lng),
      p_radius_m: siteRadius.trim() === '' ? null : Number(siteRadius),
      p_active: true,
    });
    if (error) {
      setErr(error.message);
      return;
    }
    setName('');
    setLat('');
    setLng('');
    setSiteRadius('');
    await load();
  }

  return (
    <div className="space-y-10">
      {err ? <p className="text-[13px] text-red-700">{err}</p> : null}
      {msg ? <p className="text-[13px] text-emerald-800">{msg}</p> : null}

      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Org rules</h2>
        <div className="max-w-xl space-y-3 rounded-xl border border-[#e8e4dc] bg-white p-4">
          <label className="flex items-center gap-2 text-[13px] text-[#121212]">
            <input type="checkbox" checked={geoStrict} onChange={(e) => setGeoStrict(e.target.checked)} />
            Require GPS within a work site to clock (when sites exist)
          </label>
          <label className="block text-[12px] text-[#6b6b6b]">
            Default site radius (m)
            <input
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="mt-1 w-32 rounded border border-[#d8d8d8] px-2 py-1 text-[13px]"
            />
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={resubmit} onChange={(e) => setResubmit(e.target.checked)} />
            After reject, employee may re-submit
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={mgrCorrect} onChange={(e) => setMgrCorrect(e.target.checked)} />
            After reject, manager may correct without re-submit
          </label>
          <button type="button" onClick={() => void saveOrg()} className="rounded-lg bg-[#121212] px-4 py-2 text-[12.5px] text-white">
            Save org settings
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Work sites</h2>
        <form onSubmit={addSite} className="mb-6 flex max-w-xl flex-wrap items-end gap-3">
          <label className="flex-1 min-w-[8rem] text-[12px] text-[#6b6b6b]">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded border px-2 py-1 text-[13px]" />
          </label>
          <label className="w-24 text-[12px] text-[#6b6b6b]">
            Lat
            <input value={lat} onChange={(e) => setLat(e.target.value)} className="mt-1 w-full rounded border px-2 py-1 text-[13px]" />
          </label>
          <label className="w-24 text-[12px] text-[#6b6b6b]">
            Lng
            <input value={lng} onChange={(e) => setLng(e.target.value)} className="mt-1 w-full rounded border px-2 py-1 text-[13px]" />
          </label>
          <label className="w-24 text-[12px] text-[#6b6b6b]">
            Radius m
            <input
              value={siteRadius}
              onChange={(e) => setSiteRadius(e.target.value)}
              placeholder="default"
              className="mt-1 w-full rounded border px-2 py-1 text-[13px]"
            />
          </label>
          <button type="submit" className="rounded-lg bg-[#121212] px-4 py-2 text-[12.5px] text-white">
            Add site
          </button>
        </form>
        <ul className="divide-y divide-[#eee] rounded-xl border border-[#e8e4dc]">
          {sites.length === 0 ? (
            <li className="px-4 py-3 text-[13px] text-[#6b6b6b]">No sites yet. Add latitude/longitude for each workplace.</li>
          ) : (
            sites.map((s) => (
              <li key={s.id} className="px-4 py-2 text-[13px] text-[#121212]">
                <span className="font-medium">{s.name || 'Site'}</span>{' '}
                <span className="text-[#6b6b6b]">
                  {s.lat}, {s.lng} · {s.radius_m}m {s.active ? '' : '(inactive)'}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
