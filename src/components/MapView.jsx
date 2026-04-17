// MapView.jsx
// Interactive route map using Leaflet + OpenStreetMap tiles.
// Renders the full route as a red polyline built from per-segment coords,
// marks the trailhead, and provides Google Maps and GPX export actions.
//
// Leaflet is loaded lazily from CDN on first mount to avoid adding it as
// a build dependency. The component renders a placeholder until Leaflet
// is ready.

import { useEffect, useRef, useState } from 'react';
import { COLORS } from '../styles/tokens.js';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';

// ── Leaflet loader (singleton promise) ───────────────────────────────
let leafletPromise = null;

function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (window.L) { resolve(window.L); return; }

    // Inject CSS
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    // Inject JS
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Failed to load Leaflet'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

// ── GPX export ────────────────────────────────────────────────────────
function buildGpx(route) {
  const allCoords = route.segments.flatMap(s => s.coords || []);
  if (allCoords.length === 0) return null;

  const trkpts = allCoords
    .map(([lat, lon]) => `    <trkpt lat="${lat}" lon="${lon}"></trkpt>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="PackPath" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${route.routeName}</name>
  </metadata>
  <trk>
    <name>${route.routeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

function downloadGpx(route) {
  const gpx = buildGpx(route);
  if (!gpx) return;
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${route.routeName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────
export function MapView({ route }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef  = useRef(null);
  const [leafletReady, setLeafletReady] = useState(!!window.L);
  const [mapError, setMapError] = useState(null);

  // Collect all coords across all days
  const allCoords = route.segments.flatMap(s => s.coords || []);
  const hasCoords = allCoords.length > 0;

  // Trailhead: first coord of the route
  const trailhead = route.trailheadCoord ?? allCoords[0] ?? null;

  // Google Maps deep link — directions to trailhead
  const googleMapsUrl = trailhead
    ? `https://www.google.com/maps/dir/?api=1&destination=${trailhead[0]},${trailhead[1]}`
    : null;

  // Load Leaflet
  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    loadLeaflet()
      .then(() => setLeafletReady(true))
      .catch(err => setMapError(err.message));
  }, []);

  // Initialise / update map
  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || !hasCoords) return;

    const L = window.L;

    // Destroy previous instance if route changed
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, { zoomControl: true, scrollWheelZoom: false });
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 17,
    }).addTo(map);

    // Draw full route as a single red polyline
    const polyline = L.polyline(allCoords, {
      color: '#dc2626',
      weight: 3,
      opacity: 0.85,
    }).addTo(map);

    // Trailhead marker
    if (trailhead) {
      const icon = L.divIcon({
        html: '<div style="background:#059669;width:12px;height:12px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
        className: '',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      L.marker(trailhead, { icon })
        .addTo(map)
        .bindPopup('Trailhead');
    }

    // Fit map to route bounds
    map.fitBounds(polyline.getBounds(), { padding: [20, 20] });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [leafletReady, route.routeName, hasCoords]);

  const hasGpx = allCoords.length > 0;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Map container */}
      <div style={{
        borderRadius: 10,
        overflow: 'hidden',
        border: `1px solid ${COLORS.stone200}`,
        background: COLORS.stone100,
        position: 'relative',
      }}>
        {mapError && (
          <div style={{
            height: 220,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            color: COLORS.stone500,
          }}>
            Map unavailable — {mapError}
          </div>
        )}

        {!mapError && !hasCoords && (
          <div style={{
            height: 220,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            color: COLORS.stone400,
          }}>
            Map coordinates not available for this route.
            <br />Run the pipeline to generate geometry.
          </div>
        )}

        {!mapError && hasCoords && (
          <div
            ref={mapContainerRef}
            style={{ height: 280, width: '100%' }}
          />
        )}

        {!mapError && hasCoords && !leafletReady && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: COLORS.stone100,
            fontSize: 13, color: COLORS.stone500,
          }}>
            Loading map…
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {googleMapsUrl && (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 14px',
              borderRadius: 8,
              background: '#fff',
              border: `1px solid ${COLORS.stone300}`,
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.stone700,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 15 }}>🗺</span>
            Directions in Google Maps
          </a>
        )}

        {hasGpx && (
          <button
            onClick={() => downloadGpx(route)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 14px',
              borderRadius: 8,
              background: '#fff',
              border: `1px solid ${COLORS.stone300}`,
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.stone700,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 15 }}>↓</span>
            Download GPX
          </button>
        )}
      </div>
    </div>
  );
}
