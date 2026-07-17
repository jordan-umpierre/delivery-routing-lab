import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGraph } from "./helpers.ts";
import { search, searchSteps } from "../src/search.ts";
import { MinHeap } from "../src/heap.ts";

// Canonical graph: diamond with a tempting-but-worse direct edge.
//   0 -> 1 (1), 1 -> 3 (1), 0 -> 2 (2), 2 -> 3 (5), 0 -> 3 (4)
const diamond = makeGraph(4, [
  [0, 1, 1],
  [1, 3, 1],
  [0, 2, 2],
  [2, 3, 5],
  [0, 3, 4],
]);

test("dijkstra finds the known shortest path on a canonical graph", () => {
  const r = search(diamond, "dijkstra", 0, 3);
  assert.equal(r.found, true);
  assert.deepEqual(r.path, [0, 1, 3]);
  assert.equal(r.cost, 2);
});

test("a* agrees with dijkstra on cost and path", () => {
  const d = search(diamond, "dijkstra", 0, 3);
  const a = search(diamond, "astar", 0, 3);
  assert.equal(a.cost, d.cost);
  assert.deepEqual(a.path, d.path);
});

test("directed edges are honored: no path against a one-way", () => {
  const g = makeGraph(2, [[0, 1, 1]]);
  assert.equal(search(g, "dijkstra", 0, 1).found, true);
  const back = search(g, "dijkstra", 1, 0);
  assert.equal(back.found, false);
  assert.equal(back.cost, Infinity);
  assert.deepEqual(back.path, []);
});

test("disconnected graph reports no route safely", () => {
  const g = makeGraph(4, [
    [0, 1, 1, true],
    [2, 3, 1, true],
  ]);
  const r = search(g, "dijkstra", 0, 3);
  assert.equal(r.found, false);
  assert.equal(r.cost, Infinity);
});

test("shortest-path invariant: every path prefix is itself shortest", () => {
  const g = makeGraph(6, [
    [0, 1, 2, true],
    [1, 2, 2, true],
    [2, 5, 2, true],
    [0, 3, 1, true],
    [3, 4, 1, true],
    [4, 5, 7, true],
    [1, 4, 3, true],
  ]);
  const r = search(g, "dijkstra", 0, 5);
  assert.equal(r.found, true);
  for (let i = 1; i < r.path.length; i++) {
    const prefixCost = search(g, "dijkstra", 0, r.path[i]!).cost;
    let along = 0;
    for (let j = 1; j <= i; j++) {
      const edge = g.out[r.path[j - 1]!]!.find((e) => e.to === r.path[j]);
      along += edge!.length;
    }
    assert.ok(
      Math.abs(prefixCost - along) < 1e-9,
      `prefix to ${r.path[i]} not optimal`,
    );
  }
});

test("search is deterministic: identical runs give identical visit orders", () => {
  const g = makeGraph(5, [
    [0, 1, 1, true],
    [0, 2, 1, true],
    [1, 3, 1, true],
    [2, 3, 1, true],
    [3, 4, 1, true],
  ]);
  const a = search(g, "dijkstra", 0, 4);
  const b = search(g, "dijkstra", 0, 4);
  assert.deepEqual(a.visitedOrder, b.visitedOrder);
  assert.deepEqual(a.path, b.path);
});

test("searchSteps can be cancelled mid-run and matches a full run when drained", () => {
  const spec: [number, number, number, boolean][] = [];
  for (let i = 0; i < 999; i++) spec.push([i, i + 1, 1, true]);
  const g = makeGraph(1000, spec);

  // Cancel: consume one chunk and stop. No result was produced.
  const gen = searchSteps(g, "dijkstra", 0, 999, 10);
  const first = gen.next();
  assert.equal(first.done, false);
  assert.equal((first.value as number[]).length, 10);
  gen.return(undefined as never); // consumer walks away

  // Drained chunked run equals the plain run.
  const chunks: number[] = [];
  const gen2 = searchSteps(g, "dijkstra", 0, 999, 10);
  let step = gen2.next();
  while (!step.done) {
    chunks.push(...step.value);
    step = gen2.next();
  }
  const full = search(g, "dijkstra", 0, 999);
  assert.deepEqual(chunks, full.visitedOrder);
  assert.equal(step.value.cost, full.cost);
});

test("out-of-range endpoints are rejected", () => {
  assert.throws(() => search(diamond, "dijkstra", -1, 0));
  assert.throws(() => search(diamond, "dijkstra", 0, 99));
});

test("heap pops in (cost, id) order", () => {
  const h = new MinHeap();
  h.push(3, 7);
  h.push(1, 9);
  h.push(1, 2);
  h.push(2, 1);
  assert.deepEqual(h.pop(), [1, 2]);
  assert.deepEqual(h.pop(), [1, 9]);
  assert.deepEqual(h.pop(), [2, 1]);
  assert.deepEqual(h.pop(), [3, 7]);
  assert.throws(() => h.pop());
});
