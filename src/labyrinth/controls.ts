// Walking controls.
//   computer: W/A/S/D or arrows to move, drag (or ←/→) to look, Shift to run, Space to jump, E to spin a cube, F to strike
//   phone:    one thumb, anywhere on the screen. The stick appears where you touch and
//             follows your thumb if you slide past its edge. Up = walk, sideways = turn
//             (like a car), push all the way = run. A second finger drags to look.
//             The maze helps: walking along a corridor lines the view up with it, the
//             view levels out as you walk, and walking into a corner turns you round it
//             (at a T, lean the way you want to go). Tap = spin a cube.
//             Light buzzes (Android) when you bump a wall or break into a run.

import { settings } from "./settings";

export type Input = {
  move: { x: number; z: number }; // x: strafe right, z: forward (-1..1)
  yaw: number;
  pitch: number;
  run: boolean;
  /** held by the on-screen run button (phones) */
  runHeld: boolean;
  consumeTap: () => boolean;
  /** Space / jump button */
  consumeJump: () => boolean;
  jumpPressed: boolean;
  joystick: { active: boolean; ox: number; oy: number; x: number; y: number };
  /** phones: turn round corners for you. Call each frame before moving. */
  assist: (px: number, pz: number, free: (x: number, z: number) => boolean, dt: number) => void;
  /** a short vibration for touch players (no-op elsewhere, throttled) */
  buzz: (ms?: number) => void;
};

