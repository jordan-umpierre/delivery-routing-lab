import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadGraph, haversine } from "../src/graph.ts";
import { parseScenarios } from "../src/bench.ts";
import { search } from "../src/search.ts";
import { mulberry32 } from "./helpers.ts";

const graph = loadGraph(
  JSON.parse(
    readFileSync(
      new URL("../data/kc-downtown.graph.json", import.meta.url),
      "utf8",
    ),
  ),
);

test("KC fixture is versioned and attributed", () => {
  assert.equal(graph.fixture.version, 1);
  assert.match(graph.fixture.source.attribution, /OpenStreetMap/);
  assert.match(graph.fixture.source.extracted, /^\d{4}-\d{2}-\d{2}/);
  assert.ok(graph.fixture.nodes.length > 500);
  assert.ok(graph.fixture.edges.length > 1000);
});

test("heuristic admissibility: every edge is at least the great-circle distance", () => {
  // If each edge length >= haversine(from, to), the haversine heuristic
  // never overestimates any path cost, so A* stays optimal.
  for (const e of graph.fixture.edges) {
    const straight = haversine(
      graph.fixture.nodes[e.from]!,
      graph.fixture.nodes[e.to]!,
    );
    assert.ok(
      e.length >= straight - 0.5, // rounding slack: lengths stored to 0.1 m
      `edge ${e.from}->${e.to} shorter (${e.length}) than straight line (${straight})`,
    );
  }
});

test("a* matches dijkstra on sampled KC pairs and expands no more nodes", () => {
  const rand = mulberry32(7);
  const n = graph.fixture.nodes.length;
  for (let i = 0; i < 25; i++) {
    const start = Math.floor(rand() * n);
    const goal = Math.floor(rand() * n);
    const d = search(graph, "dijkstra", start, goal);
    const a = search(graph, "astar", start, goal);
    assert.equal(a.found, d.found, `pair ${start}->${goal}`);
    if (d.found)
      assert.ok(
        Math.abs(a.cost - d.cost) < 1e-6,
        `pair ${start}->${goal} cost mismatch`,
      );
    assert.ok(
      a.expanded <= d.expanded,
      `a* expanded more nodes on ${start}->${goal}`,
    );
  }
});

test("independent reference: Bellman-Ford agrees with dijkstra on sampled pairs", () => {
  // Deliberately different algorithm and data layout, as an offline
  // cross-check of the optimized implementations.
  function bellmanFord(source: number): Float64Array {
    const dist = new Float64Array(graph.fixture.nodes.length).fill(Infinity);
    dist[source] = 0;
    for (;;) {
      let changed = false;
      for (const e of graph.fixture.edges) {
        const nd = dist[e.from]! + e.length;
        if (nd < dist[e.to]! - 1e-9) {
          dist[e.to] = nd;
          changed = true;
        }
      }
      if (!changed) break;
    }
    return dist;
  }
  const rand = mulberry32(11);
  const n = graph.fixture.nodes.length;
  for (let i = 0; i < 3; i++) {
    const start = Math.floor(rand() * n);
    const ref = bellmanFord(start);
    for (let j = 0; j < 5; j++) {
      const goal = Math.floor(rand() * n);
      const d = search(graph, "dijkstra", start, goal);
      if (ref[goal] === Infinity) assert.equal(d.found, false);
      else
        assert.ok(
          Math.abs(d.cost - ref[goal]!) < 1e-6,
          `pair ${start}->${goal}`,
        );
    }
  }
});

test("malformed fixtures are rejected", () => {
  assert.throws(() => loadGraph(null));
  assert.throws(() => loadGraph({ version: 2 }));
  assert.throws(() =>
    loadGraph({
      version: 1,
      name: "x",
      source: {
        attribution: "x",
        generator: "x",
        extracted: "x",
        bbox: [0, 0, 0, 0],
      },
      nodes: [{ lat: 0, lon: 0 }],
      edges: [{ from: 0, to: 5, length: 1, name: "bad target" }],
    }),
  );
  assert.throws(() =>
    loadGraph({
      version: 1,
      name: "x",
      source: {
        attribution: "x",
        generator: "x",
        extracted: "x",
        bbox: [0, 0, 0, 0],
      },
      nodes: [{ lat: 999, lon: 0 }],
      edges: [],
    }),
  );
});

test("committed scenario file parses and stays inside the KC graph", () => {
  const scenarios = parseScenarios(
    readFileSync(new URL("../data/scenarios.csv", import.meta.url), "utf8"),
  );
  assert.ok(scenarios.length >= 5);
  const n = graph.fixture.nodes.length;
  for (const s of scenarios) {
    assert.ok(s.start < n && s.goal < n, `scenario ${s.id} outside graph`);
  }
});
