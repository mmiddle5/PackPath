// WeatherPanel.jsx
// Displays weather forecast or historical climate normals for a route.
// Data comes from Open-Meteo (fetched server-side and attached to the route).

import { COLORS } from '../styles/tokens.js';

// WMO weather code → emoji
function wmoEmoji(code) {
  if (code === null || code === undefined) return '🌤';
  if (code === 0) return '☀️';
  if (code <= 2) return '⛅';
  if (code === 3) return '☁️';
  if (code <= 49) return '🌫';
  if (code <= 59) return '🌦';
  if (code <= 69) return '🌧';
  if (code <= 79) return '❄️';
  if (code <= 84) return '🌦';
  if (code <= 94) return '⛈';
  return '🌩';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function ForecastDay({ day }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 3,
      minWidth: 56,
      padding: '8px 6px',
      borderRadius: 8,
      background: '#fff',
      border: `1px solid ${COLORS.stone200}`,
      fontSize: 12,
    }}>
      <span style={{ fontSize: 11, color: COLORS.stone500, fontWeight: 600 }}>
        {formatDate(day.date)}
      </span>
      <span style={{ fontSize: 20 }}>{wmoEmoji(day.weatherCode)}</span>
      <span style={{ fontWeight: 700, color: COLORS.stone800 }}>
        {day.tempHighF !== null ? `${Math.round(day.tempHighF)}°` : '—'}
      </span>
      <span style={{ color: COLORS.stone400 }}>
        {day.tempLowF !== null ? `${Math.round(day.tempLowF)}°` : '—'}
      </span>
      {day.precipIn > 0 && (
        <span style={{ color: COLORS.sky600, fontSize: 11 }}>
          {day.precipIn.toFixed(2)}"
        </span>
      )}
    </div>
  );
}

export function WeatherPanel({ weather }) {
  if (!weather) return null;

  const isForecast = weather.source === 'forecast';
  const isClimate  = weather.source === 'climate_normals';

  return (
    <div style={{
      background: COLORS.sky50,
      borderRadius: 10,
      padding: 16,
      border: `1px solid ${COLORS.sky100}`,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 18 }}>🌤</span>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: COLORS.sky700, margin: 0 }}>
          {isForecast ? 'Weather Forecast' : 'Typical Weather'}
        </h4>
        {weather.elevation && (
          <span style={{ fontSize: 12, color: COLORS.stone400, marginLeft: 'auto' }}>
            {Math.round(weather.elevation * 3.28084).toLocaleString()} ft elevation
          </span>
        )}
      </div>

      {/* Per-day forecast */}
      {isForecast && weather.days && weather.days.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {weather.days.map((day, i) => (
              <ForecastDay key={i} day={day} />
            ))}
          </div>
          <p style={{ fontSize: 11, color: COLORS.stone400, margin: '8px 0 0 0' }}>
            Forecast from Open-Meteo · {weather.startDate}
          </p>
        </>
      )}

      {/* Climate normals */}
      {isClimate && (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {weather.avgHighF !== null && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.amber600 }}>
                  {weather.avgHighF}°F
                </div>
                <div style={{ fontSize: 12, color: COLORS.stone500 }}>Avg High</div>
              </div>
            )}
            {weather.avgLowF !== null && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.sky600 }}>
                  {weather.avgLowF}°F
                </div>
                <div style={{ fontSize: 12, color: COLORS.stone500 }}>Avg Low</div>
              </div>
            )}
            {weather.avgPrecipIn !== null && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.stone600 }}>
                  {weather.avgPrecipIn}"
                </div>
                <div style={{ fontSize: 12, color: COLORS.stone500 }}>Avg Precip</div>
              </div>
            )}
          </div>
          <p style={{ fontSize: 11, color: COLORS.stone400, margin: '10px 0 0 0' }}>
            30-year climate normals (1991–2020) for this time of year · Open-Meteo
          </p>
        </>
      )}
    </div>
  );
}
