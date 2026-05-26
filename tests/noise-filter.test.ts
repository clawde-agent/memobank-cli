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

  it('0.7 threshold: rich structured memories pass, bare terse content does not', () => {
    const richMemory = [
      '## Problem',
      'Queue processor used Jaccard only — missed semantic duplicates.',
      '## Solution',
      'Added LLM batch dedup (Stage 2) for ambiguous pairs in 0.4–0.8 range.',
      '## Trade-off',
      'Slower drain but eliminates near-duplicate memories accumulating over sessions.',
    ].join('\n');
    expect(calculateValueScore(richMemory)).toBeGreaterThanOrEqual(0.7);

    // Generic one-liner that scored ~0.5 and previously slipped through via shouldCapture
    const genericOneLiner = 'Use async/await instead of callbacks for cleaner code.';
    expect(calculateValueScore(genericOneLiner)).toBeLessThan(0.7);
  });
});
