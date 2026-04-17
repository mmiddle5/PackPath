import { useState } from 'react';
import { COLORS } from '../styles/tokens.js';
import { fmt, fmtMi } from '../utils/hiking.js';
import { ArchetypeTag } from './ArchetypeTag.jsx';
import { StatBlock } from './StatBlock.jsx';

/**
 * Route summary card shown in the picker view.
 * Clicking opens the full route detail.
 */
export function RouteCard({ route, onClick }) {
  const [hover, setHover] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        background: hover ? COLORS.stone50 : '#fff',
        border: `1px solid ${hover ? COLORS.emerald400 : COLORS.stone200}`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 12,
        transition: 'all 0.15s ease',
        boxShadow: hover
          ? '0 4px 12px rgba(0,0,0,0.08)'
          : '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <ArchetypeTag archetype={route.archetype} />
      </div>

      <h3 style={{
        fontSize: 18,
        fontWeight: 700,
        color: COLORS.stone800,
        margin: '0 0 8px 0',
        lineHeight: 1.3,
      }}>
        {route.routeName}
      </h3>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <StatBlock value={fmtMi(route.totalMiles)} unit=" mi" label="Distance" />
        <StatBlock value={fmt(route.totalGainFt)}  unit=" ft" label="Elevation" />
        <StatBlock value={route.days}              unit=" d"  label="Days" />
      </div>

      <p style={{ fontSize: 14, color: COLORS.stone500, margin: 0, lineHeight: 1.5 }}>
        {route.bestFor}
      </p>

      <div style={{
        marginTop: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        color: COLORS.emerald600,
        fontWeight: 600,
      }}>
        View itinerary <span style={{ fontSize: 16 }}>→</span>
      </div>
    </button>
  );
}
