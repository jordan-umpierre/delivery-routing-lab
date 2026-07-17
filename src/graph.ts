/** Graph model, fixture validation, and geometry helpers. */

export interface GraphNode {
  lat: number;
  lon: number;
  osmId?: number;
}

export interface GraphEdge {
  from: number;
  to: number;
  /** meters */
  length: number;
  name: string;
}

export interface GraphFixture {
  version: number;
  name: string;
  source: {
    attribution: string;
    generator: string;
    extracted: string;
    bbox: [number, number, number, number];
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Graph {
  fixture: GraphFixture;
  /** adjacency: out[i] is sorted by (to, length) for deterministic expansion */
  out: GraphEdge[][];
}

export const MAX_NODES = 100_000;
export const MAX_EDGES = 400_000;

/** Validate an untrusted fixture object and build the adjacency lists. */
export function loadGraph(data: unknown): Graph {
  if (typeof data !== "object" || data === null)
    throw new Error("fixture: not an object");
  const f = data as GraphFixture;
  if (f.version !== 1) throw new Error("fixture: unsupported version");
  if (typeof f.name !== "string" || typeof f.source?.attribution !== "string")
    throw new Error("fixture: missing name or attribution");
  if (!Array.isArray(f.nodes) || !Array.isArray(f.edges))
    throw new Error("fixture: bad shape");
  if (f.nodes.length === 0 || f.nodes.length > MAX_NODES)
    throw new Error(`fixture: node count out of bounds (1..${MAX_NODES})`);
  if (f.edges.length > MAX_EDGES)
    throw new Error(`fixture: edge count out of bounds`);
  for (const n of f.nodes) {
    if (
      !Number.isFinite(n.lat) ||
      !Number.isFinite(n.lon) ||
      Math.abs(n.lat) > 90 ||
      Math.abs(n.lon) > 180
    )
      throw new Error("fixture: invalid node coordinates");
  }
  const out: GraphEdge[][] = f.nodes.map(() => []);
  for (const e of f.edges) {
    if (
      !Number.isInteger(e.from) ||
      !Number.isInteger(e.to) ||
      e.from < 0 ||
      e.from >= f.nodes.length ||
      e.to < 0 ||
      e.to >= f.nodes.length ||
      !Number.isFinite(e.length) ||
      e.length < 0 ||
      typeof e.name !== "string"
    )
      throw new Error("fixture: invalid edge");
    out[e.from]!.push(e);
  }
  for (const list of out)
    list.sort((a, b) => a.to - b.to || a.length - b.length);
  return { fixture: f, out };
}

const EARTH_RADIUS_M = 6371000;

/** Great-circle distance in meters. Never exceeds any drivable path length. */
export function haversine(a: GraphNode, b: GraphNode): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

/**
 * Human labels for nodes where two differently named streets meet
 * ("12th St & Main St"). These are the pickable "allowed nodes".
 */
export function intersectionLabels(graph: Graph): Map<number, string> {
  const labels = new Map<number, string>();
  const incident: Map<number, Set<string>> = new Map();
  for (const e of graph.fixture.edges) {
    for (const n of [e.from, e.to]) {
      if (e.name === "unnamed road") continue;
      (incident.get(n) ?? incident.set(n, new Set()).get(n)!).add(e.name);
    }
  }
  for (const [node, names] of incident) {
    if (names.size >= 2) {
      const [a, b] = [...names].sort();
      labels.set(node, `${a} & ${b}`);
    }
  }
  return labels;
}
