// The seeface1 world labyrinth: seeded, chunked, identical for every visitor and for the server.
//
// Cells are CELL metres square; cell (i, j) covers x ∈ [i·CELL, (i+1)·CELL), z ∈ [j·CELL, (j+1)·CELL).
// Each cell can have a wall on its east (+x) and south (+z) edge. The world is cut into CH×CH-cell
// chunks. Inside a chunk the corridors are a randomised spanning tree (so every corridor cell is
// reachable) with extra openings for loops; rooms and hubs are rectangles kept one cell away from
// each other and from the chunk border, so the remaining corridor cells stay one connected region.
// Neighbouring chunks are joined by several border openings (at least one guaranteed), so the
// whole labyrinth is connected.
import { ROOMS, type District } from "./rooms.ts";

export const CELL = 4;
export const CH = 16;
export const WALL_H = 3.4;
export const WALL_T = 0.36;
export const WELL_R = 3.2;
export const SEED = 0x5eef1;

// edge bits per cell
const E = 1, S = 2, GHOST_E = 4, GHOST_S = 8;

export type CellKind = "corridor" | "room" | "hub";
export type Toy = "pad" | "vent" | "speed" | "none";

export type Rect = { x: number; z: number; w: number; h: number };
export type RoomPlace = { id: string; chunk: [number, number]; rect: Rect; door: "n" | "s" | "e" | "w"; curated: boolean };
export type Well = { id: string; x: number; z: number; target: string };

export type Chunk = {
  cx: number;
  cz: number;
  district: District;
  edges: Uint8Array; // CH*CH, bits E S GHOST_E GHOST_S
  kind: Uint8Array; // 0 corridor, 1 room, 2 hub
  roomAt: Int16Array; // index into chunk.rooms or -1
  toy: Uint8Array; // 0 none, 1 pad, 2 vent, 3 speed
  rooms: RoomPlace[];
  hub: Rect | null;
  well: Well | null;
  lowGravity: boolean;
};

export function hash(a: number, b: number, c: number) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647) ^ SEED;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- curated layout around spawn
type Plan = { district: District; hub: Rect | null; rooms: { id: string; rect: Rect; door: RoomPlace["door"] }[] };
const r = (x: number, z: number, w: number, h: number): Rect => ({ x, z, w, h });
const CURATED: Record<string, Plan> = {
  "0,0": { district: "entrance", hub: r(6, 6, 4, 4), rooms: [{ id: "first-words", rect: r(1, 1, 4, 3), door: "s" }, { id: "night-shift", rect: r(11, 11, 4, 4), door: "n" }] },
  "1,0": { district: "market", hub: r(2, 9, 4, 4), rooms: [{ id: "bad-advice", rect: r(8, 2, 5, 4), door: "s" }] },
  "-1,0": { district: "whisper", hub: r(9, 2, 4, 4), rooms: [{ id: "neon-confessional", rect: r(2, 8, 4, 4), door: "e" }] },
  "0,1": { district: "rain", hub: r(9, 3, 4, 4), rooms: [{ id: "lost-found", rect: r(2, 9, 4, 4), door: "n" }] },
  "0,-1": { district: "archive", hub: r(2, 2, 4, 4), rooms: [{ id: "archive-steps", rect: r(8, 9, 5, 4), door: "w" }] },
  "1,1": { district: "music", hub: r(9, 2, 4, 4), rooms: [{ id: "basement-radio", rect: r(3, 3, 4, 4), door: "e" }, { id: "static-church", rect: r(9, 9, 4, 4), door: "w" }] },
  "-1,-1": { district: "garden", hub: r(9, 9, 4, 4), rooms: [{ id: "dream-desk", rect: r(3, 3, 4, 4), door: "s" }] },
  "1,-1": { district: "market", hub: r(2, 2, 4, 4), rooms: [{ id: "strangers-kitchen", rect: r(8, 8, 4, 4), door: "n" }] },
  "-1,1": { district: "rain", hub: r(9, 2, 4, 4), rooms: [{ id: "cryptid-hotline", rect: r(2, 2, 4, 4), door: "e" }, { id: "weird-science", rect: r(9, 9, 5, 4), door: "n" }] },
};
const FAR_DISTRICTS: District[] = ["whisper", "market", "rain", "archive", "music", "garden"];

