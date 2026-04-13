import { sanitizeOfferHtml } from '@/lib/security/htmlSanitizer';
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../../../..');

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

describe('hostile HTML sanitization edge cases', () => {
  it('removes hostile encoded and nested payloads', () => {
    const html =
      '<div><IMG SRC=x onerror=&#x61;lert(1)><svg><script>alert(1)</script></svg><a href="javascript:alert(1)">x</a><p>ok</p></div>';
    const out = sanitizeOfferHtml(html);
    expect(out).toContain('<p>ok</p>');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<svg');
  });

  it('keeps safe offer formatting intact', () => {
    const html = '<h2>Offer</h2><p><strong>Welcome</strong> aboard.</p><ul><li>Item</li></ul>';
    const out = sanitizeOfferHtml(html);
    expect(out).toContain('<h2>Offer</h2>');
    expect(out).toContain('<strong>Welcome</strong>');
    expect(out).toContain('<ul><li>Item</li></ul>');
  });

  it('offer merge pipeline uses centralized sanitizer', () => {
    const mergeFile = readRepoFile('apps/web/src/lib/offers/mergeOfferTemplate.ts');
    expect(mergeFile).toContain("import { sanitizeOfferHtml } from '@/lib/security/htmlSanitizer'");
    expect(mergeFile).toContain('const sanitized = sanitizeOfferHtml(html);');
    expect(mergeFile).not.toContain('replace(/<script[\\s\\S]*?<\\/script>/gi');
  });
});

describe('token hashing + expiry + revocation + one-time-use compatibility', () => {
  it('enforces hash/expiry/revocation checks in public token SQL paths', () => {
    const sql = readRepoFile(
      'supabase/migrations/20260701150000_profiles_least_privilege_and_portal_token_hardening.sql'
    );
    expect(sql).toContain('portal_token_hash');
    expect(sql).toContain('portal_token_expires_at');
    expect(sql).toContain('portal_token_revoked_at');
    expect(sql).toContain('where ja.portal_token_hash = v_hash');
    expect(sql).toContain('where o.portal_token_hash = v_hash');
    expect(sql).toContain("and o.status = 'sent'");
  });

  it('uses secure token issuance flows instead of DB plaintext token reads', () => {
    const appActions = readRepoFile(
      'apps/web/src/app/(main)/admin/jobs/[id]/applications/actions.ts'
    );
    const interviews = readRepoFile('apps/web/src/app/(main)/admin/interviews/actions.ts');
    const pipelineClient = readRepoFile(
      'apps/web/src/app/(main)/admin/jobs/[id]/applications/JobPipelineClient.tsx'
    );

    expect(appActions).toContain('issueCandidatePortalToken');
    expect(appActions).toContain('issueOfferSigningPortalToken');
    expect(interviews).toContain('issueCandidatePortalToken');
    expect(pipelineClient).toContain('generateCandidateTrackerLink');
    expect(pipelineClient).toContain('generateOfferSigningLink');

    expect(appActions).not.toMatch(/\.select\([^)]*portal_token/);
    expect(interviews).not.toMatch(/\.select\([^)]*portal_token/);
    expect(pipelineClient).not.toContain('latest_offer.portal_token');
  });
});

describe('coworker public projection vs sensitive profile access', () => {
  it('uses coworker_directory_public for low-sensitivity coworker lookup flows', () => {
    const files = [
      'apps/web/src/lib/broadcasts/enrichBroadcastRows.ts',
      'apps/web/src/components/broadcasts/BroadcastsClient.tsx',
      'apps/web/src/components/leave/LeaveHubClient.tsx',
      'apps/web/src/components/attendance/TimesheetReviewClient.tsx',
      'apps/web/src/app/(main)/performance/page.tsx',
      'apps/web/src/components/rota/RotaClient.tsx',
    ];
    for (const rel of files) {
      const src = readRepoFile(rel);
      expect(src).toContain("from('coworker_directory_public')");
    }
  });
});

describe('permission-based admin route protection', () => {
  it('enforces explicit route-level permission checks on sensitive mutations', () => {
    const reportsRoute = readRepoFile(
      'apps/web/src/app/api/admin/members/update-reports-to/route.ts'
    );
    const rolesRoute = readRepoFile('apps/web/src/app/api/admin/roles/[roleId]/route.ts');
    expect(reportsRoute).toContain("p_permission_key: 'members.edit_roles'");
    expect(rolesRoute).toContain("p_permission_key: 'roles.manage'");
  });
});

describe('future role seed least-privilege defaults', () => {
  it('guards against reintroducing broad visibility perms for restricted roles', () => {
    const sql = readRepoFile(
      'supabase/migrations/20260701154000_guard_predefined_role_visibility_seed.sql'
    );
    expect(sql).toContain('org_role_permissions_block_restricted_visibility_trg');
    expect(sql).toContain("'members.view'");
    expect(sql).toContain("'hr.view_records'");
    expect(sql).toContain("'senior_developer'");
    expect(sql).toContain("'intern_trainee'");
  });
});
