import { resolveHostRequestContext } from '@/lib/middleware/resolveHostRequestContext';

describe('resolveHostRequestContext', () => {
  it('treats admin.campsite.app as platform admin with no org slug', () => {
    expect(resolveHostRequestContext('admin.campsite.app', 'my-org')).toEqual({
      orgSlug: null,
      isPlatformAdmin: true,
    });
  });

  it('ignores ?org= on admin.localhost (no accidental tenant header)', () => {
    expect(resolveHostRequestContext('admin.localhost:3000', 'demo')).toEqual({
      orgSlug: null,
      isPlatformAdmin: true,
    });
  });

  it('derives org slug from production tenant subdomain', () => {
    expect(resolveHostRequestContext('oxford.campsite.app', null)).toEqual({
      orgSlug: 'oxford',
      isPlatformAdmin: false,
    });
  });

  it('derives org slug from *.localhost', () => {
    expect(resolveHostRequestContext('oxford.localhost:3000', null)).toEqual({
      orgSlug: 'oxford',
      isPlatformAdmin: false,
    });
  });

  it('uses ?org= when host is plain localhost without tenant subdomain', () => {
    expect(resolveHostRequestContext('localhost:3000', 'demo')).toEqual({
      orgSlug: 'demo',
      isPlatformAdmin: false,
    });
  });

  it('does not use ?org= when tenant subdomain already set', () => {
    expect(resolveHostRequestContext('oxford.localhost:3000', 'other')).toEqual({
      orgSlug: 'oxford',
      isPlatformAdmin: false,
    });
  });
});
