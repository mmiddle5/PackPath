import { COLORS, FEATURE_ICONS } from '../styles/tokens.js';
import { fmtMi } from '../utils/hiking.js';

/**
 * A single trail in the day's route, shown as part of a vertical timeline.
 * Numbered rail connects segments visually.
 */
export function TrailSegmentRow({ seg, index, isLast }) {
  return (
    <div style={{ display: 'flex', gap: 12, position: 'relative' }}>
      {/* Timeline rail */}
      <div style={{ position: 'relative', width: 24, flexShrink: 0 }}>
        <div style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: '#fff',
          border: `2px solid ${COLORS.emerald500}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          color: COLORS.emerald700,
          position: 'relative',
          zIndex: 1,
        }}>
          {index + 1}
        </div>
        {!isLast && (
          <div style={{
            position: 'absolute',
            top: 24,
            left: 11,
            width: 2,
            bottom: -12,
            background: COLORS.emerald200,
          }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: isLast ? 0 : 16, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 4,
          flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.stone800, lineHeight: 1.3 }}>
            {seg.trail}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.stone500, whiteSpace: 'nowrap' }}>
            ~{fmtMi(+seg.miles.toFixed(1))} mi
          </div>
        </div>

        {seg.features.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {seg.features.map((f) => {
              const icon = FEATURE_ICONS[f.type] ?? { glyph: '·', color: COLORS.stone500 };
              return (
                <span key={f.name} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 7px',
                  borderRadius: 6,
                  fontSize: 11,
                  background: COLORS.stone100,
                  color: COLORS.stone700,
                }}>
                  <span style={{ fontSize: 10, color: icon.color }}>{icon.glyph}</span>
                  {f.name}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
