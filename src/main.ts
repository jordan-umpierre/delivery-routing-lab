import { loadGraph, intersectionLabels, type Graph } from "./graph.ts";
import type { SearchResult, Algorithm } from "./search.ts";
import type { TourResult } from "./tour.ts";
import type { BenchmarkReport, BenchmarkRow } from "./bench.ts";
import { toCsv } from "./bench.ts";
import { makeProjection, drawScene, type Scene } from "./render.ts";
import type { WorkerRequest, WorkerResponse } from "./worker.ts";
import fixtureUrl from "../data/kc-downtown.graph.json?url";

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const statusEl = $<HTMLParagraphElement>("status");
const canvas = $<HTMLCanvasElement>("map");
const ctx = canvas.getContext("2d")!;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const darkScheme = matchMedia("(prefers-color-scheme: dark)");

const fixture: unknown = await (await fetch(fixtureUrl)).json();
const graph: Graph = loadGraph(fixture);
const labels = intersectionLabels(graph);
const proj = makeProjection(graph, canvas.width, canvas.height);
$<HTMLParagraphElement>("attribution").textContent =
  `${graph.fixture.source.attribution}. Extract date: ${graph.fixture.source.extracted.slice(0, 10)}. ` +
  `Graph: ${graph.fixture.nodes.length} nodes, ${graph.fixture.edges.length} directed edges (largest strongly connected component of the extract).`;

const worker = new Worker(new URL("./worker.ts", import.meta.url), {
  type: "module",
});
worker.postMessage({ type: "load", fixture } satisfies WorkerRequest);

// --- node pickers -----------------------------------------------------------

const sortedLabeled = [...labels.entries()].sort((a, b) =>
  a[1].localeCompare(b[1]),
);
for (const id of ["start", "destination", "stop-picker"]) {
  const select = $<HTMLSelectElement>(id);
  for (const [node, label] of sortedLabeled) {
    const option = document.createElement("option");
    option.value = String(node);
    option.textContent = label;
    select.append(option);
  }
}
$<HTMLSelectElement>("start").value = String(sortedLabeled[0]![0]);
$<HTMLSelectElement>("destination").value = String(
  sortedLabeled[sortedLabeled.length - 1]![0],
);

const stops: number[] = [];
const stopList = $<HTMLUListElement>("stop-list");
$<HTMLButtonElement>("add-stop").addEventListener("click", () => {
  if (stops.length >= 10) {
    statusEl.textContent = "At most 10 delivery stops.";
    return;
  }
  const node = Number($<HTMLSelectElement>("stop-picker").value);
  stops.push(node);
  const li = document.createElement("li");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.setAttribute("aria-label", `Remove stop ${labels.get(node)}`);
  remove.addEventListener("click", () => {
    stops.splice(stops.indexOf(node), 1);
    li.remove();
  });
  li.append(`${labels.get(node)} `, remove);
  stopList.append(li);
});

// --- scene / animation ------------------------------------------------------

const scene: Scene = {
  visited: [],
  visibleVisited: 0,
  routePath: [],
  endpoints: [],
};
let animating = false;

function draw(): void {
  drawScene(ctx, graph, proj, scene, darkScheme.matches);
}

function animate(): void {
  if (animating) return;
  animating = true;
  const frame = (): void => {
    if (reducedMotion.matches) scene.visibleVisited = scene.visited.length;
    else
      scene.visibleVisited = Math.min(
        scene.visibleVisited + 150,
        scene.visited.length,
      );
    draw();
    if (scene.visibleVisited < scene.visited.length || pending !== null) {
      requestAnimationFrame(frame);
    } else {
      animating = false;
    }
  };
  requestAnimationFrame(frame);
}

draw();

// --- worker round-trips -----------------------------------------------------

let requestId = 0;
let pending: {
  id: number;
  resolve: (r: unknown) => void;
  animateVisited: boolean;
} | null = null;

worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
  const msg = ev.data;
  if (
    msg.type === "visited" &&
    pending?.id === msg.requestId &&
    pending.animateVisited
  ) {
    scene.visited.push(...msg.nodes);
    animate();
  } else if (msg.type === "result" && pending?.id === msg.requestId) {
    const { resolve } = pending;
    pending = null;
    resolve(msg.result);
  } else if (msg.type === "cancelled" && pending?.id === msg.requestId) {
    pending = null;
    statusEl.textContent = "Search cancelled.";
    setBusy(false);
  } else if (msg.type === "error") {
    pending = null;
    statusEl.textContent = `Error: ${msg.message}`;
    setBusy(false);
  }
};

function request(
  msg: Omit<Extract<WorkerRequest, { type: "search" }>, "requestId">,
): Promise<SearchResult>;
function request(
  msg: Omit<Extract<WorkerRequest, { type: "tour" }>, "requestId">,
): Promise<TourResult>;
function request(
  msg: Omit<Extract<WorkerRequest, { type: "search" | "tour" }>, "requestId">,
  animateVisited = true,
): Promise<unknown> {
  requestId++;
  return new Promise((resolve) => {
    pending = { id: requestId, resolve, animateVisited };
    worker.postMessage({ ...msg, requestId } as WorkerRequest);
  });
}

function setBusy(busy: boolean): void {
  $<HTMLButtonElement>("run").disabled = busy;
  $<HTMLButtonElement>("compare").disabled = busy;
  $<HTMLButtonElement>("cancel").disabled = !busy;
}

$<HTMLButtonElement>("cancel").addEventListener("click", () => {
  if (pending)
    worker.postMessage({
      type: "cancel",
      requestId: pending.id,
    } satisfies WorkerRequest);
});

// --- results ----------------------------------------------------------------

