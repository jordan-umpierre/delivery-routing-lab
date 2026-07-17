import { test } from "node:test";
import assert from "node:assert/strict";
import { makeGraph } from "./helpers.ts";
import { parseScenarios, runBenchmark, toCsv } from "../src/bench.ts";

const g = makeGraph(4, [
  [0, 1, 1, true],
  [1, 2, 1, true],
  [2, 3, 1, true],
]);

test("benchmark report carries schema, environment, and both algorithms", () => {
  const report = runBenchmark(
    g,
    [{ id: "s1", start: 0, goal: 3 }],
    "node test env",
  );
  assert.equal(report.graph, "test");
  assert.equal(report.graphVersion, 1);
  assert.equal(report.environment, "node test env");
  assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(report.rows.length, 2);
  const [d, a] = report.rows;
  assert.equal(d!.algorithm, "dijkstra");
  assert.equal(a!.algorithm, "astar");
  for (const row of report.rows) {
    assert.equal(row.found, true);
    assert.equal(row.costMeters, 3);
    assert.ok(row.nodesExpanded > 0);
    assert.ok(row.runtimeMs >= 0);
  }
});

test("unreachable scenarios export null cost, and CSV round-trips the rows", () => {
  const disconnected = makeGraph(4, [[0, 1, 1]]);
  const report = runBenchmark(
    disconnected,
    [{ id: "no-route", start: 1, goal: 3 }],
    "env",
  );
  assert.equal(report.rows[0]!.found, false);
  assert.equal(report.rows[0]!.costMeters, null);
  const csv = toCsv(report);
  const lines = csv.trim().split("\n");
  assert.equal(
    lines[0],
    "scenario,algorithm,start,goal,found,costMeters,nodesExpanded,runtimeMs",
  );
  assert.equal(lines.length, 3);
  assert.match(lines[1]!, /^no-route,dijkstra,1,3,false,,/);
});

test("scenario CSV parses ids and rejects malformed rows", () => {
  const rows = parseScenarios("id,start,goal\ns1,0,3\ns2,10,10\n");
  assert.deepEqual(rows, [
    { id: "s1", start: 0, goal: 3 },
    { id: "s2", start: 10, goal: 10 },
  ]);
  assert.throws(() => parseScenarios("start,goal\n0,3\n"));
  assert.throws(() => parseScenarios("id,start,goal\ns1,0,-3\n"));
  assert.throws(() => parseScenarios("id,start,goal\ns1,zero,3\n"));
});

test("scenario CSV parses with CRLF line endings (Windows checkouts)", () => {
  // Regression for issue #2: core.autocrlf=true gives the parser CRLF
  // content; line splitting must not leave \r on the last field.
  const rows = parseScenarios("id,start,goal\r\ns1,0,3\r\ns2,10,10\r\n");
  assert.deepEqual(rows, [
    { id: "s1", start: 0, goal: 3 },
    { id: "s2", start: 10, goal: 10 },
  ]);
});
