// Kinematic capsule controller: momentum, coyote time, jump buffer, a small double jump, air
// control, and the labyrinth toys (bounce pads, wind vents, speed strips, low gravity, wells).
// Pure logic (no three.js, no DOM), so it runs the same in tests.
import { WELL_R, lowGravityAt, pushOut, toyAt, wellsNear, type Well } from "../../../shared/world/maze.ts";

export const RADIUS = 0.42;
const MAX_SPEED = 6.2;
const SPEED_STRIP = 1.75;
const ACCEL_GROUND = 46;
const ACCEL_AIR = 16;
const FRICTION = 10; // per second, ground, when no input
const GRAVITY = 26;
const GRAVITY_LOW = 8;
const JUMP_V = 8.6;
const DOUBLE_V = 7.2;
const PAD_V = 17;
const VENT_LIFT = 46;
const VENT_TOP = 7;
const COYOTE = 0.12;
const BUFFER = 0.13;
const FALL_TRIGGER_Y = -4;

export type Body = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  coyote: number;
  buffer: number;
  jumpsLeft: number;
  /** -1..1: negative = squashed (landing), positive = stretched (jumping) */
  squash: number;
  /** while falling down a well this is set and the controller stops colliding */
  inWell: Well | null;
  stepPhase: number;
};

export type StepInput = { mx: number; mz: number; jump: boolean };
export type StepEvent =
  | { t: "jump" }
  | { t: "double" }
  | { t: "land"; impact: number }
  | { t: "bump"; speed: number }
  | { t: "pad" }
  | { t: "vent" }
  | { t: "step"; speed: number }
  | { t: "well"; well: Well };

export function createBody(x: number, z: number, y = 0): Body {
  return { x, y, z, vx: 0, vy: 0, vz: 0, onGround: y <= 0, coyote: 0, buffer: 0, jumpsLeft: 1, squash: 0, inWell: null, stepPhase: 0 };
}

const wellUnder = (x: number, z: number): Well | null => {
  for (const w of wellsNear(x, z, 1)) if ((x - w.x) ** 2 + (z - w.z) ** 2 < WELL_R * WELL_R) return w;
  return null;
};

