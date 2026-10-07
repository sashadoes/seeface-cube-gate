// Liminal art: every room is an installation built from its own random image
// (picsum, seeded by the room, so everyone sees the same art in the same room),
// in monochrome like the walls. Each room gets its own vivid light colour, so
// the black-and-white art glows differently from room to room. Corridors get the odd
// glowing photo poster. All emissive: only a fixed pool of 4 real lights.
import * as THREE from "three";
import { POSTER_LINES, decoPoster } from "./afterlife";
import { CELL, WALL_H, placeAt, placeOf, roomCentre, roomOf, rnd, wallEast, wallSouth } from "./maze";

type Art = { tex: THREE.Texture; color: THREE.Color; ready: boolean };
const cache = new Map<string, Art>();

/** Load a seeded random image once; work out its average colour for the room light. */
function art(seed: string): Art {
  let a = cache.get(seed);
  if (a) return a;
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  a = { tex, color: new THREE.Color(0xffe9c4), ready: false };
  cache.set(seed, a);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    tex.image = img;
    tex.needsUpdate = true;
    // a vivid light per image (the image itself is black and white)
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    a!.color.setHSL((h % 360) / 360, 0.75, 0.62);
    a!.ready = true;
  };
  img.src = `https://picsum.photos/seed/${encodeURIComponent(seed)}/512?grayscale`;
  return a;
}

const photoMat = (a: Art, glow = 0.85) =>
  new THREE.MeshBasicMaterial({ map: a.tex, color: new THREE.Color(glow, glow, glow), side: THREE.DoubleSide, toneMapped: false });

// ------------------------------------------------------------------ installations

function lightbox(g: THREE.Group, a: Art, k: number) {
  // a giant glowing photo filling one side of the room
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.9), photoMat(a, 0.95));
  const side = Math.floor(k * 4) % 4;
  const off = CELL * 1.5 - 0.25;
  const pos: [number, number, number][] = [[0, WALL_H / 2, -off], [off, WALL_H / 2, 0], [0, WALL_H / 2, off], [-off, WALL_H / 2, 0]];
  plane.position.set(...pos[side]);
  plane.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][side];
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(6.7, 3.2), new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide }));
  frame.position.copy(plane.position).add(new THREE.Vector3(0, 0, 0));
  frame.rotation.copy(plane.rotation);
  frame.translateZ(-0.02);
  g.add(frame, plane);
}

function ring(g: THREE.Group, a: Art) {
  // photos hanging in a slow ring around the cube
  const r = new THREE.Group();
  r.userData.spin = 0.12;
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.9), photoMat(a, 0.8));
    const ang = (i / 9) * Math.PI * 2;
    p.position.set(Math.cos(ang) * 3.3, 1.6 + Math.sin(i * 1.7) * 0.35, Math.sin(ang) * 3.3);
    p.lookAt(0, 1.6, 0);
    p.rotation.z = Math.sin(i) * 0.15;
    // each one shows a different part of the image
    const tex = a.tex.clone();
    tex.repeat.set(0.33, 0.5);
    tex.offset.set((i % 3) / 3, Math.floor(i / 3) % 2 / 2);
    (p.material as THREE.MeshBasicMaterial).map = tex;
    a.tex.addEventListener("dispose", () => tex.dispose());
    r.add(p);
  }
  g.add(r);
}

function monoliths(g: THREE.Group, a: Art, k: number) {
  const geo = new THREE.BoxGeometry(1.1, 3.1, 0.35);
  const side = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.2, metalness: 0.6 });
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(geo, [side, side, side, side, photoMat(a, 0.9), photoMat(a, 0.9)]);
    const ang = (i / 3) * Math.PI * 2 + k * 6;
    m.position.set(Math.cos(ang) * 3.6, 1.55, Math.sin(ang) * 3.6);
    m.lookAt(0, 1.55, 0);
    m.rotation.z = (i - 1) * 0.06;
    g.add(m);
  }
}

