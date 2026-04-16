// tests/validate-narration.test.js
// Unit tests for every check in validate-narration.js.
// Each check has a passing case and a failing case.
// Run with: node --test tests/validate-narration.test.js

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateNarration } from '../validate-narration.js';
import {
  minimalStructuredInput,
  minimalValidNarration,
  minimalRegionConfig,
} from './fixtures/minimal-narration.js';

// Deep clone helper so each test gets a fresh copy
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ── Helpers ───────────────────────────────────────────────────────────

function expectPass(narration, input = minimalStructuredInput, config = minimalRegionConfig) {
  const result = validateNarration(narration, input, config);
  assert.ok(result.ok, `Expected pass but got errors: ${JSON.stringify(result.errors, null, 2)}`);
}

function expectFail(checkName, narration, input = minimalStructuredInput, config = minimalRegionConfig) {
  const result = validateNarration(narration, input, config);
  assert.ok(!result.ok, 'Expected validation failure but got pass');
  const found = result.errors.some(e => e.check === checkName);
  assert.ok(found, `Expected check "${checkName}" to fail, got: ${result.errors.map(e => e.check).join(', ')}`);
}

// ── Baseline: valid fixture passes ───────────────────────────────────

describe('baseline', () => {
  it('valid fixture passes all checks', () => {
    expectPass(clone(minimalValidNarration));
  });
});

// ── cluster-exists ────────────────────────────────────────────────────

describe('cluster-exists', () => {
  it('passes when archetype matches input', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when archetype has no matching input cluster', () => {
    const narration = clone(minimalValidNarration);
    narration[0].archetype = 'nonexistent';
    expectFail('cluster-exists', narration);
  });
});

// ── route-name ────────────────────────────────────────────────────────

describe('route-name', () => {
  it('passes with a valid route name', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when routeName is missing', () => {
    const narration = clone(minimalValidNarration);
    narration[0].routeName = '';
    expectFail('route-name', narration);
  });

  it('fails when routeName is "undefined"', () => {
    const narration = clone(minimalValidNarration);
    narration[0].routeName = 'undefined';
    expectFail('route-name', narration);
  });
});

// ── trail-name ────────────────────────────────────────────────────────

describe('trail-name', () => {
  it('passes when all trail names are in input', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when a trail name is not in input segments', () => {
    const narration = clone(minimalValidNarration);
    narration[0].segments[0].trailNames = ['Invented Trail'];
    expectFail('trail-name', narration);
  });

  it('passes for unnamed/connector trails', () => {
    const narration = clone(minimalValidNarration);
    narration[0].segments[0].trailNames = ['(unnamed)', 'connector'];
    expectPass(narration);
  });
});

// ── mile-sum ──────────────────────────────────────────────────────────

describe('mile-sum', () => {
  it('passes when day miles sum to totalMiles within tolerance', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when day miles sum differs by more than 0.3 mi', () => {
    const narration = clone(minimalValidNarration);
    narration[0].segments[0].miles = 5.0; // was 10.0, now sum = 15.0 vs totalMiles 20.0
    expectFail('mile-sum', narration);
  });
});

// ── total-miles ───────────────────────────────────────────────────────

describe('total-miles', () => {
  it('passes when totalMiles matches input', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when totalMiles does not match input', () => {
    const narration = clone(minimalValidNarration);
    narration[0].totalMiles = 25.0; // input has 20.0
    expectFail('total-miles', narration);
  });
});

// ── elevation-gain-sum ────────────────────────────────────────────────

describe('elevation-gain-sum', () => {
  it('passes when day gain sums match route total within 50 ft', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when day gain sum differs by more than 50 ft', () => {
    const narration = clone(minimalValidNarration);
    narration[0].segments[0].gainFt = 100; // was 1500, now sum = 1600 vs cluster 3000
    expectFail('elevation-gain-sum', narration);
  });
});

// ── day-count ─────────────────────────────────────────────────────────

describe('day-count', () => {
  it('passes when day count matches user preference', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when max day does not match user preference', () => {
    const narration = clone(minimalValidNarration);
    narration[0].segments[1].day = 3; // user requested 2 days
    expectFail('day-count', narration);
  });
});

// ── day-balance ───────────────────────────────────────────────────────

describe('day-balance', () => {
  it('passes when all days meet the 30% minimum', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when a day is below 30% of milesPerDay target', () => {
    const narration = clone(minimalValidNarration);
    // milesPerDay = 10, 30% = 3 miles minimum
    narration[0].segments[0].miles = 1.0; // below 3 mi minimum
    expectFail('day-balance', narration);
  });
});

// ── note-length ───────────────────────────────────────────────────────

