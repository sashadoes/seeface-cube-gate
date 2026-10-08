// The Ministry of Elsewhere: the teleport campaign, inside the world.
// Art-deco broadcast booths stand in the corridors (two always near the
// entrance, more scattered) and play the Ministry's teleport bulletin
// (public/ministry/bulletin.mp4, the same film as the social video). The film
// runs on the clock, so everyone near a booth sees the same moment. Its sound
// is 3D and only within ~16 m, on the "gramophones & radio music" volume.
// Tap a booth for the how-to card (Labyrinth.tsx). The video loads only once a
// booth is near, and pauses when none is.
import * as THREE from "three";
import { CELL, placeOf, rnd, roomOf, wallEast, wallSouth } from "./maze";
import type { Sound } from "./sound";

const SRC = "/ministry/bulletin.mp4";
const POSTER = "/ministry/bulletin.jpg";
const DURATION = 103.33; // seconds, keep in step with the file
const HEAR_M = 16;
const POOL = 4;

/** corridor cell with a wall to stand against (and not a TV's cell) */
function sideOf(i: number, j: number): [number, number, number] | null {
  if (roomOf(i, j) || placeOf(i, j)) return null;
  if (rnd(i, j, 140) <= 0.05) return null; // an After Life™ TV stands here
  if (wallEast(i, j)) return [(i + 1) * CELL - 0.3, (j + 0.5) * CELL, -Math.PI / 2];
  if (wallEast(i - 1, j)) return [i * CELL + 0.3, (j + 0.5) * CELL, Math.PI / 2];
  if (wallSouth(i, j)) return [(i + 0.5) * CELL, (j + 1) * CELL - 0.3, Math.PI];
  if (wallSouth(i, j - 1)) return [(i + 0.5) * CELL, j * CELL + 0.3, 0];
  return null;
}

// two booths always near the entrance, at least 3 cells apart
const ENTRANCE = (() => {
  const cells: [number, number, number][] = [];
  for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) {
    const d = Math.hypot(i, j);
    if (d >= 3 && d <= 8 && sideOf(i, j)) cells.push([i, j, d]);
  }
  cells.sort((a, b) => a[2] - b[2]);
  const out: string[] = [];
  for (const [i, j] of cells) {
    if (out.every((k) => {
      const [a, b] = k.split(":").map(Number);
      return Math.hypot(a - i, b - j) >= 3;
    })) out.push(`${i}:${j}`);
    if (out.length === 2) break;
  }
  return new Set(out);
})();

const isBooth = (i: number, j: number) => ENTRANCE.has(`${i}:${j}`) || rnd(i, j, 177) < 0.012;

function signTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#16100b";
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = "#c9a45c";
  g.lineWidth = 4;
  g.strokeRect(6, 6, 500, 116);
  g.lineWidth = 1.5;
  g.strokeRect(14, 14, 484, 100);
  g.textAlign = "center";
  g.fillStyle = "#ead9b6";
  g.font = "bold 40px Futura, 'Arial Narrow', Arial, sans-serif";
  g.fillText("MINISTRY OF ELSEWHERE", 256, 62, 470);
  g.fillStyle = "#c9a45c";
  g.font = "italic 24px 'Bodoni 72', 'Times New Roman', serif";
  g.fillText("public bulletin · tap the screen", 256, 98, 470);
  // the ⟡ on both sides
  for (const x of [40, 472]) {
    g.fillStyle = "#a06cff";
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 4, r = k % 2 ? 6 : 18;
      g.lineTo(x + r * Math.cos(a), 64 + r * Math.sin(a));
    }
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Booth = { group: THREE.Group; screen: THREE.Mesh; x: number; z: number };

function makeBooth(sign: THREE.Texture, poster: THREE.Texture): Booth {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.5, metalness: 0.15 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.75 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.4), wood);
  body.position.y = 1.05;
  group.add(body);
  // stepped deco crown
  for (let k = 0; k < 3; k++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.9 - k * 0.25, 0.1, 0.36 - k * 0.06), gold);
    step.position.y = 2.15 + k * 0.1;
    group.add(step);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.35, 0.06), gold);
  fin.position.y = 2.55;
  group.add(fin);
  // gold frame round the screen
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.34, 0.03), gold);
  frame.position.set(0, 1.12, 0.2);
  group.add(frame);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.28), new THREE.MeshBasicMaterial({ map: poster, toneMapped: false }));
  screen.position.set(0, 1.12, 0.218);
  group.add(screen);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.24), new THREE.MeshBasicMaterial({ map: sign, toneMapped: false }));
  plate.position.set(0, 1.95, 0.205);
  group.add(plate);
  group.visible = false;
  return { group, screen, x: 0, z: 0 };
}

