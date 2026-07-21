import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { loadGraph } from "../src/graph.ts";
import { parseScenarios } from "../src/bench.ts";
import { search } from "../src/search.ts";

const graph = loadGraph(
  JSON.parse(
    readFileSync(
      new URL("../data/kc-downtown.graph.json", import.meta.url),
      "utf8",
    ),
  ),
);
const scenarios = parseScenarios(
  readFileSync(new URL("../data/scenarios.csv", import.meta.url), "utf8"),
);
const warmup = 3;
const repetitions = 20;
const searchesPerSample = 20;
const samples: Record<string, number[]> = {};

for (const scenario of scenarios) {
  for (const algorithm of ["dijkstra", "astar"] as const) {
    const key = `${scenario.id}:${algorithm}`;
    for (let i = 0; i < warmup + repetitions; i++) {
      const start = performance.now();
      for (let run = 0; run < searchesPerSample; run++)
        search(graph, algorithm, scenario.start, scenario.goal);
      if (i >= warmup)
        (samples[key] ??= []).push(
          (performance.now() - start) / searchesPerSample,
        );
    }
  }
}

const stats = Object.fromEntries(
  Object.entries(samples).map(([key, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance =
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      values.length;
    return [
      key,
      {
        samplesMs: values,
        medianMs: sorted[Math.floor(sorted.length / 2)],
        p95Ms: sorted[Math.floor(sorted.length * 0.95)],
        coefficientOfVariation: Math.sqrt(variance) / mean,
      },
    ];
  }),
);

const report = {
  standard: {
    warmup,
    repetitions,
    searchesPerSample,
    statistic: "median and p95",
    varianceTolerance: "coefficient of variation <= 0.25",
  },
  environment: {
    node: process.version,
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpu: os.cpus()[0]?.model ?? "unknown",
  },
  build: {
    command: "npm run typecheck && npm run build",
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    dataset:
      "data/kc-downtown.graph.json v1; data/scenarios.csv (5 seeded scenarios)",
  },
  workload:
    "Dijkstra and A* shortest-path searches over the committed downtown Kansas City graph",
  results: stats,
};
writeFileSync(
  new URL("../docs/performance.json", import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log("wrote docs/performance.json");
