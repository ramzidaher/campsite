import { createServerClient } from '@supabase/ssr';

jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}));

jest.mock('next/server', () => {
  class MockHeaders {
    private map = new Map<string, string>();
    constructor(init?: Record<string, string>) {
      if (init) {
        for (const [k, v] of Object.entries(init)) this.map.set(k.toLowerCase(), v);
      }
    }
    get(name: string): string | null {
      return this.map.get(name.toLowerCase()) ?? null;
    }
    set(name: string, value: string): void {
      this.map.set(name.toLowerCase(), value);
    }
    delete(name: string): void {
      this.map.delete(name.toLowerCase());
    }
  }

  class MockCookies {
    getAll() {
      return [];
    }
    delete() {}
    set() {}
  }

  class MockResponse {
    headers = new MockHeaders();
    cookies = new MockCookies();
    static next() {
      return new MockResponse();
    }
    static redirect(url: URL) {
      const res = new MockResponse();
      res.headers.set('location', url.toString());
      return res;
    }
  }

  return {
    NextResponse: MockResponse,
  };
});

const mockedCreateServerClient = createServerClient as jest.MockedFunction<typeof createServerClient>;

describe('middleware auth transient failures', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY = 'sb_publishable_test_key';
  });

  it('does not redirect to /login when Supabase auth fetch times out transiently', async () => {
    mockedCreateServerClient.mockReturnValue({
      auth: {
        getUser: jest
          .fn()
          .mockRejectedValue(new Error('supabase_fetch_timeout_after_3000ms')),
      },
    } as unknown as ReturnType<typeof createServerClient>);

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { middleware } = await import('@/middleware');
    const nextUrl = new URL('http://localhost:3000/admin/broadcasts') as URL & { clone: () => URL };
    nextUrl.clone = () => new URL(nextUrl.toString());
    const request = {
      headers: new Headers({ host: 'localhost:3000' }),
      nextUrl,
      cookies: {
        getAll: () => [],
        delete: () => {},
        set: () => {},
      },
    };

    const response = await middleware(request as never);

    expect(response.headers.get('location')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[auth][middleware][transient_failure]')
    );
    warnSpy.mockRestore();
  });
});