export function step(b: Body, inp: StepInput, dt: number, out: StepEvent[] = []): StepEvent[] {
  dt = Math.min(dt, 1 / 20);
  const toy = toyAt(b.x, b.z);
  const lowG = lowGravityAt(b.x, b.z);
  const maxSpeed = MAX_SPEED * (toy === "speed" ? SPEED_STRIP : 1);

  // horizontal: accelerate toward the wanted velocity, slide to a stop without input
  const len = Math.hypot(inp.mx, inp.mz);
  const mx = len > 1 ? inp.mx / len : inp.mx, mz = len > 1 ? inp.mz / len : inp.mz;
  const accel = b.onGround ? ACCEL_GROUND : ACCEL_AIR;
  if (len > 0.05) {
    const wx = mx * maxSpeed, wz = mz * maxSpeed;
    const dx = wx - b.vx, dz = wz - b.vz;
    const d = Math.hypot(dx, dz), a = accel * dt;
    if (d <= a) ((b.vx = wx), (b.vz = wz));
    else ((b.vx += (dx / d) * a), (b.vz += (dz / d) * a));
  } else if (b.onGround) {
    const k = Math.max(0, 1 - FRICTION * dt);
    b.vx *= k;
    b.vz *= k;
  }
  // a speed strip throws you forward along your heading
  if (toy === "speed" && b.onGround) {
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 1 && sp < maxSpeed) ((b.vx *= maxSpeed / sp), (b.vz *= maxSpeed / sp));
  }

  // jumping: buffered presses, coyote time after leaving a ledge, one extra jump in the air
  if (inp.jump) b.buffer = BUFFER;
  else b.buffer = Math.max(0, b.buffer - dt);
  b.coyote = b.onGround ? COYOTE : Math.max(0, b.coyote - dt);
  if (b.buffer > 0 && !b.inWell) {
    if (b.onGround || b.coyote > 0) {
      b.vy = JUMP_V * (lowG ? 0.8 : 1);
      b.onGround = false;
      b.coyote = 0;
      b.buffer = 0;
      b.squash = 0.55;
      out.push({ t: "jump" });
    } else if (b.jumpsLeft > 0 && inp.jump) {
      b.vy = DOUBLE_V * (lowG ? 0.8 : 1);
      b.jumpsLeft--;
      b.buffer = 0;
      b.squash = 0.45;
      out.push({ t: "double" });
    }
  }

  // vertical
  b.vy -= (lowG ? GRAVITY_LOW : GRAVITY) * dt;
  if (toy === "vent" && b.y < VENT_TOP && !b.inWell) {
    b.vy += VENT_LIFT * dt * (1 - b.y / VENT_TOP);
    if (b.onGround) out.push({ t: "vent" });
    b.onGround = false;
  }
  b.y += b.vy * dt;

  // move + collide with walls (skipped while inside a well shaft)
  const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
  if (b.inWell) {
    b.x = nx;
    b.z = nz;
  } else {
    const fixed = pushOut(nx, nz, RADIUS);
    if (fixed) {
      const before = Math.hypot(b.vx, b.vz);
      // remove the velocity component into the wall
      const ax = fixed.x - nx, az = fixed.z - nz, al = Math.hypot(ax, az) || 1;
      const into = (b.vx * ax + b.vz * az) / al;
      if (into < 0) ((b.vx -= (into * ax) / al), (b.vz -= (into * az) / al));
      b.x = fixed.x;
      b.z = fixed.z;
      if (before > 3.5 && into < -2.5) {
        b.squash = -0.25;
        out.push({ t: "bump", speed: -into });
      }
    } else {
      b.x = nx;
      b.z = nz;
    }
  }

  // floor (none above a well)
  const hole = b.inWell ?? wellUnder(b.x, b.z);
  if (!hole && b.y <= 0) {
    if (!b.onGround) {
      const impact = Math.min(1, -b.vy / 18);
      b.squash = -0.3 - impact * 0.5;
      out.push({ t: "land", impact });
      if (toy === "pad") {
        b.vy = PAD_V;
        b.y = 0.01;
        b.squash = 0.8;
        b.jumpsLeft = 1;
        out.push({ t: "pad" });
        return out;
      }
    }
    b.y = 0;
    b.vy = 0;
    b.onGround = true;
    b.jumpsLeft = 1;
  } else if (b.y > 0 || hole) {
    b.onGround = false;
    if (hole && b.y < FALL_TRIGGER_Y && !b.inWell) {
      b.inWell = hole;
      out.push({ t: "well", well: hole });
    }
    // pull toward the well's centre while dropping in, so you never clip its rim
    if (hole && b.y < 0) {
      b.vx += (hole.x - b.x) * 3 * dt;
      b.vz += (hole.z - b.z) * 3 * dt;
    }
  }

  // footsteps
  const sp = Math.hypot(b.vx, b.vz);
  if (b.onGround && sp > 0.8) {
    b.stepPhase += sp * dt * 0.55;
    if (b.stepPhase >= 1) {
      b.stepPhase -= 1;
      out.push({ t: "step", speed: sp });
    }
  }

  // squash relaxes back with a little wobble
  b.squash += (0 - b.squash) * Math.min(1, dt * 9);
  if (!b.onGround) b.squash = Math.max(b.squash, Math.min(0.35, b.vy / 30));
  return out;
}

/** put a body down at a destination from above (after a well fall) */
export function dropAt(b: Body, x: number, z: number, height = 9) {
  b.x = x;
  b.z = z;
  b.y = height;
  b.vx = b.vz = 0;
  b.vy = -14;
  b.inWell = null;
  b.onGround = false;
}
