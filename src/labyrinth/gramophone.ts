// Gramophones: brass-horn record players standing around the labyrinth (and
// in the theater, the mall and the museum). Walk up, tap, pick a record and an
// effect: it plays for EVERYONE nearby for 3 minutes, louder the closer you
// are. Shared as a retained world message so people arriving later hear it
// too, in step (everyone starts from the same moment).
import * as THREE from "three";
import { CELL, PLACE, placeAt, placeOf, rnd, roomOf, wallEast, wallSouth } from "./maze";
import { EFFECTS, RECORDS, playRecord, type FxId, type RecordId } from "./music";
import type { Presence } from "./net";

export const PLAY_SECONDS = 180;
const REGION = 7;
const HEAR_M = 34;

type Spot = { key: string; x: number; z: number; ry: number };
type Playing = { key: string; rec: RecordId; fx: FxId; t0: number; by: string };

/** gramophone spots near (px, pz): rare corridor cells + one in some places */
function spotsNear(px: number, pz: number): Spot[] {
  const out: Spot[] = [];
  const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
  for (let i = ci - 8; i <= ci + 8; i++)
    for (let j = cj - 8; j <= cj + 8; j++) {
      if (roomOf(i, j) || placeOf(i, j) || rnd(i, j, 150) > 0.025) continue;
      const sides: [boolean, number, number, number][] = [
        [wallEast(i, j), (i + 1) * CELL - 0.5, (j + 0.5) * CELL, -Math.PI / 2],
        [wallEast(i - 1, j), i * CELL + 0.5, (j + 0.5) * CELL, Math.PI / 2],
        [wallSouth(i, j), (i + 0.5) * CELL, (j + 1) * CELL - 0.5, Math.PI],
        [wallSouth(i, j - 1), (i + 0.5) * CELL, j * CELL + 0.5, 0],
      ];
      const s = sides.find((x) => x[0]);
      if (s) out.push({ key: `c${i}_${j}`, x: s[1], z: s[2], ry: s[3] });
    }
  // places with a gramophone (theater: beside the seats; mall: by the fountain; museum: in a corner; the open)
  const I0 = Math.floor(ci / REGION), J0 = Math.floor(cj / REGION);
  for (let I = I0 - 1; I <= I0 + 1; I++)
    for (let J = J0 - 1; J <= J0 + 1; J++) {
      const k = placeAt(I, J);
      const at: Partial<Record<string, [number, number]>> = { theater: [2, 7], mall: [12.6, 12.6], museum: [17.5, 17.5], open: [8, 11] };
      const p = k && at[k];
      if (p) out.push({ key: `p${I}_${J}`, x: (I * REGION + 1) * CELL + p[0], z: (J * REGION + 1) * CELL + p[1], ry: 0 });
    }
  void PLACE;
  return out;
}

function makeGramophone() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a2a16, roughness: 0.5 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.25, metalness: 0.85, side: THREE.DoubleSide });
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.6), wood);
  stand.position.y = 0.4;
  const boxTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), wood);
  boxTop.position.y = 0.9;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.015, 32), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2 }));
  disc.position.y = 1.01;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.5), brass);
  arm.position.set(0.12, 1.25, 0.05);
  arm.rotation.z = -0.5;
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.75, 32, 1, true), brass);
  horn.position.set(0.3, 1.6, 0.05);
  horn.rotation.z = -Math.PI / 2 - 0.5;
  g.add(stand, boxTop, disc, arm, horn);
  g.userData.disc = disc;
  return g;
}

