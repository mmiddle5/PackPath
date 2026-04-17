import { COLORS } from '../styles/tokens.js';

/**
 * Compact at-a-glance status indicator used in day card headers.
 * Shows a category label and a color-coded value.
 * Used in pairs: Difficulty + Water.
 */
export function GlanceChip({ icon, label, value, color, bg }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      flex: 1,
      minWidth: 0,
      padding: '8px 10px',
      borderRadius: 8,
      background: bg,
    }}>
      <span style={{ fontSize: 14, color, flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 10,
          color: COLORS.stone500,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          lineHeight: 1,
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color,
          lineHeight: 1.2,
          marginTop: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {value}
        </div>
      </div>
    </div>
  );
}
