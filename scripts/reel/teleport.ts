// Teleport reel (dev only, never shipped): real-game takes for the Ministry of
// Elsewhere newsreel. Records the canvas only (the newsreel has its own
// gramophone soundtrack), frame by frame, to the local receiver.
//   const d = await import('/scripts/reel/teleport.ts'); await d.record("meet")
// Takes: "walk", "meet", "escape". Returns the moments a teleport fired
// (seconds into the take) so the edit can add the rift flash, which is DOM
// and not on the canvas. The "other players" are local-only stand-ins: put
// straight into this tab's peer list and never sent to the relay.
import { CELL, free, placeOf, roomOf, wallEast, wallSouth } from "../../src/labyrinth/maze";
import { setSettings } from "../../src/labyrinth/settings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lab = (): Any => (window as Any).__lab;

function bfs(from: { i: number; j: number }, maxSteps: number, prefer: (i: number, j: number) => number) {
  const key = (i: number, j: number) => `${i},${j}`;
  const prev = new Map<string, string | null>([[key(from.i, from.j), null]]);
  const q: [number, number, number][] = [[from.i, from.j, 0]];
  let best: [number, number] = [from.i, from.j], bestScore = -Infinity;
  while (q.length) {
    const [i, j, d] = q.shift()!;
    const s = prefer(i, j) + d * 0.01;
    if (d >= Math.min(3, maxSteps) && s > bestScore) (bestScore = s), (best = [i, j]);
    if (d >= maxSteps) continue;
    for (const [a, b, open] of [
      [i + 1, j, !wallEast(i, j)],
      [i - 1, j, !wallEast(i - 1, j)],
      [i, j + 1, !wallSouth(i, j)],
      [i, j - 1, !wallSouth(i, j - 1)],
    ] as [number, number, boolean][]) {
      if (!open || prev.has(key(a, b)) || !free((a + 0.5) * CELL, (b + 0.5) * CELL)) continue;
      prev.set(key(a, b), key(i, j));
      q.push([a, b, d + 1]);
    }
  }
  const path: { x: number; z: number }[] = [];
  let k: string | null = key(best[0], best[1]);
  while (k) {
    const [i, j] = k.split(",").map(Number);
    path.unshift({ x: (i + 0.5) * CELL, z: (j + 0.5) * CELL });
    k = prev.get(k) ?? null;
  }
  return path;
}

const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** a plain corridor cell (not a room or a place) near you, well inside the edge
 *  (100 m around the entrance when alone; beyond it the fog is black) */
function corridorNear(x0: number, z0: number, min = 20, max = 60) {
  for (let k = 0; k < 800; k++) {
    const a = Math.random() * Math.PI * 2, d = min + Math.random() * (max - min);
    const x = x0 + Math.sin(a) * d, z = z0 + Math.cos(a) * d;
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    if (Math.hypot(x, z) < 70 && free(x, z) && !roomOf(i, j) && !placeOf(i, j)) return { x: (i + 0.5) * CELL, z: (j + 0.5) * CELL };
  }
  return { x: x0, z: z0 };
}

type Shot = { until: number; start?: () => void; tick: (t: number, dt: number) => void };

