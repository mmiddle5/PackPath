import { COLORS } from '../styles/tokens.js';

/**
 * Displays a key number with unit and label.
 * The most important component in the app — appears on every card and header.
 * Supports a `light` prop for rendering on dark backgrounds.
 */
export function StatBlock({ value, unit, label, size = 'md', light = false }) {
  const fontSize = size === 'lg' ? 28 : 20;
  const valueColor = light ? '#fff' : COLORS.stone800;
  const unitColor  = light ? 'rgba(255,255,255,0.6)' : COLORS.stone500;
  const labelColor = light ? 'rgba(255,255,255,0.6)' : COLORS.stone400;

  return (
    <div style={{ textAlign: 'center', minWidth: 60 }}>
      <div style={{ fontSize, fontWeight: 700, color: valueColor, lineHeight: 1.1 }}>
        {value}
        <span style={{ fontSize: fontSize * 0.55, fontWeight: 500, color: unitColor }}>
          {unit}
        </span>
      </div>
      <div style={{
        fontSize: 11,
        color: labelColor,
        marginTop: 2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>
        {label}
      </div>
    </div>
  );
}
