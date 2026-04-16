// tests/score-cluster.test.js
// Unit tests for all six scoring components in score-cluster.js.
// Run with: node --test tests/score-cluster.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCluster } from '../score-cluster.js';

// ── Base fixtures ─────────────────────────────────────────────────────

const baseCluster = {
  miles: 40,
  totalGainFt: 9000,
  totalLossFt: 9000,
  featureCount: 18,
  features: [
    { name: 'Shadow Lake', type: 'lake' },
    { name: 'Ediza Lake', type: 'lake' },
    { name: 'Gem Lake', type: 'lake' },
    { name: 'Iceberg Lake', type: 'lake' },
    { name: 'Clyde Minaret', type: 'peak' },
  ],
  distinctLakes: 4,
  distinctPeaks: 1,
  distinctPasses: 0,
  htRatio: 0.25,
  distinctTrailCount: 5,
  clusterSize: 100,
  trailheadCount: 3,
  centerLat: 37.69,
  centerLon: -119.15,
};

const basePrefs = {
  daysTarget: 4,
  milesPerDayTarget: 10,
  elevationTolerance: 'moderate',
  sceneryPreferences: ['lakes'],
  crowdPreference: 'mixed',
  experienceLevel: 'intermediate',
  groupType: 'couple',
  avoid: '',
  priorities: '',
  notes: '',
};

// ── Mileage Fit ───────────────────────────────────────────────────────

describe('mileageFit', () => {
  it('scores 100 when miles/day exactly matches target', () => {
    // 40 miles / 4 days = 10 mi/day = target
    const result = scoreCluster(baseCluster, basePrefs);
    assert.equal(result.breakdown.mileageFit, 100);
  });

  it('scores 0 when deviation is 50% or more', () => {
    // 60 miles / 4 days = 15 mi/day = 50% above 10 mi/day target
    const cluster = { ...baseCluster, miles: 60 };
    const result = scoreCluster(cluster, basePrefs);
    assert.equal(result.breakdown.mileageFit, 0);
  });

  it('scores ~50 at 25% deviation', () => {
    // 50 miles / 4 days = 12.5 mi/day = 25% above target
    const cluster = { ...baseCluster, miles: 50 };
    const result = scoreCluster(cluster, basePrefs);
    assert.ok(result.breakdown.mileageFit >= 45 && result.breakdown.mileageFit <= 55,
      `Expected ~50, got ${result.breakdown.mileageFit}`);
  });

  it('is symmetric: same deviation above and below target scores the same', () => {
    const above = scoreCluster({ ...baseCluster, miles: 48 }, basePrefs); // 12 mi/day, 20% above
    const below = scoreCluster({ ...baseCluster, miles: 32 }, basePrefs); // 8 mi/day, 20% below
    assert.equal(above.breakdown.mileageFit, below.breakdown.mileageFit);
  });
});

// ── Elevation Fit ─────────────────────────────────────────────────────

describe('elevationFit', () => {
  it('scores 100 at the band center for moderate', () => {
    // moderate center = 2250 ft/day; 4 days = 9000 ft total
    const cluster = { ...baseCluster, totalGainFt: 9000 };
    const result = scoreCluster(cluster, basePrefs);
    assert.equal(result.breakdown.elevationFit, 100);
  });

  it('scores ~89 at the band edge', () => {
    // moderate band edge = 1500 ft/day; 4 days = 6000 ft
    const cluster = { ...baseCluster, totalGainFt: 6000 };
    const result = scoreCluster(cluster, basePrefs);
    assert.ok(result.breakdown.elevationFit >= 85 && result.breakdown.elevationFit <= 93,
      `Expected ~89, got ${result.breakdown.elevationFit}`);
  });

  it('scores 0 when 1500 ft/day outside the band', () => {
    // moderate center = 2250; 1500 ft outside = 750 ft/day (easy territory)
    // dist = |750 - 2250| = 1500, R = 750 + 1500 = 2250, score = 1 - (1500/2250)^2 = 0.56 -> not 0
    // Actually 1500 ft outside the band edge (not center): 1500 - 1500 = 0 ft/day
    // dist = |0 - 2250| = 2250 = R -> score = 0
    const cluster = { ...baseCluster, totalGainFt: 0 };
    const result = scoreCluster(cluster, basePrefs);
    assert.equal(result.breakdown.elevationFit, 0);
  });

  it('uses the correct band for easy tolerance', () => {
    // easy center = 750 ft/day; 4 days = 3000 ft
    const cluster = { ...baseCluster, totalGainFt: 3000 };
    const prefs = { ...basePrefs, elevationTolerance: 'easy' };
    const result = scoreCluster(cluster, prefs);
    assert.equal(result.breakdown.elevationFit, 100);
  });

  it('uses the correct band for hard tolerance', () => {
    // hard center = 3750 ft/day; 4 days = 15000 ft
    const cluster = { ...baseCluster, totalGainFt: 15000 };
    const prefs = { ...basePrefs, elevationTolerance: 'hard' };
    const result = scoreCluster(cluster, prefs);
    assert.equal(result.breakdown.elevationFit, 100);
  });
});

