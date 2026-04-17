import { useState, useMemo } from 'react';
import { COLORS, FONT_FAMILY } from './styles/tokens.js';
import { useRoutes } from './hooks/useRoutes.js';
import { RouteCard } from './components/RouteCard.jsx';
import { RouteDetail } from './components/RouteDetail.jsx';
import { PreferenceForm } from './components/PreferenceForm.jsx';

// Step labels for the progress indicator
const STEP_LABELS = [
  'Load region',
  'Load clusters',
  'Score routes',
  'Build input',
  'Generate narration',
  'Validate',
];

export default function App() {
  const [view, setView] = useState('picker'); // picker | detail | prefs
  const [selectedRoute, setSelectedRoute] = useState(null);

  const { routes, status, step, message, error, findRoutes, reset } = useRoutes();

  const openRoute = (route) => { setSelectedRoute(route); setView('detail'); };
  const goHome    = () => { setView('picker'); setSelectedRoute(null); };

  const displayRoutes = routes;

  const totalFeatures = useMemo(() => {
    if (!displayRoutes) return 0;
    const all = new Set();
    displayRoutes.forEach((r) =>
      r.segments.forEach((s) =>
        Object.values(s.features).forEach((arr) => arr.forEach((f) => all.add(f)))
      )
    );
    return all.size;
  }, [displayRoutes]);

  const handleFindRoutes = async (prefs) => {
    setView('picker');
    await findRoutes(prefs);
  };

  return (
    <div style={{
      maxWidth: 640,
      margin: '0 auto',
      padding: '16px 16px 40px',
      fontFamily: FONT_FAMILY,
      color: COLORS.stone800,
      background: COLORS.stone50,
      minHeight: '100vh',
    }}>

      {/* ── Preference Form ── */}
      {view === 'prefs' && (
        <PreferenceForm
          onBack={goHome}
          onSubmit={handleFindRoutes}
          isLoading={status === 'loading'}
        />
      )}

      {/* ── Route Detail ── */}
      {view === 'detail' && selectedRoute && (
        <RouteDetail route={selectedRoute} onBack={goHome} />
      )}

      {/* ── Picker / Home ── */}
      {view === 'picker' && (
        <>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 24, paddingTop: 8 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginBottom: 4,
            }}>
              <span style={{ fontSize: 28 }}>⛰</span>
              <h1 style={{
                fontSize: 26,
                fontWeight: 800,
                margin: 0,
                color: COLORS.stone800,
                letterSpacing: -0.5,
              }}>
                PackPath
              </h1>
            </div>
            <p style={{ fontSize: 14, color: COLORS.stone500, margin: '4px 0 0 0' }}>
              Ansel Adams Wilderness · Sierra Nevada
            </p>
            {displayRoutes && (
              <p style={{ fontSize: 13, color: COLORS.stone400, margin: '8px 0 0 0' }}>
                {displayRoutes.length} routes · {totalFeatures} trail features · AI-planned from real geometry
              </p>
            )}
          </div>

          {/* Loading state */}
          {status === 'loading' && (
            <div style={{
              background: '#fff',
              border: `1px solid ${COLORS.stone200}`,
              borderRadius: 12,
              padding: 24,
              textAlign: 'center',
              marginBottom: 16,
            }}>
              <div style={{
                width: 36,
                height: 36,
                border: `3px solid ${COLORS.stone200}`,
                borderTopColor: COLORS.emerald600,
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 16px',
              }} />
              <p style={{ fontSize: 14, color: COLORS.stone600, margin: '0 0 16px 0' }}>
                {message || 'Finding routes…'}
              </p>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                {STEP_LABELS.map((label, i) => (
                  <span key={i} style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 20,
                    background: i < step ? COLORS.emerald100
                      : i === step ? COLORS.emerald600
                      : COLORS.stone100,
                    color: i < step ? COLORS.emerald700
                      : i === step ? '#fff'
                      : COLORS.stone400,
                  }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Error state */}
          {status === 'failed' && error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}>
              <p style={{ fontSize: 14, color: COLORS.hardRed, margin: '0 0 8px 0', fontWeight: 600 }}>
                Something went wrong
              </p>
              <p style={{ fontSize: 13, color: COLORS.stone600, margin: '0 0 12px 0' }}>{error}</p>
              <button onClick={reset} style={{
                fontSize: 13, fontWeight: 600, color: COLORS.emerald600,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}>
                Try again
              </button>
            </div>
          )}

          {/* Route cards */}
          {displayRoutes?.map((route, i) => (
            <RouteCard key={i} route={route} onClick={() => openRoute(route)} />
          ))}

          {/* Empty state — no routes yet */}
          {!displayRoutes && status !== 'loading' && (
            <div style={{
              background: '#fff',
              border: `1px solid ${COLORS.stone200}`,
              borderRadius: 12,
              padding: 32,
              textAlign: 'center',
              marginBottom: 16,
            }}>
              <p style={{ fontSize: 15, color: COLORS.stone500, margin: 0 }}>
                Set your trip preferences to find routes.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setView('prefs')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '14px 0',
                borderRadius: 10,
                background: 'none',
                border: `1px dashed ${COLORS.stone300}`,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                color: COLORS.stone500,
              }}
            >
              <span style={{ fontSize: 18 }}>⚙</span> Set trip preferences
            </button>
          </div>
        </>
      )}

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
