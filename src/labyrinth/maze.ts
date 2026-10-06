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

/** The room inside region (I,J): its top-left cell. */
export function roomOrigin(I: number, J: number) {
  return {
    i: I * REGION + 1 + Math.floor(hash(I, J, 7) * (REGION - ROOM - 1)),
    j: J * REGION + 1 + Math.floor(hash(I, J, 8) * (REGION - ROOM - 1)),
  };
}

export function roomOf(i: number, j: number) {
  const I = Math.floor(i / REGION), J = Math.floor(j / REGION);
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
  if (sameRoom([i, j], [i + 1, j])) return false;
  // rooms always have a door in the middle of each side
  const r = roomOf(i, j) ?? roomOf(i + 1, j);
  if (r && j === r.j + 1) return false;
  return hash(i, j, 1) < WALL_P;
}

/** Wall on the south edge of cell (i, j)? */
export function wallSouth(i: number, j: number) {
  if (sameRoom([i, j], [i, j + 1])) return false;
  const r = roomOf(i, j) ?? roomOf(i, j + 1);
  if (r && i === r.i + 1) return false;
  return hash(i, j, 2) < WALL_P;
}

/** Ceiling light panel in this cell? (liminal fluorescent squares) */
export function hasPanel(i: number, j: number) {
  return roomOf(i, j) === null && hash(i, j, 5) < 0.22;
}

/** Can a body of radius r stand at (x, z)? */
export function free(x: number, z: number, r = 0.35) {
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
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

/** Where everybody arrives: the centre of the room in region (0, 0). */
export function spawn() {
  return roomCentre(0, 0);
}
