import { inviteCallbackBaseUrl } from '@/lib/auth/inviteCallbackBaseUrl';
import type { NextRequest } from 'next/server';

function fakeReq(headers: Record<string, string>) {
  return {
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
  } as Pick<NextRequest, 'headers'> as NextRequest;
}

describe('inviteCallbackBaseUrl', () => {
  const env = process.env;
  const setNodeEnv = (value: string) => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  };
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...env };
    delete process.env.SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });
  afterAll(() => {
    process.env = env;
  });

  it('uses SITE_URL in production', () => {
    setNodeEnv('production');
    process.env.SITE_URL = 'https://app.camp-site.co.uk';
    const base = inviteCallbackBaseUrl(fakeReq({ host: 'evil.test' }));
    expect(base).toBe('https://app.camp-site.co.uk');
  });

  it('fails closed in production when SITE_URL missing', () => {
    setNodeEnv('production');
    const base = inviteCallbackBaseUrl(fakeReq({ host: 'evil.test', 'x-forwarded-host': 'evil.test' }));
    expect(base).toBeNull();
  });
});