function planFor(cx: number, cz: number): Plan {
  const c = CURATED[`${cx},${cz}`];
  if (c) return c;
  const district = FAR_DISTRICTS[Math.floor(hash(cx, cz, 1) * FAR_DISTRICTS.length)];
  const hub = hash(cx, cz, 2) < 0.5 ? r(1 + Math.floor(hash(cx, cz, 3) * 3), 1 + Math.floor(hash(cx, cz, 4) * 3), 4, 4) : null;
  // an unnamed room (claimable later) in the far half of the chunk
  const rooms = hash(cx, cz, 5) < 0.6 ? [{ id: `plot:${cx},${cz}`, rect: r(9, 9, 4, 4), door: (["n", "w"] as const)[Math.floor(hash(cx, cz, 6) * 2)] }] : [];
  return { district, hub, rooms };
}

// ------------------------------------------------------------- generation
const cache = new Map<string, Chunk>();

export function chunkAt(cx: number, cz: number): Chunk {
  const key = `${cx},${cz}`;
  let c = cache.get(key);
  if (!c) {
    if (cache.size > 256) cache.clear();
    c = generate(cx, cz);
    cache.set(key, c);
  }
  return c;
}

const inRect = (x: number, z: number, q: Rect) => x >= q.x && x < q.x + q.w && z >= q.z && z < q.z + q.h;

