import type { ReportConfig } from './types';
import raw from './fixtures/report-seed-fixtures.json';

export type DevSampleSavedReportFixture = {
  id: string;
  name: string;
  description: string;
  domains: string[];
  config: ReportConfig;
  tags: string[];
  visibility: 'private' | 'org' | 'roles';
};

const data = raw as { version: number; reports: DevSampleSavedReportFixture[] };

/** Canonical rows for local / QA saved-report seeds (`supabase/seed.sql`, `seed-qa-full.mjs`). */
export const REPORT_DEV_SEED_FIXTURES: readonly DevSampleSavedReportFixture[] = data.reports;
