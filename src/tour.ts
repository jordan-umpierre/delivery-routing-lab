/**
 * Multi-stop routing: nearest-neighbor ordering of delivery stops
 * followed by 2-opt improvement, over exact pairwise shortest paths.
 *
 * The route runs start -> (stops in chosen order) -> destination.
 * Costs are directed, so pairwise distances are computed both ways.
 */
import { search, type SearchResult } from "./search.ts";
import type { Graph } from "./graph.ts";

export interface TourResult {
  found: boolean;
  /** visiting order: start, ordered stops, destination */
  order: number[];
  /** concatenated node path over the whole route */
  path: number[];
  /** total meters */
  cost: number;
  /** nearest-neighbor cost before 2-opt (for non-regression evidence) */
  nearestNeighborCost: number;
  twoOptPasses: number;
  legs: SearchResult[];
}

export const MAX_STOPS = 10;

/** Pairwise directed shortest-path costs among the given node ids. */
function pairwiseCosts(graph: Graph, ids: number[]): number[][] {
  return ids.map((from) =>
    ids.map((to) =>
      from === to ? 0 : search(graph, "dijkstra", from, to).cost,
    ),
  );
}

function orderCost(cost: number[][], order: number[]): number {
  let total = 0;
  for (let i = 1; i < order.length; i++)
    total += cost[order[i - 1]!]![order[i]!]!;
  return total;
}

export function planTour(
  graph: Graph,
  start: number,
  destination: number,
  stops: number[],
): TourResult {
  if (stops.length > MAX_STOPS)
    throw new Error(`tour: at most ${MAX_STOPS} stops`);
  // Duplicate stops (or stops equal to the endpoints) add nothing to the route.
  const uniqueStops = [...new Set(stops)].filter(
    (s) => s !== start && s !== destination,
  );
  const ids = [start, ...uniqueStops, destination];
  const cost = pairwiseCosts(graph, ids);
  const startIdx = 0;
  const destIdx = ids.length - 1;

  // Nearest-neighbor: from the current node, always visit the cheapest
  // unvisited stop next, ending at the destination.
  const remaining = new Set<number>(uniqueStops.map((_, i) => i + 1));
  const order = [startIdx];
  while (remaining.size > 0) {
    const cur = order[order.length - 1]!;
    let best = -1;
    for (const cand of remaining) {
      if (best === -1 || cost[cur]![cand]! < cost[cur]![best]!) best = cand;
    }
    order.push(best);
    remaining.delete(best);
  }
  order.push(destIdx);
  const nearestNeighborCost = orderCost(cost, order);

  // 2-opt: reverse interior segments while it improves the directed cost.
  // Endpoints stay fixed. Accept only strict improvements, so the result
  // never regresses below nearest-neighbor.
  let twoOptPasses = 0;
  let improved = true;
  while (improved && order.length > 3) {
    improved = false;
    twoOptPasses++;
    for (let i = 1; i < order.length - 2; i++) {
      for (let j = i + 1; j < order.length - 1; j++) {
        const candidate = [
          ...order.slice(0, i),
          ...order.slice(i, j + 1).reverse(),
          ...order.slice(j + 1),
        ];
        if (orderCost(cost, candidate) < orderCost(cost, order) - 1e-9) {
          order.splice(0, order.length, ...candidate);
          improved = true;
        }
      }
    }
  }

  const finalOrder = order.map((i) => ids[i]!);
  const legs: SearchResult[] = [];
  const path: number[] = [];
  let total = 0;
  let found = true;
  for (let i = 1; i < finalOrder.length; i++) {
    const leg = search(graph, "dijkstra", finalOrder[i - 1]!, finalOrder[i]!);
    legs.push(leg);
    if (!leg.found) {
      found = false;
      break;
    }
    total += leg.cost;
    path.push(...(path.length > 0 ? leg.path.slice(1) : leg.path));
  }

  return {
    found,
    order: finalOrder,
    path: found ? path : [],
    cost: found ? total : Infinity,
    nearestNeighborCost,
    twoOptPasses,
    legs,
  };
}
