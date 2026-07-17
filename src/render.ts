/** Canvas rendering: base street graph, visited-node overlay, final route. */
import type { Graph } from "./graph.ts";

export interface Projection {
  x(lon: number): number;
  y(lat: number): number;
}

export function makeProjection(
  graph: Graph,
  width: number,
  height: number,
): Projection {
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const n of graph.fixture.nodes) {
    minLat = Math.min(minLat, n.lat);
    maxLat = Math.max(maxLat, n.lat);
    minLon = Math.min(minLon, n.lon);
    maxLon = Math.max(maxLon, n.lon);
  }
  // Equirectangular with latitude correction, letterboxed into the canvas.
  const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanX = (maxLon - minLon) * kx;
  const spanY = maxLat - minLat;
  const pad = 12;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const ox = (width - spanX * scale) / 2;
  const oy = (height - spanY * scale) / 2;
  return {
    x: (lon) => ox + (lon - minLon) * kx * scale,
    y: (lat) => oy + (maxLat - lat) * scale,
  };
}

export interface Scene {
  visited: number[];
  /** how many of `visited` to show */
  visibleVisited: number;
  routePath: number[];
  endpoints: number[];
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  graph: Graph,
  proj: Projection,
  scene: Scene,
  dark: boolean,
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = dark ? "#3a3f4a" : "#c9ccd4";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const e of graph.fixture.edges) {
    const a = graph.fixture.nodes[e.from]!;
    const b = graph.fixture.nodes[e.to]!;
    ctx.moveTo(proj.x(a.lon), proj.y(a.lat));
    ctx.lineTo(proj.x(b.lon), proj.y(b.lat));
  }
  ctx.stroke();

  ctx.fillStyle = dark ? "#8ab4f8" : "#0b57d0";
  for (let i = 0; i < scene.visibleVisited; i++) {
    const n = graph.fixture.nodes[scene.visited[i]!]!;
    ctx.fillRect(proj.x(n.lon) - 1.5, proj.y(n.lat) - 1.5, 3, 3);
  }

  if (scene.routePath.length > 1) {
    ctx.strokeStyle = dark ? "#f28b82" : "#c5221f";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < scene.routePath.length; i++) {
      const n = graph.fixture.nodes[scene.routePath[i]!]!;
      if (i === 0) ctx.moveTo(proj.x(n.lon), proj.y(n.lat));
      else ctx.lineTo(proj.x(n.lon), proj.y(n.lat));
    }
    ctx.stroke();
  }

  for (const id of scene.endpoints) {
    const n = graph.fixture.nodes[id]!;
    ctx.fillStyle = dark ? "#fdd663" : "#a56300";
    ctx.beginPath();
    ctx.arc(proj.x(n.lon), proj.y(n.lat), 6, 0, Math.PI * 2);
    ctx.fill();
  }
}
