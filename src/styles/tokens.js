// tokens.js — Design system constants
// Single source of truth for colors, spacing, and archetype styles.
// Maps directly to DESIGN-GUIDE.md section 2 & 4.

export const COLORS = {
  stone50:  '#fafaf9',
  stone100: '#f5f5f4',
  stone200: '#e7e5e3',
  stone300: '#d6d3d1',
  stone400: '#a8a29e',
  stone500: '#78716c',
  stone600: '#57534e',
  stone700: '#44403c',
  stone800: '#292524',
  stone900: '#1c1917',

  emerald50:  '#ecfdf5',
  emerald100: '#d1fae5',
  emerald200: '#a7f3d0',
  emerald400: '#34d399',
  emerald500: '#10b981',
  emerald600: '#059669',
  emerald700: '#047857',
  emerald800: '#065f46',

  amber50:  '#fffbeb',
  amber100: '#fef3c7',
  amber200: '#fde68a',
  amber500: '#f59e0b',
  amber600: '#d97706',
  amber700: '#b45309',

  sky50:  '#f0f9ff',
  sky100: '#e0f2fe',
  sky500: '#0ea5e9',
  sky600: '#0284c7',
  sky700: '#0369a1',

  rose500: '#f43f5e',

  hardRed: '#b91c1c',
  hardRedBg: '#fef2f2',
};

export const SPACING = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 32,
};

// Per DESIGN-GUIDE.md section 2 — Archetype Colors
export const ARCHETYPE_STYLES = {
  classic:  { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46', label: 'Classic' },
  scenic:   { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', label: 'Scenic' },
  explorer: { bg: '#fef3c7', border: '#fde68a', text: '#92400e', label: 'Explorer' },
};

// Per DESIGN-GUIDE.md section 2 — Feature Type Colors
export const FEATURE_ICONS = {
  lake:     { glyph: '◉', color: COLORS.sky600 },
  peak:     { glyph: '▲', color: COLORS.amber600 },
  pass:     { glyph: '⛰', color: '#9333ea' },
  landmark: { glyph: '★', color: COLORS.amber700 },
};

export const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
