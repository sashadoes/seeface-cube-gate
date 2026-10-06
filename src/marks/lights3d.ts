// WebGL light rig for /marks (three.js): volumetric spotlights placed on the
// viewer's side, aimed at the cube; dust glowing inside the beams; a hot glow
// where they land; and the visitor's real weather (rain, snow, storm…).
// The canvas sits above the cube and below the fog/UI, additive only, so it
// brightens what it touches like real light.
import * as THREE from "three";
import type { Weather } from "./weather";

type Spot = {
  mesh: THREE.Mesh; // screen-space shaft quad
  mat: THREE.ShaderMaterial;
  source: THREE.Vector3;
  aim: THREE.Vector3; // current aim point (world)
  search: THREE.Vector3 | null; // when wandering off the cube
  searchUntil: number;
  phase: number;
  radius: number; // cone radius at the target
};

// Light shafts are drawn as soft screen-space quads from the lamp (off-screen,
// on the viewer's side) to the cube. Seen along the beam, that is how real
// volumetric light reads: feathered edges, falloff and drifting haze.
const SHAFT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHAFT_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vUv; // x: across the beam (0..1), y: from lamp (0) to past the target (1)
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    float d = abs(vUv.x - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.15, 1.0, d);   // feathered sides
    float core = 1.0 - smoothstep(0.0, 0.45, d);   // brighter core
    float along = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y)); // fade in, fade past the cube
    float haze = 0.55 + 0.45 * noise(vec2(vUv.x * 3.0, vUv.y * 7.0 - uTime * 0.35))
                      * (0.7 + 0.3 * noise(vec2(vUv.x * 9.0 + uTime * 0.2, vUv.y * 2.0)));
    float a = uIntensity * (edge * 0.55 + core * 0.45) * along * haze;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let shaftScene: THREE.Scene;
let shaftCam: THREE.OrthographicCamera;
let spots: Spot[] = [];
let hotspot: THREE.Sprite;
let dust: THREE.Points;
let dustBase: Float32Array;
let weatherFx: THREE.Points | THREE.LineSegments | null = null;
let weatherSpeed: Float32Array | null = null;
let weather: Weather | null = null;
let flash = 0; // lightning
let nextBolt = 0;
const cubeWorld = new THREE.Vector3();
const tmpV = new THREE.Vector3();
let canvas: HTMLCanvasElement;
let baseColor = new THREE.Color(1, 0.95, 0.85);

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const SHAFT_POWER = 1.15; // overall brightness of the light shafts

function softTexture(size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Screen pixel → world point on the z=0 plane (where the cube is). */
function screenToWorld(x: number, y: number, out: THREE.Vector3) {
  out.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1, 0.5).unproject(camera);
  out.sub(camera.position).normalize();
  const t = -camera.position.z / out.z;
  return out.multiplyScalar(t).add(camera.position);
}

/** World point → screen pixel. */
function worldToScreen(p: THREE.Vector3) {
  tmpV.copy(p).project(camera);
  return { x: ((tmpV.x + 1) / 2) * window.innerWidth, y: ((1 - tmpV.y) / 2) * window.innerHeight };
}

