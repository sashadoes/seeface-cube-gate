// Liminal art: every room is an installation built from its own random image
// (picsum, seeded by the room, so everyone sees the same art in the same room),
// in monochrome like the walls. Each room gets its own vivid light colour, so
// the black-and-white art glows differently from room to room. Corridors get the odd
// glowing photo poster. All emissive: only a fixed pool of 4 real lights.
import * as THREE from "three";
import { zoneAt, type ZoneKind } from "./zones";
import { CELL, WALL_H, inShip, placeAt, placeOf, roomCentre, roomOf, rnd, wallEast, wallSouth } from "./maze";
import { releaseChildren } from "./gpu";

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
  /** approved artists' posts: they also hang on corridor posters all over the world */
  setGallery: (list: GalleryPiece[]) => void;
};

export type GalleryPiece = { id: string; img: string; nick: string };

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
  // "opening soon" ads (owner: "seeface · the new experience · opening soon")
  const adCache = new Map<number, THREE.CanvasTexture>();
  const adPoster = (k: number) => {
    let t = adCache.get(k);
    if (!t) adCache.set(k, (t = makeAdPoster(k, logoImg)));
    return t;
  };
  const logoImg = new Image();
  logoImg.onload = () => adCache.forEach((t, k) => drawAd(t.image as HTMLCanvasElement, k, logoImg) && (t.needsUpdate = true));
  logoImg.src = "/imgs/seeface-logo-transparent.png";

  // generated posters that belong to the place they hang in: each zone has its own look
  const posterCache = new Map<string, THREE.CanvasTexture>();
  const zonePoster = (kind: ZoneKind, k: number) => {
    const key = `${kind}:${k}`;
    let t = posterCache.get(key);
    if (!t) posterCache.set(key, (t = makeZonePoster(kind, k)));
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

  // approved art from players: framed with the artist's name (the agreement: "always with your name")
  let gallery: GalleryPiece[] = [];
  const galleryCache = new Map<string, THREE.CanvasTexture>();
  const galleryPoster = (p: GalleryPiece) => {
    let t = galleryCache.get(p.id);
    if (!t) galleryCache.set(p.id, (t = makeGalleryPoster(p)));
    return t;
  };

  let lastCell = "";

  function placeRooms(px: number, pz: number) {
    const I0 = Math.floor(px / CELL / 7), J0 = Math.floor(pz / CELL / 7);
    const list: { I: number; J: number; d: number }[] = [];
    for (let I = I0 - 1; I <= I0 + 1; I++)
      for (let J = J0 - 1; J <= J0 + 1; J++) {
        if (placeAt(I, J)) continue; // places are dressed by places.ts
        const c = roomCentre(I, J);
        if (inShip(c.x, c.z)) continue;
        list.push({ I, J, d: Math.hypot(c.x - px, c.z - pz) });
      }
    list.sort((a, b) => a.d - b.d);
    rooms.forEach((r, k) => {
      if (!list[k]) {
        releaseChildren(r.g);
        r.g.userData.key = "";
        r.light.intensity = 0;
        return;
      }
      const { I, J } = list[k];
      const override = seedFor(I, J);
      const key = `${I}:${J}:${override ?? ""}`;
      if (r.g.userData.key === key) return;
      releaseChildren(r.g);
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
        // players' approved art takes the photo slots (and a few more) once there is any
        const piece = gallery.length && pick >= 0.6 ? gallery[Math.floor(rnd(i, j, 61) * gallery.length)] : null;
        (p.material as THREE.MeshBasicMaterial).map = piece ? galleryPoster(piece) : pick < 0.22 ? logoSign : pick < 0.42 ? adPoster(Math.floor(rnd(i, j, 64) * AD_LINES.length)) : pick < 0.68 ? zonePoster(zoneAt((i + 0.5) * CELL, (j + 0.5) * CELL).kind, Math.floor(rnd(i, j, 63) * 4)) : art(`seeface1-poster-${Math.floor(rnd(i, j, 61) * 24)}`).tex;
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
    setGallery(list) {
      const key = (l: GalleryPiece[]) => l.map((p) => p.id).join(",");
      if (key(list) === key(gallery)) return;
      gallery = list;
      for (const [id, t] of galleryCache) if (!list.some((p) => p.id === id)) (t.dispose(), galleryCache.delete(id));
      placePosters(lastPos.x, lastPos.z);
    },
  };
}

// ------------------------------------------------------------------ players' art as posters
function makeGalleryPoster(p: GalleryPiece) {
  const W = 512, H = 358;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#070707";
  g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    // fit the whole work, never crop it
    const box = { w: W - 40, h: H - 70 };
    const k = Math.min(box.w / img.width, box.h / img.height);
    const w = img.width * k, h = img.height * k;
    g.drawImage(img, (W - w) / 2, 18 + (box.h - h) / 2, w, h);
    g.fillStyle = "#e9e4da";
    g.font = "italic 22px 'Times New Roman', serif";
    g.textAlign = "center";
    g.fillText(`@${p.nick}`, W / 2, H - 20, W - 40);
    g.strokeStyle = "rgba(255,255,255,0.14)";
    g.lineWidth = 2;
    g.strokeRect(6, 6, W - 12, H - 12);
    t.needsUpdate = true;
  };
  img.src = p.img;
  return t;
}

// ------------------------------------------------------------------ generated posters per zone
function makeZonePoster(kind: ZoneKind, k: number) {
  const W = 512, H = 360;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  let seed = kind.length * 131 + k * 977 + 7;
  const r = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const bg = (col: string) => {
    g.fillStyle = col;
    g.fillRect(0, 0, W, H);
  };
  if (kind === "pools") {
    // tiles + rings of water
    bg("#bfe8ec");
    g.strokeStyle = "rgba(40,120,130,0.25)";
    for (let x = 0; x < W; x += 32) for (let y = 0; y < H; y += 32) g.strokeRect(x, y, 32, 32);
    for (let n = 0; n < 6; n++) {
      const cx = r() * W, cy = r() * H;
      for (let q = 1; q < 6; q++) {
        g.strokeStyle = `rgba(20,110,140,${0.5 - q * 0.08})`;
        g.lineWidth = 2;
        g.beginPath();
        g.ellipse(cx, cy, q * 18, q * 9, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
  } else if (kind === "neon") {
    bg("#07040c");
    const cols = ["#ff3cf0", "#3cf2ff", "#a4ff3c", "#ffb13c"];
    for (let n = 0; n < 7; n++) {
      g.strokeStyle = cols[Math.floor(r() * 4)];
      g.shadowColor = g.strokeStyle;
      g.shadowBlur = 18;
      g.lineWidth = 3;
      g.beginPath();
      const x0 = r() * W;
      g.moveTo(x0, 0);
      for (let y = 0; y <= H; y += 30) g.lineTo(x0 + Math.sin(y / 40 + n) * 60, y);
      g.stroke();
    }
    g.shadowBlur = 0;
  } else if (kind === "photo") {
    // botanical: stems and leaves
    bg("#e6eadb");
    for (let n = 0; n < 9; n++) {
      const x = 40 + r() * (W - 80);
      g.strokeStyle = "#3d5a30";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, H);
      g.quadraticCurveTo(x + (r() - 0.5) * 120, H / 2, x + (r() - 0.5) * 60, 40 + r() * 80);
      g.stroke();
      for (let l = 0; l < 5; l++) {
        g.fillStyle = `rgba(${60 + r() * 50},${110 + r() * 60},${50 + r() * 30},0.8)`;
        g.beginPath();
        g.ellipse(x + (r() - 0.5) * 80, 60 + r() * (H - 120), 16, 6, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (kind === "white") {
    // minimal: one shape, lots of nothing
    bg("#f4f1ea");
    g.fillStyle = ["#1a1a1a", "#c9c3b6", "#8a8478", "#2a2a2a"][k % 4];
    if (k % 2) g.fillRect(W * 0.38, H * 0.3, W * 0.24, H * 0.4);
    else {
      g.beginPath();
      g.arc(W / 2, H / 2, 60, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === "ash") {
    bg("#2a2522");
    for (let n = 0; n < 40; n++) {
      g.fillStyle = `rgba(${10 + r() * 30},${8 + r() * 20},${6 + r() * 15},${0.2 + r() * 0.4})`;
      g.beginPath();
      g.ellipse(r() * W, r() * H, 20 + r() * 80, 6 + r() * 30, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let n = 0; n < 30; n++) {
      g.fillStyle = `rgba(255,${120 + r() * 80},40,${r() * 0.8})`;
      g.fillRect(r() * W, r() * H, 2, 2);
    }
  } else if (kind === "deep") {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0d3a40");
    grad.addColorStop(1, "#010608");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    for (let n = 0; n < 60; n++) {
      g.fillStyle = `rgba(124,255,232,${r() * 0.6})`;
      g.beginPath();
      g.arc(r() * W, r() * H, 1 + r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === "red") {
    // warm amber corridors: abstract stripes (no red-room curtains or zigzag floors)
    bg("#3a1a12");
    for (let n = 0; n < 12; n++) {
      g.fillStyle = `rgba(${200 + r() * 55},${110 + r() * 60},${50 + r() * 30},${0.2 + r() * 0.4})`;
      g.fillRect(0, r() * H, W, 4 + r() * 24);
    }
  } else {
    // the monogram halls: a quiet pattern of the logo mark
    bg("#d8d2c6");
    g.fillStyle = "rgba(40,36,30,0.25)";
    g.font = "italic 42px 'Times New Roman', serif";
    for (let y = 40; y < H; y += 60) for (let x = (y / 60) % 2 ? 0 : 60; x < W; x += 120) g.fillText("see/face", x, y);
  }
  // a thin frame, same everywhere
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 6;
  g.strokeRect(3, 3, W - 6, H - 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ "opening soon" ads
const AD_LINES: [string, string, string][] = [
  ["seeface", "the new experience", "opening soon"],
  ["seeface", "the new experience", "opening soon"],
  ["the exhibition hall", "every artist on the walls", "opening soon"],
  ["shows", "your name on the marquee", "opening soon"],
  ["the open market", "south-east of the entrance", "now open"],
];

function drawAd(c: HTMLCanvasElement, k: number, logo: HTMLImageElement) {
  const g = c.getContext("2d")!;
  const W = c.width, H = c.height;
  const [title, sub, when] = AD_LINES[k];
  g.fillStyle = "#070707";
  g.fillRect(0, 0, W, H);
  const v = g.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, W * 0.7);
  v.addColorStop(0, "rgba(255,246,226,0.10)");
  v.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  if (logo.complete && logo.naturalWidth) g.drawImage(logo, W / 2 - 55, 26, 110, 110);
  g.textAlign = "center";
  g.fillStyle = "#fff6e2";
  g.font = "italic 46px 'Times New Roman', serif";
  g.fillText(title, W / 2, 190, W - 40);
  g.fillStyle = "#a9a293";
  g.font = "italic 24px 'Times New Roman', serif";
  g.fillText(sub, W / 2, 228, W - 40);
  g.fillStyle = when === "now open" ? "#ffd27a" : "#cfc6b8";
  g.font = "italic 30px 'Times New Roman', serif";
  g.fillText(`· ${when} ·`, W / 2, 300);
  g.strokeStyle = "rgba(255,255,255,0.12)";
  g.lineWidth = 2;
  g.strokeRect(12, 12, W - 24, H - 24);
  return true;
}

function makeAdPoster(k: number, logo: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 360;
  drawAd(c, k, logo);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
