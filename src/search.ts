/** Dijkstra and A* single-pair shortest paths with deterministic expansion. */
import { MinHeap } from "./heap.ts";
import { haversine, type Graph } from "./graph.ts";

export type Algorithm = "dijkstra" | "astar";

export interface SearchResult {
  algorithm: Algorithm;
  start: number;
  goal: number;
  found: boolean;
  /** node ids from start to goal; empty when not found */
  path: number[];
  /** total path length in meters; Infinity when not found */
  cost: number;
  /** nodes settled (removed from the frontier with final distance) */
  expanded: number;
  /** settled node ids in order, for animation and determinism checks */
  visitedOrder: number[];
  runtimeMs: number;
}

/**
 * Run a search as a generator that yields settled-node batches every
 * `chunkSize` expansions. The consumer may simply stop iterating to
 * cancel; the worker uses the chunk boundaries to stay responsive.
 */
export function* searchSteps(
  graph: Graph,
  algorithm: Algorithm,
  start: number,
  goal: number,
  chunkSize = 250,
): Generator<number[], SearchResult> {
  const n = graph.fixture.nodes.length;
  if (!Number.isInteger(start) || start < 0 || start >= n)
    throw new Error("search: bad start");
  if (!Number.isInteger(goal) || goal < 0 || goal >= n)
    throw new Error("search: bad goal");

  const t0 = performance.now();
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const settled = new Uint8Array(n);
  const goalNode = graph.fixture.nodes[goal]!;
  const h =
    algorithm === "astar"
      ? (id: number) => haversine(graph.fixture.nodes[id]!, goalNode)
      : () => 0;

  const heap = new MinHeap();
  dist[start] = 0;
  heap.push(h(start), start);

  const visitedOrder: number[] = [];
  let chunk: number[] = [];
  let found = false;

  while (heap.size > 0) {
    const [, u] = heap.pop();
    if (settled[u]) continue;
    settled[u] = 1;
    visitedOrder.push(u);
    chunk.push(u);
    if (u === goal) {
      found = true;
      break;
    }
    for (const e of graph.out[u]!) {
      const nd = dist[u]! + e.length;
      if (nd < dist[e.to]!) {
        dist[e.to] = nd;
        prev[e.to] = u;
        heap.push(nd + h(e.to), e.to);
      }
    }
    if (chunk.length >= chunkSize) {
      yield chunk;
      chunk = [];
    }
  }
  if (chunk.length > 0) yield chunk;

  const path: number[] = [];
  if (found) {
    for (let u = goal; u !== -1; u = prev[u]!) path.push(u);
    path.reverse();
  }
  return {
    algorithm,
    start,
    goal,
    found,
    path,
    cost: found ? dist[goal]! : Infinity,
    expanded: visitedOrder.length,
    visitedOrder,
    runtimeMs: performance.now() - t0,
  };
}

/** Run a search to completion. */
export function search(
  graph: Graph,
  algorithm: Algorithm,
  start: number,
  goal: number,
): SearchResult {
  const gen = searchSteps(graph, algorithm, start, goal);
  for (;;) {
    const step = gen.next();
    if (step.done) return step.value;
  }
}
