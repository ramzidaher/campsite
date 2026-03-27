import { PLATFORM_ADMIN_MEMBERSHIP_TABLE } from '@campsite/types';

import { isPlatformFounder, requirePlatformFounder } from '../requirePlatformFounder';

const redirectMock = jest.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

jest.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

function mockSupabase(paRow: { user_id: string } | null) {
  return {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: paRow }),
    }),
  } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('requirePlatformFounder', () => {
  it('queries the table name documented in @campsite/types', () => {
    expect(PLATFORM_ADMIN_MEMBERSHIP_TABLE).toBe('platform_admins');
  });

  beforeEach(() => {
    redirectMock.mockClear();
  });

  it('redirects to / when user is not in platform_admins', async () => {
    const supabase = mockSupabase(null);
    await expect(requirePlatformFounder(supabase, 'user-1')).rejects.toThrow('REDIRECT:/');
    expect(redirectMock).toHaveBeenCalledWith('/');
  });

  it('does not redirect when platform_admins row exists', async () => {
    const supabase = mockSupabase({ user_id: 'user-1' });
    await expect(requirePlatformFounder(supabase, 'user-1')).resolves.toBeUndefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe('isPlatformFounder', () => {
  it('returns false when not in platform_admins', async () => {
    const supabase = mockSupabase(null);
    await expect(isPlatformFounder(supabase, 'u')).resolves.toBe(false);
  });

  it('returns true when row exists', async () => {
    const supabase = mockSupabase({ user_id: 'u' });
    await expect(isPlatformFounder(supabase, 'u')).resolves.toBe(true);
  });
});
