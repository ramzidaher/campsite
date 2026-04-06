import { isValidWorkspaceSlug, normalizeWorkspaceSlugInput, suggestSlugFromOrganisationName } from '../slug';

describe('workspace slug helpers', () => {
  it('normalizes input', () => {
    expect(normalizeWorkspaceSlugInput('  Hello World!  ')).toBe('hello-world');
    expect(normalizeWorkspaceSlugInput("O'Brien Hall")).toBe('o-brien-hall');
  });

  it('validates slug pattern', () => {
    expect(isValidWorkspaceSlug('ab')).toBe(true);
    expect(isValidWorkspaceSlug('a')).toBe(false);
    expect(isValidWorkspaceSlug('hello-world')).toBe(true);
    expect(isValidWorkspaceSlug('hello--world')).toBe(false);
    expect(isValidWorkspaceSlug('admin')).toBe(false);
    expect(isValidWorkspaceSlug('www')).toBe(false);
  });

  it('suggests slug from org name', () => {
    expect(suggestSlugFromOrganisationName("Students' Union")).toBe('students-union');
  });
});
