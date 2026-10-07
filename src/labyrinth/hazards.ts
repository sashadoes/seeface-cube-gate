// The other disasters (the flood lives in flood.ts; the schedule is shared):
//   tornado – a funnel of debris wanders the corridors (through walls) towards
//             you. Close by it pulls you in; caught in it you're flung far away
//             (or, when the labyrinth is crowded, it takes you).
//   fire    – fires break out around you and spread cell by cell. Fire is light
//             (your lantern recharges near it) but standing IN it burns.
//   plague  – green clouds drift through the walls. Walk into one and you're
//             infected: green vision, coughing, no running, a dimmer lantern.
//             Cure it in a room, at the champions' altar, or with a remedy (+).
// Rooms are always safe.
import * as THREE from "three";
import { CELL, free, placeOf, roomOf, wallEast, wallSouth } from "./maze";
import type { DisasterKind, FloodPhase } from "./flood";

function dotTexture(inner: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, inner);
  r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export type HazardResult = {
  /** pull towards the tornado (m/s), added to your velocity */
  pull: { x: number; z: number } | null;
  /** caught by the tornado / burned / the plague ran its course */
  hit: { by: "the tornado" | "the fire" | "the plague"; fling?: boolean } | null;
  /** 0–1: how infected you are (for the green vision) */
  plague: number;
  /** extra light from fires nearby (per second) */
  warmth: number;
  /** a cough just now (sound) */
  cough: boolean;
  /** cured just now */
  cured: boolean;
};

