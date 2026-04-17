// route.js — Pure utility functions for route data transformation
// All functions are stateless and independently testable.

import { COLORS } from '../styles/tokens.js';
import { fmt, fmtMi } from './hiking.js';

/**
 * Parse camp location from a day segment's note and features.
 * Looks for a sentence starting with "Camp", then cross-references feature names.
 * Returns null if no camp sentence is found.
 */
export function parseCamp(note, features) {
  const campMatch = note.match(/Camp[^.]*\./i);
  if (!campMatch) return null;

  const campSentence = campMatch[0];

  const allPlaces = [
    ...(features.lakes    || []).map((name) => ({ name, kind: 'lake' })),
    ...(features.streams  || []).map((name) => ({ name, kind: 'stream' })),
    ...(features.landmarks|| []).map((name) => ({ name, kind: 'landmark' })),
  ];

  const matched = allPlaces.find((p) => campSentence.includes(p.name));

  return {
    sentence: campSentence.replace(/^Camp\s*/i, '').replace(/\.$/, ''),
    spot: matched?.name ?? null,
    kind: matched?.kind ?? null,
    waterNearby: matched?.kind === 'lake' || matched?.kind === 'stream',
  };
}

/**
 * Build display-ready trail segments for a day.
 * Distributes mileage and features proportionally across trail names.
 * Note: mileage is approximate — the pipeline doesn't yet provide per-trail miles.
 */
export function buildTrailSegments(segment) {
  const trails = segment.trailNames.filter((t) => t && !t.includes('unnamed'));
  const count = trails.length || 1;
  const milesPerTrail = segment.miles / count;

  const allFeatures = [
    ...(segment.features.lakes    || []).map((name) => ({ type: 'lake', name })),
    ...(segment.features.peaks    || []).map((name) => ({ type: 'peak', name })),
    ...(segment.features.passes   || []).map((name) => ({ type: 'pass', name })),
    ...(segment.features.landmarks|| []).map((name) => ({ type: 'landmark', name })),
  ];

  return trails.map((trail, i) => {
    const start = Math.floor((allFeatures.length * i) / count);
    const end   = Math.floor((allFeatures.length * (i + 1)) / count);
    return { trail, miles: milesPerTrail, features: allFeatures.slice(start, end) };
  });
}

/**
 * Detect noteworthy conditions for a day segment and return callout objects.
 * Callout triggers per DESIGN-GUIDE.md section 7.
 */
export function buildCallouts(segment) {
  const callouts = [];
  const { note, miles, gainFt, features, trailNames = [] } = segment;

  if (miles >= 15) {
    callouts.push({
      type: 'warn', icon: '⚠',
      title: 'Long day',
      text: `${fmtMi(miles)} miles is a full-day push. Start at first light.`,
    });
  }

  if (gainFt >= 3500) {
    callouts.push({
      type: 'warn', icon: '▲',
      title: 'Major climbing',
      text: `${fmt(gainFt)} ft of gain. Pace yourself and hydrate.`,
    });
  }

  if (/limited water|carry water|sources are spaced|plan water/i.test(note)) {
    callouts.push({
      type: 'warn', icon: '◐',
      title: 'Water planning',
      text: 'Sources are spaced out — carry 3L+ between fills.',
    });
  }

  if (features.passes?.length > 0) {
    callouts.push({
      type: 'info', icon: '⛰',
      title: `${features.passes[0]} crossing`,
      text: 'Expect exposure, wind, and possible snowfields early season.',
    });
  }

  if (/John Muir Trail|Pacific Crest Trail/.test(trailNames.join(' '))) {
    callouts.push({
      type: 'info', icon: '●',
      title: 'Popular trail segment',
      text: 'JMT/PCT miles — expect other hikers, especially near lakes.',
    });
  }

  if (/bear|grizzly/i.test(note)) {
    callouts.push({
      type: 'warn', icon: '◆',
      title: 'Active bear country',
      text: 'Bear canister required. Store all scented items at night.',
    });
  }

  return callouts;
}