function makeSpot(source: THREE.Vector3, radius: number, phase: number): Spot {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    uniforms: { uColor: { value: baseColor.clone() }, uIntensity: { value: 0.5 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  shaftScene.add(mesh);
  return { mesh, mat, source, aim: new THREE.Vector3(), search: null, searchUntil: 0, phase, radius };
}

/** Update a shaft quad: lamp (narrow, off-screen) → aim point (wide), extended a little past it. */
function layoutShaft(s: Spot) {
  const W = window.innerWidth, H = window.innerHeight;
  const a = worldToScreen(s.aim);
  let l = worldToScreen(s.source);
  // keep the lamp end at a sane distance outside the screen
  const dx = l.x - a.x, dy = l.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const maxD = Math.hypot(W, H) * 1.1;
  if (dist > maxD) l = { x: a.x + (dx / dist) * maxD, y: a.y + (dy / dist) * maxD };
  // beam width at the target, from the cone radius projected to pixels
  const edge = worldToScreen(tmpV.copy(s.aim).add(new THREE.Vector3(s.radius, 0, 0)));
  // close to the viewer the beam is wide; it focuses down onto the cube
  const wFar = Math.abs(edge.x - a.x) * 0.72;
  const wNear = wFar * 2.6;
  const ux = (a.x - l.x) / Math.hypot(a.x - l.x, a.y - l.y), uy = (a.y - l.y) / Math.hypot(a.x - l.x, a.y - l.y);
  const px = -uy, py = ux; // perpendicular
  const end = { x: a.x + ux * wFar * 0.6, y: a.y + uy * wFar * 0.6 }; // a little past the cube
  const pos = s.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  pos.setXYZ(0, l.x - px * wNear, l.y - py * wNear, 0);
  pos.setXYZ(1, l.x + px * wNear, l.y + py * wNear, 0);
  pos.setXYZ(2, end.x - px * wFar, end.y - py * wFar, 0);
  pos.setXYZ(3, end.x + px * wFar, end.y + py * wFar, 0);
  pos.needsUpdate = true;
}

function makeDust(count: number) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand(-9, 9);
    pos[i * 3 + 1] = rand(-5, 5);
    pos[i * 3 + 2] = rand(-1, 7);
  }
  dustBase = pos.slice();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const mat = new THREE.PointsMaterial({
    size: 0.07,
    map: softTexture(64),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  dust = new THREE.Points(geo, mat);
  scene.add(dust);
}

/** How much light falls inside spot s at world point p (0..1). */
function spotLightAt(s: Spot, p: THREE.Vector3) {
  const axis = tmpV.copy(s.aim).sub(s.source);
  const len = axis.length();
  axis.divideScalar(len);
  const rel = p.clone().sub(s.source);
  const t = rel.dot(axis);
  if (t <= 0) return 0;
  const radius = 0.06 + (s.radius - 0.06) * (t / len);
  const dist = rel.sub(axis.multiplyScalar(t)).length();
  return Math.max(0, 1 - dist / radius);
}

// ------------------------------------------------------------- weather

function buildWeather(w: Weather) {
  const { kind, intensity, wind } = w;
  const drift = Math.min(wind / 40, 1.2);
  if (kind === "rain" || kind === "drizzle" || kind === "storm") {
    const n = Math.round(kind === "drizzle" ? 260 : 500 + intensity * 700);
    const pos = new Float32Array(n * 6);
    weatherSpeed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = rand(-10, 10), y = rand(-6, 7), z = rand(-1, 8);
      const len = kind === "drizzle" ? 0.12 : rand(0.25, 0.45);
      pos.set([x, y, z, x - drift * len * 0.6, y - len, z], i * 6);
      weatherSpeed[i] = kind === "drizzle" ? rand(5, 7) : rand(13, 19);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xbfd7ff, transparent: true, opacity: kind === "drizzle" ? 0.22 : 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    weatherFx = new THREE.LineSegments(geo, mat);
    (weatherFx.userData as { drift: number }).drift = drift;
    scene.add(weatherFx);
  } else if (kind === "snow") {
    const n = Math.round(350 + intensity * 500);
    const pos = new Float32Array(n * 3);
    weatherSpeed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set([rand(-10, 10), rand(-6, 7), rand(-1, 8)], i * 3);
      weatherSpeed[i] = rand(0.5, 1.4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.11, map: softTexture(64), color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
    weatherFx = new THREE.Points(geo, mat);
    (weatherFx.userData as { drift: number }).drift = drift;
    scene.add(weatherFx);
  }
}

function stepWeather(dt: number, now: number) {
  if (!weather) return;
  if (weatherFx && weatherSpeed) {
    const pos = weatherFx.geometry.getAttribute("position") as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    const drift = (weatherFx.userData as { drift: number }).drift;
    if (weatherFx instanceof THREE.LineSegments) {
      for (let i = 0; i < weatherSpeed.length; i++) {
        const dy = weatherSpeed[i] * dt;
        const dx = -drift * dy * 0.6;
        for (const k of [0, 3]) {
          a[i * 6 + k] += dx;
          a[i * 6 + k + 1] -= dy;
        }
        if (a[i * 6 + 4] < -6.5) {
          const x = rand(-10, 11), y = rand(6, 8);
          const len = a[i * 6 + 1] - a[i * 6 + 4];
          a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 3] = x - drift * len * 0.6; a[i * 6 + 4] = y - len;
        }
      }
    } else {
      for (let i = 0; i < weatherSpeed.length; i++) {
        a[i * 3] += (Math.sin(now / 900 + i) * 0.15 - drift * 0.5) * dt;
        a[i * 3 + 1] -= weatherSpeed[i] * dt;
        if (a[i * 3 + 1] < -6.5) {
          a[i * 3] = rand(-10, 11);
          a[i * 3 + 1] = rand(6, 8);
        }
      }
    }
    pos.needsUpdate = true;
  }
  // storm: lightning flashes now and then
  if (weather.kind === "storm") {
    if (now > nextBolt) {
      flash = 1;
      nextBolt = now + rand(4000, 11000);
      const el = document.querySelector(".marks-lightning") as HTMLElement | null;
      if (el) {
        el.classList.remove("strike");
        void el.offsetWidth;
        el.classList.add("strike");
      }
    }
  }
  flash = Math.max(0, flash - dt * 2.2);
}

// ------------------------------------------------------------- main loop

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const t = now / 1000;

  // where is the cube on screen right now?
  const cube = document.getElementById("cubeMain");
  if (cube) {
    const r = cube.getBoundingClientRect();
    screenToWorld(r.left + r.width / 2, r.top + r.height / 2, cubeWorld);
  }

  for (const s of spots) {
    // mostly on the cube, with a living wobble; sometimes it goes searching the walls
    if (!s.search && Math.random() < dt * 0.06) {
      s.search = new THREE.Vector3(rand(-7, 7), rand(-1, 4.5), 0);
      s.searchUntil = now + rand(2500, 5000);
    }
    if (s.search && now > s.searchUntil) s.search = null;
    const goal = s.search
      ? s.search
      : tmpV.set(cubeWorld.x + Math.sin(t * 0.7 + s.phase) * 0.35, cubeWorld.y + Math.cos(t * 0.5 + s.phase) * 0.25, 0);
    s.aim.lerp(goal, s.search ? dt * 0.9 : dt * 2.2);

    layoutShaft(s);
    s.mat.uniforms.uTime.value = t;
    s.mat.uniforms.uIntensity.value = (SHAFT_POWER + Math.sin(t * 1.3 + s.phase) * 0.06) * (1 + flash * 1.8);
  }

  // hot glow where the lights land on the cube
  hotspot.position.set(cubeWorld.x, cubeWorld.y, 0.2);
  const onCube = spots.filter((s) => !s.search).length / spots.length;
  const hs = 3.4 + onCube * 1.4 + Math.sin(t * 2) * 0.08;
  hotspot.scale.set(hs, hs, 1);
  (hotspot.material as THREE.SpriteMaterial).opacity = 0.18 + onCube * 0.32 + flash * 0.4;

  // dust: glows only inside a beam, drifts slowly
  const pos = dust.geometry.getAttribute("position") as THREE.BufferAttribute;
  const col = dust.geometry.getAttribute("color") as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const bx = dustBase[i * 3], by = dustBase[i * 3 + 1], bz = dustBase[i * 3 + 2];
    p.set(bx + Math.sin(t * 0.21 + i) * 0.35, by + Math.sin(t * 0.17 + i * 1.7) * 0.3, bz);
    pos.setXYZ(i, p.x, p.y, p.z);
    let light = 0;
    for (const s of spots) light = Math.max(light, spotLightAt(s, p));
    const v = 0.04 + light * 0.95 + flash * 0.3;
    col.setXYZ(i, v * baseColor.r, v * baseColor.g, v * baseColor.b);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;

  stepWeather(dt, now);
  renderer.clear();
  renderer.render(shaftScene, shaftCam);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (shaftCam) {
    shaftCam.left = 0;
    shaftCam.right = w;
    shaftCam.top = 0;
    shaftCam.bottom = h;
    shaftCam.updateProjectionMatrix();
  }
}

// ------------------------------------------------------------- api

export function initLights(host: HTMLElement) {
  canvas = document.createElement("canvas");
  canvas.className = "marks-gl";
  host.appendChild(canvas);
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  // pixel-space camera for the light shafts (y down, like the screen)
  shaftScene = new THREE.Scene();
  shaftCam = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
  resize();
  window.addEventListener("resize", resize);

  // lamps on the viewer's side: low left, low right, high centre
  spots = [
    makeSpot(new THREE.Vector3(-7.5, -4.2, 7.2), 1.25, 0),
    makeSpot(new THREE.Vector3(7.8, -3.6, 7.0), 1.15, 2.1),
    makeSpot(new THREE.Vector3(0.6, 5.6, 7.6), 1.05, 4.2),
  ];
  spots.forEach((s) => s.aim.set(0, 0, 0));

  hotspot = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: softTexture(), color: baseColor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  scene.add(hotspot);

  makeDust(window.innerWidth < 600 ? 260 : 420);
  requestAnimationFrame(frame);
}

/** Tint and weather. Day = warm white, night = cool moonlight, storm = cold blue. */
export function setWeather(w: Weather) {
  weather = w;
  baseColor = w.kind === "storm" || w.kind === "rain" ? new THREE.Color(0.75, 0.85, 1)
    : w.kind === "snow" ? new THREE.Color(0.85, 0.92, 1)
    : w.isDay ? new THREE.Color(1, 0.93, 0.78)
    : new THREE.Color(0.78, 0.86, 1);
  spots.forEach((s) => s.mat.uniforms.uColor.value.copy(baseColor));
  (hotspot.material as THREE.SpriteMaterial).color.copy(baseColor);
  if (weatherFx) {
    scene.remove(weatherFx);
    weatherFx = null;
  }
  buildWeather(w);
}

/** Light reaching a screen point on the back wall (0..1): used to reveal marks. */
export function lightAtScreen(x: number, y: number) {
  if (!spots.length) return 0;
  // project the point onto a plane slightly behind the cube (the wall)
  const p = screenToWorld(x, y, new THREE.Vector3());
  p.z = -0.5;
  let light = 0;
  for (const s of spots) {
    // extend each beam past its aim point onto the wall
    const ext = s.aim.clone().sub(s.source).multiplyScalar(1.12).add(s.source);
    const saved = s.aim.clone();
    s.aim.copy(ext);
    light = Math.max(light, spotLightAt(s, p) * 1.6);
    s.aim.copy(saved);
  }
  return Math.min(1, light + flash * 0.8);
}

export { worldToScreen };
