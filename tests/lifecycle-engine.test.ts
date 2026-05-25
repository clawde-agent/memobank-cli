import { classifyMemory, shouldPromote, shouldDemote } from '../src/core/lifecycle-engine';
import type { AccessLog } from '../src/core/lifecycle-engine';

function makeLog(accessCount: number, daysSinceAccess: number): AccessLog {
  return {
    memoryPath: 'test.md',
    lastAccessed: new Date(Date.now() - daysSinceAccess * 86400000),
    accessCount,
    recallQueries: [],
    epochAccessCount: 0,
    team_epoch: new Date().toISOString(),
  };
}

describe('classifyMemory', () => {
  it('returns core when access count meets threshold', () => {
    expect(classifyMemory(makeLog(10, 1), 10, 90)).toBe('core');
  });

  it('returns peripheral when inactive beyond threshold days', () => {
    expect(classifyMemory(makeLog(1, 100), 10, 90)).toBe('peripheral');
  });

  it('returns working for moderate use', () => {
    expect(classifyMemory(makeLog(3, 30), 10, 90)).toBe('working');
  });

  it('returns working when no access log exists', () => {
    expect(classifyMemory(undefined, 10, 90)).toBe('working');
  });
});

describe('shouldPromote', () => {
  it('promotes experimental → active immediately', () => {
    expect(shouldPromote('experimental', 0, 3)).toBe('active');
  });

  it('promotes needs-review → active when epoch count meets threshold', () => {
    expect(shouldPromote('needs-review', 3, 3)).toBe('active');
  });

  it('does not promote needs-review when epoch count is below threshold', () => {
    expect(shouldPromote('needs-review', 2, 3)).toBeNull();
  });

  it('promotes deprecated → needs-review', () => {
    expect(shouldPromote('deprecated', 0, 3)).toBe('needs-review');
  });

  it('returns null for active status', () => {
    expect(shouldPromote('active', 10, 3)).toBeNull();
  });
});

describe('shouldDemote', () => {
  it('demotes active → needs-review after inactivity threshold', () => {
    expect(shouldDemote('active', 91, 0, 90, 180, 30)).toBe('needs-review');
  });

  it('demotes needs-review → deprecated after longer inactivity', () => {
    expect(shouldDemote('needs-review', 181, 0, 90, 180, 30)).toBe('deprecated');
  });

  it('demotes experimental → deprecated after TTL exceeded', () => {
    expect(shouldDemote('experimental', Infinity, 31, 90, 180, 30)).toBe('deprecated');
  });

  it('returns null when thresholds are not exceeded', () => {
    expect(shouldDemote('active', 10, 0, 90, 180, 30)).toBeNull();
    expect(shouldDemote('needs-review', 10, 0, 90, 180, 30)).toBeNull();
    expect(shouldDemote('experimental', Infinity, 10, 90, 180, 30)).toBeNull();
  });
});
