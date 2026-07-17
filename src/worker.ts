/**
 * Web Worker: runs searches off the main thread in chunked slices so a
 * cancel message can interrupt between chunks. Tours are cheap relative
 * to animation and run in one slice.
 */
import { loadGraph, type Graph } from "./graph.ts";
import { searchSteps, type Algorithm } from "./search.ts";
import { planTour } from "./tour.ts";

export type WorkerRequest =
  | { type: "load"; fixture: unknown }
  | {
      type: "search";
      requestId: number;
      algorithm: Algorithm;
      start: number;
      goal: number;
    }
  | {
      type: "tour";
      requestId: number;
      start: number;
      destination: number;
      stops: number[];
    }
  | { type: "cancel"; requestId: number };

export type WorkerResponse =
  | { type: "loaded"; nodes: number; edges: number }
  | { type: "visited"; requestId: number; nodes: number[] }
  | { type: "result"; requestId: number; result: unknown }
  | { type: "cancelled"; requestId: number }
  | { type: "error"; requestId?: number; message: string };

let graph: Graph | null = null;
let cancelledId = -1;

function runSearch(msg: Extract<WorkerRequest, { type: "search" }>): void {
  const gen = searchSteps(graph!, msg.algorithm, msg.start, msg.goal);
  const step = (): void => {
    if (cancelledId === msg.requestId) {
      postMessage({
        type: "cancelled",
        requestId: msg.requestId,
      } satisfies WorkerResponse);
      return;
    }
    const r = gen.next();
    if (r.done) {
      postMessage({
        type: "result",
        requestId: msg.requestId,
        result: r.value,
      } satisfies WorkerResponse);
    } else {
      postMessage({
        type: "visited",
        requestId: msg.requestId,
        nodes: r.value,
      } satisfies WorkerResponse);
      setTimeout(step, 0); // yield so cancel messages are processed
    }
  };
  step();
}

onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  try {
    if (msg.type === "load") {
      graph = loadGraph(msg.fixture);
      postMessage({
        type: "loaded",
        nodes: graph.fixture.nodes.length,
        edges: graph.fixture.edges.length,
      } satisfies WorkerResponse);
    } else if (msg.type === "cancel") {
      cancelledId = msg.requestId;
    } else if (!graph) {
      postMessage({
        type: "error",
        requestId: msg.requestId,
        message: "graph not loaded",
      } satisfies WorkerResponse);
    } else if (msg.type === "search") {
      runSearch(msg);
    } else if (msg.type === "tour") {
      const result = planTour(graph, msg.start, msg.destination, msg.stops);
      postMessage({
        type: "result",
        requestId: msg.requestId,
        result,
      } satisfies WorkerResponse);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const error: WorkerResponse =
      "requestId" in msg
        ? { type: "error", requestId: msg.requestId, message }
        : { type: "error", message };
    postMessage(error);
  }
};
