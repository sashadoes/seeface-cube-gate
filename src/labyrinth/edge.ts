// The edge: the labyrinth is only as big as the crowd inside it.
// Few people → a small labyrinth around the entrance, so the few who are here
// find each other. Every person who comes in pushes the edge out; when people
// leave it slowly closes again. At the edge the fog turns to static and throws
// you back inside. Each level (surface and secret levels) has its own edge
// around its own entrance.
import { CELL, roomCentre } from "./maze";
import { LEVEL_OFFSET, levelAtX } from "./zones";

const BASE = 70; // metres of labyrinth for one lonely person
const PER_PERSON = 45; // more for each extra person
const MAX = 3000;

export const edgeRadius = (online: number) => Math.min(MAX, BASE + PER_PERSON * Math.max(0, online - 1));

export type EdgeState = { radius: number; fog: number; centre: { x: number; z: number } };

export function createEdge() {
  let radius = edgeRadius(1);
  let announced = radius;
  let outside = 0; // seconds spent past the edge

  function update(px: number, pz: number, online: number, dt: number) {
    const target = edgeRadius(online);
    // grows quickly, shrinks slowly (nobody gets trapped by someone leaving)
    radius += (target - radius) * Math.min(1, dt * (target > radius ? 0.25 : 0.03));
    const cx = levelAtX(px) * LEVEL_OFFSET;
    const dist = Math.hypot(px - cx, pz);
    const fog = Math.max(0, Math.min(1, (dist - (radius - 14)) / 14));
    outside = dist > radius + 2 ? outside + dt : 0;

    let grew = false;
    if (radius > announced + 30) {
      grew = true;
      announced = radius;
    }
    if (radius < announced - 30) announced = radius;

    // past the edge for a moment: thrown back to a room inside
    let throwBack: { x: number; z: number } | null = null;
    if (outside > 1.2) {
      outside = 0;
      const k = (radius - 20) / Math.max(dist, 1);
      const tx = cx + (px - cx) * k, tz = pz * k;
      throwBack = roomCentre(Math.floor(tx / CELL / 7), Math.floor(tz / CELL / 7));
    }
    return { fog, grew, throwBack, nearEdge: fog > 0.3 };
  }

  return { update, state: (px: number): EdgeState => ({ radius, fog: 0, centre: { x: levelAtX(px) * LEVEL_OFFSET, z: 0 } }) };
}
