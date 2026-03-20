import { computeEpochScore } from '../src/core/decay-engine';

describe('computeEpochScore', () => {
  it('returns full epochAccessCount score when epoch is recent', () => {
    const score = computeEpochScore({
      accessCount: 10,
      epochAccessCount: 4,
      daysSinceEpoch: 0,
      decayWindowDays: 180,
    });
    // epochAccessCount * 1.0 + historical * decay(0, 180) = 4 + 6*1.0 = 10
    expect(score).toBeCloseTo(10);
  });

  it('returns only epoch score when epoch is 180+ days old (historical fully decayed)', () => {
    const score = computeEpochScore({
      accessCount: 10,
      epochAccessCount: 4,
      daysSinceEpoch: 180,
      decayWindowDays: 180,
    });
    // decay(180, 180) = max(0, 1 - 1) = 0 → historical contributes 0
    expect(score).toBeCloseTo(4);
  });

  it('partially decays at midpoint', () => {
    const score = computeEpochScore({
      accessCount: 10,
      epochAccessCount: 4,
      daysSinceEpoch: 90,
      decayWindowDays: 180,
    });
    // decay(90, 180) = max(0, 1 - 0.5) = 0.5 → 4 + 6*0.5 = 7
    expect(score).toBeCloseTo(7);
  });
});
