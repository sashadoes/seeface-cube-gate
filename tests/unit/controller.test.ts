import { describe, expect, it } from "vitest";
import { createBody, dropAt, step, type StepEvent } from "../../src/world/player/controller.ts";
import { SPAWN, WELL_R, chunkAt, circleFree } from "../../shared/world/maze.ts";

const run = (b: ReturnType<typeof createBody>, secs: number, inp = { mx: 0, mz: 0, jump: false }) => {
  const ev: StepEvent[] = [];
  for (let t = 0; t < secs; t += 1 / 60) step(b, inp, 1 / 60, ev);
  return ev;
};

describe("controller", () => {
  it("accelerates, then slides to a stop", () => {
    const b = createBody(SPAWN.x, SPAWN.z);
    run(b, 0.05, { mx: 0, mz: -1, jump: false });
    const early = Math.hypot(b.vx, b.vz);
    run(b, 0.2, { mx: 0, mz: -1, jump: false });
    expect(Math.hypot(b.vx, b.vz)).toBeGreaterThan(early);
    run(b, 1.2);
    expect(Math.hypot(b.vx, b.vz)).toBeLessThan(0.05);
  });

  it("jumps, double jumps once, and lands with a squash", () => {
    const b = createBody(SPAWN.x, SPAWN.z);
    const ev: StepEvent[] = [];
    step(b, { mx: 0, mz: 0, jump: true }, 1 / 60, ev);
    for (let i = 0; i < 12; i++) step(b, { mx: 0, mz: 0, jump: false }, 1 / 60, ev);
    step(b, { mx: 0, mz: 0, jump: true }, 1 / 60, ev);
    for (let i = 0; i < 6; i++) step(b, { mx: 0, mz: 0, jump: false }, 1 / 60, ev);
    step(b, { mx: 0, mz: 0, jump: true }, 1 / 60, ev); // no third jump
    ev.push(...run(b, 2));
    expect(ev.filter((e) => e.t === "jump").length).toBe(1);
    expect(ev.filter((e) => e.t === "double").length).toBe(1);
    expect(ev.some((e) => e.t === "land")).toBe(true);
    expect(b.onGround).toBe(true);
  });

  it("allows a jump just after walking off (coyote) via buffer", () => {
    const b = createBody(SPAWN.x, SPAWN.z, 0.3);
    b.onGround = false;
    b.coyote = 0.1;
    const ev = step(b, { mx: 0, mz: 0, jump: true }, 1 / 60);
    expect(ev.some((e) => e.t === "jump")).toBe(true);
  });

  it("never ends up inside a wall while running around", () => {
    const b = createBody(SPAWN.x, SPAWN.z);
    for (let i = 0; i < 1200; i++) {
      const a = i * 0.013;
      step(b, { mx: Math.cos(a), mz: Math.sin(a * 1.3), jump: i % 90 === 0 }, 1 / 60);
      if (b.y <= 0.01 && !b.inWell) expect(circleFree(b.x, b.z, 0.4)).toBe(true);
    }
  });

  it("falls into a well and reports it", () => {
    const w = chunkAt(0, 0).well!;
    const b = createBody(w.x + WELL_R * 0.3, w.z);
    const ev = run(b, 1.5);
    expect(ev.some((e) => e.t === "well")).toBe(true);
    dropAt(b, SPAWN.x, SPAWN.z);
    const ev2 = run(b, 1.5);
    expect(ev2.some((e) => e.t === "land")).toBe(true);
    expect(b.onGround).toBe(true);
  });
});
