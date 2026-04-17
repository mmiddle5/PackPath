import { useState } from 'react';
import { COLORS } from '../styles/tokens.js';

const SCENERY_OPTIONS = [
  'lakes', 'peaks', 'passes', 'meadows', 'forest', 'streams', 'ridgeline',
];

const inputBase = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 14,
  border: `1px solid ${COLORS.stone300}`,
  background: '#fff',
  color: COLORS.stone800,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: COLORS.stone600,
  marginBottom: 4,
};

/**
 * Trip preferences form.
 * Calls onSubmit(preferences) when the user submits.
 * onBack returns to the picker view.
 */
export function PreferenceForm({ onBack, onSubmit, isLoading }) {
  const [form, setForm] = useState({
    daysTarget: 4,
    milesPerDayTarget: 10,
    elevationTolerance: 'moderate',
    sceneryPreferences: [],
    crowdPreference: 'mixed',
    experienceLevel: 'intermediate',
    groupType: 'couple',
    avoid: '',
    priorities: '',
    notes: '',
  });

  const update = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const toggleScenery = (s) => {
    update('sceneryPreferences',
      form.sceneryPreferences.includes(s)
        ? form.sceneryPreferences.filter((x) => x !== s)
        : [...form.sceneryPreferences, s]
    );
  };

  const handleSubmit = () => {
    if (onSubmit) onSubmit(form);
  };

  return (
    <div>
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

      <div style={{
        background: `linear-gradient(135deg, ${COLORS.emerald700}, ${COLORS.emerald800})`,
        borderRadius: 12,
        padding: 20,
        marginBottom: 20,
        color: '#fff',
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px 0' }}>Trip Preferences</h2>
        <p style={{ fontSize: 14, color: '#a7f3d0', margin: 0 }}>
          Tell us what you're looking for and the AI pipeline will find matching routes.
        </p>
      </div>

      <div style={{
        background: '#fff',
        borderRadius: 10,
        padding: 20,
        border: `1px solid ${COLORS.stone200}`,
      }}>
        {/* Days + Miles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Days</label>
            <input
              type="number" min={1} max={14}
              value={form.daysTarget}
              onChange={(e) => update('daysTarget', +e.target.value)}
              style={inputBase}
            />
          </div>
          <div>
            <label style={labelStyle}>Miles / Day</label>
            <input
              type="number" min={3} max={25}
              value={form.milesPerDayTarget}
              onChange={(e) => update('milesPerDayTarget', +e.target.value)}
              style={inputBase}
            />
          </div>
        </div>

        {/* Elevation */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Elevation Tolerance</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['easy', 'moderate', 'hard'].map((lvl) => (
              <button key={lvl} onClick={() => update('elevationTolerance', lvl)} style={{
                flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
                background: form.elevationTolerance === lvl ? COLORS.emerald600 : COLORS.stone100,
                color: form.elevationTolerance === lvl ? '#fff' : COLORS.stone600,
                border: `1px solid ${form.elevationTolerance === lvl ? COLORS.emerald600 : COLORS.stone300}`,
              }}>
                {lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Scenery */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Scenery Preferences</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SCENERY_OPTIONS.map((s) => {
              const active = form.sceneryPreferences.includes(s);
              return (
                <button key={s} onClick={() => toggleScenery(s)} style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                  cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
                  background: active ? COLORS.emerald600 : '#fff',
                  color: active ? '#fff' : COLORS.stone600,
                  border: `1px solid ${active ? COLORS.emerald600 : COLORS.stone300}`,
                }}>
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        {/* Crowd */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Crowd Preference</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['solitude', 'mixed', 'popular is fine'].map((opt) => (
              <button key={opt} onClick={() => update('crowdPreference', opt)} style={{
                flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', textTransform: 'capitalize',
                background: form.crowdPreference === opt ? COLORS.emerald600 : COLORS.stone100,
                color: form.crowdPreference === opt ? '#fff' : COLORS.stone600,
                border: `1px solid ${form.crowdPreference === opt ? COLORS.emerald600 : COLORS.stone300}`,
              }}>
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Experience + Group */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Experience Level</label>
            <select
              value={form.experienceLevel}
              onChange={(e) => update('experienceLevel', e.target.value)}
              style={inputBase}
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Group Type</label>
            <select
              value={form.groupType}
              onChange={(e) => update('groupType', e.target.value)}
              style={inputBase}
            >
              <option value="solo">Solo</option>
              <option value="couple">Couple</option>
              <option value="small group">Small Group (3–4)</option>
              <option value="large group">Large Group (5+)</option>
            </select>
          </div>
        </div>

        {/* Avoid */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Avoid</label>
          <input
            type="text"
            value={form.avoid}
            placeholder="e.g., long stretches without water"
            onChange={(e) => update('avoid', e.target.value)}
            style={inputBase}
          />
        </div>

        {/* Priorities */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Priorities</label>
          <input
            type="text"
            value={form.priorities}
            placeholder="e.g., alpine lakes, variety of terrain"
            onChange={(e) => update('priorities', e.target.value)}
            style={inputBase}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={form.notes}
            rows={3}
            placeholder="Anything else the AI should know..."
            onChange={(e) => update('notes', e.target.value)}
            style={{ ...inputBase, resize: 'vertical' }}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '12px 0',
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 700,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
            background: COLORS.emerald600,
            color: '#fff',
            border: 'none',
          }}
        >
          {isLoading ? 'Finding routes…' : '⛰ Find Routes'}
        </button>
      </div>
    </div>
  );
}
