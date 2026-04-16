// pipeline-core.js
// Shared pipeline logic used by both the CLI (test-narration-real.js)
// and the API server (server.js).
//
// Exports: assignArchetype, buildNarrationInput, buildPromptMarkdown, postProcess

import { NarrationError } from './errors.js';

// ── Archetype assignment ──────────────────────────────────────────────
// Content-based signals take priority over positional fallbacks.
export function assignArchetype(cluster, pickIndex) {
  if (cluster.distinctPasses >= 2) return 'high-passes';
  if (cluster.htRatio < 0.15) return 'remote';
  if (cluster.distinctLakes >= 8) return 'scenic';
  if (cluster.distinctTrailCount >= 6) return 'explorer';
  if (pickIndex === 0) return 'classic';
  if (pickIndex === 1) return 'scenic';
  return 'explorer';
}

// ── Convert ranked clusters to narration-input format ─────────────────
export function buildNarrationInput(rankedClusters, preferences, archetypeFn = assignArchetype) {
  const candidateRoutes = {};

  for (let i = 0; i < rankedClusters.length; i++) {
    const cluster = rankedClusters[i];
    const archetype = archetypeFn(cluster, i);
    cluster._archetype = archetype;

    candidateRoutes[archetype] = {
      clusterSize: cluster.clusterSize,
      totalMiles: cluster.miles,
      totalGainFt: cluster.totalGainFt,
      totalLossFt: cluster.totalLossFt,
      distinctTrailCount: cluster.distinctTrailCount,
      distinctFeatureCount: cluster.featureCount,
      htRatio: Math.round(cluster.htRatio * 100),
      geoCenter: { lat: cluster.centerLat, lon: cluster.centerLon },
      trailheads: [cluster.start],
      allFeatures: cluster.allFeatures,
      segments: cluster.segments.map((seg, idx) => ({
        segIdx: idx,
        trailName: seg.trailName,
        lengthMi: seg.lengthMi,
        gainFt: seg.gainFt,
        lossFt: seg.lossFt,
        fromJunction: seg.fromJunction,
        toJunction: seg.toJunction,
        midpoint: seg.midpoint,
        peaks: seg.peaks,
        passes: seg.passes,
        lakes: seg.lakes,
        streams: seg.streams,
        springs: seg.springs,
        landmarks: seg.landmarks,
      })),
    };
  }

  return {
    userPreferences: {
      days: preferences.daysTarget,
      milesPerDay: `~${preferences.milesPerDayTarget}`,
      elevationTolerance: preferences.elevationTolerance,
      experienceLevel: preferences.experienceLevel,
      groupType: preferences.groupType,
      sceneryPreferences: preferences.sceneryPreferences,
      crowdPreference: preferences.crowdPreference,
      avoid: preferences.avoid,
      priorities: preferences.priorities,
      notes: preferences.notes,
    },
    candidateRoutes,
  };
}

