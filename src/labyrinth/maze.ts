// The infinite seeface1 labyrinth. Deterministic: every visitor gets exactly
// the same maze from the same rules, so later (multiplayer) two people at the
// same coordinates stand in the same corridor.
//
// Grid of CELL-metre cells. Each cell may have a wall on its east and south
// edge. ~45% walls keeps it a labyrinth while staying connected (open-edge
// probability is above the square-lattice percolation threshold, so there is
// always a way on). Every REGION×REGION block holds one 3×3 room with a cube.

export const CELL = 4; // metres
export const WALL_H = 3.4;
const WALL_P = 0.45;
const REGION = 7;
const ROOM = 3;

function hash(a: number, b: number, c: number) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

export const rnd = hash;

// ------------------------------------------------------------------ places
// Some regions hold a big place instead of a room: a PLACE×PLACE block of open
// floor with a doorway in the middle of each side. One of each sits right
// around the entrance (so everyone finds them even when the labyrinth is
// small); more are scattered further out. The dark room is secret: one door
// only, disguised as a wall you can walk through.
export type PlaceKind = "open" | "theater" | "mall" | "museum" | "market" | "dark";
export const PLACE = 5; // cells per side (20 m)
const NEAR_PLACES: Record<string, PlaceKind> = {
  "1,0": "museum",
  "0,1": "market",
  "-1,0": "theater",
  "0,-1": "mall",
  "1,1": "open",
  "-1,-1": "dark",
};
const FAR_PLACES: PlaceKind[] = ["open", "theater", "mall", "museum", "market"];

export function placeAt(I: number, J: number): PlaceKind | null {
  if (I === 0 && J === 0) return null; // the entrance keeps its room
  const near = NEAR_PLACES[`${I},${J}`];
  if (near) return near;
  if (Math.abs(I) <= 1 && Math.abs(J) <= 1) return null;
  const h = hash(I, J, 60);
  if (h < 0.015) return "dark";
  if (h < 0.11) return FAR_PLACES[Math.floor(hash(I, J, 61) * FAR_PLACES.length)];
  return null;
}

/** The place this cell belongs to (with its top-left cell), or null. */
export function placeOf(i: number, j: number) {
  const I = Math.floor(i / REGION), J = Math.floor(j / REGION);
  const kind = placeAt(I, J);
  if (!kind) return null;
  const i0 = I * REGION + 1, j0 = J * REGION + 1;
  if (i < i0 || i >= i0 + PLACE || j < j0 || j >= j0 + PLACE) return null;
  return { I, J, kind, i0, j0 };
}

/** The dark room's one door: which side (0 east, 1 west, 2 south, 3 north). */
export const darkDoorSide = (I: number, J: number) => Math.floor(hash(I, J, 62) * 4);

/** Centre of a place in world metres. */
export function placeCentre(I: number, J: number) {
  return { x: (I * REGION + 1 + PLACE / 2) * CELL, z: (J * REGION + 1 + PLACE / 2) * CELL };
}

/** Is the edge between two neighbouring cells inside/at a place? true/false = decided, null = normal maze rules. */
function placeEdge(a: [number, number], b: [number, number]): boolean | null {
  const pa = placeOf(a[0], a[1]), pb = placeOf(b[0], b[1]);
  if (!pa && !pb) return null;
  if (pa && pb && pa.I === pb.I && pa.J === pb.J) return false; // open floor inside
  // the boundary: solid, except the doorways
  const p = (pa ?? pb)!;
  const mid = 2;
  const horizontal = a[1] === b[1]; // east-west edge
  const inner = pa ? a : b;
  if (p.kind === "dark") {
    const side = darkDoorSide(p.I, p.J);
    const east = horizontal && inner[0] === p.i0 + PLACE - 1, west = horizontal && inner[0] === p.i0;
    const south = !horizontal && inner[1] === p.j0 + PLACE - 1, north = !horizontal && inner[1] === p.j0;
    const atMid = horizontal ? inner[1] === p.j0 + mid : inner[0] === p.i0 + mid;
    const onSide = [east, west, south, north][side];
    return !(onSide && atMid);
  }
  if (horizontal ? inner[1] === p.j0 + mid : inner[0] === p.i0 + mid) return false;
  return true;
}

/** The room inside region (I,J): its top-left cell. */
export function roomOrigin(I: number, J: number) {
  return {
    i: I * REGION + 1 + Math.floor(hash(I, J, 7) * (REGION - ROOM - 1)),
    j: J * REGION + 1 + Math.floor(hash(I, J, 8) * (REGION - ROOM - 1)),
  };
}

export function roomOf(i: number, j: number) {
  const I = Math.floor(i / REGION), J = Math.floor(j / REGION);
  if (placeAt(I, J)) return null; // that region has a place instead of a room
  const o = roomOrigin(I, J);
  if (i >= o.i && i < o.i + ROOM && j >= o.j && j < o.j + ROOM) return { I, J, ...o };
  return null;
}