export function createMinistry(sound: Sound) {
  const group = new THREE.Group();
  const sign = signTexture();
  const poster = new THREE.TextureLoader().load(POSTER);
  poster.colorSpace = THREE.SRGBColorSpace;
  const booths = Array.from({ length: POOL }, () => makeBooth(sign, poster));
  booths.forEach((b) => group.add(b.group));
  const glow = new THREE.PointLight(0xc8a8ff, 0, 6, 1.6);
  group.add(glow);

  // one shared film for every booth; its sound goes through a 3D panner
  let video: HTMLVideoElement | null = null;
  let videoTex: THREE.VideoTexture | null = null;
  let gain: GainNode | null = null;
  let panner: PannerNode | null = null;
  let playing = false;

  const ensureVideo = () => {
    if (video) return;
    video = document.createElement("video");
    video.src = SRC;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    videoTex = new THREE.VideoTexture(video);
    videoTex.colorSpace = THREE.SRGBColorSpace;
    try {
      const ctx = sound.ctx;
      const src = ctx.createMediaElementSource(video);
      gain = ctx.createGain();
      gain.gain.value = 0;
      panner = ctx.createPanner();
      panner.panningModel = "equalpower";
      panner.distanceModel = "inverse";
      panner.refDistance = 2.5;
      panner.maxDistance = HEAR_M;
      panner.rolloffFactor = 1.5;
      src.connect(gain).connect(panner).connect(sound.musicBus);
    } catch {
      video.muted = true; // no Web Audio: the picture still plays
    }
    booths.forEach((b) => ((b.screen.material as THREE.MeshBasicMaterial).map = videoTex));
    booths.forEach((b) => ((b.screen.material as THREE.MeshBasicMaterial).needsUpdate = true));
  };

  const play = () => {
    if (!video || playing) return;
    playing = true;
    video.currentTime = (Date.now() / 1000) % DURATION; // the same moment for everyone
    video.play().catch(() => {
      // no sound allowed yet: play muted, unmute on the next try
      if (video) {
        video.muted = true;
        video.play().catch(() => (playing = false));
      }
    });
  };
  const pause = () => {
    if (!video || !playing) return;
    playing = false;
    video.pause();
  };

  let lastCell = "";
  function place(px: number, pz: number) {
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
    const found: { i: number; j: number; d: number }[] = [];
    for (let i = ci - 7; i <= ci + 7; i++)
      for (let j = cj - 7; j <= cj + 7; j++) if (isBooth(i, j) && sideOf(i, j)) found.push({ i, j, d: Math.hypot(i - ci, j - cj) });
    found.sort((a, b) => a.d - b.d);
    booths.forEach((b, k) => {
      const f = found[k];
      if (!f) return void (b.group.visible = false);
      const [x, z, rot] = sideOf(f.i, f.j)!;
      b.group.position.set(x, 0, z);
      b.group.rotation.y = rot;
      b.group.visible = true;
      b.x = x;
      b.z = z;
    });
  }

  return {
    group,
    update(px: number, pz: number) {
      const cell = `${Math.floor(px / CELL)}:${Math.floor(pz / CELL)}`;
      if (cell !== lastCell) {
        lastCell = cell;
        place(px, pz);
      }
      let near: Booth | null = null, nd = Infinity;
      for (const b of booths) {
        if (!b.group.visible) continue;
        const d = Math.hypot(b.x - px, b.z - pz);
        if (d < nd) (nd = d), (near = b);
      }
      if (nd < 30) {
        ensureVideo();
        play();
      } else pause();
      if (near && panner && gain) {
        panner.positionX.value = near.x;
        panner.positionY.value = 1.2;
        panner.positionZ.value = near.z;
        gain.gain.setTargetAtTime(nd < HEAR_M ? 0.9 : 0, sound.ctx.currentTime, 0.4);
        if (video?.muted && nd < HEAR_M) video.muted = false; // a later frame, after a gesture
      }
      if (near) glow.position.set(near.x, 1.4, near.z);
      glow.intensity = near && nd < 12 ? 2.4 : 0;
      return { nearBooth: nd < 2.4 };
    },
    dispose() {
      pause();
      if (video) {
        video.removeAttribute("src");
        video.load();
      }
      videoTex?.dispose();
    },
  };
}
