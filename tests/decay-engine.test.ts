import { computeDecayScore } from '../src/core/decay-engine';
import type { MemoryFile } from '../src/types';

function makeMemory(daysAgo: number, confidence: 'high' | 'medium' | 'low' = 'medium'): MemoryFile {
  const created = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  return {
    path: 'fake.md',
    name: 'test',
    type: 'lesson',
    description: 'test',
    tags: [],
    created,
    confidence,
    status: 'active',
    content: '',
  };
}

describe('computeDecayScore', () => {
  it('scores a fresh memory near 1.0 for high confidence', () => {
    const score = computeDecayScore(makeMemory(0, 'high'));
    // created = midnight today; a few hours old by test runtime
    // recency still high (t ≈ 0, Weibull → ~0.9+), importance = 1.0
    expect(score).toBeGreaterThan(0.85);
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it('scores a 90-day-old memory near the Weibull midpoint', () => {
    // t = 90/90 = 1, recency = exp(-1^0.5) = exp(-1) ≈ 0.368; × 0.7 (medium) ≈ 0.258
    const score = computeDecayScore(makeMemory(90, 'medium'));
    expect(score).toBeGreaterThan(0.2);
    expect(score).toBeLessThan(0.4);
  });

  it('scores a 180-day-old memory significantly lower than a 90-day-old', () => {
    const score90 = computeDecayScore(makeMemory(90, 'medium'));
    const score180 = computeDecayScore(makeMemory(180, 'medium'));
    expect(score180).toBeLessThan(score90);
  });

  it('high-confidence memories score higher than low-confidence at the same age', () => {
    const scoreHigh = computeDecayScore(makeMemory(30, 'high'));
    const scoreLow = computeDecayScore(makeMemory(30, 'low'));
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });
});
