// find-loops.js
// Enumerate simple loops (25–45 mi) in the main backcountry component.
// Uses recursive DFS with mutable state for performance.

import fs from 'node:fs/promises';
import { buildGraph } from './build-graph.js';

const QUERY_BBOX = { minLat: 37.55, minLon: -119.30, maxLat: 37.90, maxLon: -118.90 };
const ELEVATION_CACHE_PATH = 'cache/ansel-adams-elevation.json';
const SAMPLE_STEP = 1;   // sample every node (was 10 — caused systematic elevation over-counting)
const ELEV_THRESHOLD_FT = 10;   // ignore deltas < threshold to filter DEM jitter
const SMOOTH_WINDOW = 5;        // moving-average window for SRTM staircase smoothing
const METERS_TO_FEET = 3.28084;
const MIN_MI = 25;
const MAX_MI = 45;
const PER_ANCHOR_CAP = 2_000;  // candidate cap per starting anchor
const MAX_DEPTH = 40;  // max segments in one loop — prevents deep dead-end recursion

async function main() {
  const t0 = Date.now();
  const data = JSON.parse(await fs.readFile('cache/ansel-adams.json', 'utf-8'));
  const graph = buildGraph(data, { queryBbox: QUERY_BBOX });

  // Apply elevation data from the enrichment cache
  let elevCache = {};
  try {
    elevCache = JSON.parse(await fs.readFile(ELEVATION_CACHE_PATH, 'utf-8'));
    let enriched = 0;
    for (const seg of graph.segments) {
      const nids = seg.nodeIds;
      const sampledIndices = [0];
      for (let i = SAMPLE_STEP; i < nids.length - 1; i += SAMPLE_STEP) sampledIndices.push(i);
      sampledIndices.push(nids.length - 1);

      const profile = [];
      for (const idx of sampledIndices) {
        const elevM = elevCache[nids[idx]];
        if (elevM !== undefined && elevM !== null) profile.push(elevM * METERS_TO_FEET);
      }

      if (profile.length >= 2) {
        // Apply moving-average smoothing to eliminate SRTM staircase artifacts
        const smoothed = new Array(profile.length);
        const half = Math.floor(SMOOTH_WINDOW / 2);
        for (let i = 0; i < profile.length; i++) {
          const lo = Math.max(0, i - half);
          const hi = Math.min(profile.length - 1, i + half);
          let sum = 0;
          for (let j = lo; j <= hi; j++) sum += profile[j];
          smoothed[i] = sum / (hi - lo + 1);
        }
        smoothed[0] = profile[0];
        smoothed[profile.length - 1] = profile[profile.length - 1];

        let gain = 0, loss = 0;
        for (let i = 1; i < smoothed.length; i++) {
          const delta = smoothed[i] - smoothed[i - 1];
          if (delta > ELEV_THRESHOLD_FT) gain += delta;
          else if (delta < -ELEV_THRESHOLD_FT) loss += Math.abs(delta);
        }

        // Redistribute threshold residual so gain - loss = exact net elevation change.
        // This guarantees closed loops sum to zero gain/loss balance.
        const netChange = profile[profile.length - 1] - profile[0];
        const residual = netChange - (gain - loss);
        if (gain + loss > 0) {
          if (residual > 0) gain += residual;
          else loss += Math.abs(residual);
        }

        seg.gainFt = Math.round(gain);
        seg.lossFt = Math.round(loss);
        enriched++;
      }
    }
    console.log(`Applied elevation to ${enriched} segments from ${ELEVATION_CACHE_PATH}`);
  } catch {
    console.log('WARNING: No elevation cache found. Run enrich-elevation.js first. Elevation will be 0 for all segments.');
  }

  // ── 1. Main connected component ────────────────────────────────────
  const mainComp = new Set();
  {
    const seed = graph.segments.find(s => s.name === 'John Muir Trail').startNode;
    const stack = [seed];
    while (stack.length) {
      const n = stack.pop();
      if (mainComp.has(n)) continue;
      mainComp.add(n);
      for (const seg of (graph.adjacency.get(n) || [])) {
        const other = seg.startNode === n ? seg.endNode : seg.startNode;
        if (!mainComp.has(other)) stack.push(other);
      }
    }
  }

  // Adjacency restricted to main component — indexed for fast lookup
  const adj = new Map();
  const mainSegments = [];
  for (const seg of graph.segments) {
    if (!mainComp.has(seg.startNode)) continue;
    mainSegments.push(seg);
    for (const j of [seg.startNode, seg.endNode]) {
      if (!adj.has(j)) adj.set(j, []);
      adj.get(j).push(seg);
    }
  }

  // Assign integer IDs to segments for fast set operations
  const segIndex = new Map();
  for (let i = 0; i < mainSegments.length; i++) segIndex.set(mainSegments[i], i);

  // ── 2. Precompute shortest-path distances from every junction back to
  //       each start node (Dijkstra from each start).  This lets us prune
  //       branches that can't possibly close the loop within budget. ─────

  // Actually, for 200 nodes we can afford all-pairs shortest paths via
  // Dijkstra from every node.  But 200×200 = 40k entries — let's just do
  // it from start nodes.

  // Start nodes: tagged trailheads with degree ≥ 2  +  degree-≥3 junctions
  const trailheadIds = new Set(graph.trailheads.map(t => t.id));
  const trailheadName = new Map(graph.trailheads.map(t => [t.id, t.tags?.name || null]));

  const startNodes = [];
  for (const nid of mainComp) {
    const deg = (adj.get(nid) || []).length;
    if (trailheadIds.has(nid) && deg >= 2) startNodes.push(nid);
    else if (deg >= 3) startNodes.push(nid);
  }

  function junctionLabel(nid) {
    if (trailheadName.has(nid) && trailheadName.get(nid)) return trailheadName.get(nid);
    const segs = adj.get(nid) || [];
    const names = segs.map(s => s.name).filter(Boolean);
    if (names.length) return `jct (${[...new Set(names)].slice(0, 3).join(' / ')})`;
    return `junction ${nid}`;
  }

  // Dijkstra from each start node
  const distFromStart = new Map();  // startId -> Map(nodeId -> miles)
  for (const sid of startNodes) {
    const dist = new Map();
    dist.set(sid, 0);
    // Simple priority queue via sorted array (n=200 is tiny)
    const pq = [[0, sid]];
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, u] = pq.shift();
      if (d > (dist.get(u) ?? Infinity)) continue;
      for (const seg of (adj.get(u) || [])) {
        const v = seg.startNode === u ? seg.endNode : seg.startNode;
        const nd = d + seg.lengthMi;
        if (nd < (dist.get(v) ?? Infinity)) {
          dist.set(v, nd);
          pq.push([nd, v]);
        }
      }
    }
    distFromStart.set(sid, dist);
  }

  console.log(`Main component: ${mainComp.size} junctions, ${mainSegments.length} segments`);
  console.log(`Start nodes: ${startNodes.length}`);
  console.log(`Dijkstra precompute done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // ── 3. DFS loop search (per-anchor budget) ──────────────────────────
  // Directed-edge key: encode as a single number for Set performance
  // We'll use segIndex * 2 + direction (0 = start→end, 1 = end→start)
  function dirId(seg, fromNode) {
    const idx = segIndex.get(seg);
    return seg.startNode === fromNode ? idx * 2 : idx * 2 + 1;
  }

  const rawLoops = [];
  let totalCandidates = 0;
  const anchorStats = [];   // {anchor, label, found} for reporting

  for (const startId of startNodes) {
    const minDist = distFromStart.get(startId);
    let anchorCandidates = 0;

    // Mutable state for recursive DFS
    const usedDir = new Set();
    const segList = [];     // [{seg, fromNode}, ...]
    let miles = 0;

    function dfs(node, depth) {
      if (anchorCandidates >= PER_ANCHOR_CAP) return;
      if (depth > MAX_DEPTH) return;

      // Found a loop?
      if (node === startId && miles >= MIN_MI && miles <= MAX_MI && segList.length > 0) {
        anchorCandidates++;
        totalCandidates++;
        rawLoops.push({
          miles,
          segList: segList.slice(),
          startNode: startId,
        });
        return;
      }

      for (const seg of (adj.get(node) || [])) {
        const dk = dirId(seg, node);
        if (usedDir.has(dk)) continue;

        const nextNode = seg.startNode === node ? seg.endNode : seg.startNode;
        const nextMiles = miles + seg.lengthMi;

        // Pruning: can we still close the loop within budget?
        if (nextNode !== startId) {
          const returnDist = minDist.get(nextNode) ?? Infinity;
          if (nextMiles + returnDist > MAX_MI) continue;
        } else {
          if (nextMiles < MIN_MI || nextMiles > MAX_MI) continue;
        }

        usedDir.add(dk);
        segList.push({ seg, fromNode: node });
        const prevMiles = miles;
        miles = nextMiles;

        dfs(nextNode, depth + 1);

        // Backtrack
        miles = prevMiles;
        segList.pop();
        usedDir.delete(dk);

        if (anchorCandidates >= PER_ANCHOR_CAP) return;
      }
    }

    dfs(startId, 0);

    if (anchorCandidates > 0) {
      anchorStats.push({
        anchor: startId,
        label: junctionLabel(startId),
        found: anchorCandidates,
        hitCap: anchorCandidates >= PER_ANCHOR_CAP,
      });
    }
  }

  console.log(`\nRaw loops: ${rawLoops.length}  (per-anchor cap: ${PER_ANCHOR_CAP})`);
  console.log(`Anchors that produced loops: ${anchorStats.length} of ${startNodes.length}`);
  console.log(`Time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('\nPer-anchor breakdown:');
  anchorStats.sort((a, b) => b.found - a.found);
  for (const s of anchorStats) {
    console.log(`  ${String(s.found).padStart(5)} loops  ${s.hitCap ? '(CAP)' : '     '}  ${s.label}`);
  }

  // ── 4. Deduplicate ─────────────────────────────────────────────────
  function canonicalFingerprint(segList) {
    const counts = new Map();
    for (const { seg } of segList) {
      const idx = segIndex.get(seg);
      counts.set(idx, (counts.get(idx) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([k, c]) => `${k}x${c}`).join('|');
  }

  const seen = new Map();
  for (const loop of rawLoops) {
    const fp = canonicalFingerprint(loop.segList);
    if (!seen.has(fp) || loop.miles < seen.get(fp).miles) {
      seen.set(fp, loop);
    }
  }
  const uniqueLoops = [...seen.values()];
  console.log(`Unique loops after dedup: ${uniqueLoops.length}`);

  // ── 5. Score ───────────────────────────────────────────────────────
  const scored = uniqueLoops.map(loop => {
    const trailNamesInOrder = loop.segList.map(({ seg }) => seg.name || '(unnamed)');
    const distinctTrails = new Set(loop.segList.map(({ seg }) => seg.name).filter(Boolean));

    const featureSet = new Map();
    for (const { seg } of loop.segList) {
      // Point features + lakes: deduplicate by OSM ID (each has a unique node/way)
      for (const f of [...seg.nearbyPeaks, ...seg.nearbyPasses, ...seg.nearbySprings, ...(seg.nearbyLandmarks || []), ...(seg.nearbyLakes || [])]) {
        if (f.name && !featureSet.has(f.id)) {
          featureSet.set(f.id, { name: f.name, type: f.type });
        }
      }
      // Streams/rivers: deduplicate by name (many OSM way segments share the same name)
      for (const f of (seg.nearbyStreams || [])) {
        const key = `stream:${f.name}`;
        if (f.name && !featureSet.has(key)) {
          featureSet.set(key, { name: f.name, type: f.type });
        }
      }
    }

    const collapsed = [];
    for (const n of trailNamesInOrder) {
      if (!collapsed.length || collapsed[collapsed.length - 1] !== n) collapsed.push(n);
    }

    // Sum elevation gain/loss across all segments in the loop.
    // When a segment is traversed in reverse (fromNode !== seg.startNode),
    // the segment's gain becomes loss and vice versa.
    let totalGainFt = 0;
    let totalLossFt = 0;
    for (const { seg, fromNode } of loop.segList) {
      const forward = fromNode === seg.startNode;
      totalGainFt += (forward ? seg.gainFt : seg.lossFt) || 0;
      totalLossFt += (forward ? seg.lossFt : seg.gainFt) || 0;
    }

    return {
      miles: Number(loop.miles.toFixed(1)),
      totalGainFt,
      totalLossFt,
      trailRoute: collapsed,
      distinctTrailCount: distinctTrails.size,
      distinctTrails: [...distinctTrails].sort(),
      features: [...featureSet.values()].sort((a, b) => a.name.localeCompare(b.name)),
      featureCount: featureSet.size,
      start: junctionLabel(loop.startNode),
    };
  });

  // ── 5b. Cluster near-duplicates ─────────────────────────────────────
  // Two loops whose segment sets overlap by >60% (intersection/union) are
  // near-duplicates.  We cluster them together and keep only the loop with
  // the highest feature count per cluster.

  // Precompute segment sets (as Sets of segment indices)
  for (const loop of scored) {
    loop._segSet = new Set();
    // We need the raw segList — stash it in the scoring step
  }

  // Actually, we need the raw segList on scored loops.  Re-derive from uniqueLoops.
  const scoredWithRaw = scored.map((s, i) => {
    const segSet = new Set();
    for (const { seg } of uniqueLoops[i].segList) {
      segSet.add(segIndex.get(seg));
    }
    return { ...s, _segSet: segSet, _idx: i };
  });

  function segSetIoU(a, b) {
    let intersection = 0;
    for (const s of a) if (b.has(s)) intersection++;
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  // Sort by feature count descending so the best loop in each cluster is processed first
  const byQuality = scoredWithRaw.slice().sort((a, b) => b.featureCount - a.featureCount || a.miles - b.miles);

  const clustered = new Set(); // indices of loops already assigned to a cluster
  const clusters = [];         // [{representative, members: [...]}]

  for (const loop of byQuality) {
    if (clustered.has(loop._idx)) continue;

    // Start a new cluster with this loop as representative
    const cluster = { representative: loop, members: [loop] };
    clustered.add(loop._idx);

    // Find all unclustered loops that overlap >60% with the representative
    for (const candidate of byQuality) {
      if (clustered.has(candidate._idx)) continue;
      if (segSetIoU(loop._segSet, candidate._segSet) > 0.60) {
        cluster.members.push(candidate);
        clustered.add(candidate._idx);
      }
    }

    clusters.push(cluster);
  }

  const clusterReps = clusters.map(c => c.representative);
  console.log(`\nClusters: ${clusters.length} distinct route families (from ${scored.length} unique loops)`);
  console.log(`Largest cluster: ${Math.max(...clusters.map(c => c.members.length))} loops`);
  console.log(`Median cluster size: ${clusters.map(c => c.members.length).sort((a,b) => a-b)[Math.floor(clusters.length/2)]} loops`);

  // ── 5c. Sanity check: top 5 clusters by size ─────────────────────
  const bySize = clusters.slice().sort((a, b) => b.members.length - a.members.length);
  console.log('\n\n════════════════════════════════════════════════════════');
  console.log('  SANITY CHECK: TOP 5 CLUSTERS BY SIZE');
  console.log('════════════════════════════════════════════════════════');
  for (let i = 0; i < Math.min(5, bySize.length); i++) {
    const cl = bySize[i];
    const rep = cl.representative;
    console.log(`\n  Cluster ${i+1}  (${cl.members.length} variants)  |  ${rep.miles} mi  |  +${rep.totalGainFt}'/-${rep.totalLossFt}'  |  ${rep.distinctTrailCount} trails  |  ${rep.featureCount} features`);
    console.log(`      trails: ${rep.distinctTrails.join(', ')}`);
    console.log(`      route: ${rep.trailRoute.join(' → ')}`);
  }

  // ── 5d. Cluster character signals ─────────────────────────────────
  // Compute 10 signals for each cluster
  const HIGH_TRAFFIC_TRAILS = new Set(['John Muir Trail', 'Pacific Crest Trail']);

  const clusterSignals = clusters.map(cl => {
    const rep = cl.representative;

    // 1. Cluster size
    const size = cl.members.length;

    // 2. Rep miles
    const miles = rep.miles;

    // 3. Rep trail count
    const trailCount = rep.distinctTrailCount;

    // 4. Rep feature count
    const featureCount = rep.featureCount;

    // 5. Distinct passes
    const passes = rep.features.filter(f => f.type === 'saddle' || f.type === 'pass').map(f => f.name);
    const distinctPasses = [...new Set(passes)].length;

    // 6. Distinct named lakes
    const lakes = rep.features.filter(f => f.type === 'lake' || f.type === 'water' || f.type === 'reservoir').map(f => f.name);
    const distinctLakes = [...new Set(lakes)].length;

    // 7. Distinct named peaks
    const peaks = rep.features.filter(f => f.type === 'peak').map(f => f.name);
    const distinctPeaks = [...new Set(peaks)].length;

    // 8. Unique trailheads (starts) across all cluster members
    const trailheadStarts = new Set();
    for (const m of cl.members) {
      trailheadStarts.add(m.start);
    }
    const uniqueTrailheads = trailheadStarts.size;

    // 9. High-traffic trail ratio (JMT + PCT miles / total miles)
    // Need to compute from raw segments in the representative loop
    const rawRepLoop = uniqueLoops[rep._idx];
    let htMiles = 0;
    let totalMiles = 0;
    for (const { seg } of rawRepLoop.segList) {
      totalMiles += seg.lengthMi;
      if (seg.name && HIGH_TRAFFIC_TRAILS.has(seg.name)) {
        htMiles += seg.lengthMi;
      }
    }
    const htRatio = totalMiles > 0 ? htMiles / totalMiles : 0;

    // 10. Geographic center (mean lat/lon of all junctions in rep loop)
    const juncIds = new Set();
    for (const { seg } of rawRepLoop.segList) {
      juncIds.add(seg.startNode);
      juncIds.add(seg.endNode);
    }
    let sumLat = 0, sumLon = 0, count = 0;
    for (const jid of juncIds) {
      const n = graph.nodes.get(jid);
      if (n) { sumLat += n.lat; sumLon += n.lon; count++; }
    }
    const centerLat = count > 0 ? sumLat / count : 0;
    const centerLon = count > 0 ? sumLon / count : 0;

    // Representative label: most common trail name
    const nameCounts = {};
    for (const t of rep.distinctTrails) nameCounts[t] = 0;
    for (const { seg } of rawRepLoop.segList) {
      if (seg.name && nameCounts[seg.name] !== undefined) nameCounts[seg.name] += seg.lengthMi;
    }
    const topTrail = Object.entries(nameCounts).sort((a,b) => b[1] - a[1])[0]?.[0] || '(unnamed)';

    // 11. Elevation gain/loss from the representative loop
    const totalGainFt = rep.totalGainFt;
    const totalLossFt = rep.totalLossFt;

    return {
      size, miles, trailCount, featureCount, distinctPasses, distinctLakes,
      distinctPeaks, uniqueTrailheads, htRatio, centerLat, centerLon,
      totalGainFt, totalLossFt,
      topTrail, rep, passNames: [...new Set(passes)], peakNames: [...new Set(peaks)],
    };
  });

  // Print table sorted by size descending (top 50)
  function printClusterTable(sorted, label, limit) {
    console.log(`\n\n════════════════════════════════════════════════════════`);
    console.log(`  CLUSTER CHARACTER TABLE — ${label} (${Math.min(limit, sorted.length)} of ${sorted.length})`);
    console.log(`════════════════════════════════════════════════════════`);
    console.log(`${'#'.padStart(4)}  ${'Size'.padStart(5)}  ${'Mi'.padStart(5)}  ${'Gain'.padStart(6)}  ${'Loss'.padStart(6)}  ${'Trails'.padStart(6)}  ${'Feat'.padStart(4)}  ${'Pass'.padStart(4)}  ${'Lakes'.padStart(5)}  ${'Peaks'.padStart(5)}  ${'TH'.padStart(3)}  ${'HT%'.padStart(5)}  ${'Lat'.padStart(7)}  ${'Lon'.padStart(8)}  Top Trail / Passes / Peaks`);
    console.log('─'.repeat(180));
    for (let i = 0; i < Math.min(limit, sorted.length); i++) {
      const s = sorted[i];
      const extras = [];
      if (s.passNames.length) extras.push(`passes: ${s.passNames.join(', ')}`);
      if (s.peakNames.length) extras.push(`peaks: ${s.peakNames.join(', ')}`);
      console.log(
        `${String(i+1).padStart(4)}  ${String(s.size).padStart(5)}  ${String(s.miles).padStart(5)}  ${String(s.totalGainFt).padStart(5)}' ${String(s.totalLossFt).padStart(5)}'  ${String(s.trailCount).padStart(6)}  ${String(s.featureCount).padStart(4)}  ${String(s.distinctPasses).padStart(4)}  ${String(s.distinctLakes).padStart(5)}  ${String(s.distinctPeaks).padStart(5)}  ${String(s.uniqueTrailheads).padStart(3)}  ${(s.htRatio * 100).toFixed(0).padStart(4)}%  ${s.centerLat.toFixed(3).padStart(7)}  ${s.centerLon.toFixed(3).padStart(8)}  ${s.topTrail}${extras.length ? '  |  ' + extras.join('  |  ') : ''}`
      );
    }
  }

  const bySizeDesc = clusterSignals.slice().sort((a, b) => b.size - a.size);
  printClusterTable(bySizeDesc, 'SORTED BY SIZE DESC', 50);

  const bySizeAsc = clusterSignals.slice().sort((a, b) => a.size - b.size);
  printClusterTable(bySizeAsc, 'SORTED BY SIZE ASC (rare/remote first)', 50);

  // ── 6. Output ──────────────────────────────────────────────────────
  function printLoop(loop, rank) {
    console.log(`\n  #${rank}  ${loop.miles} mi  |  +${loop.totalGainFt}'/-${loop.totalLossFt}'  |  ${loop.distinctTrailCount} trails  |  ${loop.featureCount} features  |  start: ${loop.start}`);
    console.log(`      route: ${loop.trailRoute.join(' → ')}`);
    console.log(`      trails: ${loop.distinctTrails.join(', ')}`);
    if (loop.features.length) {
      const grouped = {};
      for (const f of loop.features) {
        const t = f.type;
        if (!grouped[t]) grouped[t] = [];
        grouped[t].push(f.name);
      }
      for (const [type, names] of Object.entries(grouped)) {
        console.log(`      ${type}: ${names.join(', ')}`);
      }
    }
  }

  const byFeatures = clusterReps.slice().sort((a, b) => b.featureCount - a.featureCount || a.miles - b.miles);
  console.log('\n\n════════════════════════════════════════════════════════');
  console.log('  TOP 30 CLUSTERED LOOPS BY DISTINCT NAMED FEATURES');
  console.log('════════════════════════════════════════════════════════');
  for (let i = 0; i < Math.min(30, byFeatures.length); i++) {
    const rep = byFeatures[i];
    const cl = clusters.find(c => c.representative === rep);
    printLoop(rep, i + 1);
    console.log(`      cluster: ${cl.members.length} variants`);
  }

  const byTrails = clusterReps.slice().sort((a, b) => b.distinctTrailCount - a.distinctTrailCount || a.miles - b.miles);
  console.log('\n\n════════════════════════════════════════════════════════');
  console.log('  TOP 30 CLUSTERED LOOPS BY DISTINCT TRAIL COUNT');
  console.log('════════════════════════════════════════════════════════');
  for (let i = 0; i < Math.min(30, byTrails.length); i++) {
    const rep = byTrails[i];
    const cl = clusters.find(c => c.representative === rep);
    printLoop(rep, i + 1);
    console.log(`      cluster: ${cl.members.length} variants`);
  }

  console.log('\n\n════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('════════════════════════════════════════════════════════');
  console.log(`  Total candidates examined: ${totalCandidates}`);
  console.log(`  Unique loops (deduplicated): ${uniqueLoops.length}`);
  console.log(`  Distinct clusters: ${clusters.length}`);
  if (clusterReps.length) {
    console.log(`  Mile range (reps): ${Math.min(...clusterReps.map(l => l.miles))}–${Math.max(...clusterReps.map(l => l.miles))}`);
    console.log(`  Feature range (reps): ${Math.min(...clusterReps.map(l => l.featureCount))}–${Math.max(...clusterReps.map(l => l.featureCount))}`);
    console.log(`  Trail count range (reps): ${Math.min(...clusterReps.map(l => l.distinctTrailCount))}–${Math.max(...clusterReps.map(l => l.distinctTrailCount))}`);
    const buckets = [25, 30, 35, 40, 46];
    console.log('  Mile distribution (all unique):');
    for (let i = 0; i < buckets.length - 1; i++) {
      const count = scored.filter(l => l.miles >= buckets[i] && l.miles < buckets[i + 1]).length;
      console.log(`    ${buckets[i]}–${buckets[i + 1]} mi: ${count} loops`);
    }
    console.log('  Cluster size distribution:');
    const sizeBuckets = [[1,1,'singleton'], [2,5,'2-5'], [6,20,'6-20'], [21,100,'21-100'], [101,Infinity,'101+']];
    for (const [lo, hi, label] of sizeBuckets) {
      const count = clusters.filter(c => c.members.length >= lo && c.members.length <= hi).length;
      if (count) console.log(`    ${label}: ${count} clusters`);
    }
  } else {
    console.log('  No loops found in range.');
  }
  console.log(`  Total time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // ── 7. Export cluster data for scoring/ranking/narration pipeline ────
  // Saves each cluster's scoring signals + detailed segment data to JSON.
  const exportClusters = clusterSignals.map((sig, i) => {
    const rep = sig.rep;
    const rawRepLoop = uniqueLoops[rep._idx];

    // Serialize representative loop segments for narration input.
    // coords: sampled lat/lon array for map rendering (max 20 points per segment,
    // direction-aware so the polyline traces the actual walking direction).
    const MAX_COORDS_PER_SEG = 20;
    const segments = rawRepLoop.segList.map(({ seg, fromNode }) => {
      const midIdx = Math.floor(seg.nodeIds.length / 2);
      const midNode = graph.nodes.get(seg.nodeIds[midIdx]);
      const forward = fromNode === seg.startNode;

      // Sample up to MAX_COORDS_PER_SEG evenly-spaced nodes from the segment.
      const nodeIds = forward ? seg.nodeIds : [...seg.nodeIds].reverse();
      const step = Math.max(1, Math.floor(nodeIds.length / MAX_COORDS_PER_SEG));
      const sampledIds = [];
      for (let si = 0; si < nodeIds.length; si += step) sampledIds.push(nodeIds[si]);
      // Always include the last node so segments connect end-to-end.
      if (sampledIds[sampledIds.length - 1] !== nodeIds[nodeIds.length - 1]) {
        sampledIds.push(nodeIds[nodeIds.length - 1]);
      }
      const coords = sampledIds
        .map(nid => graph.nodes.get(nid))
        .filter(Boolean)
        .map(n => [n.lat, n.lon]);

      return {
        trailName: seg.name || '(unnamed)',
        lengthMi: seg.lengthMi,
        gainFt: (forward ? seg.gainFt : seg.lossFt) || 0,
        lossFt: (forward ? seg.lossFt : seg.gainFt) || 0,
        fromJunction: junctionLabel(fromNode),
        toJunction: junctionLabel(seg.startNode === fromNode ? seg.endNode : seg.startNode),
        midpoint: midNode ? { lat: midNode.lat, lon: midNode.lon } : null,
        coords,
        peaks: [...new Set((seg.nearbyPeaks || []).map(f => f.name).filter(Boolean))],
        passes: [...new Set((seg.nearbyPasses || []).map(f => f.name).filter(Boolean))],
        lakes: [...new Set((seg.nearbyLakes || []).map(f => f.name).filter(Boolean))],
        streams: [...new Set((seg.nearbyStreams || []).map(f => f.name).filter(Boolean))],
        springs: [...new Set((seg.nearbySprings || []).map(f => f.name).filter(Boolean))],
        landmarks: [...new Set((seg.nearbyLandmarks || []).map(f => f.name).filter(Boolean))],
      };
    });

    return {
      // Scoring signals (used by score-cluster.js)
      miles: sig.miles,
      totalGainFt: sig.totalGainFt,
      totalLossFt: sig.totalLossFt,
      featureCount: sig.featureCount,
      features: rep.features,       // [{name, type}]
      distinctLakes: sig.distinctLakes,
      distinctPeaks: sig.distinctPeaks,
      distinctPasses: sig.distinctPasses,
      htRatio: sig.htRatio,
      trailheadCount: sig.uniqueTrailheads,
      clusterSize: sig.size,
      centerLat: sig.centerLat,
      centerLon: sig.centerLon,
      // Descriptive metadata
      topTrail: sig.topTrail,
      distinctTrailCount: sig.trailCount,
      distinctTrails: rep.distinctTrails,
      trailRoute: rep.trailRoute,
      passNames: sig.passNames,
      peakNames: sig.peakNames,
      start: rep.start,
      allFeatures: rep.features,
      // Narration segment data
      segments,
    };
  });

  await fs.writeFile('cache/clusters.json', JSON.stringify(exportClusters, null, 2));
  console.log(`\n  Exported ${exportClusters.length} clusters to cache/clusters.json`);
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
