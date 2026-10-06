// The labyrinth scene (three.js): monogram walls, dark polished floor, low
// ceiling with flickering fluorescent panels, deep fog, and a black glass cube
// floating in every room under its own spotlight. Only the cells around the
// visitor exist at any time; they are rebuilt as you walk (infinite maze).
import * as THREE from "three";
import { CELL, WALL_H, hasPanel, roomCentre, roomOf, wallEast, wallSouth, rnd } from "./maze";
import type { Weather } from "../marks/weather";

const VIEW = 7; // cells around the visitor that exist
const MAX_WALLS = (VIEW * 2 + 2) ** 2 * 2;
const MAX_PANELS = (VIEW * 2 + 2) ** 2;

export type World = {
  scene: THREE.Scene;
  update: (px: number, pz: number, t: number, dt: number) => void;
  setWeather: (w: Weather) => void;
  nearestCube: (px: number, pz: number) => { mesh: THREE.Object3D; dist: number } | null;
  spinCube: (cube: THREE.Object3D) => void;
};

/** Liminal monogram wallpaper: a pale/grey chess of see/face logos, like printed wallpaper. */
function monogramTexture(light: string, dark: string, logoAlpha: number) {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const half = size / 2;
  const cells: [number, number, string, boolean][] = [
    [0, 0, light, true],
    [half, 0, dark, false],
    [0, half, dark, false],
    [half, half, light, true],
  ];
  for (const [x, y, col] of cells) {
    g.fillStyle = col;
    g.fillRect(x, y, half, half);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    for (const [x, y, , onLight] of cells) {
      g.globalAlpha = logoAlpha;
      // dark logo on the light squares, light logo on the dark ones
      g.filter = onLight ? "invert(1)" : "none";
      g.drawImage(img, x + half * 0.1, y + half * 0.1, half * 0.8, half * 0.8);
    }
    g.globalAlpha = 1;
    g.filter = "none";
    // a little grime so it doesn't look printed yesterday
    for (let k = 0; k < 1400; k++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * size, Math.random() * size, 2 + Math.random() * 6, 2 + Math.random() * 6);
    }
    t.needsUpdate = true;
  };
  img.src = "/imgs/seeface-logo.png";
  return t;
}

