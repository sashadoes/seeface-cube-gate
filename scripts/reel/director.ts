// Trailer director (dev only, never shipped: nothing in src/ imports it).
// Run in a /labyrinth tab on the dev server:
//   const d = await import('/scripts/reel/director.ts'); await d.record()
// It plays a scripted ~27 s run through the real game (real renderer, real
// sounds), records the canvas + game audio and uploads the webm to the local
// receiver (scripts in the scratchpad). Text, music and the end card are
// added afterwards with ffmpeg.
// The "other players" in the trailer are local-only stand-ins: they are put
// straight into this tab's peer list and are never sent to the relay.
import { CELL, free, roomCentre, wallEast, wallSouth } from "../../src/labyrinth/maze";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const lab = (): Any => (window as Any).__lab;

// ---------------------------------------------------------------- moving through the maze
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
    const nb: [number, number, boolean][] = [
      [i + 1, j, !wallEast(i, j)],
      [i - 1, j, !wallEast(i - 1, j)],
      [i, j + 1, !wallSouth(i, j)],
      [i, j - 1, !wallSouth(i, j - 1)],
    ];
    for (const [a, b, open] of nb) {
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

/** a long run from where you are, going "far" in a direction */
function routeFrom(x: number, z: number, dir: { x: number; z: number }, steps = 40) {
  return bfs({ i: Math.floor(x / CELL), j: Math.floor(z / CELL) }, steps, (i, j) => ((i + 0.5) * CELL - x) * dir.x + ((j + 0.5) * CELL - z) * dir.z);
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ---------------------------------------------------------------- the shot list runner
type Shot = { until: number; tick: (t: number, dt: number) => void; start?: () => void };

export async function record({ seconds = 27, upload = "http://localhost:8791/upload" } = {}) {
  const L = lab();
  const { pos, input, camera, hunter, presence, keepers, sound, radio, renderer, rifts } = L;
  L.setLight(100);
  sound.resume();
  radio.resume();

  // ---------------- recording: canvas + every game sound mixed together
  const canvas: HTMLCanvasElement = renderer.domElement;
  const video = canvas.captureStream(30);
  const mix = new AudioContext();
  await mix.resume();
  const dest = mix.createMediaStreamDestination();
  const add = (s: MediaStream) => s.getAudioTracks().length && mix.createMediaStreamSource(s).connect(dest);
  add(sound.tap());
  add(radio.tap());
  const H = (window as Any).Howler;
  if (H?.ctx && H.masterGain) {
    const d = H.ctx.createMediaStreamDestination();
    H.masterGain.connect(d);
    add(d.stream);
  }
  const stream = new MediaStream([...video.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus", videoBitsPerSecond: 14_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  // ---------------- state shared between shots
  let path: { x: number; z: number }[] = [];
  let seg = 0, along = 0, speed = 9;
  let look = 0; // extra yaw (look around)
  let shake = 0;
  const fakes: string[] = [];
  const setEvent = (k: string | null) => {
    const u = new URL(location.href);
    if (k) u.searchParams.set("event", k);
    else u.searchParams.delete("event");
    history.replaceState(null, "", u);
  };
  let baseYaw = input.yaw;
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
    // look a little ahead along the path, smoothly
    const ahead = path[Math.min(path.length - 1, seg + 2)];
    if (Math.hypot(ahead.x - pos.x, ahead.z - pos.z) > 0.5) baseYaw = yawTo(ahead.x - pos.x, ahead.z - pos.z);
  };
  const newRoute = (dir: { x: number; z: number }, steps = 40) => {
    path = routeFrom(pos.x, pos.z, dir, steps);
    seg = 0;
    along = 0;
  };
  const addFake = (id: string, nick: string, dx: number, dz: number) => {
    // local stand-ins for other players (this tab only, never on the relay)
    presence.peers.set(id, { id, nick, x: pos.x + dx, z: pos.z + dz, yaw: 0, light: 90, held: 0, last: Date.now(), signal: 0 });
    fakes.push(id);
  };
  const keepFakesAlive = () => {
    for (const id of fakes) {
      const p = presence.peers.get(id);
      if (p) p.last = Date.now();
    }
  };
  const others = () => L.others;

  const shots: Shot[] = [
    // 0–4 s: arrival flash, sprinting down the monogram halls
    {
      until: 4,
      start: () => {
        const el = document.querySelector(".labyrinth") as HTMLElement;
        el?.classList.add("rift");
        el?.style.setProperty("--rift", "#ffffff");
        speed = 10;
        newRoute({ x: 1, z: 0.4 });
      },
      tick: (t) => {
        look = Math.sin(t * 2.2) * 0.35;
      },
    },
    // 4–8 s: it's raining memories
    {
      until: 8,
      start: () => {
        setEvent("photo-rain");
        look = 0;
      },
      tick: (t) => {
        look = Math.sin(t * 1.3) * 0.5;
        input.pitch = 0.25 + Math.sin(t * 2) * 0.1;
      },
    },
    // 8–13 s: strangers. demons. who's real?
    {
      until: 13,
      start: () => {
        setEvent(null);
        input.pitch = 0;
        look = 0;
        // a straight-ish corridor ahead; the strangers stand along it
        newRoute({ x: -Math.sin(baseYaw), z: -Math.cos(baseYaw) }, 14);
        speed = 2.2;
        const at = (k: number, side: number) => {
          const p = path[Math.min(path.length - 1, k)], q = path[Math.min(path.length - 1, k + 1)];
          const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz) || 1;
          return { x: p.x + (-dz / d) * side - pos.x, z: p.z + (dx / d) * side - pos.z };
        };
        const a1 = at(2, 0.8), a2 = at(3, -0.9), a3 = at(4, 0.2);
        addFake("reel01", "face_8812", a1.x, a1.z);
        addFake("reel02", "nyx", a2.x, a2.z);
        addFake("reel03", "m0th", a3.x, a3.z);
        setTimeout(() => others()?.say("reel02", "are you real?"), 700);
        setTimeout(() => others()?.emote("reel01", "spin"), 1500);
        setTimeout(() => others()?.say("reel01", "follow the light"), 2300);
        setTimeout(() => others()?.emote("reel03", "melt"), 2600);
        setTimeout(() => (input.jumpPressed = true), 3200);
      },
      tick: (t) => {
        keepFakesAlive();
        look = Math.sin(t * 0.9) * 0.12;
      },
    },
    // 13–18 s: the light dies, the Hollow is behind you, RUN
    {
      until: 18,
      start: () => {
        for (const id of fakes) presence.peers.delete(id);
        L.skipGrace();
        L.setLight(30);
        // look back: it's there
        look = Math.PI;
        speed = 0;
        const back = { x: Math.sin(baseYaw) * 6, z: Math.cos(baseYaw) * 6 };
        hunter.object.position.set(pos.x + back.x, 0, pos.z + back.z);
        setTimeout(() => {
          look = 0;
          speed = 11;
          newRoute({ x: -Math.sin(baseYaw), z: -Math.cos(baseYaw) }, 50);
        }, 1700);
      },
      tick: (t) => {
        L.setLight(speed === 0 ? 30 : 12);
        shake = speed === 0 ? 0.01 : 0.035;
        // keep it right behind you, never touching
        const bx = Math.sin(baseYaw), bz = Math.cos(baseYaw);
        const hx = pos.x + bx * 5, hz = pos.z + bz * 5;
        hunter.object.position.x += (hx - hunter.object.position.x) * 0.3;
        hunter.object.position.z += (hz - hunter.object.position.z) * 0.3;
        void t;
      },
    },
    // 18–22 s: a rift. fall.
    {
      until: 22,
      start: () => {
        shake = 0;
        hunter.reset(pos.x, pos.z);
        L.setLight(100);
        const r = rifts.nearest(pos.x, pos.z);
        if (r) {
          // stand two corridors away and walk the real way in
          const ri = Math.floor(r.x / CELL), rj = Math.floor(r.z / CELL);
          const way = bfs({ i: ri, j: rj }, 3, (i, j) => Math.hypot(i - ri, j - rj));
          const startAt = way[way.length - 1];
          pos.x = startAt.x;
          pos.z = startAt.z;
          path = [...way].reverse();
          path.push({ x: r.x, z: r.z });
          seg = 0;
          along = 0;
          speed = 3.2;
          baseYaw = yawTo(path[1].x - pos.x, path[1].z - pos.z);
          input.yaw = baseYaw;
        }
      },
      tick: () => {},
    },
    // 22–27 s: the static (level II): bloom, a keeper, jump
    {
      until: 27,
      start: () => {
        setEvent("bloom");
        const c = roomCentre(Math.round((2 * 100_000) / CELL / 7), 0);
        pos.x = c.x;
        pos.z = c.z + 2;
        speed = 7;
        newRoute({ x: 0.3, z: 1 }, 30);
        keepers.summon("jester");
        setTimeout(() => (input.jumpPressed = true), 1200);
        setTimeout(() => (input.jumpPressed = true), 3000);
      },
      tick: (t) => {
        look = Math.sin(t * 1.6) * 0.4;
      },
    },
  ];

  // ---------------- run
  rec.start(250);
  const t0 = performance.now();
  let last = t0, shot = -1;
  await new Promise<void>((done) => {
    const step = (now: number) => {
      const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const k = shots.findIndex((s) => t < s.until);
      if (k === -1 || t >= seconds) return done();
      if (k !== shot) {
        shot = k;
        shots[k].start?.();
      }
      follow(dt);
      shots[k].tick(t, dt);
      if (shake) {
        input.pitch = Math.max(-0.4, Math.min(0.4, (Math.random() - 0.5) * shake * 4));
        camera.position.x += (Math.random() - 0.5) * shake;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  rec.stop();
  await new Promise((r) => (rec.onstop = r));
  setEvent(null);
  const blob = new Blob(chunks, { type: "video/webm" });
  const res = await fetch(upload, { method: "POST", body: blob });
  return { bytes: blob.size, saved: await res.text(), audioTracks: dest.stream.getAudioTracks().length };
}

export const _test = { routeFrom };
void wait;
