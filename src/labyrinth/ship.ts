// The ship: a giant spaceship (240 m × 110 m × 60 m) with a gothic church in the
// middle of its deck. Reached by the beam of light in "the open" (the ship
// hangs over that place in the sky); a beam at the ship's dock brings you back.
// Built only when you're near/inside it.
import * as THREE from "three";
import { CHURCH, SHIP } from "./maze";

function dot() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.4, "rgba(255,255,255,0.4)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const DOT = dot();

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

/** a light beam: a tall glowing column (the way up / the way back) */
export function beam(height: number, colour = 0xbfe8ff) {
  const g = new THREE.Group();
  const col = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.4, height, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  col.position.y = height / 2;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.5, 48), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  const motes: THREE.Sprite[] = [];
  for (let k = 0; k < 30; k++) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: colour, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    m.scale.setScalar(0.2);
    m.userData = { a: Math.random() * 6.28, y: Math.random() * height, s: 1 + Math.random() * 2 };
    motes.push(m);
    g.add(m);
  }
  g.add(col, ring);
  g.userData.tick = (t: number) => {
    for (const m of motes) {
      const u = m.userData;
      m.position.set(Math.cos(u.a + t) * 0.8, (u.y + t * u.s) % height, Math.sin(u.a + t) * 0.8);
    }
    (col.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(t * 2) * 0.05;
  };
  return g;
}

/** the silhouette of the ship hanging in the sky over "the open" */
export function shipSilhouette() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.MeshBasicMaterial({ color: 0x0a0d14, fog: false }));
  hull.scale.set(SHIP.halfLen, 14, SHIP.halfWid * 0.6);
  g.add(hull);
  for (let k = 0; k < 60; k++) {
    const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: k % 7 === 0 ? 0xff9a5a : 0xbfe8ff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const a = Math.random() * Math.PI * 2;
    l.position.set(Math.cos(a) * SHIP.halfLen * (0.3 + Math.random() * 0.65), -12 + Math.random() * 3, Math.sin(a) * SHIP.halfWid * 0.5 * Math.random());
    l.scale.setScalar(2.5);
    g.add(l);
  }
  // engines
  for (const s of [-1, 1]) {
    const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: 0x7ab8ff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    e.scale.setScalar(30);
    e.position.set(s * SHIP.halfLen, 0, 0);
    g.add(e);
  }
  return g;
}