function pool(g: THREE.Group, a: Art) {
  // the image lies on the floor like still water; small cubes float above it
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), photoMat(a, 0.55));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.02;
  g.add(water);
  const cubes = new THREE.Group();
  cubes.userData.spin = -0.2;
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), photoMat(a, 0.9));
    const ang = (i / 7) * Math.PI * 2;
    c.position.set(Math.cos(ang) * 2.2, 0.6 + (i % 3) * 0.45, Math.sin(ang) * 2.2);
    c.rotation.set(i, i * 2, 0);
    cubes.add(c);
  }
  g.add(cubes);
}

function portals(g: THREE.Group, a: Art, k: number) {
  // free-standing doorways that open onto the image
  for (let i = 0; i < 2; i++) {
    const door = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const post = new THREE.BoxGeometry(0.15, 2.5, 0.15);
    const l = new THREE.Mesh(post, frameMat);
    const r = new THREE.Mesh(post, frameMat);
    l.position.set(-0.65, 1.25, 0);
    r.position.set(0.65, 1.25, 0);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.15, 0.15), frameMat);
    top.position.y = 2.5;
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.35), photoMat(a, 1));
    inside.position.y = 1.2;
    door.add(l, r, top, inside);
    const ang = i * Math.PI + k * 3;
    door.position.set(Math.cos(ang) * 3.4, 0, Math.sin(ang) * 3.4);
    door.lookAt(0, 0, 0);
    g.add(door);
  }
}

const KINDS = [lightbox, ring, monoliths, pool, portals];

// ------------------------------------------------------------------ the art layer

export type ArtLayer = {
  group: THREE.Group;
  update: (px: number, pz: number, dt: number) => void;
  /** a wish changed this room: rebuild its installation */
  refresh: (I: number, J: number) => void;
};

