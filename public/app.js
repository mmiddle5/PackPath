// app.js — PackPath frontend

// ── Section management ────────────────────────────────────────────────
const sections = {
  form:     document.getElementById('form-section'),
  progress: document.getElementById('progress-section'),
  error:    document.getElementById('error-section'),
  results:  document.getElementById('results-section'),
};

function showSection(name) {
  Object.entries(sections).forEach(([key, el]) => {
    el.classList.toggle('hidden', key !== name);
  });
}

function resetToForm() {
  showSection('form');
  setSubmitState(false);
  clearFieldErrors();
}

window.resetToForm = resetToForm;

// ── Form submission ───────────────────────────────────────────────────
document.getElementById('prefs-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const prefs = collectAndValidate();
  if (!prefs) return;
  await runPipeline(prefs);
});

// ── Demo button ───────────────────────────────────────────────────────
document.getElementById('demo-btn').addEventListener('click', async () => {
  showSection('progress');
  setProgress(5, 'Loading demo output…');
  try {
    const res = await fetch('/api/routes/cached');
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'No cached output available.');
      return;
    }
    renderResults(data.routes);
  } catch (err) {
    showError('Could not load demo output: ' + err.message);
  }
});

// ── Collect + validate form ───────────────────────────────────────────
function collectAndValidate() {
  clearFieldErrors();
  let valid = true;

  const days = parseInt(document.getElementById('days').value);
  const miles = parseFloat(document.getElementById('miles').value);
  const elevation = document.getElementById('elevation').value;
  const crowd = document.getElementById('crowd').value;
  const experience = document.getElementById('experience').value;
  const notes = document.getElementById('notes').value.trim();
  const scenery = [...document.querySelectorAll('input[name="scenery"]:checked')].map(cb => cb.value);

  if (isNaN(days) || days < 2 || days > 10) {
    setFieldError('days', 'Enter a number between 2 and 10');
    valid = false;
  }
  if (isNaN(miles) || miles < 4 || miles > 20) {
    setFieldError('miles', 'Enter a number between 4 and 20');
    valid = false;
  }
  if (scenery.length === 0) {
    setFieldError('scenery-group', 'Select at least one scenery type');
    valid = false;
  }

  if (!valid) return null;

  return {
    daysTarget: days,
    milesPerDayTarget: miles,
    elevationTolerance: elevation,
    sceneryPreferences: scenery,
    crowdPreference: crowd,
    experienceLevel: experience,
    groupType: 'couple',
    avoid: '',
    priorities: scenery.join(', '),
    notes: notes || undefined,
  };
}

function setFieldError(fieldId, message) {
  const field = document.getElementById(fieldId) ||
                document.querySelector(`[data-error-id="${fieldId}"]`);
  if (!field) return;
  field.classList.add('field-error');
  const existing = field.parentElement.querySelector('.error-hint');
  if (!existing) {
    const hint = document.createElement('span');
    hint.className = 'error-hint';
    hint.textContent = message;
    field.parentElement.appendChild(hint);
  }
}

function clearFieldErrors() {
  document.querySelectorAll('.field-error').forEach(el => el.classList.remove('field-error'));
  document.querySelectorAll('.error-hint').forEach(el => el.remove());
}

// ── Submit button state ───────────────────────────────────────────────
function setSubmitState(loading) {
  const btn = document.getElementById('submit-btn');
  btn.disabled = loading;
  btn.textContent = loading ? 'Finding routes…' : 'Find routes';
}

// ── SSE pipeline ──────────────────────────────────────────────────────
// Uses a proper line-buffer parser. SSE format is:
//   event: <type>\n
//   data: <json>\n
//   \n
// We accumulate lines until we hit a blank line (message boundary),
// then extract event + data from the buffered block.
async function runPipeline(prefs) {
  showSection('progress');
  setSubmitState(true);

  try {
    const response = await fetch('/api/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      showError(data.error || 'Server error. Check that ANTHROPIC_API_KEY is set.');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let rawBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      rawBuffer += decoder.decode(value, { stream: true });
      rawBuffer = processSSEBuffer(rawBuffer);
    }

    // Flush any remaining complete message in the buffer
    processSSEBuffer(rawBuffer + '\n\n');

  } catch (err) {
    showError('Connection error: ' + err.message);
  }
}

// Processes all complete SSE messages in the buffer.
// Returns the unconsumed remainder (incomplete message at the end).
function processSSEBuffer(buffer) {
  // SSE messages are separated by double newlines
  const messages = buffer.split(/\n\n/);
  // Last element is either empty or an incomplete message — keep it
  const remainder = messages.pop();

  for (const message of messages) {
    if (!message.trim()) continue;
    const lines = message.split('\n');
    let eventType = 'message';
    let dataLine = null;

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        dataLine = line.slice(6);
      }
    }

    if (dataLine !== null) {
      try {
        const payload = JSON.parse(dataLine);
        handleSSEEvent(eventType, payload);
      } catch (e) {
        console.warn('SSE parse error:', e.message, 'data:', dataLine);
      }
    }
  }

  return remainder;
}

function handleSSEEvent(type, payload) {
  if (type === 'progress') {
    setProgress(payload.step, payload.message);
  } else if (type === 'result') {
    renderResults(payload.routes);
  } else if (type === 'error') {
    showError(payload.message);
  }
}

// ── Progress UI ───────────────────────────────────────────────────────
const STEP_LABELS = [
  'Load region',
  'Load clusters',
  'Score routes',
  'Build input',
  'Generate narration',
  'Validate',
];

function setProgress(step, message) {
  document.getElementById('progress-message').textContent = message;
  document.querySelectorAll('.step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle('done', s < step);
    el.classList.toggle('active', s === step);
  });
}

