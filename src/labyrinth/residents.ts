// Residents: characters that belong to the labyrinth (openly part of the game,
// never posing as real people).
//   watchers – pale tall figures standing at the end of corridors; they turn
//              towards you and are gone when you come close
//   wisp     – a small light that appears when your lantern is nearly dead and
//              drifts ahead of you towards the nearest safe room
import * as THREE from "three";
import { CELL, roomCentre, roomOf, rnd, wallEast, wallSouth } from "./maze";

export type Residents = {
  group: THREE.Group;
  update: (dt: number, t: number, ctx: { px: number; pz: number; light: number }) => void;
};

function watcherTexture() {
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 320;
  const g = c.getContext("2d")!;
  g.filter = "blur(4px)";
  const grad = g.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0, "rgba(230,232,236,0.85)");
  grad.addColorStop(1, "rgba(230,232,236,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(48, 34, 15, 20, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(36, 54);
  g.lineTo(22, 320);
  g.lineTo(74, 320);
  g.lineTo(60, 54);
  g.closePath();
  g.fill();
  g.filter = "none";
  // no face: two dark hollows
  g.fillStyle = "rgba(0,0,0,0.75)";
  g.beginPath();
  g.ellipse(42, 32, 3, 5, 0, 0, Math.PI * 2);
  g.ellipse(54, 32, 3, 5, 0, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,248,220,1)");
  grad.addColorStop(0.3, "rgba(255,230,170,0.6)");
  grad.addColorStop(1, "rgba(255,220,150,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Cells at the far end of straight corridors are good places to be watched from. */
function watcherSpot(I: number, J: number, k: number) {
  const i = I * 6 + Math.floor(rnd(I, J, 30 + k) * 6);
  const j = J * 6 + Math.floor(rnd(I, J, 40 + k) * 6);
  if (roomOf(i, j)) return null;
  // dead ends feel the creepiest
  const open = [!wallEast(i, j), !wallEast(i - 1, j), !wallSouth(i, j), !wallSouth(i, j - 1)].filter(Boolean).length;
  if (open > 2) return null;
  return { x: (i + 0.5) * CELL, z: (j + 0.5) * CELL };
}

export function createResidents(): Residents {
  const group = new THREE.Group();
  const wTex = watcherTexture();
  const watchers = Array.from({ length: 6 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: wTex, transparent: true, depthWrite: false, opacity: 0 }));
    s.scale.set(0.9, 2.6, 1);
    s.center.set(0.5, 0);
    s.userData = { key: "", gone: false, fade: 0 };
    group.add(s);
    return s;
  });

  const wisp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  wisp.scale.set(0.5, 0.5, 1);
  const wispLight = new THREE.PointLight(0xffe6b0, 0, 4, 2);
  wisp.add(wispLight);
  group.add(wisp);
  let wispOn = false;

  let lastRegion = "";

  function placeWatchers(px: number, pz: number) {
    const I0 = Math.floor(px / CELL / 6), J0 = Math.floor(pz / CELL / 6);
    let k = 0;
    for (let I = I0 - 1; I <= I0 + 1 && k < watchers.length; I++)
      for (let J = J0 - 1; J <= J0 + 1 && k < watchers.length; J++)
        for (let n = 0; n < 2 && k < watchers.length; n++) {
          const spot = watcherSpot(I, J, n);
          if (!spot) continue;
          const w = watchers[k++];
          const key = `${I}:${J}:${n}`;
          if (w.userData.key !== key) {
            w.userData = { key, gone: false, fade: 0 };
            w.position.set(spot.x, 0, spot.z);
          }
        }
    for (; k < watchers.length; k++) watchers[k].userData.gone = true;
  }

  function nearestRoom(px: number, pz: number) {
    const I0 = Math.floor(px / CELL / 7), J0 = Math.floor(pz / CELL / 7);
    let best = roomCentre(I0, J0);
    let bd = Infinity;
    for (let I = I0 - 1; I <= I0 + 1; I++)
      for (let J = J0 - 1; J <= J0 + 1; J++) {
        const c = roomCentre(I, J);
        const d = Math.hypot(c.x - px, c.z - pz);
        if (d < bd) (bd = d), (best = c);
      }
    return best;
  }

  function update(dt: number, t: number, ctx: { px: number; pz: number; light: number }) {
    const { px, pz, light } = ctx;
    const region = `${Math.floor(px / CELL / 6)}:${Math.floor(pz / CELL / 6)}`;
    if (region !== lastRegion) {
      lastRegion = region;
      placeWatchers(px, pz);
    }

    // watchers: visible from afar, gone when you get close (until you leave the area)
    for (const w of watchers) {
      const d = Math.hypot(w.position.x - px, w.position.z - pz);
      if (d < CELL * 1.6) w.userData.gone = true;
      const target = w.userData.gone ? 0 : d > CELL * 2.5 && d < CELL * 9 ? 0.55 : 0;
      w.userData.fade += (target - w.userData.fade) * Math.min(1, dt * (w.userData.gone ? 6 : 1.2));
      (w.material as THREE.SpriteMaterial).opacity = w.userData.fade * (0.85 + Math.sin(t * 9 + w.position.x) * 0.15);
    }

    // wisp: appears when the lantern is dying, floats ahead towards safety
    const safe = roomOf(Math.floor(px / CELL), Math.floor(pz / CELL)) !== null;
    if (!wispOn && light < 30 && !safe) {
      wispOn = true;
      wisp.position.set(px, 1.5, pz);
    }
    if (wispOn && (light > 60 || safe)) wispOn = false;
    const m = wisp.material as THREE.SpriteMaterial;
    m.opacity += ((wispOn ? 0.95 : 0) - m.opacity) * Math.min(1, dt * 2);
    wispLight.intensity = m.opacity * 1.6;
    if (wispOn) {
      const r = nearestRoom(px, pz);
      // stay ~3 m ahead of you, on the way to the room
      const dx = r.x - px, dz = r.z - pz;
      const d = Math.hypot(dx, dz) || 1;
      const ahead = Math.min(3, d);
      const gx = px + (dx / d) * ahead, gz = pz + (dz / d) * ahead;
      wisp.position.x += (gx - wisp.position.x) * Math.min(1, dt * 1.4);
      wisp.position.z += (gz - wisp.position.z) * Math.min(1, dt * 1.4);
      wisp.position.y = 1.5 + Math.sin(t * 2.3) * 0.15;
    }
  }

  return { group, update };
}