function generate(cx: number, cz: number): Chunk {
  const plan = planFor(cx, cz);
  const N = CH * CH;
  const edges = new Uint8Array(N).fill(E | S);
  const kind = new Uint8Array(N);
  const roomAt = new Int16Array(N).fill(-1);
  const toy = new Uint8Array(N);
  const idx = (x: number, z: number) => z * CH + x;
  const rooms: RoomPlace[] = plan.rooms.map((p) => ({ ...p, chunk: [cx, cz], curated: !p.id.startsWith("plot:") }));

  rooms.forEach((room, ri) => {
    for (let z = room.rect.z; z < room.rect.z + room.rect.h; z++)
      for (let x = room.rect.x; x < room.rect.x + room.rect.w; x++) {
        kind[idx(x, z)] = 1;
        roomAt[idx(x, z)] = ri;
      }
  });
  if (plan.hub) for (let z = plan.hub.z; z < plan.hub.z + plan.hub.h; z++) for (let x = plan.hub.x; x < plan.hub.x + plan.hub.w; x++) kind[idx(x, z)] = 2;

  // spanning tree over every non-room cell (iterative randomised DFS)
  const rand = prng(Math.floor(hash(cx, cz, 7) * 2 ** 32));
  const seen = new Uint8Array(N);
  let start = 0;
  while (kind[start] === 1) start++;
  const stack = [start];
  seen[start] = 1;
  const open = (x: number, z: number, dx: number, dz: number) => {
    if (dx === 1) edges[idx(x, z)] &= ~E;
    else if (dx === -1) edges[idx(x - 1, z)] &= ~E;
    else if (dz === 1) edges[idx(x, z)] &= ~S;
    else edges[idx(x, z - 1)] &= ~S;
  };
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const x = cur % CH, z = (cur / CH) | 0;
    const options: number[] = [];
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
      if (nx < 0 || nz < 0 || nx >= CH || nz >= CH) continue;
      const n = idx(nx, nz);
      if (!seen[n] && kind[n] !== 1) options.push(d);
    }
    if (!options.length) {
      stack.pop();
      continue;
    }
    const d = options[Math.floor(rand() * options.length)];
    const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
    open(x, z, DIRS[d][0], DIRS[d][1]);
    seen[idx(nx, nz)] = 1;
    stack.push(idx(nx, nz));
  }

  // loops: knock out extra corridor walls (braids the maze, fewer dead ends)
  for (let z = 0; z < CH; z++)
    for (let x = 0; x < CH; x++) {
      const i = idx(x, z);
      if (kind[i] === 1) continue;
      if (x < CH - 1 && kind[idx(x + 1, z)] !== 1 && rand() < 0.16) edges[i] &= ~E;
      if (z < CH - 1 && kind[idx(x, z + 1)] !== 1 && rand() < 0.16) edges[i] &= ~S;
    }

  // rooms: open inside, closed around, one door in the middle of the chosen side
  for (const room of rooms) {
    const q = room.rect;
    for (let z = q.z; z < q.z + q.h; z++)
      for (let x = q.x; x < q.x + q.w; x++) {
        const i = idx(x, z);
        if (x < q.x + q.w - 1) edges[i] &= ~E;
        else edges[i] |= E;
        if (z < q.z + q.h - 1) edges[i] &= ~S;
        else edges[i] |= S;
      }
    for (let z = q.z; z < q.z + q.h; z++) edges[idx(q.x - 1, z)] |= E;
    for (let x = q.x; x < q.x + q.w; x++) edges[idx(x, q.z - 1)] |= S;
    const mx = q.x + Math.floor(q.w / 2), mz = q.z + Math.floor(q.h / 2);
    if (room.door === "n") edges[idx(mx, q.z - 1)] &= ~S;
    if (room.door === "s") edges[idx(mx, q.z + q.h - 1)] &= ~S;
    if (room.door === "w") edges[idx(q.x - 1, mz)] &= ~E;
    if (room.door === "e") edges[idx(q.x + q.w - 1, mz)] &= ~E;
  }

  // hub: an open plaza (no inner walls, most of its outline open)
  let well: Well | null = null;
  if (plan.hub) {
    const q = plan.hub;
    for (let z = q.z; z < q.z + q.h; z++)
      for (let x = q.x; x < q.x + q.w; x++) {
        const i = idx(x, z);
        if (x < q.x + q.w - 1 || rand() < 0.6) edges[i] &= ~E;
        if (z < q.z + q.h - 1 || rand() < 0.6) edges[i] &= ~S;
      }
    for (let z = q.z; z < q.z + q.h; z++) if (rand() < 0.6) edges[idx(q.x - 1, z)] &= ~E;
    for (let x = q.x; x < q.x + q.w; x++) if (rand() < 0.6) edges[idx(x, q.z - 1)] &= ~S;
    const curated = ROOMS.filter((room) => room.id !== "first-words");
    const target = curated[Math.floor(hash(cx, cz, 8) * curated.length)].id;
    well = { id: `well:${cx},${cz}`, x: (cx * CH + q.x + q.w / 2) * CELL, z: (cz * CH + q.z + q.h / 2) * CELL, target };
    // bounce pads in two hub corners
    toy[idx(q.x, q.z)] = 1;
    toy[idx(q.x + q.w - 1, q.z + q.h - 1)] = 1;
  }

  // border openings toward the east and south neighbours (the neighbour opens its own east/south)
  for (let k = 0; k < CH; k++) {
    const guaranteedE = Math.floor(hash(cx, cz, 11) * (CH - 2)) + 1;
    const guaranteedS = Math.floor(hash(cx, cz, 12) * (CH - 2)) + 1;
    if (k === guaranteedE || hash(cx * 31 + k, cz, 13) < 0.22) edges[idx(CH - 1, k)] &= ~E;
    else edges[idx(CH - 1, k)] |= E;
    if (k === guaranteedS || hash(cx, cz * 31 + k, 14) < 0.22) edges[idx(k, CH - 1)] &= ~S;
    else edges[idx(k, CH - 1)] |= S;
  }

  // secret walls: a few corridor walls you can walk through (they look solid)
  for (let i = 0; i < N; i++) {
    if (kind[i] !== 0) continue;
    const x = i % CH, z = (i / CH) | 0;
    if (edges[i] & E && x < CH - 1 && kind[i + 1] === 0 && hash(cx * CH + x, cz * CH + z, 21) < 0.025) edges[i] |= GHOST_E;
    if (edges[i] & S && z < CH - 1 && kind[i + CH] === 0 && hash(cx * CH + x, cz * CH + z, 22) < 0.025) edges[i] |= GHOST_S;
  }

  // corridor toys: wind vents and speed strips (straight corridors only)
  for (let i = 0; i < N; i++) {
    if (kind[i] !== 0 || toy[i]) continue;
    const x = i % CH, z = (i / CH) | 0;
    const h = hash(cx * CH + x, cz * CH + z, 31);
    const straightX = !(edges[i] & E) && x > 0 && !(edges[i - 1] & E) && edges[i] & S && z > 0 && edges[i - CH] & S;
    const straightZ = !(edges[i] & S) && z > 0 && !(edges[i - CH] & S) && edges[i] & E && x > 0 && edges[i - 1] & E;
    if (h < 0.018) toy[i] = 2;
    else if (h < 0.05 && (straightX || straightZ)) toy[i] = 3;
  }

  return { cx, cz, district: plan.district, edges, kind, roomAt, toy, rooms, hub: plan.hub, well, lowGravity: plan.district === "garden" };
}

