import { useState, useMemo } from 'react';
import { COLORS } from '../styles/tokens.js';
import { estimateHikingTime, dayDifficulty, waterReport, fmt, fmtMi } from '../utils/hiking.js';
import { parseCamp, buildTrailSegments, buildCallouts } from '../utils/route.js';
import { GlanceChip } from './GlanceChip.jsx';
import { TrailSegmentRow } from './TrailSegmentRow.jsx';
import { CampCard } from './CampCard.jsx';
import { Callout } from './Callout.jsx';

/**
 * Primary content unit for itineraries.
 * Five zones: header, trail timeline, camp card, callouts, expandable narrative.
 */
export function DayCard({ segment, isLastDay }) {
  const [expanded, setExpanded] = useState(false);

  const time       = estimateHikingTime(segment.miles, segment.gainFt);
  const difficulty = dayDifficulty(segment.miles, segment.gainFt);
  const water      = waterReport(segment.features, segment.note);
  const camp       = parseCamp(segment.note, segment.features);
  const trailSegs  = useMemo(() => buildTrailSegments(segment), [segment]);
  const callouts   = useMemo(() => buildCallouts(segment), [segment]);
  const netElev    = segment.gainFt - segment.lossFt;

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${COLORS.stone200}`,
      borderRadius: 12,
      marginBottom: 16,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* ── Day Header ── */}
      <div style={{
        padding: '14px 16px',
        background: COLORS.stone50,
        borderBottom: `1px solid ${COLORS.stone200}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 38,
            height: 38,
            borderRadius: 10,
            flexShrink: 0,
            background: COLORS.emerald600,
            color: '#fff',
          }}>
            <div style={{ textAlign: 'center', lineHeight: 1 }}>
              <div style={{ fontSize: 9, opacity: 0.8, marginBottom: 2 }}>DAY</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{segment.day}</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.stone800, lineHeight: 1.2 }}>
              {fmtMi(segment.miles)} miles · {time} hiking
            </div>
            <div style={{ fontSize: 12, color: COLORS.stone500, marginTop: 3 }}>
              +{fmt(segment.gainFt)} ft gain · −{fmt(segment.lossFt)} ft loss
              {netElev !== 0 && (
                <span style={{
                  color: netElev > 0 ? COLORS.emerald700 : COLORS.rose500,
                  marginLeft: 4,
                }}>
                  ({netElev > 0 ? '+' : ''}{fmt(netElev)} net)
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <GlanceChip icon="◎" label="Difficulty" value={difficulty.label} color={difficulty.color} bg={difficulty.bg} />
          <GlanceChip icon="∿" label="Water"      value={water.level}      color={water.color}      bg={water.bg} />
        </div>
      </div>

      {/* ── Trail Timeline ── */}
      <div style={{ padding: '16px 16px 4px 16px' }}>
        <div style={{
          fontSize: 11,
          fontWeight: 700,
          color: COLORS.stone500,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          marginBottom: 12,
        }}>
          The Route
        </div>
        {trailSegs.map((seg, i) => (
          <TrailSegmentRow key={i} seg={seg} index={i} isLast={i === trailSegs.length - 1} />
        ))}
      </div>

      {/* ── Camp Card ── */}
      <div style={{ padding: '0 16px' }}>
        <CampCard camp={camp} isLastDay={isLastDay} />
      </div>

      {/* ── Callouts ── */}
      {callouts.length > 0 && (
        <div style={{ padding: '14px 16px 4px 16px' }}>
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: COLORS.stone500,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 8,
          }}>
            Good to know
          </div>
          {callouts.map((c, i) => <Callout key={i} callout={c} />)}
        </div>
      )}

      {/* ── Expandable Narrative ── */}
      <div style={{ padding: '8px 16px 14px 16px' }}>
        <button
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            color: COLORS.stone500,
            padding: '6px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {expanded ? 'Hide' : 'Read'} full narrative
          <span style={{
            transition: 'transform 0.2s',
            transform: expanded ? 'rotate(90deg)' : 'none',
          }}>›</span>
        </button>
        {expanded && (
          <p style={{
            fontSize: 13,
            color: COLORS.stone600,
            margin: '8px 0 0 0',
            lineHeight: 1.6,
            fontStyle: 'italic',
          }}>
            {segment.note}
          </p>
        )}
      </div>
    </div>
  );
}
