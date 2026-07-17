import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGraph } from "./helpers.ts";
import { planTour, MAX_STOPS } from "../src/tour.ts";

// A ring of 6 nodes with bidirectional unit edges plus shortcuts, so
// stop ordering matters.
const ring = makeGraph(6, [
  [0, 1, 1, true],
  [1, 2, 1, true],
  [2, 3, 1, true],
  [3, 4, 1, true],
  [4, 5, 1, true],
  [5, 0, 1, true],
]);

test("tour visits stops and ends at the destination", () => {
  const t = planTour(ring, 0, 3, [1, 2]);
  assert.equal(t.found, true);
  assert.deepEqual(t.order, [0, 1, 2, 3]);
  assert.equal(t.cost, 3);
  assert.deepEqual(t.path, [0, 1, 2, 3]);
});

test("duplicate stops and endpoint stops collapse to one visit", () => {
  const a = planTour(ring, 0, 3, [1, 1, 2, 2, 0, 3]);
  const b = planTour(ring, 0, 3, [1, 2]);
  assert.deepEqual(a.order, b.order);
  assert.equal(a.cost, b.cost);
});

test("2-opt never regresses below nearest-neighbor", () => {
  // Line graph where greedy nearest-neighbor picks a bad first hop.
  const g = makeGraph(5, [
    [0, 1, 1, true],
    [1, 2, 1, true],
    [2, 3, 1, true],
    [3, 4, 1, true],
    [0, 2, 1.5, true],
  ]);
  const t = planTour(g, 0, 4, [1, 2, 3]);
  assert.equal(t.found, true);
  assert.ok(t.cost <= t.nearestNeighborCost + 1e-9);
  assert.equal(t.cost, 4); // optimal: 0-1-2-3-4
});

test("tour with an unreachable stop reports no route", () => {
  const g = makeGraph(4, [
    [0, 1, 1, true],
    [2, 3, 1, true],
  ]);
  const t = planTour(g, 0, 1, [2]);
  assert.equal(t.found, false);
  assert.equal(t.cost, Infinity);
  assert.deepEqual(t.path, []);
});

test("stop count is bounded", () => {
  const stops = Array.from({ length: MAX_STOPS + 1 }, (_, i) => i % 6);
  assert.throws(() => planTour(ring, 0, 3, stops));
});

test("tour is deterministic", () => {
  const a = planTour(ring, 0, 3, [5, 2, 4]);
  const b = planTour(ring, 0, 3, [5, 2, 4]);
  assert.deepEqual(a.order, b.order);
  assert.equal(a.cost, b.cost);
});