// ── Error UI ──────────────────────────────────────────────────────────
function showError(message) {
  document.getElementById('error-message').textContent = message;
  showSection('error');
  setSubmitState(false);
}

// ── Map instances — track by route index to avoid double-init ────────
const mapInstances = new Map();

function destroyMaps() {
  for (const map of mapInstances.values()) {
    map.remove();
  }
  mapInstances.clear();
}

// ── Results ───────────────────────────────────────────────────────────
function renderResults(routes) {
  destroyMaps();
  const grid = document.getElementById('routes-grid');
  grid.innerHTML = '';
  for (let i = 0; i < routes.length; i++) {
    grid.appendChild(buildRouteCard(routes[i], i));
  }
  showSection('results');
  // Init maps after DOM is painted
  requestAnimationFrame(() => {
    for (let i = 0; i < routes.length; i++) {
      initMap(routes[i], i);
    }
  });
}

function buildRouteCard(route, index) {
  const card = document.createElement('article');
  card.className = 'route-card';

  const gainK = (route.totalGainFt / 1000).toFixed(1);
  const lossK = (route.totalLossFt / 1000).toFixed(1);
  const archClass = `archetype-${route.archetype}`;
  const milesPerDay = (route.totalMiles / route.days).toFixed(1);

  card.innerHTML = `
    <div class="route-card-header">
      <div class="route-title">
        <div class="route-name">${esc(route.routeName)}</div>
        <span class="route-archetype ${archClass}">${esc(route.archetype)}</span>
      </div>
      <div class="route-stats">
        <div class="stat">
          <span class="stat-value">${route.totalMiles} mi</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="stat">
          <span class="stat-value">${route.days} days</span>
          <span class="stat-label">Duration</span>
        </div>
        <div class="stat">
          <span class="stat-value">${milesPerDay} mi</span>
          <span class="stat-label">Per day</span>
        </div>
        <div class="stat">
          <span class="stat-value">+${gainK}k ft</span>
          <span class="stat-label">Gain</span>
        </div>
        <div class="stat">
          <span class="stat-value">-${lossK}k ft</span>
          <span class="stat-label">Loss</span>
        </div>
      </div>
    </div>

    <div class="route-card-body">
      <div class="route-map" id="map-${index}" aria-label="Map showing approximate location of ${esc(route.routeName)}"></div>
      <div class="route-text">
        <div class="route-summary">${esc(route.summary)}</div>
        <div class="best-for"><strong>Best for:</strong> ${esc(route.bestFor)}</div>
      </div>
    </div>

    <button class="itinerary-toggle" aria-expanded="false">
      Day-by-day itinerary
      <span class="toggle-icon">▼</span>
    </button>
    <div class="itinerary-body" role="region">
      ${route.segments.map(seg => buildDayRow(seg, route.days)).join('')}
    </div>

    <div class="pros-cons">
      <div class="pros">
        <h4>Pros</h4>
        <ul>${route.pros.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      </div>
      <div class="cons">
        <h4>Cons</h4>
        <ul>${route.cons.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      </div>
    </div>

    ${route.gearTips?.length ? `
    <div class="gear-tips">
      <h4>Gear tips</h4>
      <ul>${route.gearTips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>` : ''}
  `;

  const toggle = card.querySelector('.itinerary-toggle');
  const body = card.querySelector('.itinerary-body');
  toggle.addEventListener('click', () => {
    const open = body.classList.toggle('open');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });

  return card;
}

// ── Map initialisation ────────────────────────────────────────────────
// Uses OpenTopoMap — free, no API key, topographic tiles ideal for trail planning.
// Falls back gracefully if Leaflet isn't loaded (e.g. offline).
function initMap(route, index) {
  if (typeof L === 'undefined') return;

  const container = document.getElementById(`map-${index}`);
  if (!container) return;

  const lat = route.geoCenter?.lat;
  const lon = route.geoCenter?.lon;
  if (!lat || !lon) {
    container.classList.add('map--no-data');
    container.textContent = 'Location data unavailable';
    return;
  }

  const map = L.map(container, {
    center: [lat, lon],
    zoom: 11,
    zoomControl: true,
    scrollWheelZoom: false,  // prevent accidental zoom while scrolling the page
    attributionControl: true,
  });

  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 15,
    attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> ' +
                 '(<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
  }).addTo(map);

  // Custom marker — pine green circle matching the brand
  const markerIcon = L.divIcon({
    className: 'route-marker',
    html: '<div class="route-marker-inner">▲</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  L.marker([lat, lon], { icon: markerIcon })
    .addTo(map)
    .bindPopup(`<strong>${route.routeName}</strong><br>${route.totalMiles} mi · ${route.days} days`);

  mapInstances.set(index, map);
}

function buildDayRow(seg, totalDays) {
  const trails = seg.trailNames.filter(t => t && t !== '(unnamed)').join(', ');
  const gainStr = seg.gainFt ? `+${seg.gainFt.toLocaleString()} ft` : '';
  const lossStr = seg.lossFt ? `-${seg.lossFt.toLocaleString()} ft` : '';

  return `
    <div class="day-row">
      <div class="day-label">Day ${seg.day}<span class="day-of-total"> / ${totalDays}</span></div>
      <div class="day-content">
        <div class="day-stats">
          <span class="day-stat">${seg.miles} mi</span>
          ${gainStr ? `<span class="day-stat">${gainStr}</span>` : ''}
          ${lossStr ? `<span class="day-stat">${lossStr}</span>` : ''}
        </div>
        ${trails ? `<div class="day-trails">${esc(trails)}</div>` : ''}
        <div class="day-note">${esc(seg.note)}</div>
      </div>
    </div>
  `;
}

// ── HTML escape ───────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
