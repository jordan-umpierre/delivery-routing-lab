/** Benchmark runs over seeded scenarios, exportable as JSON and CSV. */
import { search, type Algorithm, type SearchResult } from "./search.ts";
import type { Graph } from "./graph.ts";

export interface Scenario {
  id: string;
  start: number;
  goal: number;
}

/**
 * Parse a scenarios CSV (`id,start,goal` header) into validated rows.
 * Node ids are checked strictly here; bounds against a graph are the
 * caller's job because the graph is not known at parse time.
 */
export function parseScenarios(csv: string): Scenario[] {
  // Split on \r?\n: Windows checkouts (core.autocrlf=true) and editors
  // hand this boundary CRLF content, and every caller routes through here.
  const lines = csv.split(/\r?\n/).filter((line) => line !== "");
  if (lines[0] !== "id,start,goal")
    throw new Error(`scenarios: bad header "${lines[0]}"`);
  return lines.slice(1).map((line) => {
    const fields = line.split(",");
    const [id, start, goal] = fields;
    if (
      fields.length !== 3 ||
      !id ||
      !/^\d+$/.test(start!) ||
      !/^\d+$/.test(goal!)
    )
      throw new Error(`scenarios: invalid row "${line}"`);
    return { id, start: Number(start), goal: Number(goal) };
  });
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