// ── Scenery Match ─────────────────────────────────────────────────────

describe('sceneryMatch', () => {
  it('scores 50 when no scenery preferences stated', () => {
    const prefs = { ...basePrefs, sceneryPreferences: [] };
    const result = scoreCluster(baseCluster, prefs);
    assert.equal(result.breakdown.sceneryMatch, 50);
  });

  it('scores 80 base when all preferences matched (no density bonus)', () => {
    // 1 lake feature = matched, no density bonus (only 1 feature)
    const cluster = {
      ...baseCluster,
      features: [{ name: 'Shadow Lake', type: 'lake' }],
    };
    const result = scoreCluster(cluster, basePrefs);
    assert.equal(result.breakdown.sceneryMatch, 80);
  });

  it('adds density bonus for multiple matching features', () => {
    // 4 lakes = matched + 3 extra = +15 density bonus (capped)
    const result = scoreCluster(baseCluster, basePrefs);
    assert.ok(result.breakdown.sceneryMatch > 80,
      `Expected >80 with density bonus, got ${result.breakdown.sceneryMatch}`);
  });

  it('scores 0 when no preferences matched', () => {
    const prefs = { ...basePrefs, sceneryPreferences: ['passes'] };
    const cluster = { ...baseCluster, distinctPasses: 0, features: [] };
    const result = scoreCluster(cluster, prefs);
    assert.equal(result.breakdown.sceneryMatch, 0);
  });

  it('scores partial match when only some preferences matched', () => {
    const prefs = { ...basePrefs, sceneryPreferences: ['lakes', 'passes'] };
    const cluster = { ...baseCluster, distinctPasses: 0 };
    const result = scoreCluster(cluster, prefs);
    // 1 of 2 matched = 50% base = 40 + density bonus
    assert.ok(result.breakdown.sceneryMatch < 80,
      `Expected <80 for partial match, got ${result.breakdown.sceneryMatch}`);
  });

  it('matches alpine proxy when peaks present and daily gain > 2000', () => {
    const prefs = { ...basePrefs, sceneryPreferences: ['alpine'] };
    const cluster = { ...baseCluster, distinctPeaks: 2, totalGainFt: 10000 }; // 2500/day
    const result = scoreCluster(cluster, prefs);
    assert.ok(result.breakdown.sceneryMatch > 0,
      `Expected alpine match, got ${result.breakdown.sceneryMatch}`);
  });

  it('does not match alpine proxy when daily gain is too low', () => {
    const prefs = { ...basePrefs, sceneryPreferences: ['alpine'] };
    const cluster = { ...baseCluster, distinctPeaks: 2, totalGainFt: 4000 }; // 1000/day
    const result = scoreCluster(cluster, prefs);
    assert.equal(result.breakdown.sceneryMatch, 0);
  });
});

// ── Crowd Match ───────────────────────────────────────────────────────

