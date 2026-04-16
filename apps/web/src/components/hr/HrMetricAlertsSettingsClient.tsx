'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

type EqCode = { code: string; label: string };

type SettingsRow = {
  bradford_alert_threshold: number;
  working_hours_use_contract: boolean;
  working_hours_absolute_max: number | null;
  diversity_evaluation_window_days: number;
  diversity_min_sample_size: number;
  eq_category_codes: EqCode[];
  metrics_enabled: Record<string, boolean>;
};

export function HrMetricAlertsSettingsClient({ initial }: { initial: SettingsRow | null }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [bradford, setBradford] = useState(String(initial?.bradford_alert_threshold ?? 200));
  const [useContract, setUseContract] = useState(initial?.working_hours_use_contract ?? true);
  const [absMax, setAbsMax] = useState(
    initial?.working_hours_absolute_max != null ? String(initial.working_hours_absolute_max) : '',
  );
  const [divDays, setDivDays] = useState(String(initial?.diversity_evaluation_window_days ?? 90));
  const [minSample, setMinSample] = useState(String(initial?.diversity_min_sample_size ?? 5));
  const [eqCodes, setEqCodes] = useState<EqCode[]>(
    Array.isArray(initial?.eq_category_codes) ? initial!.eq_category_codes : [],
  );
  const [me, setMe] = useState<Record<string, boolean>>({
    bradford: initial?.metrics_enabled?.bradford !== false,
    working_hours: initial?.metrics_enabled?.working_hours !== false,
    diversity: initial?.metrics_enabled?.diversity !== false,
    probation: initial?.metrics_enabled?.probation !== false,
    missing_hr_record: initial?.metrics_enabled?.missing_hr_record !== false,
    review_cycle: initial?.metrics_enabled?.review_cycle !== false,
  });

  const field =
    'mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] outline-none focus:border-[#121212]';
  const label = 'mb-1 block text-[12px] font-medium text-[#505050]';

  const save = useCallback(async () => {
    setMsg(null);
    setErr(null);
    setBusy(true);
    const bt = Number.parseFloat(bradford);
    const dd = Number.parseInt(divDays, 10);
    const ms = Number.parseInt(minSample, 10);
    const am = absMax.trim() === '' ? null : Number.parseFloat(absMax);
    if (!Number.isFinite(bt) || bt <= 0) {
      setErr('Bradford threshold must be a positive number.');
      setBusy(false);
      return;
    }
    if (!Number.isFinite(dd) || dd < 1) {
      setErr('Diversity window must be at least 1 day.');
      setBusy(false);
      return;
    }
    if (!Number.isFinite(ms) || ms < 0) {
      setErr('Minimum sample size must be zero or more.');
      setBusy(false);
      return;
    }
    const { error } = await supabase.rpc('org_hr_metric_settings_upsert', {
      p_bradford_alert_threshold: bt,
      p_working_hours_use_contract: useContract,
      p_working_hours_absolute_max: am,
      p_diversity_evaluation_window_days: dd,
      p_diversity_min_sample_size: ms,
      p_eq_category_codes: eqCodes.filter((r) => r.code.trim() && r.label.trim()),
      p_metrics_enabled: me,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setMsg('Saved.');
    router.refresh();
  }, [supabase, bradford, useContract, absMax, divDays, minSample, eqCodes, me, router]);

  const runNow = useCallback(async () => {
    setMsg(null);
    setErr(null);
    setBusy(true);
    const { error } = await supabase.rpc('org_hr_metrics_run_now');
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setMsg('Evaluation run completed. Recipients will see new in-app alerts when thresholds apply.');
    router.refresh();
  }, [supabase, router]);

  function addEqRow() {
    setEqCodes((prev) => [...prev, { code: '', label: '' }]);
  }

  function updateEqRow(i: number, key: 'code' | 'label', v: string) {
    setEqCodes((prev) => {
      const next = [...prev];
      if (!next[i]) return prev;
      next[i] = { ...next[i], [key]: v };
      return next;
    });
  }

  function removeEqRow(i: number) {
    setEqCodes((prev) => prev.filter((_, j) => j !== i));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-5 py-8 sm:px-7">
      <div>
        <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">
          HR metric alerts
        </h1>
        <p className="mt-2 text-[13px] text-[#6b6b6b]">
          Thresholds for automated in-app notifications to line managers and HR. A daily job also evaluates these
          metrics.
        </p>
      </div>

      {msg ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-950">
          {msg}
        </div>
      ) : null}
      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900" role="alert">
          {err}
        </div>
      ) : null}

      <section className="rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="mb-4 font-authSerif text-[18px] text-[#121212]">Which metrics are on</h2>
        <div className="space-y-2">
          {(
            [
              ['bradford', 'Bradford factor (sickness + leave)'],
              ['working_hours', 'Working hours vs rota / contract'],
              ['diversity', 'Recruitment diversity share vs listing target'],
              ['probation', 'Probation review overdue'],
              ['missing_hr_record', 'Missing employee HR record'],
              ['review_cycle', 'Performance review manager assessment overdue'],
            ] as const
          ).map(([k, lab]) => (
            <label key={k} className="flex items-center gap-2 text-[13px] text-[#121212]">
              <input
                type="checkbox"
                checked={me[k] !== false}
                onChange={(e) => setMe((m) => ({ ...m, [k]: e.target.checked }))}
                disabled={busy}
              />
              {lab}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="mb-4 font-authSerif text-[18px] text-[#121212]">Bradford</h2>
        <div>
          <label className={label} htmlFor="bradford_th">
            Alert when score reaches at least
          </label>
          <input
            id="bradford_th"
            type="number"
            min={1}
            step={1}
            value={bradford}
            onChange={(e) => setBradford(e.target.value)}
            className={field}
            disabled={busy}
          />
        </div>
      </section>

      <section className="rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="mb-4 font-authSerif text-[18px] text-[#121212]">Working hours (rota)</h2>
        <label className="flex items-center gap-2 text-[13px] text-[#121212]">
          <input
            type="checkbox"
            checked={useContract}
            onChange={(e) => setUseContract(e.target.checked)}
            disabled={busy}
          />
          Prefer contracted weekly hours from the employee HR record when set
        </label>
        <div className="mt-3">
          <label className={label} htmlFor="abs_max">
            Absolute weekly cap (hours), if no contract hours — default 48
          </label>
          <input
            id="abs_max"
            type="number"
            min={1}
            step={0.5}
            placeholder="e.g. 48"
            value={absMax}
            onChange={(e) => setAbsMax(e.target.value)}
            className={field}
            disabled={busy}
          />
        </div>
      </section>

      <section className="rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="mb-4 font-authSerif text-[18px] text-[#121212]">Recruitment diversity</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="div_d">
              Rolling window (days)
            </label>
            <input
              id="div_d"
              type="number"
              min={1}
              value={divDays}
              onChange={(e) => setDivDays(e.target.value)}
              className={field}
              disabled={busy}
            />
          </div>
          <div>
            <label className={label} htmlFor="div_m">
              Minimum applicants with equality data before alerting
            </label>
            <input
              id="div_m"
              type="number"
              min={0}
              value={minSample}
              onChange={(e) => setMinSample(e.target.value)}
              className={field}
              disabled={busy}
            />
          </div>
        </div>
        <p className="mt-3 text-[12px] text-[#6b6b6b]">
          Set per–job listing targets under each job&apos;s edit page (minimum share % and which equality codes count).
        </p>
      </section>

      <section className="rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="mb-4 font-authSerif text-[18px] text-[#121212]">Equality monitoring options (applications)</h2>
        <p className="mb-3 text-[12px] text-[#6b6b6b]">
          Candidates see these as optional choices. Use short stable codes (e.g. <code className="text-[11px]">asian</code>
          , <code className="text-[11px]">black</code>) so job listing targets can reference them.
        </p>
        <div className="space-y-2">
          {eqCodes.map((row, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input
                value={row.code}
                onChange={(e) => updateEqRow(i, 'code', e.target.value)}
                className={field}
                placeholder="code"
                disabled={busy}
              />
              <input
                value={row.label}
                onChange={(e) => updateEqRow(i, 'label', e.target.value)}
                className={field}
                placeholder="Label shown to candidates"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => removeEqRow(i)}
                className="rounded-lg border border-[#d8d8d8] px-2 text-[12px] text-[#6b6b6b]"
                disabled={busy}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addEqRow}
          className="mt-2 text-[12px] text-[#6b6b6b] underline"
          disabled={busy}
        >
          Add option
        </button>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg bg-[#121212] px-4 py-2.5 text-[13px] font-medium text-white disabled:opacity-50"
        >
          Save settings
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runNow()}
          className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2.5 text-[13px] font-medium text-[#121212] disabled:opacity-50"
        >
          Run evaluation now
        </button>
      </div>
    </div>
  );
}
