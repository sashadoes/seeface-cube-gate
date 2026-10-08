// Little helpers: small round creatures of the Ministry of Elsewhere. They
// hover up to you, chirp, and if you walk into one it gives you something
// (a teleport card ⟡, a ◈ or a full lantern; at most 3 gifts a day).
// But some of them are digital demons wearing a cute face: walk into one and it
// glitches into its real shape, takes a ⟡ (or 2 ◈) and flees through the
// walls (at most twice a day). The tell: digital demons cast no shadow, their
// face flickers now and then, and they never enter safe rooms.
// Personal: each player meets their own helpers (no relay), like twists.
// They are creatures, never presented as people: not in counts, not on the map.
import * as THREE from "three";
import { CELL, free, roomOf } from "./maze";
import type { Sound } from "./sound";

const MAX_ALIVE = 2;
const DEMON_CHANCE = 0.3;
const GIFTS_PER_DAY = 3;
const THEFTS_PER_DAY = 2;

const PALETTES = [
  { body: "#bff2dc", dark: "#6fcfa8", cheek: "#ffb3c8" }, // mint
  { body: "#dccbff", dark: "#9f86e8", cheek: "#ffb3d9" }, // lilac
  { body: "#ffd9b8", dark: "#f0a874", cheek: "#ff9fb0" }, // peach
  { body: "#c4e6ff", dark: "#7fb4e8", cheek: "#ffb6c9" }, // sky
];
const NAMES = ["pip", "nim", "bo", "tuk", "mimo", "fen", "lu", "zip", "oon", "pesh"];

type Face = "open" | "blink" | "happy" | "demon";

