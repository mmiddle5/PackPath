// build-graph.js
// Transforms an Overpass JSON response into a trail graph:
//   - Nodes = junctions (where 2+ trails meet) and endpoints (trailheads, dead ends)
//   - Edges = segments (continuous trail between two junctions)
//
// Each segment carries: name, length_miles, gain_ft, loss_ft, point_geometry,
// and nearby features (water, peaks, passes) within a buffer.
//
// Elevation is left as null in this pass — filled in by enrich-elevation.js
// from a DEM service so the graph builder stays pure and testable.

import { haversineMiles } from './geo-utils.js';

// ── Buffer distances ──────────────────────────────────────────────────
// How close a feature must be to a trail segment to be "attached" to it.
// These were calibrated against known Sierra trail/feature relationships.
const FEATURE_BUFFER_MI = 0.06;  // ~100m — "you can see/reach it from the trail"
const PEAK_BUFFER_MI = 0.93;     // ~1500m — peaks visible from trail
const PASS_BUFFER_MI = 0.25;     // ~400m — passes are navigational waypoints, often slightly off trail centerline
const LAKE_BUFFER_MI = 0.25;     // ~400m — trails wrap around shorelines
const STREAM_BUFFER_MI = 0.031;  // ~50m — trails follow streams closely

// ── Boundary detection ────────────────────────────────────────────────
// Junctions within this distance of the query bbox edge are likely clipped
// trails, not real dead ends. The loop search skips them as start candidates.
const BOUNDARY_TOLERANCE_DEG = 0.005; // ~0.3 mi

// ── Micro-segment merging ─────────────────────────────────────────────
// OSM mappers sometimes split trails into tiny bridge/connector pieces.
// Segments shorter than this threshold are merged into a neighbour rather
// than being treated as independent segments (which would sever the trail).
const MICRO_THRESHOLD_MI = 0.01;

function classifyElements(elements) {
  const nodes = new Map(); // id -> {lat, lon, tags}
  const trailWays = [];
  const waterWays = [];
  const lakeWays = [];
  const trailheadNodes = [];
  const peakNodes = [];
  const passNodes = [];
  const springNodes = [];
  const landmarkNodes = [];

  for (const el of elements) {
    if (el.type === 'node') {
      nodes.set(el.id, { lat: el.lat, lon: el.lon, tags: el.tags || {} });
      const t = el.tags || {};
      if (t.highway === 'trailhead' || t.information === 'trailhead') {
        trailheadNodes.push(el);
      }
      if (t.natural === 'peak' && t.name) {
        // Filter out terrain features misclassified as peaks in OSM/GNIS.
        // Names containing these words indicate terrain features, not summits.
        const NON_PEAK_PATTERN = /stairway|stairs|gap|notch|chute|steps?(?:\s|$)|bench|ledge|shelf|ramp/i;
        if (!NON_PEAK_PATTERN.test(t.name)) {
          peakNodes.push(el);
        } else {
          landmarkNodes.push(el);
        }
      }
      if (t.mountain_pass === 'yes' || t.natural === 'saddle') passNodes.push(el);
      if (t.natural === 'spring') springNodes.push(el);
      if (t.natural === 'waterfall') landmarkNodes.push(el);
      if (t.natural === 'cliff' && t.name) landmarkNodes.push(el);
      if (t.tourism === 'attraction' && t.name) landmarkNodes.push(el);
      if (t.tourism === 'viewpoint') landmarkNodes.push(el);
      if (t.historic && t.name) landmarkNodes.push(el);
      if (t.geological && t.name) landmarkNodes.push(el);
      if (t.place === 'locality' && t.name) landmarkNodes.push(el);
    } else if (el.type === 'way') {
      const t = el.tags || {};
      const isTrail =
        t.highway === 'path' ||
        t.highway === 'footway' ||
        t.route === 'hiking' ||
        t.sac_scale;
      const isStream = t.waterway === 'stream' || t.waterway === 'river';
      const isLake = t.natural === 'water';
      if (isTrail) trailWays.push(el);
      else if (isStream) waterWays.push(el);
      else if (isLake) lakeWays.push(el);
    }
  }

  return {
    nodes,
    trailWays,
    waterWays,
    trailheadNodes,
    peakNodes,
    passNodes,
    springNodes,
    landmarkNodes,
    lakeWays,
  };
}

function findJunctions(trailWays, trailheadNodeIds) {
  // A node is a junction if it appears in 2+ trail ways, OR it's a trailhead,
  // OR it's an endpoint of any trail way (terminus / dead end).
  const nodeUsage = new Map();

  for (const way of trailWays) {
    for (const nodeId of new Set(way.nodes)) {
      nodeUsage.set(nodeId, (nodeUsage.get(nodeId) || 0) + 1);
    }
  }

  const junctions = new Set();
  for (const [id, count] of nodeUsage) {
    if (count >= 2) junctions.add(id);
  }
  for (const id of trailheadNodeIds) junctions.add(id);
  for (const way of trailWays) {
    junctions.add(way.nodes[0]);
    junctions.add(way.nodes[way.nodes.length - 1]);
  }

  return junctions;
}

