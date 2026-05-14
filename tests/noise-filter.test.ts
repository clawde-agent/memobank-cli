import { isNoise, calculateValueScore } from '../src/core/noise-filter';

describe('noise-filter', () => {
  it('should not filter workflow lessons starting with "Run"', () => {
    const lesson =
      'Run npm ci instead of npm install to respect the lockfile and avoid unexpected upgrades.';
    expect(isNoise(lesson)).toBe(false);
  });

  it('should not filter lessons starting with "Execute"', () => {
    const lesson =
      'Execute migrations with --dry-run first to catch schema conflicts before applying.';
    expect(isNoise(lesson)).toBe(false);
  });

  it('should still filter very short content', () => {
    expect(isNoise('ok')).toBe(true);
  });

  it('should filter greetings', () => {
    const greeting = 'Hello, how are you doing today?';
    expect(isNoise(greeting)).toBe(true);
  });

  it('should calculate reasonable value scores for valid lessons', () => {
    const lesson =
      'Run npm ci instead of npm install to respect the lockfile and avoid unexpected upgrades.';
    const score = calculateValueScore(lesson);
    expect(score).toBeGreaterThan(0.5);
  });
});
