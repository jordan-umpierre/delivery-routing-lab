/**
 * Generate the committed benchmark evidence over seeded scenarios.
 * Usage: node scripts/run-benchmark.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { loadGraph } from "../src/graph.ts";
import { parseScenarios, runBenchmark, toCsv } from "../src/bench.ts";

const graph = loadGraph(
  JSON.parse(
    readFileSync(
      new URL("../data/kc-downtown.graph.json", import.meta.url),
      "utf8",
    ),
  ),
);

// Fixed node ids in the versioned scenario file: reruns are reproducible.
const scenarios = parseScenarios(
  readFileSync(new URL("../data/scenarios.csv", import.meta.url), "utf8"),
);
for (const s of scenarios) {
  if (
    s.start >= graph.fixture.nodes.length ||
    s.goal >= graph.fixture.nodes.length
  )
    throw new Error(`scenario ${s.id}: node id outside the graph`);
}

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
