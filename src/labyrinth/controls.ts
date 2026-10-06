// Walking controls.
//   computer: W/A/S/D or arrows to move, drag (or ←/→) to look, Shift to run, E/Space to spin a cube
//   phone:    left half = joystick (appears where you touch), right half = drag to look, tap = spin a cube

export type Input = {
  move: { x: number; z: number }; // x: strafe right, z: forward (-1..1)
  yaw: number;
  pitch: number;
  run: boolean;
  consumeTap: () => boolean;
  joystick: { active: boolean; ox: number; oy: number; x: number; y: number };
};

export function createInput(target: HTMLElement): Input {
  const keys = new Set<string>();
  const input: Input = {
    move: { x: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    run: false,
    consumeTap: () => {
      const t = tapped;
      tapped = false;
      return t;
    },
    joystick: { active: false, ox: 0, oy: 0, x: 0, y: 0 },
  };
  let tapped = false;

  const LOOK = 0.0042;
  const clampPitch = () => (input.pitch = Math.max(-1.1, Math.min(1.1, input.pitch)));

  // ---------------------------------------------------------------- keyboard
  window.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement)?.tagName === "INPUT") return;
    keys.add(e.code);
    if (e.code === "KeyE" || e.code === "Space") tapped = true;
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  // ---------------------------------------------------------------- pointers
  type Ptr = { id: number; kind: "stick" | "look"; sx: number; sy: number; lx: number; ly: number; t: number; moved: boolean };
  const ptrs = new Map<number, Ptr>();

  target.addEventListener("pointerdown", (e) => {
    target.setPointerCapture(e.pointerId);
    const touchStick = e.pointerType === "touch" && e.clientX < window.innerWidth / 2;
    const p: Ptr = { id: e.pointerId, kind: touchStick ? "stick" : "look", sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: false };
    ptrs.set(e.pointerId, p);
    if (touchStick) Object.assign(input.joystick, { active: true, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
  });

  target.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) p.moved = true;
    if (p.kind === "look") {
      input.yaw -= (e.clientX - p.lx) * LOOK;
      input.pitch -= (e.clientY - p.ly) * LOOK;
      clampPitch();
    } else {
      const R = 60;
      let dx = e.clientX - p.sx, dy = e.clientY - p.sy;
      const d = Math.hypot(dx, dy);
      if (d > R) (dx *= R / d), (dy *= R / d);
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
    if (p.kind === "stick") Object.assign(input.joystick, { active: false, x: 0, y: 0 });
    ptrs.delete(e.pointerId);
  };
  target.addEventListener("pointerup", end);
  target.addEventListener("pointercancel", end);

  // ---------------------------------------------------------------- per frame
  const tick = () => {
    let x = 0, z = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) z += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) z -= 1;
    if (keys.has("KeyD")) x += 1;
    if (keys.has("KeyA")) x -= 1;
    if (keys.has("ArrowLeft")) input.yaw += 0.035;
    if (keys.has("ArrowRight")) input.yaw -= 0.035;
    if (input.joystick.active) {
      x += input.joystick.x;
      z -= input.joystick.y;
    }
    const len = Math.hypot(x, z);
    input.move.x = len > 1 ? x / len : x;
    input.move.z = len > 1 ? z / len : z;
    input.run = keys.has("ShiftLeft") || keys.has("ShiftRight") || Math.hypot(input.joystick.x, input.joystick.y) > 0.92;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return input;
}
