// Sasha reel (dev only, never shipped: nothing in src/ imports it). Real-game
// takes for the "find Sasha" gameplay ad, rendered frame by frame (the hidden
// browser pane barely paints) and POSTed as JPEGs to the local receiver.
//   const d = await import('/scripts/reel/sasha.ts'); await d.record("glimpse")
// Takes: glimpse, find, meet, open, ship, king, helper, event, mall.
// The "other players" are local-only stand-ins: put straight into this tab's
// peer list and never sent to the relay.
import { CELL, SHIP, free, placeOf, roomOf, safeSpot, wallEast, wallSouth } from "../../src/labyrinth/maze";
import { setSettings } from "../../src/labyrinth/settings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lab = (): Any => (window as Any).__lab;
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** a long straight corridor run: start cell + direction with >= n free cells ahead */
function straight(x0: number, z0: number, n: number, maxR = 60) {
  for (let k = 0; k < 3000; k++) {
    const i = Math.floor((x0 + (Math.random() - 0.5) * maxR * 2) / CELL), j = Math.floor((z0 + (Math.random() - 0.5) * maxR * 2) / CELL);
    if (roomOf(i, j) || placeOf(i, j) || Math.hypot(i * CELL, j * CELL) > 75) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let ok = true;
      for (let s = 0; s < n && ok; s++) {
        const a = i + di * s, b = j + dj * s;
        if (roomOf(a, b) || placeOf(a, b) || !free((a + 0.5) * CELL, (b + 0.5) * CELL, 0.8)) ok = false;
        if (s < n - 1) {
          const open = di === 1 ? !wallEast(a, b) : di === -1 ? !wallEast(a - 1, b) : dj === 1 ? !wallSouth(a, b) : !wallSouth(a, b - 1);
          if (!open) ok = false;
        }
      }
      if (ok) return { x: (i + 0.5) * CELL, z: (j + 0.5) * CELL, dx: di, dz: dj };
    }
  }
  throw new Error("no straight corridor found");
}

type Shot = { until: number; start?: () => void; tick: (t: number, dt: number) => void };