function splitWayAtJunctions(way, junctions) {
  const segments = [];
  let current = [way.nodes[0]];
  for (let i = 1; i < way.nodes.length; i++) {
    current.push(way.nodes[i]);
    if (junctions.has(way.nodes[i]) && i < way.nodes.length - 1) {
      segments.push(current);
      current = [way.nodes[i]];
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

function segmentLengthMiles(nodeIds, nodes) {
  let total = 0;
  for (let i = 1; i < nodeIds.length; i++) {
    const a = nodes.get(nodeIds[i - 1]);
    const b = nodes.get(nodeIds[i]);
    if (!a || !b) continue;
    total += haversineMiles(a.lat, a.lon, b.lat, b.lon);
  }
  return total;
}

function segmentBoundingBox(nodeIds, nodes) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const id of nodeIds) {
    const n = nodes.get(id);
    if (!n) continue;
    if (n.lat < minLat) minLat = n.lat;
    if (n.lat > maxLat) maxLat = n.lat;
    if (n.lon < minLon) minLon = n.lon;
    if (n.lon > maxLon) maxLon = n.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

function findNearbyFeatures(segmentNodeIds, nodes, featureNodes, bufferMi) {
  const bbox = segmentBoundingBox(segmentNodeIds, nodes);
  const latBuffer = bufferMi / 69;
  const nearby = [];

  for (const feature of featureNodes) {
    if (feature.lat < bbox.minLat - latBuffer) continue;
    if (feature.lat > bbox.maxLat + latBuffer) continue;
    const lonBuffer = bufferMi / (69 * Math.cos((feature.lat * Math.PI) / 180));
    if (feature.lon < bbox.minLon - lonBuffer) continue;
    if (feature.lon > bbox.maxLon + lonBuffer) continue;

    let minDist = Infinity;
    for (const id of segmentNodeIds) {
      const n = nodes.get(id);
      if (!n) continue;
      const d = haversineMiles(feature.lat, feature.lon, n.lat, n.lon);
      if (d < minDist) minDist = d;
    }
    if (minDist <= bufferMi) {
      nearby.push({
        id: feature.id,
        name: feature.tags?.name || null,
        type:
          feature.tags?.natural ||
          (feature.tags?.mountain_pass === 'yes' ? 'pass' : 'feature'),
        distMi: Number(minDist.toFixed(3)),
      });
    }
  }

  return nearby;
}

function findNearbyPeaks(segmentNodeIds, nodes, peakNodes, bufferMi) {
  // Attach a named peak only if it's the closest peak to this segment,
  // OR if it's within the tight FEATURE_BUFFER_MI (definitely on-trail).
  // This prevents a segment under Banner Peak from also claiming Mount Ritter
  // and Mount Davis just because they're within the wider peak buffer.
  const candidates = findNearbyFeatures(segmentNodeIds, nodes, peakNodes, bufferMi);
  if (candidates.length <= 1) return candidates;

  candidates.sort((a, b) => a.distMi - b.distMi);
  const closest = candidates[0];
  const result = [closest];
  for (let i = 1; i < candidates.length; i++) {
    // Keep secondary peaks within half the buffer — genuine ridge traversals
    // where two named peaks are both close to the trail.
    if (candidates[i].distMi <= bufferMi / 2) {
      result.push(candidates[i]);
    }
  }
  return result;
}

function findNearbyPolygonFeatures(segmentNodeIds, nodes, wayFeatures, bufferMi) {
  const segBbox = segmentBoundingBox(segmentNodeIds, nodes);
  const latBuffer = bufferMi / 69;
  const nearby = [];

  for (const way of wayFeatures) {
    const name = way.tags?.name;
    if (!name) continue;

    let wMinLat = Infinity, wMaxLat = -Infinity, wMinLon = Infinity, wMaxLon = -Infinity;
    for (const nid of way.nodes) {
      const n = nodes.get(nid);
      if (!n) continue;
      if (n.lat < wMinLat) wMinLat = n.lat;
      if (n.lat > wMaxLat) wMaxLat = n.lat;
      if (n.lon < wMinLon) wMinLon = n.lon;
      if (n.lon > wMaxLon) wMaxLon = n.lon;
    }
    if (wMinLat > segBbox.maxLat + latBuffer) continue;
    if (wMaxLat < segBbox.minLat - latBuffer) continue;
    const midLat = (wMinLat + wMaxLat) / 2;
    const lonBuffer = bufferMi / (69 * Math.cos((midLat * Math.PI) / 180));
    if (wMinLon > segBbox.maxLon + lonBuffer) continue;
    if (wMaxLon < segBbox.minLon - lonBuffer) continue;

    let minDist = Infinity;
    const step = Math.max(1, Math.floor(way.nodes.length / 40));
    for (let wi = 0; wi < way.nodes.length; wi += step) {
      const wn = nodes.get(way.nodes[wi]);
      if (!wn) continue;
      for (const sid of segmentNodeIds) {
        const sn = nodes.get(sid);
        if (!sn) continue;
        const d = haversineMiles(wn.lat, wn.lon, sn.lat, sn.lon);
        if (d < minDist) minDist = d;
        if (d < bufferMi) break;
      }
      if (minDist < bufferMi) break;
    }

    if (minDist <= bufferMi) {
      const type = way.tags?.water || way.tags?.waterway || way.tags?.natural || 'water';
      nearby.push({
        id: way.id,
        name,
        type,
        distMi: Number(minDist.toFixed(3)),
      });
    }
  }

  return nearby;
}

function computeBbox(nodes) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const n of nodes.values()) {
    if (n.lat < minLat) minLat = n.lat;
    if (n.lat > maxLat) maxLat = n.lat;
    if (n.lon < minLon) minLon = n.lon;
    if (n.lon > maxLon) maxLon = n.lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

function isOnBoundary(node, bbox) {
  return (
    Math.abs(node.lat - bbox.minLat) < BOUNDARY_TOLERANCE_DEG ||
    Math.abs(node.lat - bbox.maxLat) < BOUNDARY_TOLERANCE_DEG ||
    Math.abs(node.lon - bbox.minLon) < BOUNDARY_TOLERANCE_DEG ||
    Math.abs(node.lon - bbox.maxLon) < BOUNDARY_TOLERANCE_DEG
  );
}

export function buildGraph(overpassData, options = {}) {
  const { elements } = overpassData;
  const classified = classifyElements(elements);
  const { nodes, trailWays, waterWays, peakNodes, passNodes, springNodes, landmarkNodes, lakeWays, trailheadNodes } =
    classified;

  const trailheadIds = new Set(trailheadNodes.map(n => n.id));
  const junctions = findJunctions(trailWays, trailheadIds);
  const bbox = options.queryBbox || computeBbox(nodes);
  const detectBoundary = !!options.queryBbox;

  // Phase 1: collect all raw sub-segments per way
  const rawSubs = [];
  for (const way of trailWays) {
    const subs = splitWayAtJunctions(way, junctions);
    for (const sub of subs) {
      rawSubs.push({ way, nodeIds: sub });
    }
  }

  // Phase 2: merge micro-segments into neighbours.
  // OSM mappers split trails at bridge/culvert boundaries, producing tiny
  // connector pieces that would otherwise sever the trail graph.
  const nodeToSubs = new Map();
  for (let i = 0; i < rawSubs.length; i++) {
    const sub = rawSubs[i];
    const start = sub.nodeIds[0];
    const end = sub.nodeIds[sub.nodeIds.length - 1];
    for (const n of [start, end]) {
      if (!nodeToSubs.has(n)) nodeToSubs.set(n, []);
      nodeToSubs.get(n).push(i);
    }
  }

  const merged = new Set();
  for (let i = 0; i < rawSubs.length; i++) {
    const sub = rawSubs[i];
    const len = segmentLengthMiles(sub.nodeIds, nodes);
    if (len >= MICRO_THRESHOLD_MI) continue;

    const endpoints = [sub.nodeIds[0], sub.nodeIds[sub.nodeIds.length - 1]];
    let didMerge = false;
    for (const ep of endpoints) {
      const neighbours = (nodeToSubs.get(ep) || []).filter(j => j !== i && !merged.has(j));
      if (neighbours.length === 0) continue;

      const target =
        neighbours.find(j => segmentLengthMiles(rawSubs[j].nodeIds, nodes) >= MICRO_THRESHOLD_MI) ??
        neighbours[0];

      const tgt = rawSubs[target];
      const tgtStart = tgt.nodeIds[0];
      const tgtEnd = tgt.nodeIds[tgt.nodeIds.length - 1];

      if (tgtEnd === sub.nodeIds[0]) {
        tgt.nodeIds = tgt.nodeIds.concat(sub.nodeIds.slice(1));
      } else if (tgtStart === sub.nodeIds[sub.nodeIds.length - 1]) {
        tgt.nodeIds = sub.nodeIds.slice(0, -1).concat(tgt.nodeIds);
      } else if (tgtEnd === sub.nodeIds[sub.nodeIds.length - 1]) {
        tgt.nodeIds = tgt.nodeIds.concat(sub.nodeIds.slice(0, -1).reverse());
      } else if (tgtStart === sub.nodeIds[0]) {
        tgt.nodeIds = sub.nodeIds.slice(1).reverse().concat(tgt.nodeIds);
      } else {
        continue;
      }

      merged.add(i);
      didMerge = true;
      break;
    }

    if (!didMerge) merged.add(i);
  }

  // Phase 3: build final segment objects
  const segments = [];
  for (let i = 0; i < rawSubs.length; i++) {
    if (merged.has(i)) continue;
    const { way, nodeIds: sub } = rawSubs[i];
    const lengthMi = segmentLengthMiles(sub, nodes);
    if (lengthMi < 0.001) continue;
    segments.push({
      wayId: way.id,
      name: way.tags?.name || null,
      sacScale: way.tags?.sac_scale || null,
      startNode: sub[0],
      endNode: sub[sub.length - 1],
      nodeIds: sub.slice(),
      nodeCount: sub.length,
      lengthMi: Number(lengthMi.toFixed(3)),
      gainFt: null,
      lossFt: null,
      nearbyPeaks: findNearbyPeaks(sub, nodes, peakNodes, PEAK_BUFFER_MI),
      nearbyPasses: findNearbyFeatures(sub, nodes, passNodes, PASS_BUFFER_MI),
      nearbySprings: findNearbyFeatures(sub, nodes, springNodes, FEATURE_BUFFER_MI),
      nearbyLandmarks: findNearbyFeatures(sub, nodes, landmarkNodes, FEATURE_BUFFER_MI),
      nearbyLakes: findNearbyPolygonFeatures(sub, nodes, lakeWays, LAKE_BUFFER_MI),
      nearbyStreams: findNearbyPolygonFeatures(sub, nodes, waterWays, STREAM_BUFFER_MI),
    });
  }

  const adjacency = new Map();
  for (const seg of segments) {
    for (const j of [seg.startNode, seg.endNode]) {
      if (!adjacency.has(j)) adjacency.set(j, []);
      adjacency.get(j).push(seg);
    }
  }

  const boundaryJunctions = new Set();
  if (detectBoundary) {
    for (const [juncId, segs] of adjacency) {
      if (segs.length !== 1) continue;
      const node = nodes.get(juncId);
      if (node && isOnBoundary(node, bbox)) boundaryJunctions.add(juncId);
    }
  }

  return {
    nodes,
    bbox,
    junctions,
    boundaryJunctions,
    segments,
    adjacency,
    trailheads: trailheadNodes,
    peaks: peakNodes,
    passes: passNodes,
    springs: springNodes,
    landmarks: landmarkNodes,
    lakes: lakeWays,
    waterWays: classified.waterWays,
  };
}

export function summarizeGraph(graph) {
  const namedSegs = graph.segments.filter(s => s.name);
  const trailNames = new Set(namedSegs.map(s => s.name));
  const totalMi = graph.segments.reduce((sum, s) => sum + s.lengthMi, 0);
  const namedMi = namedSegs.reduce((sum, s) => sum + s.lengthMi, 0);

  const visited = new Set();
  const components = [];
  for (const startJunc of graph.junctions) {
    if (visited.has(startJunc)) continue;
    const stack = [startJunc];
    const comp = new Set();
    while (stack.length) {
      const j = stack.pop();
      if (visited.has(j)) continue;
      visited.add(j);
      comp.add(j);
      const segs = graph.adjacency.get(j) || [];
      for (const seg of segs) {
        const other = seg.startNode === j ? seg.endNode : seg.startNode;
        if (!visited.has(other)) stack.push(other);
      }
    }
    components.push(comp.size);
  }
  components.sort((a, b) => b - a);

  return {
    rawElements: {
      nodes: graph.nodes.size,
      trailheads: graph.trailheads.length,
      peaks: graph.peaks.length,
      passes: graph.passes.length,
      springs: graph.springs.length,
    },
    graph: {
      junctions: graph.junctions.size,
      boundaryJunctions: graph.boundaryJunctions.size,
      segments: graph.segments.length,
      namedSegments: namedSegs.length,
      uniqueTrailNames: trailNames.size,
      totalMiles: Number(totalMi.toFixed(1)),
      namedMiles: Number(namedMi.toFixed(1)),
      namedPct: Number(((namedMi / totalMi) * 100).toFixed(0)),
    },
    connectivity: {
      componentCount: components.length,
      largestComponent: components[0] || 0,
      largestComponentPct: Number(
        (((components[0] || 0) / graph.junctions.size) * 100).toFixed(0)
      ),
      top5: components.slice(0, 5),
      note: 'Small components are usually trails clipped by the bounding box, not real disconnects.',
    },
    sampleTrailNames: [...trailNames].slice(0, 20),
  };
}
