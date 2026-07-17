/**
 * Preprocess a raw Overpass API extract into the versioned graph fixture.
 *
 * Usage: node scripts/preprocess-osm.ts <raw-overpass.json> <out-fixture.json>
 *
 * Steps:
 * 1. Read drivable ways and their node coordinates.
 * 2. Keep only topology nodes (way endpoints and intersections shared by
 *    two or more ways); collapse the chains between them into single
 *    directed edges whose length is the summed haversine distance.
 * 3. Honor one-way tags (`oneway=yes|1|true|-1`, `junction=roundabout`).
 * 4. Keep the largest strongly connected component so every allowed node
 *    can reach every other one; report what was dropped.
 * 5. Emit a deterministic fixture with OpenStreetMap attribution and the
 *    extract date.
 */
import { readFileSync, writeFileSync } from "node:fs";

interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}
interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
}

const [rawPath, outPath] = process.argv.slice(2);
if (!rawPath || !outPath) {
  console.error("usage: node scripts/preprocess-osm.ts <raw.json> <out.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(rawPath, "utf8")) as {
  osm3s: { timestamp_osm_base: string };
  elements: (OsmWay | OsmNode)[];
};

const ways = raw.elements.filter((e): e is OsmWay => e.type === "way");
const coords = new Map<number, { lat: number; lon: number }>();
for (const e of raw.elements) {
  if (e.type === "node") coords.set(e.id, { lat: e.lat, lon: e.lon });
}

// Topology nodes: endpoints, or nodes referenced more than once overall.
const refCount = new Map<number, number>();
for (const way of ways) {
  for (const id of way.nodes) refCount.set(id, (refCount.get(id) ?? 0) + 1);
}
const isTopology = (way: OsmWay, i: number): boolean =>
  i === 0 ||
  i === way.nodes.length - 1 ||
  (refCount.get(way.nodes[i]!) ?? 0) > 1;

const R = 6371000;
function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

interface RawEdge {
  from: number; // OSM node id
  to: number;
  length: number;
  name: string;
}
const rawEdges: RawEdge[] = [];

for (const way of ways) {
  const tags = way.tags ?? {};
  const oneway =
    tags["oneway"] ?? (tags["junction"] === "roundabout" ? "yes" : "no");
  const name = tags["name"] ?? tags["ref"] ?? "unnamed road";
  let segStart = 0;
  let segLen = 0;
  for (let i = 1; i < way.nodes.length; i++) {
    const a = coords.get(way.nodes[i - 1]!);
    const b = coords.get(way.nodes[i]!);
    if (!a || !b) continue;
    segLen += haversine(a, b);
    if (isTopology(way, i)) {
      const from = way.nodes[segStart]!;
      const to = way.nodes[i]!;
      if (from !== to && segLen > 0) {
        if (oneway !== "-1") rawEdges.push({ from, to, length: segLen, name });
        if (oneway !== "yes" && oneway !== "1" && oneway !== "true")
          rawEdges.push({ from: to, to: from, length: segLen, name });
      }
      segStart = i;
      segLen = 0;
    }
  }
}

// Largest strongly connected component (iterative Kosaraju).
const adj = new Map<number, number[]>();
const radj = new Map<number, number[]>();
const nodeIds = new Set<number>();
for (const e of rawEdges) {
  nodeIds.add(e.from);
  nodeIds.add(e.to);
  (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
  (radj.get(e.to) ?? radj.set(e.to, []).get(e.to)!).push(e.from);
}
function dfsOrder(): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  for (const start of nodeIds) {
    if (seen.has(start)) continue;
    const stack: [number, number][] = [[start, 0]];
    seen.add(start);
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const next = (adj.get(top[0]) ?? [])[top[1]];
      top[1]++;
      if (next === undefined) {
        order.push(top[0]);
        stack.pop();
      } else if (!seen.has(next)) {
        seen.add(next);
        stack.push([next, 0]);
      }
    }
  }
  return order;
}
const order = dfsOrder();
const comp = new Map<number, number>();
let compCount = 0;
for (let i = order.length - 1; i >= 0; i--) {
  const root = order[i]!;
  if (comp.has(root)) continue;
  const stack = [root];
  comp.set(root, compCount);
  while (stack.length > 0) {
    const n = stack.pop()!;
    for (const m of radj.get(n) ?? []) {
      if (!comp.has(m)) {
        comp.set(m, compCount);
        stack.push(m);
      }
    }
  }
  compCount++;
}
const sizes = new Map<number, number>();
for (const c of comp.values()) sizes.set(c, (sizes.get(c) ?? 0) + 1);
const largest = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]![0];

const keptOsmIds = [...nodeIds]
  .filter((id) => comp.get(id) === largest)
  .sort((a, b) => a - b);
const indexOf = new Map<number, number>(keptOsmIds.map((id, i) => [id, i]));

const nodes = keptOsmIds.map((osmId) => {
  const c = coords.get(osmId)!;
  return {
    lat: Number(c.lat.toFixed(7)),
    lon: Number(c.lon.toFixed(7)),
    osmId,
  };
});

// Deduplicate parallel edges (keep the shortest) and sort deterministically.
const bestEdge = new Map<
  string,
  { from: number; to: number; length: number; name: string }
>();
for (const e of rawEdges) {
  const from = indexOf.get(e.from);
  const to = indexOf.get(e.to);
  if (from === undefined || to === undefined) continue;
  const key = `${from}>${to}`;
  const length = Number(e.length.toFixed(1));
  const prev = bestEdge.get(key);
  if (!prev || length < prev.length)
    bestEdge.set(key, { from, to, length, name: e.name });
}
const edges = [...bestEdge.values()].sort(
  (a, b) => a.from - b.from || a.to - b.to,
);

const fixture = {
  version: 1,
  name: "kc-downtown",
  source: {
    attribution:
      "Map data © OpenStreetMap contributors, ODbL 1.0 (openstreetmap.org/copyright)",
    generator: "Overpass API",
    extracted: raw.osm3s.timestamp_osm_base,
    bbox: [39.076, -94.615, 39.112, -94.56],
  },
  nodes,
  edges,
};

writeFileSync(outPath, JSON.stringify(fixture));
console.log(
  `nodes ${nodes.length}, edges ${edges.length}; dropped ${nodeIds.size - nodes.length} nodes outside the largest strongly connected component (${compCount} components)`,
);