const fmtM = (m: number): string =>
  m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`;

function edgeBetween(u: number, v: number): { length: number; name: string } {
  return graph.out[u]!.find((e) => e.to === v)!;
}

function showMetrics(pairs: [string, string][]): void {
  const dl = $<HTMLDListElement>("metrics");
  dl.replaceChildren();
  for (const [k, v] of pairs) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    dl.append(dt, dd);
  }
}

function showRouteTable(path: number[]): void {
  const tbody = $<HTMLTableElement>("route-table").tBodies[0]!;
  tbody.replaceChildren();
  // Aggregate consecutive edges that share a street name.
  const segments: { name: string; length: number }[] = [];
  for (let i = 1; i < path.length; i++) {
    const e = edgeBetween(path[i - 1]!, path[i]!);
    const last = segments[segments.length - 1];
    if (last && last.name === e.name) last.length += e.length;
    else segments.push({ name: e.name, length: e.length });
  }
  let cumulative = 0;
  segments.forEach((seg, i) => {
    cumulative += seg.length;
    const tr = document.createElement("tr");
    for (const cell of [
      String(i + 1),
      seg.name,
      fmtM(seg.length),
      fmtM(cumulative),
    ]) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.append(td);
    }
    tbody.append(tr);
  });
}

$<HTMLFormElement>("controls").addEventListener("submit", (ev) => {
  ev.preventDefault();
  void runRoute();
});

async function runRoute(): Promise<void> {
  const algorithm = $<HTMLSelectElement>("algorithm").value as Algorithm;
  const start = Number($<HTMLSelectElement>("start").value);
  const destination = Number($<HTMLSelectElement>("destination").value);
  setBusy(true);
  scene.visited = [];
  scene.visibleVisited = 0;
  scene.routePath = [];
  scene.endpoints = [start, ...stops, destination];
  draw();
  $<HTMLElement>("results").hidden = true;

  if (stops.length === 0) {
    statusEl.textContent = `Searching with ${algorithm}…`;
    const r = await request({
      type: "search",
      algorithm,
      start,
      goal: destination,
    });
    scene.routePath = r.path;
    scene.visibleVisited = scene.visited.length;
    draw();
    if (r.found) {
      statusEl.textContent = `Route found: ${fmtM(r.cost)}.`;
      showMetrics([
        ["Algorithm", r.algorithm],
        ["Path cost / distance", fmtM(r.cost)],
        ["Nodes expanded", String(r.expanded)],
        ["Runtime", `${r.runtimeMs.toFixed(1)} ms`],
      ]);
      showRouteTable(r.path);
      $<HTMLElement>("results").hidden = false;
    } else {
      statusEl.textContent =
        "No route exists between these nodes (one-way restrictions).";
    }
  } else {
    statusEl.textContent = `Planning ${stops.length}-stop tour…`;
    const t = await request({
      type: "tour",
      start,
      destination,
      stops: [...stops],
    });
    scene.routePath = t.path;
    draw();
    if (t.found) {
      statusEl.textContent = `Tour found: ${fmtM(t.cost)}.`;
      showMetrics([
        [
          "Visiting order",
          t.order.map((n) => labels.get(n) ?? `node ${n}`).join(" → "),
        ],
        ["Total distance", fmtM(t.cost)],
        ["Nearest-neighbor distance", fmtM(t.nearestNeighborCost)],
        ["2-opt passes", String(t.twoOptPasses)],
        [
          "Nodes expanded (all legs)",
          String(t.legs.reduce((s, l) => s + l.expanded, 0)),
        ],
      ]);
      showRouteTable(t.path);
      $<HTMLElement>("results").hidden = false;
    } else {
      statusEl.textContent =
        "No tour exists: at least one stop is unreachable.";
    }
  }
  setBusy(false);
}

// --- comparison + export ----------------------------------------------------

let lastReport: BenchmarkReport | null = null;

$<HTMLButtonElement>("compare").addEventListener("click", async () => {
  const start = Number($<HTMLSelectElement>("start").value);
  const destination = Number($<HTMLSelectElement>("destination").value);
  setBusy(true);
  statusEl.textContent = "Running both algorithms…";
  scene.visited = [];
  scene.visibleVisited = 0;
  scene.routePath = [];
  scene.endpoints = [start, destination];

  const rows: BenchmarkRow[] = [];
  const tbody = $<HTMLTableElement>("compare-table").tBodies[0]!;
  tbody.replaceChildren();
  for (const algorithm of ["dijkstra", "astar"] as const) {
    const r = await request({
      type: "search",
      algorithm,
      start,
      goal: destination,
    });
    rows.push({
      scenario: `${labels.get(start)} to ${labels.get(destination)}`,
      algorithm,
      start,
      goal: destination,
      found: r.found,
      costMeters: r.found ? Number(r.cost.toFixed(1)) : null,
      nodesExpanded: r.expanded,
      runtimeMs: Number(r.runtimeMs.toFixed(2)),
    });
    scene.routePath = r.path;
    scene.visibleVisited = scene.visited.length;
    draw();
    const tr = document.createElement("tr");
    for (const cell of [
      algorithm,
      r.found ? fmtM(r.cost) : "no route",
      String(r.expanded),
      `${r.runtimeMs.toFixed(1)} ms`,
    ]) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.append(td);
    }
    tbody.append(tr);
  }
  lastReport = {
    graph: graph.fixture.name,
    graphVersion: graph.fixture.version,
    extracted: graph.fixture.source.extracted,
    environment: navigator.userAgent,
    generatedAt: new Date().toISOString(),
    rows,
  };
  $<HTMLElement>("comparison").hidden = false;
  statusEl.textContent = "Comparison complete.";
  setBusy(false);
});

function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

$<HTMLButtonElement>("export-json").addEventListener("click", () => {
  if (lastReport)
    download(
      "benchmark.json",
      JSON.stringify(lastReport, null, 2),
      "application/json",
    );
});
$<HTMLButtonElement>("export-csv").addEventListener("click", () => {
  if (lastReport) download("benchmark.csv", toCsv(lastReport), "text/csv");
});

darkScheme.addEventListener("change", draw);
