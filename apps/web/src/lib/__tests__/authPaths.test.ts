import { isAuthPath } from '@/lib/middleware/authPaths';

describe('isAuthPath', () => {
  it('matches auth roots and nested routes', () => {
    expect(isAuthPath('/login')).toBe(true);
    expect(isAuthPath('/register')).toBe(true);
    expect(isAuthPath('/register/done')).toBe(true);
    expect(isAuthPath('/forgot-password')).toBe(true);
    expect(isAuthPath('/auth/callback')).toBe(true);
  });

  it('rejects protected app paths', () => {
    expect(isAuthPath('/dashboard')).toBe(false);
    expect(isAuthPath('/pending')).toBe(false);
    expect(isAuthPath('/')).toBe(false);
  });
});
