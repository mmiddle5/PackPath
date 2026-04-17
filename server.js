// server.js
// Express API server for PackPath.
// Wraps the pipeline as an HTTP API and serves the static frontend.
//
// Routes:
//   GET  /api/regions          — list available regions
//   POST /api/routes           — create a background job, returns { jobId, status }
//   GET  /api/routes/:jobId    — poll job status and result
//   GET  /                     — serve the frontend

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { rankClusters } from './rank-clusters.js';
import { validateNarration } from './validate-narration.js';
import { NarrationError, RegionConfigError } from './errors.js';
import {
  assignArchetype,
  buildNarrationInput,
  buildPromptMarkdown,
  postProcess,
} from './pipeline-core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-5-20250929';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_RETRIES = 2;
const CLAUDE_TIMEOUT_MS = 120_000; // 2 minutes
const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── In-memory job store ───────────────────────────────────────────────
const jobs = new Map();

// Periodically remove jobs older than JOB_TTL_MS to prevent memory leak.
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000); // run every 5 minutes

function createJob() {
  const jobId = crypto.randomUUID();
  const now = Date.now();
  const job = {
    jobId,
    status: 'queued',
    step: 0,
    message: 'Queued',
    routes: null,
    error: null,
    validated: false,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(jobId, job);
  return job;
}

function updateJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}