/** seedFor: a wished room image overrides the default one */
export function createArt(seedFor: (I: number, J: number) => string | null = () => null): ArtLayer {
  const group = new THREE.Group();
  const rooms = Array.from({ length: 4 }, () => {
    const g = new THREE.Group();
    g.userData = { key: "" };
    group.add(g);
    const light = new THREE.PointLight(0xffe9c4, 0, 13, 1.4);
    light.position.set(0, WALL_H - 0.6, 0);
    group.add(light);
    return { g, light, art: null as Art | null };
  });

  // corridor posters: glowing photos on corridor walls, from a small rotating set
  const posterGeo = new THREE.PlaneGeometry(1.5, 1.05);
  const posters = Array.from({ length: 12 }, () => {
    const m = new THREE.Mesh(posterGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }));
    m.visible = false;
    group.add(m);
    return m;
  });

  // a glowing see/face sign: about a third of the posters are this instead
  // After Life™ art-deco posters (made once each)
  const DECO_HUES = ["#2fb8a8", "#c9a24a", "#d8607a", "#6a8cff", "#e8b84a", "#3cc8e8"];
  const decoCache = new Map<number, THREE.CanvasTexture>();
  const deco = (k: number) => {
    let t = decoCache.get(k);
    if (!t) decoCache.set(k, (t = decoPoster(POSTER_LINES[k], DECO_HUES[k % DECO_HUES.length])));
    return t;
  };
  const logoSign = (() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 358;
    const g = c.getContext("2d")!;
    g.fillStyle = "#050505";
    g.fillRect(0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      g.shadowColor = "rgba(255,240,210,0.95)";
      g.shadowBlur = 28;
      for (let k = 0; k < 2; k++) g.drawImage(img, 106, 29, 300, 300);
      t.needsUpdate = true;
    };
    img.src = "/imgs/seeface-logo-transparent.png";
    return t;
  })();

  let lastCell = "";

  function placeRooms(px: number, pz: number) {
    const I0 = Math.floor(px / CELL / 7), J0 = Math.floor(pz / CELL / 7);
    const list: { I: number; J: number; d: number }[] = [];
    for (let I = I0 - 1; I <= I0 + 1; I++)
      for (let J = J0 - 1; J <= J0 + 1; J++) {
        if (placeAt(I, J)) continue; // places are dressed by places.ts
        const c = roomCentre(I, J);
        list.push({ I, J, d: Math.hypot(c.x - px, c.z - pz) });
      }
    list.sort((a, b) => a.d - b.d);
    rooms.forEach((r, k) => {
      if (!list[k]) {
        r.g.clear();
        r.g.userData.key = "";
        r.light.intensity = 0;
        return;
      }
      const { I, J } = list[k];
      const override = seedFor(I, J);
      const key = `${I}:${J}:${override ?? ""}`;
      if (r.g.userData.key === key) return;
      r.g.clear();
      r.g.userData.key = key;
      const c = roomCentre(I, J);
      r.g.position.set(c.x, 0, c.z);
      r.light.position.set(c.x, WALL_H - 0.6, c.z);
      r.art = art(override ?? `seeface1-room-${I}-${J}`);
      // a changed room also gets a different kind of installation
      const h = override ? (parseInt(override.slice(-4), 36) % 1000) / 1000 : rnd(I, J, 50);
      KINDS[Math.floor(h * KINDS.length)](r.g, r.art, rnd(I, J, 51));
    });
  }

  function placePosters(px: number, pz: number) {
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
    let k = 0;
    for (let i = ci - 5; i <= ci + 5 && k < posters.length; i++)
      for (let j = cj - 5; j <= cj + 5 && k < posters.length; j++) {
        if (roomOf(i, j) || placeOf(i, j) || rnd(i, j, 60) > 0.15) continue;
        // hang it on an existing wall of this cell
        const sides: [boolean, number, number, number][] = [
          [wallEast(i, j), (i + 1) * CELL - 0.17, (j + 0.5) * CELL, -Math.PI / 2],
          [wallEast(i - 1, j), i * CELL + 0.17, (j + 0.5) * CELL, Math.PI / 2],
          [wallSouth(i, j), (i + 0.5) * CELL, (j + 1) * CELL - 0.17, Math.PI],
          [wallSouth(i, j - 1), (i + 0.5) * CELL, j * CELL + 0.17, 0],
        ];
        const s = sides.find((x) => x[0]);
        if (!s) continue;
        const p = posters[k++];
        p.position.set(s[1], 1.75, s[2]);
        p.rotation.set(0, s[3], 0);
        const pick = rnd(i, j, 62);
        (p.material as THREE.MeshBasicMaterial).map = pick < 0.28 ? logoSign : pick < 0.62 ? deco(Math.floor(rnd(i, j, 63) * POSTER_LINES.length)) : art(`seeface1-poster-${Math.floor(rnd(i, j, 61) * 24)}`).tex;
        (p.material as THREE.MeshBasicMaterial).needsUpdate = true;
        p.visible = true;
      }
    for (; k < posters.length; k++) posters[k].visible = false;
  }

  function update(px: number, pz: number, dt: number) {
    const cell = `${Math.floor(px / CELL)}:${Math.floor(pz / CELL)}`;
    if (cell !== lastCell) {
      lastCell = cell;
      placeRooms(px, pz);
      placePosters(px, pz);
    }
    for (const r of rooms) {
      // slow spinning parts of installations
      r.g.children.forEach((c) => {
        if (c.userData.spin) c.rotation.y += c.userData.spin * dt;
      });
      // the room's light takes the colour of its image
      if (r.art?.ready) r.light.color.lerp(r.art.color, Math.min(1, dt * 2));
      const d = Math.hypot(r.g.position.x - px, r.g.position.z - pz);
      r.light.intensity = r.g.userData.key && d < CELL * 6 ? 7 : 0;
    }
  }

  let lastPos = { x: 0, z: 0 };
  function refresh(I: number, J: number) {
    void I;
    void J;
    placeRooms(lastPos.x, lastPos.z);
  }

  const baseUpdate = update;
  return {
    group,
    update: (px, pz, dt) => {
      lastPos = { x: px, z: pz };
      baseUpdate(px, pz, dt);
    },
    refresh,
  };
}