describe('note-length', () => {
  it('passes for notes between 20 and 80 words', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails for notes shorter than 20 words', () => {
    const narration = clone(minimalValidNarration);
    narration[0].segments[0].note = 'Short note.';
    expectFail('note-length', narration);
  });

  it('fails for notes longer than 80 words', () => {
    const narration = clone(minimalValidNarration);
    narration[0].segments[0].note = Array(85).fill('word').join(' ');
    expectFail('note-length', narration);
  });
});

// ── banned-word ───────────────────────────────────────────────────────

describe('banned-word', () => {
  it('passes when no banned words are present', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when "nestled" appears in a day note', () => {
    const narration = clone(minimalValidNarration);
    narration[0].segments[0].note = narration[0].segments[0].note + ' The camp is nestled beside Shadow Lake.';
    expectFail('banned-word', narration);
  });

  it('fails when "pristine" appears in summary', () => {
    const narration = clone(minimalValidNarration);
    narration[0].summary = 'A pristine loop through the Shadow Lake basin.';
    expectFail('banned-word', narration);
  });

  it('fails when "stunning" appears in a pro', () => {
    const narration = clone(minimalValidNarration);
    narration[0].pros[0] = 'Stunning views of Shadow Lake from the John Muir Trail.';
    expectFail('banned-word', narration);
  });
});

// ── ascii-hyphen ──────────────────────────────────────────────────────

describe('ascii-hyphen', () => {
  it('passes when only ASCII hyphens are used', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when an en-dash appears in a route name', () => {
    const narration = clone(minimalValidNarration);
    narration[0].routeName = 'Shadow Lake \u2013 Ediza Loop'; // en-dash
    expectFail('ascii-hyphen', narration);
  });

  it('fails when an em-dash appears in a day note', () => {
    const narration = clone(minimalValidNarration);
    narration[0].segments[0].note = narration[0].segments[0].note.replace(',', '\u2014'); // em-dash
    expectFail('ascii-hyphen', narration);
  });
});

// ── pro-length / con-length ───────────────────────────────────────────

describe('pro/con length', () => {
  it('passes for 1-2 sentence pros and cons', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when a pro has 3 or more sentences', () => {
    const narration = clone(minimalValidNarration);
    narration[0].pros[0] = 'Shadow Lake is beautiful. Ediza Lake is also beautiful. Both are worth visiting.';
    expectFail('pro-length', narration);
  });

  it('fails when a con has 3 or more sentences', () => {
    const narration = clone(minimalValidNarration);
    narration[0].cons[0] = 'The John Muir Trail is crowded. Especially on weekends. Plan accordingly.';
    expectFail('con-length', narration);
  });
});

// ── pro-specificity / con-specificity ────────────────────────────────

describe('pro/con specificity', () => {
  it('passes when pros reference named features', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when a pro has no feature, trail, or numeric reference', () => {
    const narration = clone(minimalValidNarration);
    narration[0].pros[0] = 'Great views and good camping throughout the route.';
    expectFail('pro-specificity', narration);
  });

  it('passes when a pro references a numeric fact', () => {
    const narration = clone(minimalValidNarration);
    narration[0].pros[0] = 'The 20-mile loop is achievable in 2 days for most intermediate backpackers.';
    expectPass(narration);
  });
});

// ── segment-coverage ─────────────────────────────────────────────────

describe('segment-coverage', () => {
  it('passes when all segments are assigned', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when a segment is missing from all days', () => {
    const narration = clone(minimalValidNarration);
    // Remove segment 3 from day 2 -- only 3 of 4 segments assigned
    narration[0].segments[1].segmentIds = [2]; // was [2, 3]
    expectFail('segment-coverage', narration);
  });

  it('fails when a segment appears in two days', () => {
    const narration = clone(minimalValidNarration);
    // Segment 1 appears in both day 1 and day 2
    narration[0].segments[1].segmentIds = [1, 2, 3]; // segment 1 duplicated
    expectFail('segment-duplicate', narration);
  });
});

// ── note-mile-accuracy ────────────────────────────────────────────────

describe('note-mile-accuracy', () => {
  it('passes when no mileage figures are mentioned in notes', () => {
    expectPass(clone(minimalValidNarration));
  });

  it('fails when a note claims wrong mileage', () => {
    const narration = clone(minimalValidNarration);
    // Day 1 is 10 miles; note claims 15 miles
    narration[0].segments[0].note = 'Cover 15 miles today along the John Muir Trail past Shadow Lake and Ediza Lake, climbing steadily through the basin with views of Shadow Creek below.';
    expectFail('note-mile-accuracy', narration);
  });
});
