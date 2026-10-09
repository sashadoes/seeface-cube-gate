// Input. Desktop: WASD/arrows, drag to look, Space jumps, V held = talk.
// Phones: the first thumb on the left 55% of the screen is a floating stick; a finger on the
// right drags the camera; a quick tap anywhere (not on a button) jumps; a second tap in the
// air is the double jump.

export type Input = {
  move: { x: number; y: number }; // x right, y forward, -1..1
  look: { yaw: number; pitch: number };
  consumeJump: () => boolean;
  talkKey: boolean;
  onTalkKey: (fn: (down: boolean) => void) => void;
  /** a quick tap/click on the world; return true to consume it (e.g. it hit a person) */
  onTap: (fn: (x: number, y: number) => boolean) => void;
  stick: { active: boolean; ox: number; oy: number; x: number; y: number };
  dispose: () => void;
};

export function createInput(el: HTMLElement): Input {
  const keys = new Set<string>();
  let jumpQueued = false;
  const look = { yaw: 0, pitch: 0.42 };
  const move = { x: 0, y: 0 };
  const stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
  let talkFn: (down: boolean) => void = () => {};
  let tapFn: (x: number, y: number) => boolean = () => false;
  const inp: Input = {
    move,
    look,
    stick,
    talkKey: false,
    consumeJump: () => {
      const j = jumpQueued;
      jumpQueued = false;
      return j;
    },
    onTalkKey: (fn) => (talkFn = fn),
    onTap: (fn) => (tapFn = fn),
    dispose: () => {},
  };

  const typing = (e: Event) => (e.target as HTMLElement)?.closest?.("input, textarea");
  const keyDown = (e: KeyboardEvent) => {
    if (typing(e)) return;
    keys.add(e.code);
    if (e.code === "Space") {
      if (!e.repeat) jumpQueued = true;
      e.preventDefault();
    }
    if (e.code === "KeyV" && !e.repeat) ((inp.talkKey = true), talkFn(true));
    updateKeys();
  };
  const keyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
    if (e.code === "KeyV") ((inp.talkKey = false), talkFn(false));
    updateKeys();
  };
  const updateKeys = () => {
    if (stick.active) return;
    move.x = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
    move.y = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  };

  // pointers: one stick pointer, one look pointer; taps = jump
  type P = { id: number; role: "stick" | "look"; sx: number; sy: number; lx: number; ly: number; t: number; moved: number };
  const ptrs = new Map<number, P>();
  const STICK_R = 56;
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button, .w-overlay, input")) return;
    el.setPointerCapture?.(e.pointerId);
    const touch = e.pointerType === "touch";
    const hasStick = [...ptrs.values()].some((p) => p.role === "stick");
    const role: P["role"] = touch && !hasStick && e.clientX < innerWidth * 0.55 ? "stick" : "look";
    ptrs.set(e.pointerId, { id: e.pointerId, role, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: 0 });
    if (role === "stick") Object.assign(stick, { active: true, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
  };
  const moveP = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.lx, dy = e.clientY - p.ly;
    p.moved += Math.abs(dx) + Math.abs(dy);
    p.lx = e.clientX;
    p.ly = e.clientY;
    if (p.role === "look") {
      const k = e.pointerType === "touch" ? 0.0065 : 0.0045;
      look.yaw -= dx * k;
      look.pitch = Math.max(0.12, Math.min(1.05, look.pitch + dy * k * 0.7));
    } else {
      let ox = e.clientX - stick.ox, oy = e.clientY - stick.oy;
      const l = Math.hypot(ox, oy);
      // the stick follows your thumb if you slide past its edge
      if (l > STICK_R) {
        stick.ox += (ox / l) * (l - STICK_R);
        stick.oy += (oy / l) * (l - STICK_R);
        ox = e.clientX - stick.ox;
        oy = e.clientY - stick.oy;
      }
      stick.x = ox / STICK_R;
      stick.y = oy / STICK_R;
      move.x = stick.x;
      move.y = -stick.y;
    }
  };
  const up = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    ptrs.delete(e.pointerId);
    const quick = performance.now() - p.t < 260 && p.moved < 14;
    if (quick && !tapFn(e.clientX, e.clientY) && e.pointerType === "touch") jumpQueued = true;
    if (p.role === "stick") {
      Object.assign(stick, { active: false, x: 0, y: 0 });
      move.x = move.y = 0;
      updateKeys();
    }
  };

  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  el.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", moveP);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
  const blur = () => (keys.clear(), updateKeys());
  window.addEventListener("blur", blur);
  inp.dispose = () => {
    window.removeEventListener("keydown", keyDown);
    window.removeEventListener("keyup", keyUp);
    el.removeEventListener("pointerdown", down);
    window.removeEventListener("pointermove", moveP);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    window.removeEventListener("blur", blur);
  };
  return inp;
}