function buildChurch() {
  const g = new THREE.Group();
  const c = CHURCH;
  const L = c.x1 - c.x0, W = c.z1 - c.z0, H = 16;
  const stone = new THREE.MeshStandardMaterial({ color: 0xcfc8bc, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.7 });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  // walls (west wall split around the door)
  add(new THREE.BoxGeometry(L, H, c.wall), stone, 0, H / 2, c.z0 + c.wall / 2);
  add(new THREE.BoxGeometry(L, H, c.wall), stone, 0, H / 2, c.z1 - c.wall / 2);
  add(new THREE.BoxGeometry(c.wall, H, W), stone, c.x1 - c.wall / 2, H / 2, 0);
  const side = (W - c.door) / 2;
  add(new THREE.BoxGeometry(c.wall, H, side), stone, c.x0 + c.wall / 2, H / 2, c.z0 + side / 2);
  add(new THREE.BoxGeometry(c.wall, H, side), stone, c.x0 + c.wall / 2, H / 2, c.z1 - side / 2);
  add(new THREE.BoxGeometry(c.wall, H - 6, c.door), stone, c.x0 + c.wall / 2, 6 + (H - 6) / 2, 0); // over the door
  // a pitched roof
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, W * 0.72, L + 1, 4, 1), dark);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.x = Math.PI / 4;
  roof.position.set(0, H + 5, 0);
  roof.scale.set(1, 1, 0.6);
  g.add(roof);
  // the spire over the door, 35 m up
  add(new THREE.BoxGeometry(6, 26, 6), stone, c.x0 + 3, 13, 0);
  add(new THREE.ConeGeometry(4.4, 14, 4), dark, c.x0 + 3, 33, 0).rotation.y = Math.PI / 4;
  // stained glass: tall pointed windows down both sides + a rose window behind the altar
  const glass = (seed: number) =>
    canvasTex(128, 320, (g2) => {
      g2.fillStyle = "#0a0a14";
      g2.fillRect(0, 0, 128, 320);
      const cols = ["#ff3c6a", "#3c8cff", "#ffd23c", "#3cffb4", "#b43cff", "#ff8a3c"];
      for (let y = 0; y < 320; y += 32)
        for (let x = 0; x < 128; x += 32) {
          g2.fillStyle = cols[(x / 32 + y / 32 + seed) % cols.length];
          g2.globalAlpha = 0.85;
          g2.beginPath();
          g2.moveTo(x + 16, y);
          g2.lineTo(x + 32, y + 16);
          g2.lineTo(x + 16, y + 32);
          g2.lineTo(x, y + 16);
          g2.fill();
        }
      g2.globalAlpha = 1;
      g2.strokeStyle = "#111";
      g2.lineWidth = 3;
      for (let y = 0; y < 320; y += 32) (g2.beginPath(), g2.moveTo(0, y), g2.lineTo(128, y), g2.stroke());
    });
  for (let k = 0; k < 5; k++) {
    const x = c.x0 + 6 + k * 7;
    for (const zz of [c.z0 + c.wall + 0.02, c.z1 - c.wall - 0.02]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 7), new THREE.MeshBasicMaterial({ map: glass(k), toneMapped: false, side: THREE.DoubleSide }));
      win.position.set(x, 7, zz);
      g.add(win);
    }
  }
  const rose = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48),
    new THREE.MeshBasicMaterial({
      map: canvasTex(256, 256, (g2) => {
        g2.fillStyle = "#06060c";
        g2.fillRect(0, 0, 256, 256);
        g2.translate(128, 128);
        const cols = ["#ff3c6a", "#3c8cff", "#ffd23c", "#3cffb4", "#b43cff", "#ff8a3c"];
        for (let ring = 6; ring > 0; ring--)
          for (let k = 0; k < 12; k++) {
            g2.save();
            g2.rotate((k / 12) * Math.PI * 2 + ring * 0.2);
            g2.fillStyle = cols[(k + ring) % cols.length];
            g2.beginPath();
            g2.ellipse(ring * 18, 0, 12, 6, 0, 0, Math.PI * 2);
            g2.fill();
            g2.restore();
          }
      }),
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  rose.rotation.y = -Math.PI / 2;
  rose.position.set(c.x1 - c.wall - 0.03, 10, 0);
  g.add(rose);
  // pews, the altar with candles, organ pipes
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 0.6 });
  for (let px = -14; px <= 8; px += 3)
    for (const z of [-4.5, 4.5]) {
      add(new THREE.BoxGeometry(0.6, 0.5, 6), wood, px + 0.3, 0.25, z);
      add(new THREE.BoxGeometry(0.12, 0.9, 6), wood, px + 0.6, 0.6, z);
    }
  add(new THREE.BoxGeometry(3, 1.1, 5), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.5 }), 14.5, 0.55, 0);
  const flames: THREE.Sprite[] = [];
  for (let k = 0; k < 7; k++) {
    const z = -2.1 + k * 0.7;
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.5), new THREE.MeshStandardMaterial({ color: 0xfff6e2 }), 14.5, 1.35, z);
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: 0xffb04a, blending: THREE.AdditiveBlending, depthWrite: false }));
    f.scale.setScalar(0.3);
    f.position.set(14.5, 1.68, z);
    flames.push(f);
    g.add(f);
  }
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3c, roughness: 0.3, metalness: 0.8 });
  for (let k = 0; k < 13; k++) {
    const h = 4 + Math.sin((k / 12) * Math.PI) * 6;
    add(new THREE.CylinderGeometry(0.18, 0.18, h, 12), brass, 18.4, 2 + h / 2, -3.6 + k * 0.6);
  }
  g.userData.tick = (t: number) => flames.forEach((f, k) => f.scale.setScalar(0.26 + Math.sin(t * 9 + k) * 0.05));
  return g;
}

