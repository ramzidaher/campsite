import { completeRegistrationProfileIfNeeded } from '@/lib/auth/completeRegistrationProfile';
import type { User } from '@supabase/supabase-js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const DEPT_ID = '00000000-0000-4000-8000-0000000000bb';

function userWithMeta(meta: Record<string, unknown>): User {
  return {
    id: USER_ID,
    email: 'member@example.org',
    user_metadata: meta,
  } as User;
}

describe('completeRegistrationProfileIfNeeded', () => {
  it('returns ok without calling rpc when profile already exists', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: { id: USER_ID }, error: null });
    const supabase = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({ maybeSingle }),
        }),
      })),
      rpc: jest.fn(),
    };

    const out = await completeRegistrationProfileIfNeeded(supabase as never, userWithMeta({}));
    expect(out).toEqual({ ok: true });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('returns ok after rpc when profile appears', async () => {
    const maybeSingle = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: USER_ID }, error: null });

    const supabase = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({ maybeSingle }),
        }),
      })),
      rpc: jest.fn().mockResolvedValue({ error: null }),
    };

    const out = await completeRegistrationProfileIfNeeded(supabase as never, userWithMeta({}));
    expect(out).toEqual({ ok: true });
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).toHaveBeenCalledWith('ensure_my_registration_profile');
  });

  it('ignores missing-function rpc errors and completes via client insert', async () => {
    const meta = {
      register_org_id: ORG_ID,
      register_dept_ids: JSON.stringify([DEPT_ID]),
    };

    const profileMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const profileInsert = jest.fn().mockResolvedValue({ error: null });
    const udInsert = jest.fn().mockResolvedValue({ error: null });

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: profileMaybeSingle }),
            }),
            insert: profileInsert,
          };
        }
        if (table === 'user_departments') {
          return { insert: udInsert };
        }
        return {};
      }),
      rpc: jest.fn().mockResolvedValue({
        error: { message: 'Could not find the function public.ensure_my_registration_profile' },
      }),
    };

    const out = await completeRegistrationProfileIfNeeded(supabase as never, userWithMeta(meta));
    expect(out).toEqual({ ok: true });
    expect(profileInsert).toHaveBeenCalled();
    expect(udInsert).toHaveBeenCalled();
  });

  it('treats duplicate profile insert as success when row exists (trigger race)', async () => {
    const meta = {
      register_org_id: ORG_ID,
      register_dept_ids: JSON.stringify([DEPT_ID]),
    };

    const profileMaybeSingle = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: USER_ID }, error: null });

    const profileInsert = jest.fn().mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    const supabase = {
      from: jest.fn((table: string) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: profileMaybeSingle }),
            }),
            insert: profileInsert,
          };
        }
        return {};
      }),
      rpc: jest.fn().mockResolvedValue({ error: null }),
    };

    const out = await completeRegistrationProfileIfNeeded(supabase as never, userWithMeta(meta));
    expect(out).toEqual({ ok: true });
  });

  it('returns actionable error when metadata is missing', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({ maybeSingle }),
        }),
      })),
      rpc: jest.fn().mockResolvedValue({ error: null }),
    };

    const out = await completeRegistrationProfileIfNeeded(supabase as never, userWithMeta({}));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.message).toMatch(/metadata/i);
      expect(out.kind).toBeUndefined();
    }
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('returns org_creator_pending when RPC leaves no profile and metadata is create-org', async () => {
    const meta = {
      full_name: 'Pat Admin',
      register_create_org_name: 'Test Union',
      register_create_org_slug: 'test-union',
    };
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: jest.fn(() => ({
        select: () => ({
          eq: () => ({ maybeSingle }),
        }),
      })),
      rpc: jest.fn().mockResolvedValue({ error: null }),
    };

    const out = await completeRegistrationProfileIfNeeded(supabase as never, userWithMeta(meta));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.kind).toBe('org_creator_pending');
      expect(out.message).toMatch(/workspace|linked/i);
    }
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });
});
