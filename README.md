# Delivery Routing Lab

Shortest-path and multi-stop routing algorithms — **Dijkstra, A\*,
nearest-neighbor, and 2-opt — implemented from scratch** in strict
TypeScript and benchmarked over an attributed OpenStreetMap street graph
of downtown Kansas City. Searches run in a cancellable Web Worker, visited
nodes and the final route animate on a canvas, and every result also
appears as an accessible textual route table.

**Live:** https://jordan-umpierre.github.io/delivery-routing-lab/

This is an educational algorithms lab, **not a navigation product**. Routes
ignore traffic, closures, turn restrictions beyond mapped one-way streets,
and anything safety-critical. No routing API is called anywhere; every
result comes from the algorithms in `src/`.

## What it demonstrates

- **Classic graph algorithms, hand-written and verified.** Dijkstra and A\*
  share one search core with a deterministic binary min-heap (ties break on
  node id, so identical inputs always produce identical expansion orders).
  A\* uses the haversine great-circle distance as its heuristic; the test
  suite proves admissibility by checking that **every one of the graph's
  directed edges is at least as long as the straight line between its
  endpoints**, so the heuristic can never overestimate and A\* stays optimal.
- **Multi-stop routing as composition.** Nearest-neighbor orders delivery
  stops by exact pairwise shortest-path cost (directed, both ways), then
  2-opt reverses segments while it strictly improves the total. The result
  is never worse than nearest-neighbor's, and the UI reports both costs.
- **Responsive by architecture, not luck.** Searches run in a Web Worker as
  a generator that yields settled-node batches; the worker re-enters the
  event loop between batches, so a cancel message actually lands. The main
  thread only animates.
- **An independent cross-check.** A deliberately different Bellman-Ford
  implementation verifies Dijkstra's distances on sampled Kansas City node
  pairs, offline in the test suite.

## The graph

`data/kc-downtown.graph.json` is a versioned fixture built by
`scripts/preprocess-osm.ts` from an Overpass API extract of drivable
streets in downtown Kansas City (bbox 39.076,-94.615 → 39.112,-94.560).
Preprocessing:

1. keeps way endpoints and intersections, collapsing chains between them
   into single directed edges weighted by summed haversine length;
2. honors `oneway` tags (including reversed one-ways and roundabouts);
3. keeps the largest strongly connected component so every pickable node
   can reach every other one (dropped nodes are reported);
4. emits deterministic, sorted output with attribution and extract date.

Result: 1,851 nodes and 4,078 directed edges. Imported fixtures are
treated as untrusted: shape, coordinate ranges, edge indices, and size
bounds are validated before use.

**Map data © OpenStreetMap contributors, ODbL 1.0**
(www.openstreetmap.org/copyright), extracted 2026-07-17 via Overpass API.

## Complexity

| Algorithm        | Time             | Notes                                                                                  |
| ---------------- | ---------------- | -------------------------------------------------------------------------------------- |
| Dijkstra         | O((V + E) log V) | binary heap, settles nodes in exact-distance order                                     |
| A\*              | same bound       | admissible haversine heuristic; expands 2–5× fewer nodes on this graph (see benchmark) |
| Nearest-neighbor | O(k² · Dijkstra) | k = stops; exact pairwise costs                                                        |
| 2-opt            | O(k³) per pass   | strict-improvement passes over the stop order; never regresses below nearest-neighbor  |

## Benchmark

`node scripts/run-benchmark.ts` regenerates `docs/benchmark.json` and
`docs/benchmark.csv` over five seeded scenarios with the recorded
environment. Both algorithms always agree on cost; A\* expands 2–5× fewer
nodes. The app's **Compare algorithms** button runs the same measurement
in-browser and exports it as JSON or CSV.

## Testing

`npm test` (node:test, no framework) covers: known shortest paths on
canonical graphs, prefix-optimality invariants, directed one-way edges,
disconnected graphs, deterministic visit orders, mid-run cancellation,
duplicate delivery stops, 2-opt non-regression, benchmark schema and CSV,
fixture validation against malformed input, whole-graph heuristic
admissibility, A\*/Dijkstra agreement on sampled pairs, and the
Bellman-Ford cross-check. `npm run e2e` drives the built app with
Playwright: route table and metrics, algorithm comparison and export,
multi-stop tours, keyboard-only operation, and an axe-core WCAG 2.2 AA
gate before and after a search.

## Accessibility

Semantic HTML with native controls; the canvas is a described `role="img"`
whose information is fully duplicated by the route table, metrics list, and
status live region; complete keyboard operation; visible focus; reduced
motion collapses the animation to an instant final state; light and dark
schemes.

## Limitations

Edge weights are geometric length only — no speed limits, travel time,
traffic, or turn restrictions. The extract is a bounded snapshot of one
neighborhood on one date. 2-opt is a heuristic and does not guarantee the
optimal stop order. None of this is suitable for real-world navigation.

## Commands

| Command                                       | Purpose                                               |
| --------------------------------------------- | ----------------------------------------------------- |
| `npm run dev`                                 | Vite dev server                                       |
| `npm test`                                    | unit and invariant tests                              |
| `npm run e2e`                                 | Playwright + axe end-to-end suite                     |
| `npm run typecheck` / `npm run format:check`  | strict TS and Prettier gates                          |
| `npm run preprocess -- <raw.json> <out.json>` | rebuild the graph fixture from a raw Overpass extract |
| `node scripts/run-benchmark.ts`               | regenerate committed benchmark evidence               |