// ------------------------------------------------------------- queries (world cell coordinates)
const floorDiv = (a: number, b: number) => Math.floor(a / b);
const mod = (a: number, b: number) => ((a % b) + b) % b;

export function cellInfo(i: number, j: number) {
  const c = chunkAt(floorDiv(i, CH), floorDiv(j, CH));
  return { chunk: c, li: mod(i, CH), lj: mod(j, CH), k: mod(j, CH) * CH + mod(i, CH) };
}

/** wall on the east edge of cell (i, j); solid = collides (secret walls look solid but don't) */
export function wallE(i: number, j: number) {
  const { chunk, k } = cellInfo(i, j);
  const b = chunk.edges[k];
  return { wall: !!(b & E), solid: !!(b & E) && !(b & GHOST_E) };
}
export function wallS(i: number, j: number) {
  const { chunk, k } = cellInfo(i, j);
  const b = chunk.edges[k];
  return { wall: !!(b & S), solid: !!(b & S) && !(b & GHOST_S) };
}

export const cellOf = (x: number, z: number): [number, number] => [Math.floor(x / CELL), Math.floor(z / CELL)];

export function toyAt(x: number, z: number): Toy {
  const [i, j] = cellOf(x, z);
  const { chunk, k } = cellInfo(i, j);
  return (["none", "pad", "vent", "speed"] as const)[chunk.toy[k]];
}

export function districtAt(x: number, z: number): District {
  const [i, j] = cellOf(x, z);
  return cellInfo(i, j).chunk.district;
}

export function lowGravityAt(x: number, z: number) {
  const [i, j] = cellOf(x, z);
  const { chunk, k } = cellInfo(i, j);
  return chunk.lowGravity && chunk.kind[k] === 0;
}

/** the room place (with world-space bounds) that contains this point, if any */
export function roomAtPoint(x: number, z: number): (RoomPlace & { bounds: { x0: number; z0: number; x1: number; z1: number } }) | null {
  const [i, j] = cellOf(x, z);
  const { chunk, k } = cellInfo(i, j);
  const ri = chunk.roomAt[k];
  if (ri < 0) return null;
  return withBounds(chunk.rooms[ri]);
}

export function withBounds(p: RoomPlace) {
  const ox = p.chunk[0] * CH, oz = p.chunk[1] * CH;
  return { ...p, bounds: { x0: (ox + p.rect.x) * CELL, z0: (oz + p.rect.z) * CELL, x1: (ox + p.rect.x + p.rect.w) * CELL, z1: (oz + p.rect.z + p.rect.h) * CELL } };
}

/** world position of a room's door (on the outside threshold) and its centre */
export function roomGeometry(p: RoomPlace) {
  const b = withBounds(p).bounds;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const q = p.rect, ox = p.chunk[0] * CH, oz = p.chunk[1] * CH;
  const mx = (ox + q.x + Math.floor(q.w / 2) + 0.5) * CELL, mz = (oz + q.z + Math.floor(q.h / 2) + 0.5) * CELL;
  const door = p.door === "n" ? { x: mx, z: b.z0, nx: 0, nz: -1 } : p.door === "s" ? { x: mx, z: b.z1, nx: 0, nz: 1 } : p.door === "w" ? { x: b.x0, z: mz, nx: -1, nz: 0 } : { x: b.x1, z: mz, nx: 1, nz: 0 };
  return { center: { x: cx, z: cz }, door, bounds: b };
}

/** every curated room's placement (they all live in the 3×3 chunks around spawn) */
export function curatedRooms(): RoomPlace[] {
  const out: RoomPlace[] = [];
  for (let cz = -1; cz <= 1; cz++) for (let cx = -1; cx <= 1; cx++) out.push(...chunkAt(cx, cz).rooms.filter((p) => p.curated));
  return out;
}

