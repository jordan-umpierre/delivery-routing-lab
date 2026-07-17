/** Benchmark runs over seeded scenarios, exportable as JSON and CSV. */
import { search, type Algorithm, type SearchResult } from "./search.ts";
import type { Graph } from "./graph.ts";

export interface Scenario {
  id: string;
  start: number;
  goal: number;
}

export interface BenchmarkRow {
  scenario: string;
  algorithm: Algorithm;
  start: number;
  goal: number;
  found: boolean;
  costMeters: number | null;
  nodesExpanded: number;
  runtimeMs: number;
}

export interface BenchmarkReport {
  graph: string;
  graphVersion: number;
  extracted: string;
  environment: string;
  generatedAt: string;
  rows: BenchmarkRow[];
}

export function runBenchmark(
  graph: Graph,
  scenarios: Scenario[],
  environment: string,
): BenchmarkReport {
  const rows: BenchmarkRow[] = [];
  for (const s of scenarios) {
    for (const algorithm of ["dijkstra", "astar"] as const) {
      const r: SearchResult = search(graph, algorithm, s.start, s.goal);
      rows.push({
        scenario: s.id,
        algorithm,
        start: s.start,
        goal: s.goal,
        found: r.found,
        costMeters: r.found ? Number(r.cost.toFixed(1)) : null,
        nodesExpanded: r.expanded,
        runtimeMs: Number(r.runtimeMs.toFixed(2)),
      });
    }
  }
  return {
    graph: graph.fixture.name,
    graphVersion: graph.fixture.version,
    extracted: graph.fixture.source.extracted,
    environment,
    generatedAt: new Date().toISOString(),
    rows,
  };
}

export function toCsv(report: BenchmarkReport): string {
  const header =
    "scenario,algorithm,start,goal,found,costMeters,nodesExpanded,runtimeMs";
  const lines = report.rows.map((r) =>
    [
      r.scenario,
      r.algorithm,
      r.start,
      r.goal,
      r.found,
      r.costMeters ?? "",
      r.nodesExpanded,
      r.runtimeMs,
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}