function draw(face: Face, pal: (typeof PALETTES)[number], seed: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const demon = face === "demon";
  // antenna with its little ⟡
  g.strokeStyle = demon ? "#1b1b1b" : pal.dark;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(64, 34);
  g.quadraticCurveTo(70 + (seed % 3) * 4, 18, 62, 10);
  g.stroke();
  g.fillStyle = demon ? "#b6ff3a" : "#a06cff";
  g.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 4, r = k % 2 ? 3 : 8;
    g.lineTo(62 + r * Math.cos(a), 10 + r * Math.sin(a));
  }
  g.fill();
  if (demon) {
    // little pixel horns
    g.fillStyle = "#1b1b1b";
    for (const s of [-1, 1]) {
      g.fillRect(64 + s * 30 - 4, 30, 8, 8);
      g.fillRect(64 + s * 34 - 4, 22, 8, 8);
      g.fillRect(64 + s * 38 - 4, 14, 8, 8);
    }
  }
  // round body
  const grd = g.createRadialGradient(54, 58, 6, 64, 72, 50);
  grd.addColorStop(0, demon ? "#3a2a46" : "#ffffff");
  grd.addColorStop(0.35, demon ? "#24182e" : pal.body);
  grd.addColorStop(1, demon ? "#0e0a14" : pal.dark);
  g.fillStyle = grd;
  g.beginPath();
  g.ellipse(64, 74, 44, 42, 0, 0, Math.PI * 2);
  g.fill();
  // little feet
  g.fillStyle = demon ? "#0e0a14" : pal.dark;
  g.beginPath();
  g.ellipse(48, 114, 9, 5, 0, 0, Math.PI * 2);
  g.ellipse(80, 114, 9, 5, 0, 0, Math.PI * 2);
  g.fill();
  if (demon) {
    // glitch slices + acid eyes + jagged grin
    for (let k = 0; k < 6; k++) {
      const y = 40 + ((seed * 13 + k * 17) % 70);
      const dx = ((seed + k * 7) % 11) - 5;
      g.drawImage(c, 0, y, 128, 4, dx, y, 128, 4);
    }
    g.fillStyle = "#b6ff3a";
    g.fillRect(40, 62, 14, 8);
    g.fillRect(74, 62, 14, 8);
    g.fillStyle = "#ff3ad1";
    g.fillRect(44, 64, 4, 4);
    g.fillRect(78, 64, 4, 4);
    g.strokeStyle = "#b6ff3a";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(42, 90);
    for (let k = 0; k <= 8; k++) g.lineTo(42 + k * 5.5, k % 2 ? 98 : 90);
    g.stroke();
  } else {
    // big eyes with highlights, rosy cheeks, a tiny smile
    g.fillStyle = "#1d1730";
    if (face === "blink") {
      g.fillRect(40, 70, 16, 3);
      g.fillRect(72, 70, 16, 3);
    } else if (face === "happy") {
      g.lineWidth = 4;
      g.strokeStyle = "#1d1730";
      for (const x of [48, 80]) {
        g.beginPath();
        g.arc(x, 74, 7, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      }
    } else {
      for (const x of [48, 80]) {
        g.beginPath();
        g.ellipse(x, 70, 9, 11, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.arc(x - 3, 65, 3.5, 0, Math.PI * 2);
        g.arc(x + 3, 75, 1.6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#1d1730";
      }
    }
    g.fillStyle = pal.cheek;
    g.globalAlpha = 0.7;
    g.beginPath();
    g.ellipse(34, 86, 8, 5, 0, 0, Math.PI * 2);
    g.ellipse(94, 86, 8, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = "#1d1730";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(64, 86, 6, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Helper = {
  sprite: THREE.Sprite;
  shadow: THREE.Mesh | null;
  faces: Record<Face, THREE.Texture>;
  demon: boolean;
  name: string;
  x: number;
  z: number;
  phase: number;
  life: number;
  noticed: boolean;
  state: "roam" | "happy" | "reveal" | "gone";
  stateT: number;
  flickerAt: number;
  vx: number;
  vz: number;
};

export type HelperEvent = { kind: "gift"; name: string } | { kind: "demon"; name: string; first: boolean };

const today = () => new Date().toISOString().slice(0, 10);
const readNum = (k: string) => {
  try {
    return Number(localStorage.getItem(k)) || 0;
  } catch {
    return 0;
  }
};
const bump = (k: string) => {
  try {
    localStorage.setItem(k, String(readNum(k) + 1));
  } catch {
    // ignore
  }
};

export function createHelpers(sound: Sound) {
  const group = new THREE.Group();
  const helpers: Helper[] = [];
  const shadowGeo = new THREE.CircleGeometry(0.22, 20);
  let nextSpawn = 12 + Math.random() * 10; // the first one comes soon
  let met = readNum("seeface-helpers-met");

  // ---- tiny synthesised sounds (effects bus)
  const blip = (f0: number, f1: number, at: number, len = 0.09, type: OscillatorType = "sine", vol = 0.08) => {
    const ctx = sound.ctx, now = ctx.currentTime + at;
    const o = ctx.createOscillator(), gn = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(f1, now + len);
    gn.gain.setValueAtTime(0.0001, now);
    gn.gain.exponentialRampToValueAtTime(vol, now + 0.01);
    gn.gain.exponentialRampToValueAtTime(0.0001, now + len);
    o.connect(gn).connect(sound.effectsOut);
    o.start(now);
    o.stop(now + len + 0.02);
  };
  const chirp = () => {
    blip(900, 1500, 0);
    blip(1200, 1900, 0.11);
  };
  const happy = () => [660, 880, 1320].forEach((f, k) => blip(f, f * 1.05, k * 0.08, 0.12, "triangle", 0.07));
  const glitch = () => {
    for (let k = 0; k < 9; k++) {
      const f = 80 + Math.random() * 900;
      blip(f, f * (0.5 + Math.random()), k * 0.045, 0.05, "square", 0.05);
    }
    blip(220, 40, 0.42, 0.4, "sawtooth", 0.06); // the cackle sinks
  };

  function spawn(px: number, pz: number, forceDemon?: boolean) {
    // somewhere down an open corridor from you, so it can come straight to you
    const runs = [
      { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
    ].map((dir) => {
      let n = 0;
      while (n < 28 && free(px + dir.x * (n + 1) * 0.5, pz + dir.z * (n + 1) * 0.5)) n++;
      return { dir, len: n * 0.5 };
    }).filter((r) => r.len >= 5);
    for (let tries = 0; tries < 12 && runs.length; tries++) {
      const r = runs[Math.floor(Math.random() * runs.length)];
      const d = 5 + Math.random() * (r.len - 5);
      const x = px + r.dir.x * d, z = pz + r.dir.z * d;
      if (!free(x, z)) continue;
      // the very first helper anyone meets is a real one
      const demon = forceDemon ?? (met > 0 && Math.random() < DEMON_CHANCE);
      if (demon && roomOf(Math.floor(x / CELL), Math.floor(z / CELL))) continue; // demons never enter safe rooms
      const pal = PALETTES[Math.floor(Math.random() * PALETTES.length)];
      const seed = Math.floor(Math.random() * 1000);
      const faces = { open: draw("open", pal, seed), blink: draw("blink", pal, seed), happy: draw("happy", pal, seed), demon: draw("demon", pal, seed) };
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: faces.open, transparent: true, depthWrite: false }));
      sprite.scale.set(0.55, 0.55, 1);
      sprite.center.set(0.5, 0);
      group.add(sprite);
      let shadow: THREE.Mesh | null = null;
      if (!demon) {
        shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        group.add(shadow);
      }
      helpers.push({
        sprite, shadow, faces, demon, name: NAMES[seed % NAMES.length], x, z, phase: Math.random() * 6, life: 0,
        noticed: false, state: "roam", stateT: 0, flickerAt: 2 + Math.random() * 3, vx: 0, vz: 0,
      });
      return;
    }
  }

  function remove(h: Helper) {
    group.remove(h.sprite);
    if (h.shadow) group.remove(h.shadow);
    Object.values(h.faces).forEach((t) => t.dispose());
    (h.sprite.material as THREE.Material).dispose();
    (h.shadow?.material as THREE.Material | undefined)?.dispose();
    helpers.splice(helpers.indexOf(h), 1);
  }

  return {
    group,
    /** dev / tests: bring one now */
    spawn: (px: number, pz: number, demon?: boolean) => spawn(px, pz, demon),
    /** allowed = alive, on the surface or a level, not on the ship */
    update(dt: number, px: number, pz: number, yaw: number, allowed: boolean): HelperEvent | null {
      let ev: HelperEvent | null = null;
      nextSpawn -= dt;
      if (allowed && nextSpawn <= 0) {
        nextSpawn = 40 + Math.random() * 50;
        if (helpers.filter((h) => h.state === "roam").length < MAX_ALIVE) spawn(px, pz);
      }
      // where they like to hover: a little in front of you
      const fx = px - Math.sin(yaw) * 1.6, fz = pz - Math.cos(yaw) * 1.6;
      for (const h of [...helpers]) {
        h.life += dt;
        h.stateT += dt;
        h.phase += dt;
        const d = Math.hypot(h.x - px, h.z - pz);
        const mat = h.sprite.material as THREE.SpriteMaterial;
        if (h.state === "roam") {
          if (d < 9 && !h.noticed) {
            h.noticed = true;
            chirp();
          }
          const tx = d < 9 ? fx : h.x + Math.sin(h.phase * 0.7) * 0.6;
          const tz = d < 9 ? fz : h.z + Math.cos(h.phase * 0.5) * 0.6;
          const k = Math.min(1, dt * (d < 9 ? 1.6 : 0.6));
          const nx = h.x + (tx - h.x) * k, nz = h.z + (tz - h.z) * k;
          // they walk round walls; demons stay out of safe rooms
          const blockedRoom = h.demon && roomOf(Math.floor(nx / CELL), Math.floor(nz / CELL));
          // slide along walls: both axes, else one of them
          if (!blockedRoom) {
            if (free(nx, nz)) (h.x = nx), (h.z = nz);
            else if (free(nx, h.z)) h.x = nx;
            else if (free(h.x, nz)) h.z = nz;
          }
          // the tell: a demon's face slips for a frame now and then
          h.flickerAt -= dt;
          let face: Face = (h.phase % 3.2) < 0.12 ? "blink" : "open";
          if (h.demon && h.flickerAt < 0) {
            face = "demon";
            if (h.flickerAt < -0.07) h.flickerAt = 2 + Math.random() * 4;
          }
          mat.map = h.faces[face];
          if (d < 0.95 && allowed) {
            // you walked into it
            met++;
            bump("seeface-helpers-met");
            h.state = h.demon ? "reveal" : "happy";
            h.stateT = 0;
            if (h.demon) {
              glitch();
              const first = readNum("seeface-demon-met") === 0;
              bump("seeface-demon-met");
              ev = { kind: "demon", name: h.name, first };
              // it runs away from you
              const a = Math.atan2(h.x - px, h.z - pz);
              h.vx = Math.sin(a) * 9;
              h.vz = Math.cos(a) * 9;
            } else {
              happy();
              ev = { kind: "gift", name: h.name };
            }
          }
          if (h.life > 120 || d > 45) h.state = "gone";
        } else if (h.state === "happy") {
          mat.map = h.faces.happy;
          if (h.stateT > 1.6) h.state = "gone";
        } else if (h.state === "reveal") {
          mat.map = h.faces.demon;
          h.x += h.vx * dt; // straight through the walls
          h.z += h.vz * dt;
          if (h.stateT > 1.4) h.state = "gone";
        }
        // hover + bob, fade out when leaving
        const bob = Math.sin(h.phase * 3) * 0.08 + (h.state === "happy" ? Math.abs(Math.sin(h.stateT * 9)) * 0.35 : 0);
        const jitter = h.state === "reveal" ? (Math.random() - 0.5) * 0.15 : 0;
        h.sprite.position.set(h.x + jitter, 0.7 + bob, h.z);
        const s = h.state === "reveal" ? 0.55 + h.stateT * 0.5 : 0.55;
        h.sprite.scale.set(s, s, 1);
        if (h.shadow) {
          h.shadow.position.set(h.x, 0.02, h.z);
          h.shadow.scale.setScalar(1 - bob * 0.8);
        }
        if (h.state === "gone") {
          mat.opacity -= dt * 2;
          if (mat.opacity <= 0) remove(h);
        } else mat.opacity = Math.min(1, h.life * 2);
      }
      return ev;
    },
    /** may this helper still give today? (3 a day) */
    takeGift() {
      const k = `seeface-helpers-gift-${today()}`;
      if (readNum(k) >= GIFTS_PER_DAY) return false;
      bump(k);
      return true;
    },
    /** may a demon still steal today? (twice a day) */
    takeTheft() {
      const k = `seeface-helpers-theft-${today()}`;
      if (readNum(k) >= THEFTS_PER_DAY) return false;
      bump(k);
      return true;
    },
    /** one teleport card from a helper per day */
    takeCardGift() {
      const k = `seeface-helpers-card-${today()}`;
      if (readNum(k) >= 1) return false;
      bump(k);
      return true;
    },
  };
}
