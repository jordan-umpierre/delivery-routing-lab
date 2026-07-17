/**
 * Generate the committed benchmark evidence over seeded scenarios.
 * Usage: node scripts/run-benchmark.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { loadGraph } from "../src/graph.ts";
import { runBenchmark, toCsv, type Scenario } from "../src/bench.ts";

const graph = loadGraph(
  JSON.parse(
    readFileSync(
      new URL("../data/kc-downtown.graph.json", import.meta.url),
      "utf8",
    ),
  ),
);

// Fixed node ids in the versioned fixture: reruns are reproducible.
const n = graph.fixture.nodes.length;
const scenarios: Scenario[] = [
  { id: "short-hop", start: 0, goal: 25 },
  { id: "cross-town", start: 0, goal: n - 1 },
  { id: "mid-range", start: Math.floor(n / 4), goal: Math.floor((3 * n) / 4) },
  { id: "reverse-cross-town", start: n - 1, goal: 0 },
  { id: "same-node", start: 100, goal: 100 },
];

const environment = `Node ${process.version}, ${os.type()} ${os.arch()}, ${os.cpus()[0]?.model ?? "unknown CPU"}`;
const report = runBenchmark(graph, scenarios, environment);
writeFileSync(
  new URL("../docs/benchmark.json", import.meta.url),
  JSON.stringify(report, null, 2) + "\n",
);
writeFileSync(new URL("../docs/benchmark.csv", import.meta.url), toCsv(report));
console.log(
  `wrote docs/benchmark.json and .csv (${report.rows.length} rows) — ${environment}`,
);