// ── Build the prompt markdown sent to Claude ──────────────────────────
export function buildPromptMarkdown(structuredInput) {
  const prefs = structuredInput.userPreferences;
  let md = `# PackPath Narration Request\n\n## User preferences\n\n\`\`\`json\n${JSON.stringify(prefs, null, 2)}\n\`\`\`\n\n## Candidate routes\n\n`;

  const routeLabels = 'ABCDEFGHIJ';
  const archetypes = Object.keys(structuredInput.candidateRoutes);

  for (let i = 0; i < archetypes.length; i++) {
    const archetype = archetypes[i];
    const route = structuredInput.candidateRoutes[archetype];
    const label = routeLabels[i] || String(i + 1);

    const featuresByType = {};
    for (const f of route.allFeatures) {
      if (!featuresByType[f.type]) featuresByType[f.type] = [];
      featuresByType[f.type].push(f.name);
    }
    const featureSummary = Object.entries(featuresByType)
      .map(([type, names]) => `${names.length} ${type}s: ${names.join(', ')}`)
      .join('; ');

    const trailNames = [...new Set(route.segments.map(s => s.trailName).filter(n => n && n !== '(unnamed)'))];
    const passNames = [...new Set(route.segments.flatMap(s => s.passes))];

    md += `### Route ${label} -- "${archetype}" archetype\n`;
    md += `- Total miles: ${route.totalMiles}\n`;
    md += `- Total elevation gain: ${route.totalGainFt.toLocaleString()} ft\n`;
    md += `- Total elevation loss: ${route.totalLossFt.toLocaleString()} ft\n`;
    md += `- Distinct trails: ${route.distinctTrailCount} (${trailNames.join(', ')})\n`;
    md += `- Distinct features: ${route.distinctFeatureCount} (${featureSummary})\n`;
    md += `- High-traffic ratio: ${route.htRatio}% (JMT+PCT miles / total)\n`;
    md += `- Cluster size: ${route.clusterSize} variants\n`;
    md += `- Geo center: ${route.geoCenter.lat.toFixed(2)}N, ${Math.abs(route.geoCenter.lon).toFixed(2)}W\n`;
    md += `- Passes: ${passNames.length ? passNames.join(', ') : 'none'}\n\n`;
    md += `Ordered segments (segIdx : trail : miles : elevation : features):\n`;

    let segIdx = 0;
    while (segIdx < route.segments.length) {
      const seg = route.segments[segIdx];
      const trailName = seg.trailName;

      let endIdx = segIdx;
      while (endIdx + 1 < route.segments.length && route.segments[endIdx + 1].trailName === trailName) {
        endIdx++;
      }

      let groupMiles = 0, groupGain = 0, groupLoss = 0;
      const groupFeatures = { peaks: [], passes: [], lakes: [], streams: [], springs: [], landmarks: [] };
      for (let j = segIdx; j <= endIdx; j++) {
        const s = route.segments[j];
        groupMiles += s.lengthMi;
        groupGain += s.gainFt;
        groupLoss += s.lossFt;
        for (const cat of ['peaks', 'passes', 'lakes', 'streams', 'springs', 'landmarks']) {
          for (const name of (s[cat] || [])) {
            if (!groupFeatures[cat].includes(name)) groupFeatures[cat].push(name);
          }
        }
      }

      const segRange = segIdx === endIdx ? String(segIdx) : `${segIdx}-${endIdx}`;
      const subCount = endIdx - segIdx + 1;
      const subNote = subCount > 1 ? ` (${subCount} sub-segments)` : '';
      const parts = [];
      for (const [cat, names] of Object.entries(groupFeatures)) {
        if (names.length) parts.push(`${cat}: ${names.join(', ')}`);
      }
      const featureStr = parts.length ? ` -- ${parts.join(' | ')}` : '';
      md += `- ${segRange}: ${trailName} ${groupMiles.toFixed(1)}mi +${groupGain}'/-${groupLoss}'${subNote}${featureStr}\n`;
      segIdx = endIdx + 1;
    }
    md += '\n';
  }

  const archetypeList = archetypes.join(' | ');
  const targetMi = parseInt(prefs.milesPerDay.replace('~', ''));
  md += `## Output schema\n\nProduce a JSON array of exactly ${archetypes.length} route objects. Each object:\n\n\`\`\`json\n{\n  "routeName": "Evocative route name referencing real geography",\n  "archetype": "${archetypeList}",\n  "summary": "2-3 sentence overview naming specific features",\n  "bestFor": "1 sentence describing what kind of backpacker this suits",\n  "itinerary": [\n    {\n      "day": 1,\n      "segmentIds": [0, 1, 2, 3],\n      "note": "20-80 word narration referencing actual named features"\n    }\n  ],\n  "pros": ["specific pro (1-2 sentences max)"],\n  "cons": ["specific con (1-2 sentences max)"],\n  "gearTips": ["tip specific to this route"]\n}\n\`\`\`\n\n`;
  md += `Assign all segments across exactly ${prefs.days} days, aiming for ~${targetMi}mi/day. Output ONLY the JSON array.\n\n`;
  md += `**Banned words:** nestled, tucked, dramatic, pristine, stunning, breathtaking, spectacular, magnificent.\n`;
  md += `**Day notes:** 20-80 words, name actual features only, never invent geography.\n`;
  md += `**Pros/cons:** 1-2 sentences each, reference named features or numeric facts.\n`;
  md += `**Trail names:** Always full names — never "JMT" or "PCT". Plain ASCII hyphens only.\n`;

  return md;
}

// ── Post-process: resolve segment IDs to deterministic values ─────────
export function postProcess(claudeOutput, structuredInput) {
  const result = [];

  for (const route of claudeOutput) {
    const archetype = sanitizeDashes(route.archetype);
    const cluster = structuredInput.candidateRoutes[archetype];
    if (!cluster) {
      throw new NarrationError(
        `No input data for archetype "${archetype}". Available: ${Object.keys(structuredInput.candidateRoutes).join(', ')}`
      );
    }

    const segments = [];
    let routeMileSum = 0;

    for (const dayEntry of route.itinerary) {
      const daySegIds = dayEntry.segmentIds;
      let dayMiles = 0;
      const dayTrails = new Set();
      const dayFeatures = { peaks: [], passes: [], lakes: [], streams: [], springs: [], landmarks: [] };
      let dayGainFt = 0;
      let dayLossFt = 0;

      for (const idx of daySegIds) {
        const seg = cluster.segments[idx];
        if (!seg) continue;
        dayMiles += seg.lengthMi;
        dayGainFt += seg.gainFt || 0;
        dayLossFt += seg.lossFt || 0;
        dayTrails.add(seg.trailName);
        for (const cat of ['peaks', 'passes', 'lakes', 'streams', 'springs', 'landmarks']) {
          for (const name of (seg[cat] || [])) {
            if (!dayFeatures[cat].includes(name)) dayFeatures[cat].push(name);
          }
        }
      }

      routeMileSum += dayMiles;
      segments.push({
        day: dayEntry.day,
        segmentIds: daySegIds,
        trailNames: [...dayTrails],
        miles: Number(dayMiles.toFixed(1)),
        gainFt: dayGainFt,
        lossFt: dayLossFt,
        note: sanitizeDashes(dayEntry.note),
        features: dayFeatures,
      });
    }

    result.push({
      routeName: sanitizeDashes(route.routeName),
      archetype,
      totalMiles: cluster.totalMiles,
      computedMiles: Number(routeMileSum.toFixed(1)),
      totalGainFt: segments.reduce((s, d) => s + d.gainFt, 0),
      totalLossFt: segments.reduce((s, d) => s + d.lossFt, 0),
      days: route.itinerary.length,
      summary: sanitizeDashes(route.summary),
      bestFor: sanitizeDashes(route.bestFor),
      segments,
      pros: route.pros.map(sanitizeDashes),
      cons: route.cons.map(sanitizeDashes),
      gearTips: (route.gearTips || []).map(sanitizeDashes),
    });
  }

  return result;
}

function sanitizeDashes(s) {
  return typeof s === 'string' ? s.replace(/[–—]/g, '-') : s;
}