const app = express();
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      'https://packpath.com',
      'https://www.packpath.com',
      /https:\/\/.*\.onrender\.com$/,
    ]
  : true; // allow all in dev

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// ── Serve static frontend ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── GET /api/regions ──────────────────────────────────────────────────
app.get('/api/regions', async (req, res) => {
  try {
    const files = await fs.readdir(path.join(__dirname, 'regions'));
    const regions = await Promise.all(
      files
        .filter(f => f.endsWith('.json'))
        .map(async f => {
          const config = JSON.parse(await fs.readFile(path.join(__dirname, 'regions', f), 'utf-8'));
          const id = f.replace('.json', '');
          const hasCache = existsSync(path.join(__dirname, 'cache', `${id}-clusters.json`)) ||
                           existsSync(path.join(__dirname, 'cache', 'clusters.json'));
          return { id, name: config.name, ready: hasCache };
        })
    );
    res.json({ regions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/routes ──────────────────────────────────────────────────
// Body: user preferences object (see user-preferences.example.json for schema)
// Optional query param: ?region=ansel-adams (default: ansel-adams)
// Returns immediately with { jobId, status: 'queued' }.
// Poll GET /api/routes/:jobId for progress and results.
app.post('/api/routes', (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY environment variable not set on the server.'
    });
  }

  const regionName = req.query.region || 'ansel-adams';
  const preferences = req.body;

  const prefErrors = validatePreferences(preferences);
  if (prefErrors.length > 0) {
    return res.status(400).json({ error: 'Invalid preferences', details: prefErrors });
  }

  const job = createJob();

  // Fire-and-forget — do NOT await
  runPipeline(job.jobId, preferences, regionName).catch(err => {
    // Catch any unexpected top-level error not already handled inside runPipeline
    updateJob(job.jobId, {
      status: 'failed',
      error: err.message || 'Unknown error',
    });
  });

  res.json({ jobId: job.jobId, status: 'queued' });
});

// ── GET /api/routes/:jobId ────────────────────────────────────────────
app.get('/api/routes/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// ── Background pipeline ───────────────────────────────────────────────
async function runPipeline(jobId, preferences, regionName) {
  try {
    // Step 0: Load region config
    updateJob(jobId, { status: 'running', step: 0, message: 'Loading region data…' });
    let regionConfig;
    try {
      regionConfig = JSON.parse(
        await fs.readFile(path.join(__dirname, 'regions', `${regionName}.json`), 'utf-8')
      );
    } catch (e) {
      throw new RegionConfigError(`Region "${regionName}" not found.`);
    }

    // Step 1: Check cache
    updateJob(jobId, { step: 1, message: 'Loading trail clusters…' });
    const clusterPath = existsSync(path.join(__dirname, 'cache', `${regionName}-clusters.json`))
      ? path.join(__dirname, 'cache', `${regionName}-clusters.json`)
      : path.join(__dirname, 'cache', 'clusters.json');

    if (!existsSync(clusterPath)) {
      throw new Error(
        'Trail cluster cache not found. Run the full pipeline first: npm run fetch && npm run enrich && npm run loops'
      );
    }

    // Step 2: Rank clusters
    updateJob(jobId, { step: 2, message: 'Scoring and ranking routes…' });
    const { ranked } = await rankClusters(preferences, { clusterPath });

    if (ranked.length === 0) {
      throw new Error('No routes matched your preferences. Try adjusting mileage or elevation tolerance.');
    }

    // Step 3: Build narration input
    updateJob(jobId, { step: 3, message: `Found ${ranked.length} candidate routes. Building itinerary…` });
    const structuredInput = buildNarrationInput(ranked, preferences, assignArchetype);
    const promptMd = buildPromptMarkdown(structuredInput);

    // Step 4: Call Claude (with retry loop)
    updateJob(jobId, { step: 4, message: 'Generating route narration (this takes 15–30 seconds)…' });
    const messages = [{ role: 'user', content: promptMd }];
    let attempt = 1;
    let finalOutput = null;
    let validationResult = null;

    while (attempt <= MAX_RETRIES + 1) {
      if (attempt > 1) {
        updateJob(jobId, { step: 4, message: `Fixing validation errors (attempt ${attempt})…` });
      }

      let responseText;
      try {
        responseText = await callClaude(messages, API_KEY);
      } catch (err) {
        throw new NarrationError(`Claude API call failed: ${err.message}`);
      }

      const claudeOutput = extractJSON(responseText);
      if (!claudeOutput) {
        if (attempt <= MAX_RETRIES) {
          messages.push({ role: 'assistant', content: responseText });
          messages.push({
            role: 'user',
            content: `Your response was not valid JSON. Output ONLY a JSON array with no markdown fences or explanation.`,
          });
          attempt++;
          continue;
        }
        throw new NarrationError('Claude returned unparseable JSON after all retries.');
      }

      try {
        finalOutput = postProcess(claudeOutput, structuredInput);
      } catch (err) {
        throw new NarrationError(`Post-processing failed: ${err.message}`);
      }

      validationResult = validateNarration(finalOutput, structuredInput, regionConfig);

      if (validationResult.ok) break;

      if (attempt <= MAX_RETRIES) {
        const errorList = validationResult.errors.map(e => `- [${e.check}] ${e.msg}`).join('\n');
        messages.push({ role: 'assistant', content: responseText });
        messages.push({
          role: 'user',
          content: `Your previous output had ${validationResult.errors.length} validation errors:\n\n${errorList}\n\nPlease fix these and output the corrected JSON array only.`,
        });
        attempt++;
      } else {
        break;
      }
    }

    // Step 5: Persist and mark done
    updateJob(jobId, { step: 5, message: 'Validating output…' });

    // Step 6: Fetch weather for each route (non-blocking — failures are tolerated)
    updateJob(jobId, { step: 5, message: 'Fetching weather data…' });
    const weatherResults = await Promise.allSettled(
      finalOutput.map(route =>
        fetchWeatherForRoute(route.geoCenter, preferences.startDate, preferences.daysTarget)
      )
    );
    const finalOutputWithWeather = finalOutput.map((route, i) => ({
      ...route,
      weather: weatherResults[i].status === 'fulfilled' ? weatherResults[i].value : null,
    }));

    await fs.writeFile(
      path.join(__dirname, 'narration-output-real.json'),
      JSON.stringify(finalOutputWithWeather, null, 2)
    );

    updateJob(jobId, {
      status: 'done',
      step: 5,
      message: 'Done',
      routes: finalOutputWithWeather,
      validated: validationResult?.ok ?? false,
      attempts: attempt,
    });
  } catch (err) {
    updateJob(jobId, {
      status: 'failed',
      error: err.message || 'Unknown error',
      message: `Failed: ${err.message}`,
    });
  }
}

// ── Preference validation ─────────────────────────────────────────────
function validatePreferences(prefs) {
  const errors = [];
  if (!prefs || typeof prefs !== 'object') return ['Request body must be a JSON object'];
  if (!prefs.daysTarget || prefs.daysTarget < 1 || prefs.daysTarget > 14) {
    errors.push('daysTarget must be between 1 and 14');
  }
  if (!prefs.milesPerDayTarget || prefs.milesPerDayTarget < 3 || prefs.milesPerDayTarget > 25) {
    errors.push('milesPerDayTarget must be between 3 and 25');
  }
  if (!['easy', 'moderate', 'hard'].includes(prefs.elevationTolerance)) {
    errors.push('elevationTolerance must be easy, moderate, or hard');
  }
  if (!Array.isArray(prefs.sceneryPreferences) || prefs.sceneryPreferences.length === 0) {
    errors.push('sceneryPreferences must be a non-empty array');
  }
  if (prefs.startDate !== undefined && prefs.startDate !== null && prefs.startDate !== '') {
    const d = new Date(prefs.startDate);
    if (isNaN(d.getTime())) {
      errors.push('startDate must be a valid ISO date string (YYYY-MM-DD)');
    }
  }
  return errors;
}

// ── Weather fetch (Open-Meteo — free, no API key) ─────────────────────
// For dates within 16 days: real forecast.
// For dates further out or no date: historical climate averages for that
// calendar week using the Open-Meteo climate API.
const WEATHER_TIMEOUT_MS = 10_000;

async function fetchWeatherForRoute(geoCenter, startDate, daysTarget) {
  if (!geoCenter) return null;
  const { lat, lon } = geoCenter;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEATHER_TIMEOUT_MS);

    let weatherData;
    const today = new Date();
    const tripStart = startDate ? new Date(startDate) : null;
    const daysUntilTrip = tripStart ? Math.ceil((tripStart - today) / (1000 * 60 * 60 * 24)) : null;
    const useForecast = daysUntilTrip !== null && daysUntilTrip >= 0 && daysUntilTrip <= 16;

    try {
      if (useForecast) {
        // Real forecast from Open-Meteo
        const endDate = new Date(tripStart);
        endDate.setDate(endDate.getDate() + daysTarget - 1);
        const fmt = d => d.toISOString().split('T')[0];
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,windspeed_10m_max&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&start_date=${fmt(tripStart)}&end_date=${fmt(endDate)}&timezone=America%2FLos_Angeles`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Open-Meteo forecast ${res.status}`);
        const json = await res.json();
        weatherData = parseForecastResponse(json, daysTarget);
        weatherData.source = 'forecast';
        weatherData.startDate = fmt(tripStart);
      } else {
        // Historical climate normals — use the target week of year
        const refDate = tripStart || today;
        const month = String(refDate.getMonth() + 1).padStart(2, '0');
        const day = String(refDate.getDate()).padStart(2, '0');
        // Open-Meteo climate API: 30-year normals
        const url = `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_date=1991-${month}-${day}&end_date=2020-${month}-${day}&models=EC_Earth3P_HR&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=fahrenheit&precipitation_unit=inch`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Open-Meteo climate ${res.status}`);
        const json = await res.json();
        weatherData = parseClimateResponse(json);
        weatherData.source = 'climate_normals';
        weatherData.referenceDate = `${month}-${day}`;
      }
    } finally {
      clearTimeout(timeout);
    }

    return weatherData;
  } catch (err) {
    // Weather is non-critical — log and return null rather than failing the job
    console.warn(`Weather fetch failed for ${lat},${lon}: ${err.message}`);
    return null;
  }
}

function parseForecastResponse(json, daysTarget) {
  const daily = json.daily || {};
  const dates = daily.time || [];
  const days = [];
  for (let i = 0; i < Math.min(dates.length, daysTarget); i++) {
    days.push({
      date: dates[i],
      tempHighF: daily.temperature_2m_max?.[i] ?? null,
      tempLowF: daily.temperature_2m_min?.[i] ?? null,
      precipIn: daily.precipitation_sum?.[i] ?? null,
      windMph: daily.windspeed_10m_max?.[i] ?? null,
      weatherCode: daily.weathercode?.[i] ?? null,
      description: wmoDescription(daily.weathercode?.[i]),
    });
  }
  return { days, elevation: json.elevation ?? null };
}

function parseClimateResponse(json) {
  const daily = json.daily || {};
  const tempHighs = daily.temperature_2m_max || [];
  const tempLows = daily.temperature_2m_min || [];
  const precips = daily.precipitation_sum || [];
  const avgHigh = tempHighs.length ? Math.round(tempHighs.reduce((a, b) => a + b, 0) / tempHighs.length) : null;
  const avgLow = tempLows.length ? Math.round(tempLows.reduce((a, b) => a + b, 0) / tempLows.length) : null;
  const avgPrecip = precips.length ? Number((precips.reduce((a, b) => a + b, 0) / precips.length).toFixed(2)) : null;
  return {
    avgHighF: avgHigh,
    avgLowF: avgLow,
    avgPrecipIn: avgPrecip,
    elevation: json.elevation ?? null,
    days: null,
  };
}

// WMO Weather Interpretation Codes → human description
function wmoDescription(code) {
  if (code === null || code === undefined) return null;
  if (code === 0) return 'Clear sky';
  if (code <= 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code <= 49) return 'Fog';
  if (code <= 59) return 'Drizzle';
  if (code <= 69) return 'Rain';
  if (code <= 79) return 'Snow';
  if (code <= 84) return 'Rain showers';
  if (code <= 94) return 'Thunderstorm';
  return 'Severe thunderstorm';
}

// ── Claude API call ───────────────────────────────────────────────────
async function callClaude(messages, apiKey) {
  const systemPrompt = await fs.readFile(
    path.join(__dirname, 'narration-system-prompt.txt'), 'utf-8'
  ).catch(() => null);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        system: systemPrompt || undefined,
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API ${response.status}: ${errText}`);
    }

    const result = await response.json();
    return result.content[0].text;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new NarrationError(`Claude API timed out after ${CLAUDE_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── JSON extraction ───────────────────────────────────────────────────
function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return null;
}

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`PackPath server running at http://localhost:${PORT}`);
  console.log(`API key: ${API_KEY ? 'set ✓' : 'NOT SET — set ANTHROPIC_API_KEY to run the pipeline'}`);
});