function digitTexture(d: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#050505";
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(255,255,255,0.12)";
  g.lineWidth = 6;
  g.strokeRect(3, 3, 250, 250);
  g.font = "italic 150px 'Times New Roman', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = d === "6" ? "#3cff6a" : "#e9e9e9";
  g.shadowColor = d === "6" ? "#3cff6a" : "#ffffff";
  g.shadowBlur = 18;
  g.fillText(d, 128, 136);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createWorld(): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0c0b);
  scene.fog = new THREE.FogExp2(0x0c0c0b, 0.06);

  // ---------------------------------------------------------------- materials
  const wallMat = new THREE.MeshStandardMaterial({
    map: monogramTexture("#cfccc4", "#9d9a93", 0.32),
    roughness: 0.86,
    metalness: 0.02,
  });
  const floorTex = monogramTexture("#3b3a38", "#2b2a29", 0.18);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.32, metalness: 0.25 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x8c8a85, roughness: 0.95 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xf2f5ff, emissiveIntensity: 1.2 });

  // ---------------------------------------------------------------- walls (instanced)
  const wallGeo = new THREE.BoxGeometry(CELL + 0.3, WALL_H, 0.3);
  // map the texture so each wall shows one 2×2 chess tile
  const uv = wallGeo.getAttribute("uv") as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 1, uv.getY(k) * 0.85);
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, MAX_WALLS);
  walls.frustumCulled = false;
  scene.add(walls);

  // floor + ceiling follow the visitor; textures scroll with world position
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 40, CELL * 40), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floorTex.repeat.set(40, 40);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 40, CELL * 40), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = WALL_H;
  scene.add(ceil);

  // ceiling light panels (instanced) + a small pool of real lights on the nearest ones
  const panels = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 1.6), panelMat, MAX_PANELS);
  panels.frustumCulled = false;
  scene.add(panels);
  const panelLights = Array.from({ length: 5 }, () => {
    const l = new THREE.PointLight(0xdfe6ff, 0, 14, 1.3);
    scene.add(l);
    return l;
  });

  scene.add(new THREE.AmbientLight(0xb8b6ae, 0.55));
  scene.add(new THREE.HemisphereLight(0xdedcd4, 0x1a1a18, 0.6));

  // ---------------------------------------------------------------- cubes in rooms
  const faces = ["1", "2", "3", "4", "5", "6"].map(
    (d) => new THREE.MeshStandardMaterial({ map: digitTexture(d), roughness: 0.18, metalness: 0.55, emissive: 0xffffff, emissiveMap: digitTexture(d), emissiveIntensity: 0.35 })
  );
  const cubeGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
  const cubes = Array.from({ length: 4 }, () => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(cubeGeo, faces);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(cubeGeo), new THREE.LineBasicMaterial({ color: 0x000000 }));
    m.add(edges);
    g.add(m);
    const spot = new THREE.SpotLight(0xfff1d6, 18, 12, Math.PI / 7, 0.55, 1.4);
    spot.position.set(0, WALL_H - 0.1, 0);
    spot.target = m;
    g.add(spot);
    const halo = new THREE.PointLight(0xbfd8ff, 2.2, 5, 2);
    halo.position.set(0, 0.2, 0);
    g.add(halo);
    g.userData = { spin: 0, key: "" };
    g.visible = false;
    scene.add(g);
    return g;
  });

  // ---------------------------------------------------------------- weather
  let weather: Weather | null = null;
  let precip: THREE.Points | null = null;
  let precipSpeed = 0;
  let flash = 0;
  let nextBolt = 0;
  const flashLight = new THREE.AmbientLight(0xc8d8ff, 0);
  scene.add(flashLight);

  function setWeather(w: Weather) {
    weather = w;
    const fog = scene.fog as THREE.FogExp2;
    fog.density = w.kind === "fog" ? 0.13 : w.kind === "drizzle" || w.kind === "rain" ? 0.08 : w.kind === "storm" ? 0.09 : 0.06;
    const tint = w.kind === "storm" || w.kind === "rain" ? 0xc9d8ff : w.isDay ? 0xfff0dc : 0xd9e2ff;
    panelMat.emissive.setHex(tint);
    panelLights.forEach((l) => l.color.setHex(tint));
    if (precip) scene.remove(precip);
    precip = null;
    if (["rain", "drizzle", "storm", "snow"].includes(w.kind)) {
      const n = w.kind === "snow" ? 900 : w.kind === "drizzle" ? 500 : 1400;
      const pos = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) pos.set([(Math.random() - 0.5) * 24, Math.random() * WALL_H, (Math.random() - 0.5) * 24], k * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      precip = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color: w.kind === "snow" ? 0xffffff : 0xaac4ff,
          size: w.kind === "snow" ? 0.06 : 0.025,
          transparent: true,
          opacity: w.kind === "snow" ? 0.9 : 0.55,
          depthWrite: false,
        })
      );
      precipSpeed = w.kind === "snow" ? 0.7 : w.kind === "drizzle" ? 4 : 9;
      scene.add(precip);
    }
  }

  // ---------------------------------------------------------------- rebuild around the visitor
  let lastCell = "";
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s1 = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const flatQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
  let panelSpots: { x: number; z: number; seed: number }[] = [];

  function rebuild(ci: number, cj: number) {
    let n = 0;
    let np = 0;
    panelSpots = [];
    for (let i = ci - VIEW; i <= ci + VIEW; i++) {
      for (let j = cj - VIEW; j <= cj + VIEW; j++) {
        if (wallEast(i, j)) {
          p.set((i + 1) * CELL, WALL_H / 2, (j + 0.5) * CELL);
          walls.setMatrixAt(n++, m4.compose(p, rotY, s1));
        }
        if (wallSouth(i, j)) {
          p.set((i + 0.5) * CELL, WALL_H / 2, (j + 1) * CELL);
          walls.setMatrixAt(n++, m4.compose(p, q.identity(), s1));
        }
        if (hasPanel(i, j)) {
          const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL;
          p.set(x, WALL_H - 0.02, z);
          panels.setMatrixAt(np++, m4.compose(p, flatQ, s1));
          panelSpots.push({ x, z, seed: rnd(i, j, 9) });
        }
      }
    }
    walls.count = n;
    walls.instanceMatrix.needsUpdate = true;
    panels.count = np;
    panels.instanceMatrix.needsUpdate = true;

    // cubes: the rooms nearest to the visitor
    const R = 7;
    const I0 = Math.floor(ci / R), J0 = Math.floor(cj / R);
    const rooms: { I: number; J: number; d: number }[] = [];
    for (let I = I0 - 1; I <= I0 + 1; I++)
      for (let J = J0 - 1; J <= J0 + 1; J++) {
        const c = roomCentre(I, J);
        rooms.push({ I, J, d: Math.hypot(c.x - (ci + 0.5) * CELL, c.z - (cj + 0.5) * CELL) });
      }
    rooms.sort((a, b) => a.d - b.d);
    cubes.forEach((g, k) => {
      const r = rooms[k];
      if (!r) return (g.visible = false);
      const key = `${r.I}:${r.J}`;
      if (g.userData.key !== key) {
        const c = roomCentre(r.I, r.J);
        g.position.set(c.x, 1.45, c.z);
        g.userData.key = key;
        g.children[0].rotation.set(rnd(r.I, r.J, 3) * 6, rnd(r.I, r.J, 4) * 6, 0);
      }
      g.visible = true;
    });
  }

  // ---------------------------------------------------------------- per frame
  function update(px: number, pz: number, t: number, dt: number) {
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
    const key = `${ci}:${cj}`;
    if (key !== lastCell) {
      lastCell = key;
      rebuild(ci, cj);
    }

    // floor/ceiling stay under the visitor; texture offset keeps the world fixed
    floor.position.set(px, 0, pz);
    ceil.position.set(px, WALL_H, pz);
    floorTex.offset.set(px / CELL, -pz / CELL);

    // nearest panels get real (flickering) light
    panelSpots.sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    panelLights.forEach((l, k) => {
      const s = panelSpots[k];
      if (!s) return (l.intensity = 0);
      l.position.set(s.x, WALL_H - 0.3, s.z);
      const broken = s.seed < 0.25; // some tubes are dying
      const flicker = broken ? (Math.sin(t * 23 + s.seed * 50) > 0.6 || Math.random() < 0.04 ? 0.15 : 1) : 1;
      l.intensity = 9 * flicker;
    });

    // cubes float and turn; a spun cube whirls then settles
    cubes.forEach((g, k) => {
      if (!g.visible) return;
      const m = g.children[0];
      g.userData.spin *= 0.97;
      m.rotation.y += dt * (0.25 + g.userData.spin);
      m.rotation.x += dt * (0.12 + g.userData.spin * 0.6);
      m.position.y = Math.sin(t * 1.1 + k) * 0.12;
    });

    // weather moves with the visitor
    if (precip && weather) {
      precip.position.set(px, 0, pz);
      const a = (precip.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
      const drift = Math.min(weather.wind / 40, 1);
      for (let k = 0; k < a.length; k += 3) {
        a[k + 1] -= precipSpeed * dt;
        a[k] -= drift * dt * (weather.kind === "snow" ? 0.6 : 2);
        if (weather.kind === "snow") a[k] += Math.sin(t + k) * dt * 0.2;
        if (a[k + 1] < 0) {
          a[k + 1] = WALL_H;
          a[k] = (Math.random() - 0.5) * 24;
          a[k + 2] = (Math.random() - 0.5) * 24;
        }
      }
      precip.geometry.getAttribute("position").needsUpdate = true;
    }
    if (weather?.kind === "storm" && t * 1000 > nextBolt) {
      flash = 1;
      nextBolt = t * 1000 + 4000 + Math.random() * 8000;
    }
    flash = Math.max(0, flash - dt * 2.5);
    flashLight.intensity = flash * 2.5 * (Math.random() < 0.3 ? 0.4 : 1);
  }

  function nearestCube(px: number, pz: number) {
    let best: { mesh: THREE.Object3D; dist: number } | null = null;
    for (const g of cubes) {
      if (!g.visible) continue;
      const d = Math.hypot(g.position.x - px, g.position.z - pz);
      if (!best || d < best.dist) best = { mesh: g, dist: d };
    }
    return best;
  }

  function spinCube(g: THREE.Object3D) {
    g.userData.spin = 9;
  }

  return { scene, update, setWeather, nearestCube, spinCube };
}

export { roomOf };
