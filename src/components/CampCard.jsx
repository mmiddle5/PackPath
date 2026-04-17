import { COLORS } from '../styles/tokens.js';

/**
 * Dark-themed card showing where to camp for the night.
 * Two variants: overnight camp and finish/trailhead (last day).
 */
export function CampCard({ camp, isLastDay }) {
  if (!camp && !isLastDay) return null;

  if (isLastDay) {
    return (
      <div style={{
        marginTop: 12,
        padding: 14,
        borderRadius: 10,
        background: COLORS.emerald50,
        border: `1px solid ${COLORS.emerald200}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          flexShrink: 0,
          background: COLORS.emerald600,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
        }}>
          ✓
        </div>
        <div>
          <div style={{
            fontSize: 12,
            color: COLORS.emerald700,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            Finish
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.stone800, marginTop: 2 }}>
            Back at the trailhead
          </div>
        </div>
      </div>
    );
  }

  const kindLabel = camp.kind === 'lake' ? 'Lakeside camp'
    : camp.kind === 'stream' ? 'Streamside camp'
    : 'Camp';
  const kindIcon = camp.kind === 'lake' ? '◉'
    : camp.kind === 'stream' ? '∿'
    : '▲';

  return (
    <div style={{
      marginTop: 12,
      padding: 14,
      borderRadius: 10,
      background: `linear-gradient(135deg, #1e293b, ${COLORS.stone900})`,
      border: `1px solid ${COLORS.stone700}`,
      color: '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          flexShrink: 0,
          background: 'rgba(255,255,255,0.1)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
        }}>
          ⛺
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.6)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}>
            Tonight's camp
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 2 }}>
            {camp.spot ?? 'Backcountry site'}
          </div>
          <div style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.7)',
            marginTop: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span>{kindIcon} {kindLabel}</span>
            {camp.waterNearby && (
              <span style={{ color: COLORS.emerald400 }}>• Water on site</span>
            )}
          </div>
        </div>
      </div>
      <div style={{
        fontSize: 13,
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 1.5,
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}>
        {camp.sentence}.
      </div>
    </div>
  );
}