export function createShip() {
  const group = new THREE.Group();
  group.position.set(SHIP.x, 0, SHIP.z);
  group.visible = false;
  let built = false;
  let church: THREE.Group | null = null;
  let dock: THREE.Group | null = null;
  const lights = [new THREE.PointLight(0xffd8a0, 0, 80, 1), new THREE.PointLight(0x9fc8ff, 0, 200, 0.8), new THREE.PointLight(0xffb04a, 0, 30, 1.4), new THREE.PointLight(0xfff0d8, 0, 50, 1)];

  function build() {
    built = true;
    // the hull: a giant ellipsoid seen from inside, with ribs and portholes
    const hullTex = canvasTex(512, 256, (g) => {
      g.fillStyle = "#1a1e26";
      g.fillRect(0, 0, 512, 256);
      g.strokeStyle = "rgba(255,255,255,0.06)";
      for (let x = 0; x < 512; x += 32) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, 256), g.stroke());
      for (let y = 0; y < 256; y += 32) (g.beginPath(), g.moveTo(0, y), g.lineTo(512, y), g.stroke());
      // portholes with stars
      for (let k = 0; k < 6; k++) {
        const cx = 40 + k * 85, cy = 128;
        g.fillStyle = "#02030a";
        g.beginPath();
        g.arc(cx, cy, 22, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#fff";
        for (let n = 0; n < 8; n++) g.fillRect(cx - 16 + Math.random() * 32, cy - 16 + Math.random() * 32, 1.5, 1.5);
        g.strokeStyle = "#9fb8d8";
        g.lineWidth = 3;
        g.beginPath();
        g.arc(cx, cy, 22, 0, Math.PI * 2);
        g.stroke();
      }
    }, [8, 4]);
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: hullTex, side: THREE.BackSide, roughness: 0.6, metalness: 0.4, emissive: 0x1c2638, emissiveIntensity: 1, emissiveMap: hullTex }));
    hull.scale.set(SHIP.halfLen, SHIP.height, SHIP.halfWid);
    group.add(hull);
    // ribs every 12 m
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.4, metalness: 0.7 });
    for (let x = -SHIP.halfLen + 12; x < SHIP.halfLen; x += 12) {
      const k = Math.sqrt(Math.max(0, 1 - (x / SHIP.halfLen) ** 2));
      const rib = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 48, Math.PI), ribMat);
      rib.rotation.y = Math.PI / 2;
      rib.scale.set(SHIP.halfWid * k, SHIP.height * k, 1);
      rib.position.x = x;
      group.add(rib);
    }
    // the deck: dark metal plates with guide lights
    const deckTex = canvasTex(256, 256, (g) => {
      g.fillStyle = "#14171c";
      g.fillRect(0, 0, 256, 256);
      g.strokeStyle = "rgba(255,255,255,0.08)";
      g.lineWidth = 2;
      g.strokeRect(0, 0, 256, 256);
      g.fillStyle = "rgba(159,232,255,0.5)";
      g.fillRect(124, 0, 8, 6);
    }, [SHIP.halfLen / 4, SHIP.halfWid / 4]);
    const deck = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.35, metalness: 0.6 }));
    deck.rotation.x = -Math.PI / 2;
    deck.scale.set(SHIP.halfLen, SHIP.halfWid, 1);
    deck.position.y = 0.03;
    group.add(deck);
    // engines glowing at both ends
    for (const s of [-1, 1]) {
      const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: 0x7ab8ff, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      e.scale.setScalar(40);
      e.position.set(s * (SHIP.halfLen - 4), 18, 0);
      group.add(e);
    }
    // floating lanterns high in the hull
    for (let k = 0; k < 40; k++) {
      const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: DOT, color: 0xffe6b8, blending: THREE.AdditiveBlending, depthWrite: false }));
      l.position.set((Math.random() - 0.5) * SHIP.halfLen * 1.6, 20 + Math.random() * 25, (Math.random() - 0.5) * SHIP.halfWid * 1.4);
      l.scale.setScalar(1.6);
      group.add(l);
    }
    church = buildChurch();
    group.add(church);
    dock = beam(SHIP.height);
    dock.position.set(-SHIP.halfLen + 22, 0, 0);
    group.add(dock);
    lights[0].position.set(0, 14, 0);
    lights[1].position.set(0, 40, 0);
    lights[2].position.set(14, 3, 0);
    lights[3].position.set(CHURCH.x0 - 14, 12, 0); // lights the church's front
    lights.forEach((l) => group.add(l));
  }

  return {
    group,
    /** world position of the dock beam (the way back down) */
    dock: { x: SHIP.x - SHIP.halfLen + 22, z: SHIP.z },
    update(px: number, pz: number, t: number) {
      const near = Math.abs(px - SHIP.x) < SHIP.halfLen + 60;
      if (near && !built) build();
      group.visible = near;
      if (!near) return;
      lights[0].intensity = 60;
      lights[1].intensity = 120;
      lights[2].intensity = 6;
      lights[3].intensity = 16;
      church?.userData.tick(t);
      dock?.userData.tick(t);
    },
  };
}