export function createHazards(ctx: AudioContext, out: AudioNode) {
  const group = new THREE.Group();

  // ---------------------------------------------------------------- tornado
  const tornado = new THREE.Group();
  const debris: THREE.Sprite[] = [];
  const dust = dotTexture("rgba(200,190,170,0.9)");
  for (let k = 0; k < 160; k++) {
    // seen through walls (faintly): you can watch it coming down the labyrinth
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dust, transparent: true, depthWrite: false, depthTest: false, opacity: 0.4, color: k % 9 === 0 ? 0xffd27a : 0xcfc6b8, fog: false }));
    const h = Math.random();
    s.userData = { h, a: Math.random() * Math.PI * 2, sp: 2 + Math.random() * 3 };
    s.scale.setScalar(0.6 + h * 1.6);
    debris.push(s);
    tornado.add(s);
  }
  tornado.visible = false;
  group.add(tornado);
  let tx = 0, tz = 0, tActive = false;

  // ---------------------------------------------------------------- fire
  const flameTex = dotTexture("rgba(255,170,60,1)");
  const fires = new Map<string, { i: number; j: number; t: number }>();
  const flamePool = Array.from({ length: 180 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    s.visible = false;
    group.add(s);
    return s;
  });
  const fireLight = new THREE.PointLight(0xff8a30, 0, 14, 1.4);
  group.add(fireLight);
  let spreadIn = 0, burn = 0;

  // ---------------------------------------------------------------- plague
  const cloudTex = dotTexture("rgba(120,255,120,0.55)");
  const clouds = Array.from({ length: 7 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0.7 }));
    s.scale.set(7, 4, 1);
    s.visible = false;
    group.add(s);
    return s;
  });
  const remedies = Array.from({ length: 3 }, () => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#7affa0";
    g.shadowColor = "#7affa0";
    g.shadowBlur = 12;
    g.fillRect(26, 10, 12, 44);
    g.fillRect(10, 26, 44, 12);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    s.scale.setScalar(0.6);
    s.visible = false;
    group.add(s);
    return s;
  });
  let infected = 0, coughIn = 0, cloudsPlaced = false;

  // a crackle for the fire / a howl for the tornado, mixed by how close they are
  const roar = ctx.createGain();
  roar.gain.value = 0;
  const roarLp = ctx.createBiquadFilter();
  roarLp.type = "lowpass";
  roarLp.frequency.value = 500;
  roarLp.connect(roar).connect(out);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const ns = ctx.createBufferSource();
  ns.buffer = nb;
  ns.loop = true;
  ns.connect(roarLp);
  ns.start();

  function freeCell(px: number, pz: number, rMin: number, rMax: number) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2, d = rMin + Math.random() * (rMax - rMin);
      const x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d;
      const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
      if (!roomOf(i, j) && free((i + 0.5) * CELL, (j + 0.5) * CELL)) return { i, j, x: (i + 0.5) * CELL, z: (j + 0.5) * CELL };
    }
    return null;
  }

  return {
    group,
    update(dt: number, t: number, kind: DisasterKind, phase: FloodPhase, me: { px: number; pz: number; alive: boolean }): HazardResult {
      const res: HazardResult = { pull: null, hit: null, plague: infected, warmth: 0, cough: false, cured: false };
      const { px, pz } = me;
      const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
      const inRoom = roomOf(ci, cj) !== null;
      const active = phase === "flood"; // the "active" phase of the shared schedule
      let roarTarget = 0;

      // ---------------- tornado
      if (kind === "tornado" && active) {
        if (!tActive) {
          const s = freeCell(px, pz, 22, 30);
          tx = s?.x ?? px + 25;
          tz = s?.z ?? pz;
          tActive = true;
          tornado.visible = true;
        }
        // wander towards you, wobbling
        const dx = px - tx, dz = pz - tz, d = Math.hypot(dx, dz) || 1;
        const sp = 2.6 + Math.sin(t * 0.3) * 0.8;
        tx += (dx / d) * sp * dt + Math.sin(t * 0.9) * dt * 2;
        tz += (dz / d) * sp * dt + Math.cos(t * 0.7) * dt * 2;
        tornado.position.set(tx, 0, tz);
        for (const s of debris) {
          const u = s.userData;
          u.a += dt * u.sp * (2.2 - u.h);
          const r = 0.6 + u.h * 5;
          s.position.set(Math.cos(u.a) * r, u.h * 12, Math.sin(u.a) * r);
        }
        roarTarget = Math.max(roarTarget, Math.max(0, 1 - d / 30));
        if (!inRoom && me.alive) {
          if (d < 7) res.pull = { x: (-dx / d) * (7 - d) * 0.9, z: (-dz / d) * (7 - d) * 0.9 };
          if (d < 1.6) {
            res.hit = { by: "the tornado", fling: true };
            // it moves on after taking someone
            const s = freeCell(px, pz, 28, 36);
            if (s) (tx = s.x), (tz = s.z);
          }
        }
      } else if (tActive) {
        tActive = false;
        tornado.visible = false;
      }

      // ---------------- fire
      if (kind === "fire" && active) {
        if (fires.size === 0)
          for (let n = 0; n < 3; n++) {
            const s = freeCell(px, pz, 8, 16);
            if (s) fires.set(`${s.i}_${s.j}`, { i: s.i, j: s.j, t });
          }
        spreadIn -= dt;
        if (spreadIn <= 0 && fires.size < 45) {
          spreadIn = 1.6;
          for (const f of [...fires.values()]) {
            if (Math.random() > 0.35) continue;
            const nbs: [number, number, boolean][] = [
              [f.i + 1, f.j, !wallEast(f.i, f.j)],
              [f.i - 1, f.j, !wallEast(f.i - 1, f.j)],
              [f.i, f.j + 1, !wallSouth(f.i, f.j)],
              [f.i, f.j - 1, !wallSouth(f.i, f.j - 1)],
            ];
            const pick = nbs.filter(([a, b, open]) => open && !roomOf(a, b) && !fires.has(`${a}_${b}`));
            const n = pick[Math.floor(Math.random() * pick.length)];
            if (n) fires.set(`${n[0]}_${n[1]}`, { i: n[0], j: n[1], t });
          }
        }
        // draw: the nearest burning cells get flames
        const near = [...fires.values()].sort((a, b) => Math.hypot(a.i - ci, a.j - cj) - Math.hypot(b.i - ci, b.j - cj)).slice(0, 30);
        let k = 0;
        for (const f of near)
          for (let n = 0; n < 6 && k < flamePool.length; n++, k++) {
            const s = flamePool[k];
            const ph = (t * 1.3 + n * 0.37 + f.i * 0.11) % 1;
            s.visible = true;
            s.position.set((f.i + 0.2 + ((n * 0.37) % 0.6)) * CELL, ph * 2.4, (f.j + 0.2 + ((n * 0.61) % 0.6)) * CELL);
            s.scale.setScalar(1.6 * (1 - ph) + 0.3);
            (s.material as THREE.SpriteMaterial).opacity = 1 - ph;
          }
        for (; k < flamePool.length; k++) flamePool[k].visible = false;
        const nf = near[0];
        const dFire = nf ? Math.hypot((nf.i + 0.5) * CELL - px, (nf.j + 0.5) * CELL - pz) : Infinity;
        if (nf) fireLight.position.set((nf.i + 0.5) * CELL, 1.5, (nf.j + 0.5) * CELL);
        fireLight.intensity = nf ? 9 : 0;
        roarTarget = Math.max(roarTarget, Math.max(0, 1 - dFire / 20) * 0.6);
        res.warmth = dFire < 8 ? 12 : 0;
        // standing in a burning cell
        if (fires.has(`${ci}_${cj}`) && !inRoom && me.alive) {
          burn += dt;
          if (burn > 2.2) {
            burn = 0;
            res.hit = { by: "the fire" };
          }
        } else burn = Math.max(0, burn - dt);
      } else if (fires.size) {
        fires.clear();
        flamePool.forEach((s) => (s.visible = false));
        fireLight.intensity = 0;
      }

      // ---------------- plague
      if (kind === "plague" && active) {
        if (!cloudsPlaced) {
          cloudsPlaced = true;
          clouds.forEach((c) => {
            const s = freeCell(px, pz, 6, 26);
            c.position.set(s?.x ?? px + 10, 1.6, s?.z ?? pz);
            c.userData = { vx: (Math.random() - 0.5) * 1.6, vz: (Math.random() - 0.5) * 1.6 };
            c.visible = true;
          });
          remedies.forEach((r) => {
            const s = freeCell(px, pz, 10, 24);
            r.visible = !!s;
            if (s) r.position.set(s.x, 1.1, s.z);
          });
        }
        for (const c of clouds) {
          // drift, and lean towards you a little
          const dx = px - c.position.x, dz = pz - c.position.z, d = Math.hypot(dx, dz) || 1;
          c.position.x += (c.userData.vx + (dx / d) * 0.6) * dt;
          c.position.z += (c.userData.vz + (dz / d) * 0.6) * dt;
          c.material.rotation += dt * 0.1;
          if (d < 3 && !inRoom && me.alive && infected === 0) infected = 0.01;
        }
        for (const r of remedies) {
          r.position.y = 1.1 + Math.sin(t * 2) * 0.1;
          if (r.visible && Math.hypot(r.position.x - px, r.position.z - pz) < 1.2 && infected > 0) {
            r.visible = false;
            infected = 0;
            res.cured = true;
          }
        }
      } else if (cloudsPlaced) {
        cloudsPlaced = false;
        clouds.forEach((c) => (c.visible = false));
        remedies.forEach((r) => (r.visible = false));
      }
      // the infection runs its course over ~45 s (also after the clouds are gone)
      if (infected > 0) {
        if (inRoom || placeOf(ci, cj)?.kind === "ritual") {
          infected = 0;
          res.cured = true;
        } else {
          infected = Math.min(1, infected + dt / 45);
          coughIn -= dt;
          if (coughIn <= 0) {
            coughIn = 3 + Math.random() * 4;
            res.cough = true;
          }
          if (infected >= 1) {
            infected = 0;
            res.hit = { by: "the plague" };
          }
        }
      }
      res.plague = infected;

      roar.gain.setTargetAtTime(roarTarget * 0.5, ctx.currentTime, 0.4);
      roarLp.frequency.setTargetAtTime(kind === "fire" ? 1400 : 380, ctx.currentTime, 0.4);
      return res;
    },
    /** a cough (the plague) */
    cough() {
      const now = ctx.currentTime;
      for (const d of [0, 0.22]) {
        const s = ctx.createBufferSource();
        s.buffer = nb;
        const f = ctx.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.value = 700;
        f.Q.value = 1.2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now + d);
        g.gain.linearRampToValueAtTime(0.5, now + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + d + 0.18);
        s.connect(f).connect(g).connect(out);
        s.start(now + d, Math.random(), 0.25);
      }
    },
  };
}
