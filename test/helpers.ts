import { loadGraph, type Graph, type GraphEdge } from "../src/graph.ts";

/**
 * Build a graph from a compact edge spec. Coordinates cluster within a
 * few meters of the origin, so the haversine heuristic is tiny and
 * trivially admissible against the synthetic edge lengths.
 */
export function makeGraph(
  nodeCount: number,
  spec: [from: number, to: number, length: number, bidirectional?: boolean][],
): Graph {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    lat: i * 1e-7,
    lon: 0,
  }));
  const edges: GraphEdge[] = [];
  for (const [from, to, length, bidirectional] of spec) {
    edges.push({ from, to, length, name: `e${from}-${to}` });
    if (bidirectional)
      edges.push({ from: to, to: from, length, name: `e${to}-${from}` });
  }
  return loadGraph({
    version: 1,
    name: "test",
    source: {
      attribution: "test",
      generator: "test",
      extracted: "test",
      bbox: [0, 0, 0, 0],
    },
    nodes,
    edges,
  });
}

/** Deterministic PRNG (mulberry32) for reproducible sampling in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
