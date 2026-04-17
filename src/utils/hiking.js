// hiking.js — Pure utility functions for hiking metrics
// All functions are stateless and independently testable.

import { COLORS } from '../styles/tokens.js';

/**
 * Naismith-ish hiking time estimate.
 * Formula: 2 mph flat rate + 30 min per 1,000 ft of gain.
 * Returns a display string like "5h 45m".
 */
export function estimateHikingTime(miles, gainFt) {
  const flatHours = miles / 2.0;
  const climbHours = gainFt / 2000;
  const total = flatHours + climbHours;
  const h = Math.floor(total);
  const m = Math.round((total - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Day difficulty bucket.
 * Score = miles + gainFt / 400.
 * Returns label, color, and background color per DESIGN-GUIDE.md section 7.
 */
export function dayDifficulty(miles, gainFt) {
  const score = miles + gainFt / 400;
  if (score < 18) {
    return { label: 'Moderate', color: COLORS.emerald600, bg: COLORS.emerald50 };
  }
  if (score < 28) {
    return { label: 'Strenuous', color: COLORS.amber600, bg: COLORS.amber50 };
  }
  return { label: 'Very Hard', color: COLORS.hardRed, bg: COLORS.hardRedBg };
}

/**
 * Water availability report derived from segment features and note text.
 * Returns level, color, background, and display text per DESIGN-GUIDE.md section 7.
 */
export function waterReport(features, note) {
  const hasLakes = features.lakes?.length > 0;
  const hasStreams = features.streams?.length > 0;
  const hasWarning = /limited water|carry water|sources are spaced|plan water|dry stretch/i.test(note);

  if (hasWarning) {
    return { level: 'Limited', color: COLORS.amber700, bg: COLORS.amber50, text: 'Carry extra' };
  }
  if (hasLakes && hasStreams) {
    return { level: 'Plentiful', color: COLORS.sky700, bg: COLORS.sky50, text: 'Lakes and creeks' };
  }
  if (hasLakes || hasStreams) {
    return {
      level: 'Reliable',
      color: COLORS.sky700,
      bg: COLORS.sky50,
      text: hasLakes ? 'Lake access' : 'Creeks along route',
    };
  }
  return { level: 'Check map', color: COLORS.stone600, bg: COLORS.stone100, text: 'Few named sources' };
}

/** Format a number with locale-aware thousands separators. */
export const fmt = (n) => Number(n).toLocaleString();

/** Format miles — omit decimal if whole number. */
export const fmtMi = (n) => (n % 1 === 0 ? String(n) : Number(n).toFixed(1));