export function createGramophones(presence: Presence, ctx: AudioContext, out: AudioNode) {
  const group = new THREE.Group();
  const pool = Array.from({ length: 6 }, () => {
    const m = makeGramophone();
    m.visible = false;
    group.add(m);
    return m;
  });
  const shown = new Map<string, THREE.Group>();
  const spotCache = new Map<string, Spot | null>();
  let spots: Spot[] = [];
  let lastCell = "";
  const playing = new Map<string, Playing>(); // what the world says is playing
  const sounds = new Map<string, { stop: () => void; panner: PannerNode; until: number; rec: RecordId; fx: FxId }>();

  presence.onWorld((path, d) => {
    const [kind, key] = path.split("/");
    if (kind !== "gramo" || !key || !/^[cp]-?\d+_-?\d+$/.test(key)) return;
    if (typeof d.r !== "string" || !(d.r in RECORDS) || typeof d.f !== "string" || !(d.f in EFFECTS) || typeof d.t0 !== "number") return;
    if (Date.now() - d.t0 > PLAY_SECONDS * 1000) return; // finished long ago
    playing.set(key, { key, rec: d.r as RecordId, fx: d.f as FxId, t0: d.t0, by: typeof d.by === "string" ? d.by.slice(0, 16) : "" });
  });

  function place(px: number, pz: number) {
    spots = spotsNear(px, pz);
    shown.clear();
    pool.forEach((m, k) => {
      const s = spots[k];
      m.visible = !!s;
      if (!s) return;
      m.position.set(s.x, 0, s.z);
      m.rotation.y = s.ry;
      shown.set(s.key, m);
    });
  }

  return {
    group,
    /** play a record on the gramophone (for everyone) */
    play(key: string, rec: RecordId, fx: FxId, by: string) {
      const t0 = Date.now();
      presence.publishWorld(`gramo/${key}`, { r: rec, f: fx, t0, by });
      playing.set(key, { key, rec, fx, t0, by });
    },
    /** which gramophone is within reach, if any */
    near(px: number, pz: number) {
      let best: Spot | null = null, bd = 2.2;
      for (const s of spots) {
        const d = Math.hypot(s.x - px, s.z - pz);
        if (d < bd) (bd = d), (best = s);
      }
      return best;
    },
    /** what's playing closest to you (for the radio's gramophone station) */
    nearestPlaying(px: number, pz: number) {
      let best: (Playing & { x: number; z: number }) | null = null, bd = Infinity;
      for (const p of playing.values()) {
        const s = spotOf(p.key);
        if (!s) continue;
        const d = Math.hypot(s.x - px, s.z - pz);
        if (d < bd) (bd = d), (best = { ...p, ...s });
      }
      return best;
    },
    update(px: number, pz: number, t: number) {
      const cell = `${Math.floor(px / CELL)}:${Math.floor(pz / CELL)}`;
      if (cell !== lastCell) {
        lastCell = cell;
        place(px, pz);
      }
      const now = Date.now();
      // start / stop the music you can hear
      for (const [key, p] of playing) {
        if (now - p.t0 > PLAY_SECONDS * 1000) {
          playing.delete(key);
          continue;
        }
        const s = spotOf(key);
        const d = s ? Math.hypot(s.x - px, s.z - pz) : Infinity;
        const cur = sounds.get(key);
        if (d < HEAR_M && s && (!cur || cur.rec !== p.rec || cur.fx !== p.fx)) {
          cur?.stop();
          const r = playRecord(ctx, p.rec, p.fx, p.t0);
          const panner = ctx.createPanner();
          panner.panningModel = "equalpower";
          panner.distanceModel = "inverse";
          panner.refDistance = 3;
          panner.maxDistance = HEAR_M;
          panner.rolloffFactor = 1.4;
          panner.positionX.value = s.x;
          panner.positionY.value = 1.5;
          panner.positionZ.value = s.z;
          r.output.connect(panner).connect(out);
          sounds.set(key, { stop: r.stop, panner, until: p.t0 + PLAY_SECONDS * 1000, rec: p.rec, fx: p.fx });
        }
      }
      for (const [key, snd] of sounds) {
        const s = spotOf(key);
        const d = s ? Math.hypot(s.x - px, s.z - pz) : Infinity;
        if (now > snd.until || d > HEAR_M + 6 || !playing.has(key)) {
          snd.stop();
          sounds.delete(key);
        }
      }
      // spinning discs
      for (const [key, m] of shown) if (playing.has(key)) (m.userData.disc as THREE.Mesh).rotation.y = t * 3.5;
    },
    playingAt: (key: string) => playing.get(key) ?? null,
  };

  function spotOf(key: string) {
    // corridor spots: c<i>_<j>; places: p<I>_<J> (cached: positions never change)
    const local = spots.find((s) => s.key === key);
    if (local) return local;
    if (spotCache.has(key)) return spotCache.get(key)!;
    const m = /^([cp])(-?\d+)_(-?\d+)$/.exec(key);
    if (!m) return null;
    const a = Number(m[2]), b = Number(m[3]);
    const found = spotsNear(m[1] === "c" ? (a + 0.5) * CELL : (a * REGION + 4) * CELL, m[1] === "c" ? (b + 0.5) * CELL : (b * REGION + 4) * CELL).find((s) => s.key === key) ?? null;
    spotCache.set(key, found);
    return found;
  }
}
