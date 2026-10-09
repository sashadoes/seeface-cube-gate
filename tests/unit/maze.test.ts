import { describe, expect, it } from "vitest";
import { CELL, CH, SPAWN, cellOf, chunkAt, circleFree, curatedRooms, pushOut, reachable, roomAtPoint, roomGeometry, wallE, wellsNear } from "../../shared/world/maze.ts";
import { ROOMS } from "../../shared/world/rooms.ts";

describe("maze", () => {
  it("is deterministic", () => {
    const a = chunkAt(5, -3).edges.join(",");
    const b = chunkAt(5, -3).edges.join(",");
    expect(a).toBe(b);
  });

  it("places every curated room exactly once near spawn", () => {
    const placed = curatedRooms().map((p) => p.id).sort();
    expect(placed).toEqual(ROOMS.map((r) => r.id).sort());
  });

  it("spawn is clear and not in a room", () => {
    expect(circleFree(SPAWN.x, SPAWN.z, 0.4)).toBe(true);
    expect(roomAtPoint(SPAWN.x, SPAWN.z)).toBeNull();
  });

  it("every curated room is reachable on foot from spawn, through its door", () => {
    const [si, sj] = cellOf(SPAWN.x, SPAWN.z);
    for (const p of curatedRooms()) {
      const g = roomGeometry(p);
      const [ri, rj] = cellOf(g.center.x, g.center.z);
      expect(reachable(si, sj, ri, rj), p.id).toBe(true);
      expect(roomAtPoint(g.center.x, g.center.z)?.id).toBe(p.id);
    }
  });

  it("far chunks connect to spawn", () => {
    const [si, sj] = cellOf(SPAWN.x, SPAWN.z);
    for (const [cx, cz] of [[3, 2], [-4, 1], [2, -5]]) {
      const ti = cx * CH + 7, tj = cz * CH + 7;
      // pick a corridor cell
      expect(reachable(si, sj, ti, tj, 120000), `${cx},${cz}`).toBe(true);
    }
  });

  it("wells sit in hubs and point at curated rooms", () => {
    const wells = wellsNear(SPAWN.x, SPAWN.z, 1);
    expect(wells.length).toBeGreaterThanOrEqual(8);
    for (const w of wells) expect(ROOMS.some((r) => r.id === w.target)).toBe(true);
  });

  it("pushOut keeps a circle out of a solid wall", () => {
    // find a solid east wall near spawn and push into it
    const [si, sj] = cellOf(SPAWN.x, SPAWN.z);
    for (let i = si - 6; i < si + 6; i++)
      for (let j = sj - 6; j < sj + 6; j++)
        if (wallE(i, j).solid) {
          const x = (i + 1) * CELL - 0.1, z = (j + 0.5) * CELL;
          const r = pushOut(x, z, 0.4)!;
          expect(r).not.toBeNull();
          expect(Math.abs(r.x - (i + 1) * CELL)).toBeGreaterThanOrEqual(0.4 + 0.17);
          return;
        }
    throw new Error("no wall found");
  });
});

import { wallsBetween, wallS as wS } from "../../shared/world/maze.ts";
describe("occlusion", () => {
  it("counts zero walls inside one cell and one across a wall", () => {
    expect(wallsBetween(SPAWN.x, SPAWN.z, SPAWN.x + 0.5, SPAWN.z + 0.5)).toBe(0);
    const [si, sj] = cellOf(SPAWN.x, SPAWN.z);
    for (let i = si - 8; i < si + 8; i++)
      for (let j = sj - 8; j < sj + 8; j++)
        if (wS(i, j).wall && !wS(i, j - 1).wall && !wS(i, j + 1).wall) {
          expect(wallsBetween((i + 0.5) * CELL, (j + 0.5) * CELL, (i + 0.5) * CELL, (j + 1.5) * CELL)).toBe(1);
          return;
        }
  });
});
