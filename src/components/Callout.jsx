import { COLORS } from '../styles/tokens.js';

/**
 * Contextual alert within a day card.
 * Two types: warning (amber) and info (sky).
 */
export function Callout({ callout }) {
  const isWarn = callout.type === 'warn';
  return (
    <div style={{
      display: 'flex',
      gap: 10,
      padding: '10px 12px',
      borderRadius: 8,
      background: isWarn ? COLORS.amber50 : COLORS.sky50,
      border: `1px solid ${isWarn ? COLORS.amber200 : COLORS.sky100}`,
      marginBottom: 8,
    }}>
      <span style={{
        fontSize: 14,
        color: isWarn ? COLORS.amber700 : COLORS.sky700,
        lineHeight: 1.3,
        flexShrink: 0,
      }}>
        {callout.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.stone800, lineHeight: 1.3 }}>
          {callout.title}
        </div>
        <div style={{ fontSize: 12, color: COLORS.stone600, lineHeight: 1.5, marginTop: 2 }}>
          {callout.text}
        </div>
      </div>
    </div>
  );
}
