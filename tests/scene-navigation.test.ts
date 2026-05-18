import { generateSceneNavigation, stripSceneNavigation } from '../src/core/scene-navigation';
import type { SceneEntry } from '../src/core/scene-index';

const entries: SceneEntry[] = [
  {
    filename: 'auth-refactor.md',
    summary: 'JWT bug fix and short-token switch',
    heat: 42,
    created: '2026-01-01',
    updated: '2026-05-18',
  },
  {
    filename: 'rrf-search.md',
    summary: 'Hybrid search with RRF',
    heat: 7,
    created: '2026-01-02',
    updated: '2026-05-10',
  },
];

describe('generateSceneNavigation', () => {
  it('returns empty string when no entries', () => {
    expect(generateSceneNavigation('/repo/.memobank', [])).toBe('');
  });

  it('generates navigation block sorted by heat (descending)', () => {
    const nav = generateSceneNavigation('/repo/.memobank', entries);
    expect(nav).toContain('## Scene Navigation');
    expect(nav).toContain('auth-refactor.md');
    expect(nav).toContain('42');
    expect(nav.indexOf('auth-refactor')).toBeLessThan(nav.indexOf('rrf-search'));
  });

  it('includes full path to scene file', () => {
    const nav = generateSceneNavigation('/repo/.memobank', entries);
    expect(nav).toContain('/repo/.memobank/scenes/auth-refactor.md');
  });
});

describe('stripSceneNavigation', () => {
  it('removes scene navigation block from MEMORY.md content', () => {
    const nav = generateSceneNavigation('/repo/.memobank', entries);
    const content = '## Recalled Memory\n\nsome content\n\n' + nav;
    const stripped = stripSceneNavigation(content);
    expect(stripped).not.toContain('Scene Navigation');
    expect(stripped).toContain('some content');
  });

  it('returns original string unchanged if no nav block', () => {
    const content = '## Recalled Memory\n\nsome content';
    expect(stripSceneNavigation(content)).toBe(content);
  });
});
