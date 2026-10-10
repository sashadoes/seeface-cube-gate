// The edge: the labyrinth is only as big as the crowd inside it.
// Few people → a small labyrinth around the entrance, so the few who are here
// find each other. Every person who comes in pushes the edge out; when people
// leave it slowly closes again. At the edge the fog turns to static and you
// can't walk any further out (you're never moved: only intentional teleports). Each level (surface and secret levels) has its own edge
// around its own entrance.
import { LEVEL_OFFSET, levelAtX } from "./zones";

const BASE = 100; // metres of labyrinth for one lonely person (reaches the café east of the entrance)
const PER_PERSON = 45; // more for each extra person
const MAX = 3000;

export const edgeRadius = (online: number) => Math.min(MAX, BASE + PER_PERSON * Math.max(0, online - 1));

export type EdgeState = { radius: number; fog: number; centre: { x: number; z: number } };

export function createEdge() {
  let radius = edgeRadius(1);
  let announced = radius;

  function update(px: number, pz: number, online: number, dt: number) {
    const target = edgeRadius(online);
    // grows quickly, shrinks slowly (nobody gets trapped by someone leaving)
    radius += (target - radius) * Math.min(1, dt * (target > radius ? 0.25 : 0.03));
    const cx = levelAtX(px) * LEVEL_OFFSET;
    const dist = Math.hypot(px - cx, pz);
    const fog = Math.max(0, Math.min(1, (dist - (radius - 14)) / 14));

    let grew = false;
    if (radius > announced + 30) {
      grew = true;
      announced = radius;
    }
    if (radius < announced - 30) announced = radius;

    return { fog, grew, nearEdge: fog > 0.3 };
  }

  /** may you step from (ox,oz) to (nx,nz)? Past the edge you can only walk back in
   *  (if the edge shrinks past you, nothing pushes you: just walk inwards). */
  function allows(ox: number, oz: number, nx: number, nz: number) {
    const cx = levelAtX(ox) * LEVEL_OFFSET;
    const dn = Math.hypot(nx - cx, nz);
    return dn <= radius + 1 || dn <= Math.hypot(ox - cx, oz);
  }

  return { update, allows, state: (px: number): EdgeState => ({ radius, fog: 0, centre: { x: levelAtX(px) * LEVEL_OFFSET, z: 0 } }) };
}