describe('crowdMatch', () => {
  it('scores high for popular preference with high htRatio', () => {
    const prefs = { ...basePrefs, crowdPreference: 'popular' };
    const cluster = { ...baseCluster, htRatio: 0.6 };
    const result = scoreCluster(cluster, prefs);
    assert.ok(result.breakdown.crowdMatch >= 90,
      `Expected >=90, got ${result.breakdown.crowdMatch}`);
  });

  it('scores high for solitude preference with low htRatio', () => {
    const prefs = { ...basePrefs, crowdPreference: 'solitude' };
    const cluster = { ...baseCluster, htRatio: 0.0 };
    const result = scoreCluster(cluster, prefs);
    assert.equal(result.breakdown.crowdMatch, 100);
  });

  it('scores high for mixed preference near 0.25 htRatio', () => {
    const cluster = { ...baseCluster, htRatio: 0.25 };
    const result = scoreCluster(cluster, basePrefs);
    assert.equal(result.breakdown.crowdMatch, 100);
  });

  it('scores lower for mixed preference at extremes', () => {
    const highHT = scoreCluster({ ...baseCluster, htRatio: 0.8 }, basePrefs);
    const lowHT = scoreCluster({ ...baseCluster, htRatio: 0.0 }, basePrefs);
    assert.ok(highHT.breakdown.crowdMatch < 100);
    assert.ok(lowHT.breakdown.crowdMatch < 100);
  });

  it('popular and solitude are inverse of each other', () => {
    const popularPrefs = { ...basePrefs, crowdPreference: 'popular' };
    const solitudePrefs = { ...basePrefs, crowdPreference: 'solitude' };
    const cluster = { ...baseCluster, htRatio: 0.3 };
    const popular = scoreCluster(cluster, popularPrefs);
    const solitude = scoreCluster(cluster, solitudePrefs);
    // They should sum to ~130 (30 + 100 at the extremes, linear in between)
    assert.ok(popular.breakdown.crowdMatch + solitude.breakdown.crowdMatch === 130,
      `Expected sum 130, got ${popular.breakdown.crowdMatch + solitude.breakdown.crowdMatch}`);
  });
});

// ── Accessibility ─────────────────────────────────────────────────────

describe('accessibility', () => {
  it('scores 20 for 1 trailhead', () => {
    const cluster = { ...baseCluster, trailheadCount: 1 };
    const result = scoreCluster(cluster, basePrefs);
    assert.equal(result.breakdown.accessibility, 20);
  });

  it('scores 100 for 5+ trailheads', () => {
    const cluster = { ...baseCluster, trailheadCount: 5 };
    const result = scoreCluster(cluster, basePrefs);
    assert.equal(result.breakdown.accessibility, 100);
  });

  it('caps at 100 for more than 5 trailheads', () => {
    const cluster = { ...baseCluster, trailheadCount: 10 };
    const result = scoreCluster(cluster, basePrefs);
    assert.equal(result.breakdown.accessibility, 100);
  });

  it('defaults to 1 trailhead when trailheadCount is 0', () => {
    const cluster = { ...baseCluster, trailheadCount: 0 };
    const result = scoreCluster(cluster, basePrefs);
    assert.equal(result.breakdown.accessibility, 20);
  });
});

// ── Feature Density ───────────────────────────────────────────────────

describe('featureDensity', () => {
  it('scores 0 for 0 features', () => {
    const cluster = { ...baseCluster, featureCount: 0 };
    const result = scoreCluster(cluster, basePrefs);
    assert.equal(result.breakdown.featureDensity, 0);
  });

  it('scores ~50 at 0.3 features/mi', () => {
    // 0.3 * 40 miles = 12 features
    const cluster = { ...baseCluster, featureCount: 12 };
    const result = scoreCluster(cluster, basePrefs);
    assert.ok(result.breakdown.featureDensity >= 45 && result.breakdown.featureDensity <= 55,
      `Expected ~50, got ${result.breakdown.featureDensity}`);
  });

  it('scores 100 at 0.6+ features/mi', () => {
    // 0.6 * 40 miles = 24 features
    const cluster = { ...baseCluster, featureCount: 24 };
    const result = scoreCluster(cluster, basePrefs);
    assert.equal(result.breakdown.featureDensity, 100);
  });

  it('caps at 100 above 0.6 features/mi', () => {
    const cluster = { ...baseCluster, featureCount: 100 };
    const result = scoreCluster(cluster, basePrefs);
    assert.equal(result.breakdown.featureDensity, 100);
  });
});

// ── Total score ───────────────────────────────────────────────────────

describe('total score', () => {
  it('returns a number between 0 and 100', () => {
    const result = scoreCluster(baseCluster, basePrefs);
    assert.ok(result.total >= 0 && result.total <= 100,
      `Expected 0-100, got ${result.total}`);
  });

  it('returns all six breakdown components', () => {
    const result = scoreCluster(baseCluster, basePrefs);
    const expected = ['mileageFit', 'elevationFit', 'sceneryMatch', 'crowdMatch', 'accessibility', 'featureDensity'];
    for (const key of expected) {
      assert.ok(key in result.breakdown, `Missing breakdown key: ${key}`);
    }
  });

  it('is deterministic: same inputs produce same output', () => {
    const r1 = scoreCluster(baseCluster, basePrefs);
    const r2 = scoreCluster(baseCluster, basePrefs);
    assert.deepEqual(r1, r2);
  });
});