export async function record(take: string, { upload = "http://localhost:8793/upload", seconds: secs = 0, event = "photo-rain", region = [0, 0] as [number, number], name = "" } = {}) {
  const L = lab();
  const { pos, input, camera, presence, sound, radio, renderer, hunter, others } = L;
  const sasha = L.sasha();
  const H = (window as Any).Howler;
  H?.mute?.(true);
  L.setLight(100);
  L.skipGrace?.();
  sound.resume();
  radio.resume();
  hunter.reset(pos.x + 300, pos.z + 300);

  let shake = 0;
  let pitch: number | null = null;
  const fakes: string[] = [];
  const addFake = (id: string, nick: string, x: number, z: number) => {
    presence.peers.set(id, { id, nick, x, z, yaw: 0, light: 90, held: 0, last: Date.now(), signal: 0 });
    fakes.push(id);
  };
  const keepFakes = () => fakes.forEach((id) => {
    const p = presence.peers.get(id);
    if (p) p.last = Date.now();
  });
  const setEvent = (k: string | null) => {
    const u = new URL(location.href);
    if (k) u.searchParams.set("event", k);
    else u.searchParams.delete("event");
    history.replaceState(null, "", u);
  };
  let t = 0;
  let after = (ms: number, fn: () => void) => void setTimeout(fn, ms);
  const face = (yaw: number) => ((input.yaw = yaw), (input.pitch = 0));
  const awayKing = () => hunter.reset(pos.x + 300, pos.z + 300);

  let seconds = 5;
  let shots: Shot[] = [];
  sasha.pin(null);

  if (take === "glimpse") {
    // a long corridor; far at the end, something orange glows. Walk towards it.
    seconds = 5.5;
    const c = straight(0, 0, 7);
    pos.x = c.x;
    pos.z = c.z;
    const sx = c.x + c.dx * 6 * CELL, sz = c.z + c.dz * 6 * CELL;
    sasha.pin(sx, sz);
    face(yawTo(c.dx, c.dz));
    shots = [{ until: 9, tick: (tt, dt) => {
      awayKing();
      const v = 2.2;
      pos.x += c.dx * v * dt;
      pos.z += c.dz * v * dt;
      input.yaw = yawTo(c.dx, c.dz) + Math.sin(tt * 0.9) * 0.05;
      input.pitch = 0.04;
    } }];
  } else if (take === "find") {
    // close in, he notices you, the diamonds race, he flickers... and he's gone
    seconds = 6;
    const c = straight(-20, 10, 4);
    const sx = c.x + c.dx * 3 * CELL, sz = c.z + c.dz * 3 * CELL;
    pos.x = sx - c.dx * 7;
    pos.z = sz - c.dz * 7;
    sasha.pin(sx, sz);
    face(yawTo(c.dx, c.dz));
    shots = [{ until: 9, tick: (tt, dt) => {
      awayKing();
      const d = Math.hypot(sx - pos.x, sz - pos.z);
      if (d > 2.9) {
        const v = 1.8 * Math.min(1, (d - 2.9) / 1.5 + 0.25);
        pos.x += c.dx * v * dt;
        pos.z += c.dz * v * dt;
      }
      input.yaw = yawTo(c.dx, c.dz);
      input.pitch = 0.1 + Math.min(0.08, tt * 0.02);
    } }];
  } else if (take === "meet") {
    // real people meet in here: two others wave you over
    seconds = 6;
    const c = straight(15, -15, 4);
    pos.x = c.x;
    pos.z = c.z;
    face(yawTo(c.dx, c.dz));
    const sx = -c.dz, sz = c.dx;
    addFake("sr01", "m0th", pos.x + c.dx * 3.4 + sx * 0.8, pos.z + c.dz * 3.4 + sz * 0.8);
    addFake("sr02", "kiki.exe", pos.x + c.dx * 4.6 - sx * 0.9, pos.z + c.dz * 4.6 - sz * 0.9);
    after(500, () => others?.say("sr01", "have you seen sasha?"));
    after(2600, () => others?.say("sr02", "he was by the mall!"));
    after(1500, () => others?.emote("sr02", "spin"));
    after(3800, () => others?.emote("sr01", "float"));
    shots = [{ until: 9, tick: (tt) => {
      awayKing();
      keepFakes();
      input.yaw = yawTo(c.dx, c.dz) + Math.sin(tt * 0.6) * 0.07;
      input.pitch = 0.02;
    } }];
  } else if (take === "open") {
    // "the open": no ceiling, the night sky, and the ship hanging above
    seconds = 6;
    const s = safeSpot(1, 1);
    pos.x = s.x - 6;
    pos.z = s.z + 4;
    face(0);
    shots = [{ until: 9, tick: (tt) => {
      awayKing();
      input.yaw = 0.6 - tt * 0.12;
      pitch = 0.05 + Math.min(0.75, tt * 0.16);
      input.pitch = pitch;
    } }];
  } else if (take === "ship") {
    // the giant ship with a church inside
    seconds = 6;
    pos.x = SHIP.x - 60;
    pos.z = 0;
    face(yawTo(1, 0));
    shots = [{ until: 9, tick: (tt, dt) => {
      pos.x += 3.2 * dt;
      input.yaw = yawTo(1, 0) + Math.sin(tt * 0.5) * 0.15;
      input.pitch = 0.18 + tt * 0.025;
    } }];
  } else if (take === "king") {
    // lights die. the dark king steps out of the dark... and bows
    seconds = 5;
    const c = straight(-15, -25, 4);
    pos.x = c.x;
    pos.z = c.z;
    face(yawTo(c.dx, c.dz));
    hunter.object.position.set(pos.x + c.dx * 9, 0, pos.z + c.dz * 9);
    shots = [{ until: 9, tick: (tt) => {
      L.setLight(Math.max(22, 90 - tt * 40));
      const hx = pos.x + c.dx * 2.8, hz = pos.z + c.dz * 2.8;
      hunter.object.position.x += (hx - hunter.object.position.x) * 0.025;
      hunter.object.position.z += (hz - hunter.object.position.z) * 0.025;
      shake = tt > 2.5 ? 0.01 : 0;
      input.yaw = yawTo(c.dx, c.dz);
      input.pitch = 0.08;
    } }];
  } else if (take === "helper") {
    // a little helper floats up with a gift
    seconds = 4.5;
    const c = straight(25, 20, 4);
    pos.x = c.x;
    pos.z = c.z;
    face(yawTo(c.dx, c.dz));
    L.helpers?.spawn(pos.x + c.dx * 6, pos.z + c.dz * 6, false);
    shots = [{ until: 9, tick: (tt) => {
      awayKing();
      input.yaw = yawTo(c.dx, c.dz) + Math.sin(tt * 0.7) * 0.04;
      input.pitch = -0.05;
    } }];
  } else if (take === "event") {
    // a world event everyone sees at once: the bloom / photo rain in a cube room
    seconds = 5;
    const s = safeSpot(0, 1);
    setEvent(event);
    pos.x = s.x - 3;
    pos.z = s.z + 3;
    face(yawTo(1, -1));
    shots = [{ until: 9, tick: (tt) => {
      awayKing();
      input.yaw = yawTo(1, -1) + tt * 0.1;
      input.pitch = 0.15;
    } }];
  } else if (take === "mall") {
    // neon shopfronts in the mall
    seconds = 5;
    const s = safeSpot(0, -1);
    pos.x = s.x - 7;
    pos.z = s.z;
    face(yawTo(1, 0));
    shots = [{ until: 9, tick: (tt, dt) => {
      awayKing();
      pos.x += 1.6 * dt;
      input.yaw = yawTo(1, 0) + Math.sin(tt * 0.5) * 0.5;
      input.pitch = 0.05;
    } }];
  } else if (take === "place") {
    // any place: a slow walk-in from the west side, looking around
    seconds = 5;
    const s = safeSpot(region[0], region[1]);
    pos.x = s.x - 6;
    pos.z = s.z;
    face(yawTo(1, 0));
    shots = [{ until: 9, tick: (tt, dt) => {
      awayKing();
      pos.x += 1.4 * dt;
      input.yaw = yawTo(1, 0) + Math.sin(tt * 0.45) * 0.55;
      input.pitch = 0.12;
    } }];
    take = name || `place${region[0]}_${region[1]}`;
  } else throw new Error("unknown take " + take);
  if (secs) seconds = secs;

  // ---- offline render (as in the teleport reel): frozen clock, 1/60 s steps, every 2nd saved = 30 fps
  const canvas: HTMLCanvasElement = renderer.domElement;
  const realNow = performance.now.bind(performance);
  const realRaf = window.requestAnimationFrame.bind(window);
  let vnow = realNow();
  const queue: FrameRequestCallback[] = [];
  performance.now = () => vnow;
  window.requestAnimationFrame = (cb) => (queue.push(cb), queue.length);
  setSettings({ quality: "medium", qualityAuto: false, cameraBob: false });
  for (let w = 0; !queue.length && w < 600; w++) await new Promise((r) => setTimeout(r, 50));
  if (!queue.length) throw new Error("the game loop never handed over a frame");
  vnow = realNow();
  L.perf.setQuality(1080 / innerWidth, "medium");
  const later: { at: number; fn: () => void }[] = [];
  after = (ms, fn) => later.push({ at: t + ms / 1000, fn });
  // settle: a second of frames that are not saved (textures, fog lerps)
  for (let k = 0; k < 60; k++) {
    vnow += 1000 / 60;
    shots[0].tick(0, 0);
    for (const cb of queue.splice(0)) cb(vnow);
  }
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
      shots[s].tick(t, 1 / 60);
      if (shake) camera.position.x += (Math.random() - 0.5) * shake;
      (window as Any).__reelAt = { take, k, t, frame };
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
    setEvent(null);
  }
  for (const id of fakes) presence.peers.delete(id);
  sasha.pin(null);
  hunter.reset(pos.x + 300, pos.z + 300);
  H?.mute?.(false);
  return { take, frames: frame, size: [canvas.width, canvas.height] };
}
