import { COLORS } from '../styles/tokens.js';
import { fmt, fmtMi } from '../utils/hiking.js';
import { ArchetypeTag } from './ArchetypeTag.jsx';
import { StatBlock } from './StatBlock.jsx';
import { DayCard } from './DayCard.jsx';
import { MapView } from './MapView.jsx';
import { WeatherPanel } from './WeatherPanel.jsx';

/**
 * Full route detail view.
 * Structure: back link → dark header → day cards → pros/cons → gear tips → export.
 */
export function RouteDetail({ route, onBack }) {
  return (
    <div>
      {/* Back link */}
      <button
        onClick={onBack}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 14,
          fontWeight: 600,
          color: COLORS.emerald600,
          padding: '8px 0',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 18 }}>←</span> All routes
      </button>

      {/* Dark gradient header */}
      <div style={{
        background: `linear-gradient(135deg, ${COLORS.stone800}, ${COLORS.stone900})`,
        borderRadius: 12,
        padding: 24,
        marginBottom: 20,
        color: '#fff',
      }}>
        <ArchetypeTag archetype={route.archetype} />
        <h2 style={{ fontSize: 22, fontWeight: 700, margin: '10px 0 8px 0', lineHeight: 1.25 }}>
          {route.routeName}
        </h2>
        <p style={{ fontSize: 14, color: COLORS.stone300, margin: '0 0 16px 0', lineHeight: 1.5 }}>
          {route.summary}
        </p>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <StatBlock value={fmtMi(route.totalMiles)} unit=" mi" label="Total" size="lg" light />
          <StatBlock value={fmt(route.totalGainFt)}  unit=" ft" label="Gain"  size="lg" light />
          <StatBlock value={fmt(route.totalLossFt)}  unit=" ft" label="Loss"  size="lg" light />
          <StatBlock value={route.days}              unit=" d"  label="Days"  size="lg" light />
        </div>
      </div>

      {/* Map + export actions */}
      <MapView route={route} />

      {/* Weather */}
      {route.weather && <WeatherPanel weather={route.weather} />}

      {/* Day-by-day itinerary */}
      <h3 style={{ fontSize: 16, fontWeight: 700, color: COLORS.stone700, marginBottom: 12 }}>
        Day-by-Day Itinerary
      </h3>
      {route.segments.map((seg, i) => (
        <DayCard
          key={seg.day}
          segment={seg}
          isLastDay={i === route.segments.length - 1}
        />
      ))}

      {/* Pros & Cons */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
        marginTop: 8,
        marginBottom: 12,
      }}>
        <div style={{ background: '#ecfdf5', borderRadius: 10, padding: 16 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: COLORS.emerald700, margin: '0 0 8px 0' }}>
            Pros
          </h4>
          {route.pros.map((p, i) => (
            <p key={i} style={{ fontSize: 13, color: COLORS.stone700, margin: '0 0 6px 0', lineHeight: 1.5 }}>
              {p}
            </p>
          ))}
        </div>
        <div style={{ background: '#fef2f2', borderRadius: 10, padding: 16 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: COLORS.hardRed, margin: '0 0 8px 0' }}>
            Cons
          </h4>
          {route.cons.map((c, i) => (
            <p key={i} style={{ fontSize: 13, color: COLORS.stone700, margin: '0 0 6px 0', lineHeight: 1.5 }}>
              {c}
            </p>
          ))}
        </div>
      </div>

      {/* Gear Tips */}
      <div style={{
        background: COLORS.stone50,
        borderRadius: 10,
        padding: 16,
        border: `1px solid ${COLORS.stone200}`,
      }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: COLORS.stone700, margin: '0 0 10px 0' }}>
          Gear Tips
        </h4>
        {route.gearTips.map((tip, i) => (
          <div key={i} style={{
            display: 'flex',
            gap: 8,
            marginBottom: 8,
            fontSize: 13,
            color: COLORS.stone600,
            lineHeight: 1.5,
          }}>
            <span style={{ color: COLORS.emerald500, fontSize: 16, lineHeight: 1 }}>✓</span>
            <span>{tip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