/** Centre of a room in world metres (x, z). */
export function roomCentre(I: number, J: number) {
  const o = roomOrigin(I, J);
  return { x: (o.i + ROOM / 2) * CELL, z: (o.j + ROOM / 2) * CELL };
}

function sameRoom(a: [number, number], b: [number, number]) {
  const ra = roomOf(a[0], a[1]);
  const rb = roomOf(b[0], b[1]);
  return !!ra && !!rb && ra.I === rb.I && ra.J === rb.J;
}

/** Wall on the east edge of cell (i, j)? */
export function wallEast(i: number, j: number) {
  const pe = placeEdge([i, j], [i + 1, j]);
  if (pe !== null) return pe;
  if (sameRoom([i, j], [i + 1, j])) return false;
  // rooms always have a door in the middle of each side
  const r = roomOf(i, j) ?? roomOf(i + 1, j);
  if (r && j === r.j + 1) return false;
  return hash(i, j, 1) < WALL_P;
}

/** Wall on the south edge of cell (i, j)? */
export function wallSouth(i: number, j: number) {
  const pe = placeEdge([i, j], [i, j + 1]);
  if (pe !== null) return pe;
  if (sameRoom([i, j], [i, j + 1])) return false;
  const r = roomOf(i, j) ?? roomOf(i, j + 1);
  if (r && i === r.i + 1) return false;
  return hash(i, j, 2) < WALL_P;
}

/** Ceiling light panel in this cell? (liminal fluorescent squares) */
export function hasPanel(i: number, j: number) {
  return roomOf(i, j) === null && placeOf(i, j) === null && hash(i, j, 5) < 0.22;
}

/** Can a body of radius r stand at (x, z)? */
// solid furniture inside places, in metres from the place's corner (x0, z0, x1, z1)
const SOLID: Partial<Record<PlaceKind, [number, number, number, number][]>> = {
  // supermarket aisles + checkouts
  market: [
    [3, 3, 4, 14], [7, 3, 8, 14], [11, 3, 12, 14], [15, 3, 16, 14],
    [3, 16.5, 5.5, 17.5], [8, 16.5, 10.5, 17.5], [13, 16.5, 15.5, 17.5],
  ],
  // museum pedestals
  museum: [
    [4.5, 4.5, 5.5, 5.5], [14.5, 4.5, 15.5, 5.5], [4.5, 14.5, 5.5, 15.5], [14.5, 14.5, 15.5, 15.5], [9, 9, 11, 11],
  ],
  // theater stage + seat rows
  theater: [
    [3, 1, 17, 4.5],
    [4, 8, 8.5, 8.8], [11.5, 8, 16, 8.8], [4, 10.5, 8.5, 11.3], [11.5, 10.5, 16, 11.3], [4, 13, 8.5, 13.8], [11.5, 13, 16, 13.8],
  ],
  // mall fountain
  mall: [[8.3, 8.3, 11.7, 11.7]],
  // standing stones in the open
  open: [[5, 5, 6, 6], [14, 6, 15, 7], [9.5, 14, 10.5, 15]],
};

export function free(x: number, z: number, r = 0.35) {
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
  const pl = placeOf(i, j);
  if (pl) {
    const lx = x - pl.i0 * CELL, lz = z - pl.j0 * CELL;
    for (const [x0, z0, x1, z1] of SOLID[pl.kind] ?? []) if (lx > x0 - r && lx < x1 + r && lz > z0 - r && lz < z1 + r) return false;
  }
  const lx = x - i * CELL, lz = z - j * CELL;
  const half = 0.15; // half wall thickness
  if (lx < r + half && wallEast(i - 1, j)) return false;
  if (lx > CELL - r - half && wallEast(i, j)) return false;
  if (lz < r + half && wallSouth(i, j - 1)) return false;
  if (lz > CELL - r - half && wallSouth(i, j)) return false;
  // corner posts
  const nearX = lx < r + half ? 0 : lx > CELL - r - half ? CELL : -1;
  const nearZ = lz < r + half ? 0 : lz > CELL - r - half ? CELL : -1;
  if (nearX >= 0 && nearZ >= 0) {
    const ci = i + (nearX ? 1 : 0), cj = j + (nearZ ? 1 : 0);
    const post = wallEast(ci - 1, cj) || wallEast(ci - 1, cj - 1) || wallSouth(ci, cj - 1) || wallSouth(ci - 1, cj - 1);
    if (post && Math.hypot(lx - nearX, lz - nearZ) < r + half) return false;
  }
  return true;
}

/** A spot in region (I,J) that's always free: the room's centre, or an open
 *  spot inside the place that replaced it (never on its furniture). */
export function safeSpot(I: number, J: number) {
  if (placeAt(I, J)) return { x: (I * REGION + 1) * CELL + 10, z: (J * REGION + 1) * CELL + 7.2 };
  return roomCentre(I, J);
}

/** Where everybody arrives: the centre of the room in region (0, 0). */
export function spawn() {
  return roomCentre(0, 0);
}