export function curatedRoomPlace(id: string) {
  return curatedRooms().find((p) => p.id === id) ?? null;
}

export function wellsNear(x: number, z: number, radiusChunks = 1): Well[] {
  const ccx = floorDiv(Math.floor(x / CELL), CH), ccz = floorDiv(Math.floor(z / CELL), CH);
  const out: Well[] = [];
  for (let dz = -radiusChunks; dz <= radiusChunks; dz++)
    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      const w = chunkAt(ccx + dx, ccz + dz).well;
      if (w) out.push(w);
    }
  return out;
}

/** where a new player stands: the entrance hub, beside the well */
export const SPAWN = (() => {
  const w = chunkAt(0, 0).well!;
  return { x: w.x - WELL_R - 2.2, z: w.z + 1.5 };
})();

/** circle-vs-walls: is a circle of radius rad at (x, z) clear of every solid wall? */
export function circleFree(x: number, z: number, rad: number) {
  return pushOut(x, z, rad) === null;
}

/**
 * Resolve a circle against nearby solid walls. Returns the corrected position, or null if it
 * already touches nothing. Walls are boxes WALL_T thick centred on cell edges; each wall's
 * ends are extended by WALL_T/2 so corners are closed.
 */
export function pushOut(x: number, z: number, rad: number): { x: number; z: number; hit: boolean } | null {
  const [ci, cj] = cellOf(x, z);
  let px = x, pz = z, hit = false;
  const ht = WALL_T / 2;
  for (let pass = 0; pass < 2; pass++)
    for (let j = cj - 1; j <= cj + 1; j++)
      for (let i = ci - 1; i <= ci + 1; i++) {
        // east wall of (i, j): x = (i+1)·CELL, z from j·CELL to (j+1)·CELL
        if (wallE(i, j).solid) {
          const r2 = resolveBox(px, pz, rad, (i + 1) * CELL - ht, j * CELL - ht, (i + 1) * CELL + ht, (j + 1) * CELL + ht);
          if (r2) ((px = r2.x), (pz = r2.z), (hit = true));
        }
        if (wallS(i, j).solid) {
          const r2 = resolveBox(px, pz, rad, i * CELL - ht, (j + 1) * CELL - ht, (i + 1) * CELL + ht, (j + 1) * CELL + ht);
          if (r2) ((px = r2.x), (pz = r2.z), (hit = true));
        }
      }
  return hit ? { x: px, z: pz, hit } : null;
}

function resolveBox(x: number, z: number, rad: number, x0: number, z0: number, x1: number, z1: number) {
  const nx = Math.max(x0, Math.min(x, x1)), nz = Math.max(z0, Math.min(z, z1));
  const dx = x - nx, dz = z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= rad * rad) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2), push = rad - d;
    return { x: x + (dx / d) * push, z: z + (dz / d) * push };
  }
  // centre inside the box: push out along the shallowest axis
  const left = x - x0 + rad, right = x1 - x + rad, up = z - z0 + rad, down = z1 - z + rad;
  const m = Math.min(left, right, up, down);
  if (m === left) return { x: x0 - rad, z };
  if (m === right) return { x: x1 + rad, z };
  if (m === up) return { x, z: z0 - rad };
  return { x, z: z1 + rad };
}

/** breadth-first reachability over cells (used by tests and the server sanity checks) */
export function reachable(fromI: number, fromJ: number, toI: number, toJ: number, maxCells = 20000) {
  const key = (i: number, j: number) => `${i},${j}`;
  const seen = new Set([key(fromI, fromJ)]);
  const q: [number, number][] = [[fromI, fromJ]];
  while (q.length && seen.size < maxCells) {
    const [i, j] = q.shift()!;
    if (i === toI && j === toJ) return true;
    const nb: [number, number, boolean][] = [
      [i + 1, j, !wallE(i, j).solid],
      [i - 1, j, !wallE(i - 1, j).solid],
      [i, j + 1, !wallS(i, j).solid],
      [i, j - 1, !wallS(i, j - 1).solid],
    ];
    for (const [ni, nj, ok] of nb) {
      const k2 = key(ni, nj);
      if (ok && !seen.has(k2)) (seen.add(k2), q.push([ni, nj]));
    }
  }
  return false;
}
