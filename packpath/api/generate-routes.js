// api/generate-routes.js
// Vercel serverless function — proxies Claude API, keeps key server-side

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Simple in-memory rate limiter (resets per function instance)
// For production, swap with Vercel KV or Upstash Redis
const rateLimitMap = new Map();
const RATE_LIMIT = 3;        // max requests
const RATE_WINDOW = 60000;   // per 60 seconds

function getRateLimitKey(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
}

function isRateLimited(key) {
  const now = Date.now();
  const entry = rateLimitMap.get(key) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_WINDOW) {
    // Window expired — reset
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return false;
  }

  if (entry.count >= RATE_LIMIT) return true;

  entry.count++;
  rateLimitMap.set(key, entry);
  return false;
}

function buildPrompt(prefs) {
  const {
    locationMode, location, regions, driveTime,
    dateStart, dateEnd, dateFlex,
    days, milesPerDay,
    routeType, elevTolerance, gainMin, gainMax,
    scenery, avoid,
    dryStretch, waterPref, campStyle, permitPref,
    expLevel, packWeight, groupType,
    fears, priorities, notes
  } = prefs;

  const locationContext = locationMode === 'explore'
    ? `The hiker is open to any great area. Preferred regions: ${regions || 'West Coast / Sierra'}. Max drive time to trailhead: ${driveTime || '4 hours'}.`
    : locationMode === 'region'
    ? `The hiker has a region in mind: ${location}.`
    : `The hiker wants to start near: ${location}.`;

  return `You are an expert backpacking route planner with deep knowledge of trails across North America, including the Sierra Nevada, Cascades, Rockies, Desert Southwest, and Appalachians.

A hiker has submitted these trip preferences:

LOCATION: ${locationContext}
DATES: ${dateStart && dateEnd ? `${dateStart} to ${dateEnd}` : 'flexible'} — flexibility: ${dateFlex || 'flexible'}
TRIP LENGTH: ${days} hiking days
DAILY MILEAGE TARGET: ${milesPerDay} miles/day
ROUTE TYPE: ${routeType || 'loop preferred'}
ELEVATION TOLERANCE: ${elevTolerance || 'moderate'} — target gain range ${gainMin || 1500}–${gainMax || 4000} ft/day
SCENERY PREFERENCES: ${scenery || 'alpine, mountain lakes'}
TERRAIN TO AVOID: ${avoid || 'none specified'}
WATER: max dry stretch ${dryStretch || '6'} miles — reliability: ${waterPref || 'perennial streams preferred'}
CAMPING STYLE: ${campStyle || 'dispersed preferred'}
PERMITS: ${permitPref || 'avoid quota areas'}
EXPERIENCE: ${expLevel || 'intermediate'}
PACK WEIGHT: ${packWeight || 'light 10-18lb'}
GROUP: ${groupType || 'solo'}
FEARS / AVOID: ${fears || 'none specified'}
PRIORITIES: ${priorities || 'solitude, scenery'}
ADDITIONAL NOTES: ${notes || 'none'}

Generate exactly 3 candidate backpacking routes that best match these preferences. Stitch together real named trail segments into logical day-by-day itineraries. Use accurate trail names and real geography.

CRITICAL: Respond ONLY with a valid JSON array. No markdown, no preamble, no explanation — just the raw JSON array starting with [ and ending with ].

Use this exact schema:
[
  {
    "rank": 1,
    "name": "Evocative route name (3-5 words)",
    "score": 92,
    "totalMiles": 36,
    "gainFt": 4200,
    "lossFt": 4100,
    "highPointFt": 11200,
    "days": 4,
    "routeType": "Loop",
    "permitRequired": false,
    "permitDetails": "No permit needed for this wilderness area",
    "waterSources": 7,
    "bestSeason": "July–September",
    "crowdLevel": "Moderate",
    "summary": "2-3 sentence vivid description of what makes this route special, what the hiker will experience, and why it fits their preferences.",
    "bestFor": "Type of hiker this is ideal for in one sentence",
    "segments": [
      {
        "day": 1,
        "name": "Trailhead → First Camp",
        "trailNames": ["Trail Name Trail", "Connecting Trail"],
        "miles": 9.2,
        "gainFt": 1800,
        "lossFt": 200,
        "campName": "Shadow Lake",
        "campElevFt": 8750,
        "waterAtCamp": true,
        "notes": "Brief note on terrain, highlights, or hazards for this day"
      }
    ],
    "waypoints": [
      { "name": "Trailhead", "lat": 37.6851, "lon": -119.0731, "eleFt": 8340 },
      { "name": "Camp Night 1", "lat": 37.6612, "lon": -119.0445, "eleFt": 8750 }
    ],
    "pros": ["Specific pro point 1", "Specific pro point 2", "Specific pro point 3"],
    "cons": ["Specific con point 1", "Specific con point 2"],
    "gearTips": ["One gear tip specific to this route's terrain or conditions"],
    "affiliateContext": {
      "needsBearCanister": true,
      "goodForFishing": false,
      "offTrailNav": false,
      "topoAppEssential": true
    }
  }
]

Make the 3 routes genuinely different in character — vary difficulty, scenery type, and logistics. Be specific with real trail names. Waypoints should be geographically accurate lat/lon coordinates for the actual locations.`;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit
  const ipKey = getRateLimitKey(req);
  if (isRateLimited(ipKey)) {
    return res.status(429).json({
      error: 'Too many requests. Please wait a minute before searching again.'
    });
  }

  // Validate API key exists
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  let prefs;
  try {
    prefs = req.body;
    if (!prefs || typeof prefs !== 'object') throw new Error('Invalid body');
  } catch (e) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: buildPrompt(prefs) }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'Route generation failed. Please try again.' });
    }

    const data = await response.json();
    const rawText = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    // Validate it's parseable JSON
    const routes = JSON.parse(cleaned);
    if (!Array.isArray(routes) || routes.length === 0) {
      throw new Error('Invalid route response structure');
    }

    return res.status(200).json({ routes });

  } catch (e) {
    console.error('Route generation error:', e.message);
    return res.status(500).json({
      error: 'Could not generate routes. Please try again.',
      detail: e.message
    });
  }
}
