import { parsePushTokenBody } from '../parsePushTokenBody';

describe('parsePushTokenBody', () => {
  it('requires a non-empty token string', () => {
    const empty = parsePushTokenBody({});
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toBe('token required');
    expect(parsePushTokenBody({ token: '' }).ok).toBe(false);
    expect(parsePushTokenBody({ token: '   ' }).ok).toBe(false);
  });

  it('accepts token and defaults platform to web', () => {
    const r = parsePushTokenBody({ token: ' expo-token ' });
    expect(r).toEqual({ ok: true, token: 'expo-token', platform: 'web' });
  });

  it('accepts ios and android platform', () => {
    expect(parsePushTokenBody({ token: 't', platform: 'ios' })).toEqual({
      ok: true,
      token: 't',
      platform: 'ios',
    });
    expect(parsePushTokenBody({ token: 't', platform: 'android' })).toEqual({
      ok: true,
      token: 't',
      platform: 'android',
    });
  });

  it('falls back to web for unknown platform string', () => {
    const r = parsePushTokenBody({ token: 't', platform: 'desktop' });
    expect(r.ok && r.platform).toBe('web');
  });

  it('rejects non-object JSON root', () => {
    expect(parsePushTokenBody(null).ok).toBe(false);
    expect(parsePushTokenBody([]).ok).toBe(false);
    expect(parsePushTokenBody('x').ok).toBe(false);
  });
});