export function createInput(target: HTMLElement): Input {
  const keys = new Set<string>();
  let touching = false; // last input came from a finger
  let lastBuzz = 0;
  const buzz = (ms = 12) => {
    const now = performance.now();
    if (!touching || now - lastBuzz < 220) return;
    lastBuzz = now;
    try {
      navigator.vibrate?.(ms);
    } catch {
      // ignore
    }
  };

  // corner turning: a yaw we're easing towards (null = none)
  let turnTo: number | null = null;
  const Q = Math.PI / 2;

  const input: Input = {
    move: { x: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    run: false,
    runHeld: false,
    jumpPressed: false,
    consumeJump: () => {
      const j = input.jumpPressed;
      input.jumpPressed = false;
      return j;
    },
    consumeTap: () => {
      const t = tapped;
      tapped = false;
      return t;
    },
    joystick: { active: false, ox: 0, oy: 0, x: 0, y: 0 },
    buzz,
    assist: (px, pz, free, dt) => {
      const j = input.joystick;
      if (!j.active || !settings().stickSteers) return void (turnTo = null);
      // the player steering on purpose always wins
      if (Math.abs(j.x) > 0.55 || -j.y < 0.3) return void (turnTo = null);
      if (turnTo === null) {
        const fx = -Math.sin(input.yaw), fz = -Math.cos(input.yaw);
        if (free(px + fx * 1.1, pz + fz * 1.1)) return;
        // wall ahead: which way is open? (snap to the maze's quarter turns)
        const base = Math.round(input.yaw / Q) * Q;
        const open = (a: number) => free(px - Math.sin(a) * 1.8, pz - Math.cos(a) * 1.8);
        const left = open(base + Q), right = open(base - Q);
        if (left && right) {
          if (Math.abs(j.x) < 0.06) return; // a T: wait for a lean
          turnTo = j.x < 0 ? base + Q : base - Q;
        } else if (left) turnTo = base + Q;
        else if (right) turnTo = base - Q;
        else return; // dead end: your call
      }
      const off = turnTo - input.yaw;
      if (Math.abs(off) < 0.02) {
        input.yaw = turnTo;
        turnTo = null;
      } else input.yaw += off * Math.min(1, dt * 9);
    },
  };
  let tapped = false;

  const LOOK = 0.0042;
  const LOOK_TOUCH = 0.0062;
  const clampPitch = () => (input.pitch = Math.max(-1.1, Math.min(1.1, input.pitch)));

  // ---------------------------------------------------------------- keyboard
  window.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    touching = false;
    keys.add(e.code);
    if (e.code === "KeyE") tapped = true;
    if (e.code === "Space" && !e.repeat) input.jumpPressed = true;
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  // ---------------------------------------------------------------- pointers
  type Ptr = { id: number; kind: "stick" | "look"; sx: number; sy: number; lx: number; ly: number; t: number; moved: boolean };
  const ptrs = new Map<number, Ptr>();
  const R = 52; // stick radius (px)

  target.addEventListener("pointerdown", (e) => {
    target.setPointerCapture(e.pointerId);
    touching = e.pointerType === "touch";
    // first finger anywhere walks; any other finger looks around
    const touchStick = touching && !input.joystick.active;
    const p: Ptr = { id: e.pointerId, kind: touchStick ? "stick" : "look", sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: false };
    ptrs.set(e.pointerId, p);
    if (touchStick) Object.assign(input.joystick, { active: true, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
  });

  target.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) p.moved = true;
    if (p.kind === "look") {
      const k = (e.pointerType === "touch" ? LOOK_TOUCH : LOOK) * settings().lookSpeed;
      input.yaw -= (e.clientX - p.lx) * k;
      input.pitch -= (e.clientY - p.ly) * k * (settings().invertY ? -1 : 1);
      clampPitch();
      turnTo = null;
    } else {
      let dx = e.clientX - p.sx, dy = e.clientY - p.sy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // the stick follows the thumb, so you never run off its edge
        p.sx += dx - (dx * R) / d;
        p.sy += dy - (dy * R) / d;
        dx = (dx * R) / d;
        dy = (dy * R) / d;
        input.joystick.ox = p.sx;
        input.joystick.oy = p.sy;
      }
      input.joystick.x = dx / R;
      input.joystick.y = dy / R;
    }
    p.lx = e.clientX;
    p.ly = e.clientY;
  });

  const end = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    if (!p.moved && performance.now() - p.t < 300) tapped = true;
    if (p.kind === "stick") {
      Object.assign(input.joystick, { active: false, x: 0, y: 0 });
      turnTo = null;
    }
    ptrs.delete(e.pointerId);
  };
  target.addEventListener("pointerup", end);
  target.addEventListener("pointercancel", end);

  // ---------------------------------------------------------------- per frame
  let last = performance.now();
  let stickRun = false;
  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let x = 0, z = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) z += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) z -= 1;
    if (keys.has("KeyD")) x += 1;
    if (keys.has("KeyA")) x -= 1;
    if (keys.has("ArrowLeft")) input.yaw += 0.035;
    if (keys.has("ArrowRight")) input.yaw -= 0.035;
    if (input.joystick.active) {
      // dead zone, then a smooth curve so small moves are gentle
      const jx = Math.abs(input.joystick.x) < 0.12 ? 0 : input.joystick.x;
      const jy = Math.abs(input.joystick.y) < 0.12 ? 0 : input.joystick.y;
      // sideways steers (turns you), with only a little side-step; or classic side-step
      if (settings().stickSteers) {
        // turn faster when standing still (spin on the spot), calmer while walking
        const rate = jy > -0.3 ? 3.4 : 2.6;
        input.yaw -= jx * Math.abs(jx) * rate * dt * settings().lookSpeed;
        x += jx * 0.25;
      } else x += jx;
      z -= jy;
      if (-jy > 0.3) {
        // corridor assist: when walking roughly along a corridor, line up with it
        if (Math.abs(jx) < 0.25 && turnTo === null) {
          const target = Math.round(input.yaw / Q) * Q;
          const off = input.yaw - target;
          if (Math.abs(off) < 0.42) input.yaw -= off * Math.min(1, dt * 2.2);
        }
        // and level the view, so nobody walks staring at the floor
        input.pitch -= input.pitch * Math.min(1, dt * 1.6);
      }
    }
    const len = Math.hypot(x, z);
    input.move.x = len > 1 ? x / len : x;
    input.move.z = len > 1 ? z / len : z;
    const pushedFar = Math.hypot(input.joystick.x, input.joystick.y) > 0.88;
    if (pushedFar && !stickRun) buzz(18);
    stickRun = pushedFar;
    input.run = input.runHeld || keys.has("ShiftLeft") || keys.has("ShiftRight") || pushedFar;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return input;
}