export async function record(take: "walk" | "meet" | "escape", { upload = "http://localhost:8792/upload" } = {}) {
  const L = lab();
  const { pos, input, camera, presence, sound, radio, renderer, hunter, others } = L;
  const H = (window as Any).Howler;
  H?.mute?.(true);
  L.setLight(100);
  L.skipGrace?.();
  sound.resume();
  radio.resume();
  try {
    localStorage.setItem("seeface-tp-cards", "9");
  } catch {
    // ignore
  }
  const start = corridorNear(0, 0, 10, 45);
  pos.x = start.x;
  pos.z = start.z;
  hunter.reset(pos.x, pos.z);

  // ---- path following, as in director.ts
  let path: { x: number; z: number }[] = [];
  let seg = 0, along = 0, speed = 0, look = 0, shake = 0;
  let baseYaw = input.yaw;
  const newRoute = (dir: { x: number; z: number }, steps = 40) => {
    path = bfs({ i: Math.floor(pos.x / CELL), j: Math.floor(pos.z / CELL) }, steps, (i, j) => ((i + 0.5) * CELL - pos.x) * dir.x + ((j + 0.5) * CELL - pos.z) * dir.z);
    seg = 0;
    along = 0;
  };
  const follow = (dt: number) => {
    input.yaw += angDiff(baseYaw + look, input.yaw) * Math.min(1, dt * 5);
    if (seg >= path.length - 1 || speed === 0) return;
    let a = path[seg], b = path[seg + 1];
    let len = Math.hypot(b.x - a.x, b.z - a.z);
    along += speed * dt;
    while (along > len && seg < path.length - 2) {
      along -= len;
      seg++;
      a = path[seg];
      b = path[seg + 1];
      len = Math.hypot(b.x - a.x, b.z - a.z);
    }
    const f = Math.min(1, along / len);
    pos.x = a.x + (b.x - a.x) * f;
    pos.z = a.z + (b.z - a.z) * f;
    const ahead = path[Math.min(path.length - 1, seg + 2)];
    if (Math.hypot(ahead.x - pos.x, ahead.z - pos.z) > 0.5) baseYaw = yawTo(ahead.x - pos.x, ahead.z - pos.z);
  };
  const fakes: string[] = [];
  const addFake = (id: string, nick: string, x: number, z: number) => {
    presence.peers.set(id, { id, nick, x, z, yaw: 0, light: 90, held: 0, last: Date.now(), signal: 0 });
    fakes.push(id);
  };
  const keepFakes = () => fakes.forEach((id) => {
    const p = presence.peers.get(id);
    if (p) p.last = Date.now();
  });
  let t = 0;
  let after = (ms: number, fn: () => void) => void setTimeout(fn, ms);
  const jumps: number[] = [];
  const tp = (x: number, z: number, incognito: boolean) => {
    const no = L.teleport(x, z, incognito);
    if (no) console.warn("teleport refused:", no);
    else jumps.push(Math.round(t * 100) / 100);
    return !no;
  };

  let shots: Shot[] = [];
  let seconds = 8;
  if (take === "walk") {
    // the after life: slow walk through liminal halls, looking around
    seconds = 10;
    shots = [{ until: 10, start: () => ((speed = 4), newRoute({ x: 1, z: 0.3 }, 40)), tick: (tt) => (look = Math.sin(tt * 0.8) * 0.4) }];
  } else if (take === "meet") {
    // far from the others: one card, and you're with them
    seconds = 9;
    let meetAt = { x: 0, z: 0 };
    // the open direction from (x, z): the one with the longest free run
    const openDir = (x: number, z: number) => {
      let best = { x: 0, z: -1 }, run = -1;
      for (const d of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
        let n = 0;
        while (n < 40 && free(x + d.x * (n + 1) * 0.5, z + d.z * (n + 1) * 0.5)) n++;
        if (n > run) (run = n), (best = d);
      }
      return best;
    };
    shots = [
      {
        until: 2.6,
        start: () => {
          speed = 3;
          newRoute({ x: -1, z: 0.2 }, 20);
          meetAt = corridorNear(pos.x, pos.z, 14, 24);
        },
        tick: (tt) => (look = Math.sin(tt) * 0.2),
      },
      {
        until: 9,
        start: () => {
          speed = 0;
          look = 0;
          if (tp(meetAt.x, meetAt.z, false)) {
            // look down the open corridor; the two of them wait a few steps ahead
            const d = openDir(pos.x, pos.z);
            baseYaw = yawTo(d.x, d.z);
            input.yaw = baseYaw;
            const sx = -d.z, sz = d.x;
            addFake("tp01", "velvet", pos.x + d.x * 3.2 + sx * 0.7, pos.z + d.z * 3.2 + sz * 0.7);
            addFake("tp02", "m0th", pos.x + d.x * 4.2 - sx * 0.8, pos.z + d.z * 4.2 - sz * 0.8);
          }
          after(900, () => others?.emote("tp01", "spin"));
          after(1300, () => others?.say("tp02", "you came!"));
          after(2400, () => others?.emote("tp02", "float"));
        },
        tick: (tt) => {
          keepFakes();
          look = Math.sin(tt * 0.7) * 0.06;
        },
      },
    ];
  } else {
    // the dark king behind you: two cards, and nobody knows where you went
    seconds = 9;
    shots = [
      {
        until: 1.6,
        start: () => {
          speed = 3;
          newRoute({ x: 0.4, z: 1 }, 20);
        },
        tick: () => L.setLight(60),
      },
      {
        until: 4.6,
        start: () => {
          speed = 0;
          look = Math.PI;
          L.setLight(30);
          const bx = Math.sin(baseYaw) * 7, bz = Math.cos(baseYaw) * 7;
          hunter.object.position.set(pos.x + bx, 0, pos.z + bz);
        },
        tick: () => {
          shake = 0.012;
          L.setLight(25);
          const hx = pos.x + Math.sin(baseYaw) * 3.5, hz = pos.z + Math.cos(baseYaw) * 3.5;
          hunter.object.position.x += (hx - hunter.object.position.x) * 0.02;
          hunter.object.position.z += (hz - hunter.object.position.z) * 0.02;
        },
      },
      {
        until: 9,
        start: () => {
          shake = 0;
          const away = corridorNear(pos.x, pos.z, 14, 24);
          tp(away.x, away.z, true);
          hunter.reset(pos.x, pos.z);
          L.setLight(100);
          look = 0;
          speed = 2.5;
          newRoute({ x: 1, z: 0 }, 12);
        },
        tick: (tt) => (look = Math.sin(tt * 0.6) * 0.25),
      },
    ];
  }

  // ---- offline render: the game's clock is frozen and stepped by hand
  // (1/60 s per step, every 2nd step saved = 30 fps), so slow machines still
  // give smooth full-resolution frames. Each frame is a JPEG POSTed to the receiver.
  const canvas: HTMLCanvasElement = renderer.domElement;
  const realNow = performance.now.bind(performance);
  const realRaf = window.requestAnimationFrame.bind(window);
  let vnow = realNow();
  const queue: FrameRequestCallback[] = [];
  performance.now = () => vnow;
  window.requestAnimationFrame = (cb) => (queue.push(cb), queue.length);
  // full sharpness (this tab only): 1080 px wide on a 540 px phone view; medium effects
  // (high, with immersive shadows, ran the tab out of memory after a teleport)
  setSettings({ quality: "medium", qualityAuto: false, cameraBob: false });
  // wait until the game loop has parked its next frame with us. Its last real
  // frame (a hidden pane fires them only now and then) must come BEFORE the
  // virtual clock starts, or the game sees time run backwards (the camera sinks)
  for (let w = 0; !queue.length && w < 600; w++) await new Promise((r) => setTimeout(r, 50));
  if (!queue.length) throw new Error("the game loop never handed over a frame");
  vnow = realNow();
  L.perf.setQuality(1080 / innerWidth, "medium");
  const later: { at: number; fn: () => void }[] = [];
  after = (ms, fn) => later.push({ at: t + ms / 1000, fn });
  let shot = -1, frame = 0;
  try {
    for (let k = 0; t < seconds; k++) {
      t = k / 60;
      vnow += 1000 / 60;
      const s = shots.findIndex((x) => t < x.until);
      if (s === -1) break;
      if (s !== shot) {
        shot = s;
        shots[s].start?.();
      }
      for (let i = later.length - 1; i >= 0; i--) if (later[i].at <= t) later.splice(i, 1)[0].fn();
      follow(1 / 60);
      shots[s].tick(t, 1 / 60);
      if (shake) camera.position.x += (Math.random() - 0.5) * shake;
      (window as Any).__reelAt = { take, k, t, shot: s, frame };
      for (const cb of queue.splice(0)) cb(vnow);
      if (k % 2 === 0) {
        const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.92));
        await fetch(`${upload}?name=${take}_${String(frame++).padStart(4, "0")}.jpg`, { method: "POST", body: blob });
      }
    }
  } finally {
    performance.now = realNow;
    window.requestAnimationFrame = realRaf;
    for (const cb of queue.splice(0)) realRaf(cb);
  }
  for (const id of fakes) presence.peers.delete(id);
  hunter.reset(pos.x, pos.z);
  H?.mute?.(false);
  return { take, frames: frame, jumps, size: [canvas.width, canvas.height] };
}
