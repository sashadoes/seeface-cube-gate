// Chase reel (dev only, never shipped): The Pop Queen hunts you through the
// labyrinth and tries to take your ◈. Records the canvas + the game's sounds
// WITHOUT the background music (the owner adds a rap track in Instagram).
//   const d = await import('/scripts/reel/chase.ts'); await d.record()
import { CELL, free, placeOf, roomOf, wallEast, wallSouth } from "../../src/labyrinth/maze";

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

type Shot = { until: number; start?: () => void; tick: (t: number, dt: number) => void };

export async function record({ seconds = 19.5, upload = "http://localhost:8791/upload" } = {}) {
  const L = lab();
  const { pos, input, camera, presence, sound, radio, renderer, queen, hunter } = L;
  // start in a plain corridor (not in the market or a room): liminal, long sightlines
  for (let k = 0; k < 600; k++) {
    const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * 40;
    const x = pos.x + Math.sin(a) * d, z = pos.z + Math.cos(a) * d;
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    if (free(x, z) && !roomOf(i, j) && !placeOf(i, j)) {
      pos.x = (i + 0.5) * CELL;
      pos.z = (j + 0.5) * CELL;
      break;
    }
  }
  L.setLight(100);
  L.skipGrace?.();
  sound.resume();
  radio.resume();
  // no background music: the owner puts a rap track under it
  const H = (window as Any).Howler;
  H?.mute?.(true);
  // keep her show running for the whole clip
  const u = new URL(location.href);
  u.searchParams.set("event", "popqueen");
  history.replaceState(null, "", u);

  // ---- recording: picture + the game's own sounds only (no music)
  const canvas: HTMLCanvasElement = renderer.domElement;
  const mix = new AudioContext();
  await mix.resume();
  const dest = mix.createMediaStreamDestination();
  const add = (s: MediaStream) => s.getAudioTracks().length && mix.createMediaStreamSource(s).connect(dest);
  add(sound.tap());
  add(radio.tap());
  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const type = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9,opus"].find((t) => MediaRecorder.isTypeSupported(t))!;
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  // ---- movement
  let path: { x: number; z: number }[] = [];
  let seg = 0, along = 0, speed = 0, look = 0, shake = 0, baseYaw = input.yaw;
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
  /** put her right behind you, at distance d */
  const placeQueen = (d: number) => {
    const q = queen.position();
    q.x = pos.x + Math.sin(baseYaw) * d;
    q.z = pos.z + Math.cos(baseYaw) * d;
  };

  const shots: Shot[] = [
    // 0–3 s: walking, calm. something behind you.
    {
      until: 3,
      start: () => {
        speed = 4.2;
        newRoute({ x: 1, z: 0.3 }, 45);
        hunter.reset(pos.x + 200, pos.z + 200);
      },
      tick: (t) => {
        look = Math.sin(t * 1.2) * 0.2;
        placeQueen(11 - t * 1.2);
      },
    },
    // 3–6.5 s: look back — she's there, gliding at you
    {
      until: 6.5,
      start: () => {
        speed = 1.2;
      },
      tick: (t) => {
        look = Math.min(Math.PI, (t - 3) * 2.4);
        placeQueen(Math.max(4.5, 9 - (t - 3) * 1.4));
      },
    },
    // 6.5–13 s: RUN. glance back twice, she keeps coming.
    {
      until: 13,
      start: () => {
        look = 0;
        speed = 9.5;
        newRoute({ x: -Math.sin(baseYaw), z: -Math.cos(baseYaw) }, 55);
        shake = 0.02;
      },
      tick: (t) => {
        L.setLight(100);
        const k = t - 6.5;
        look = k > 2.2 && k < 3.4 ? Math.PI * 0.92 : k > 4.6 && k < 5.6 ? Math.PI * 0.95 : Math.sin(t * 2) * 0.12;
        placeQueen(5.5 + Math.sin(t * 0.9) * 1.6);
      },
    },
    // 13–17 s: she catches you and takes it
    {
      until: 17,
      start: () => {
        speed = 0.8;
        look = Math.PI;
        shake = 0.05;
      },
      tick: () => {
        L.setLight(100);
        placeQueen(Math.max(1.3, 5 - (performance.now() % 1000) / 1000));
        const q = queen.position();
        const d = Math.hypot(q.x - pos.x, q.z - pos.z);
        if (d > 2) placeQueen(1.6);
      },
    },
    // 17–19.5 s: the camera. "NO PHOTOS!" — and out
    {
      until: 19.5,
      start: () => {
        shake = 0;
        speed = 0;
        look = Math.PI;
        setTimeout(() => {
          const q = queen.position();
          input.yaw = yawTo(q.x - pos.x, q.z - pos.z);
          baseYaw = input.yaw;
          look = 0;
          queen.flash(pos.x, pos.z, input.yaw);
        }, 900);
      },
      tick: (t) => {
        L.setLight(100);
        if (t < 17.9) placeQueen(3.4);
        input.pitch += (0 - input.pitch) * 0.1;
      },
    },
  ];

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
        input.pitch = Math.max(-0.3, Math.min(0.3, (Math.random() - 0.5) * shake * 4));
        camera.position.x += (Math.random() - 0.5) * shake;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  rec.stop();
  await new Promise((r) => (rec.onstop = r));
  H?.mute?.(false);
  const blob = new Blob(chunks, { type: type.split(";")[0] });
  const res = await fetch(upload, { method: "POST", body: blob });
  void presence;
  return { bytes: blob.size, saved: await res.text() };
}
