// Blueprint → a three.js room. The same builder serves the chamber preview, the
// "Enter my room" walk and the public room page, so what the artist sees is what
// visitors get. Images arrive asynchronously (they're private blob URLs), so the
// room is built at once with placeholders and textures drop in as they load.
import * as THREE from "three";
import type { Blueprint } from "../types";
import { ARCHETYPES, type Floor, type Shell } from "./archetypes";
import { LIBRARY, makeKit } from "./objects";
import { LIGHTING, rng, skyTexture, surfacePreset } from "./presets";

/** asset id → a URL the browser can load (blob: for private ones) */
export type Resolve = (assetId: string) => Promise<string | null>;

export type Room = {
  group: THREE.Group;
  shell: Shell;
  fog: THREE.FogExp2;
  background: THREE.Color;
  exposure: number;
  update: (t: number) => void;
  dispose: () => void;
};

const loader = new THREE.TextureLoader();
const texCache = new Map<string, Promise<THREE.Texture | null>>();
function image(id: string, resolve: Resolve) {
  if (!texCache.has(id)) {
    texCache.set(
      id,
      resolve(id).then((url) =>
        url
          ? loader.loadAsync(url).then((t) => {
              t.colorSpace = THREE.SRGBColorSpace;
              t.anisotropy = 4;
              return t;
            }, () => null)
          : null
      )
    );
  }
  return texCache.get(id)!;
}

function surfaceMaterial(value: string, tint: string, resolve: Resolve, onReady: () => void) {
  const preset = surfacePreset(value);
  if (preset) {
    const map = preset.map.clone();
    map.needsUpdate = true;
    map.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({
      color: tint,
      map,
      roughness: preset.roughness,
      metalness: preset.metalness,
      ...(preset.emissive ? { emissive: tint, emissiveMap: map, emissiveIntensity: 0.9 } : {}),
    });
  }
  // an uploaded image as the surface
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85, metalness: 0 });
  image(value, resolve).then((t) => {
    if (!t) return;
    const tt = t.clone();
    tt.wrapS = tt.wrapT = THREE.RepeatWrapping;
    tt.repeat.set(0.25, 0.25);
    tt.needsUpdate = true;
    mat.map = tt;
    mat.needsUpdate = true;
    onReady();
  });
  return mat;
}

/** placement of library objects inside the walkable floor */
function spots(floor: Floor, placement: string, n: number, r: () => number): [number, number][] {
  const half = floor.kind === "rect" ? [floor.w / 2 - 1, floor.d / 2 - 1] : [floor.r - 1, floor.r - 1];
  const inside = (x: number, z: number) => (floor.kind === "rect" ? Math.abs(x) <= half[0] && Math.abs(z) <= half[1] : Math.hypot(x, z) <= floor.r - 1);
  const out: [number, number][] = [];
  if (placement === "ring" || placement === "center") {
    const rad = placement === "center" ? Math.min(1.2 + n * 0.25, 3.5) : Math.min(half[0], half[1]) * 0.6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push(n === 1 && placement === "center" ? [0, 0] : [Math.sin(a) * rad, Math.cos(a) * rad]);
    }
    return out;
  }
  if (placement === "walls") {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      if (floor.kind === "circle") {
        const a = t * Math.PI * 2;
        out.push([Math.sin(a) * (floor.r - 1.2), Math.cos(a) * (floor.r - 1.2)]);
      } else {
        // walk the perimeter
        const per = 2 * (half[0] + half[1]) * 2;
        let s = t * per;
        const w = half[0] * 2,
          d = half[1] * 2;
        if (s < w) out.push([-half[0] + s, -half[1]]);
        else if ((s -= w) < d) out.push([half[0], -half[1] + s]);
        else if ((s -= d) < w) out.push([half[0] - s, half[1]]);
        else out.push([-half[0], half[1] - (s - w)]);
      }
    }
    return out;
  }
  for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
    const x = (r() * 2 - 1) * half[0],
      z = (r() * 2 - 1) * half[1];
    if (!inside(x, z) || Math.hypot(x, z) < 1.5) continue;
    if (out.some(([a, b]) => Math.hypot(a - x, b - z) < 1.4)) continue;
    out.push([x, z]);
    i++;
  }
  return out;
}

/** a framed image with an optional caption plaque */
function poster(tex: Promise<THREE.Texture | null>, size: number, caption: string, frameMat: THREE.Material, onReady: () => void) {
  const g = new THREE.Group();
  const pic = new THREE.MeshStandardMaterial({ color: "#222", roughness: 0.6 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(size, size), pic);
  face.position.z = 0.045;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(size + 0.16, size + 0.16, 0.08), frameMat);
  g.add(frame, face);
  tex.then((t) => {
    if (!t) return;
    const img = t.image as { width: number; height: number };
    const aspect = img.width / img.height;
    const [w, h] = aspect >= 1 ? [size, size / aspect] : [size * aspect, size];
    face.scale.set(w / size, h / size, 1);
    frame.scale.set((w + 0.16) / (size + 0.16), (h + 0.16) / (size + 0.16), 1);
    pic.map = t;
    pic.color.set("#ffffff");
    pic.emissive.set("#ffffff");
    pic.emissiveMap = t;
    pic.emissiveIntensity = 0.35; // posters read in the dark
    pic.needsUpdate = true;
    onReady();
  });
  if (caption) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 64;
    const x = c.getContext("2d")!;
    x.fillStyle = "#0b0b0d";
    x.fillRect(0, 0, 512, 64);
    x.fillStyle = "#e9e4da";
    x.font = "italic 30px 'Times New Roman', serif";
    x.textAlign = "center";
    x.fillText(caption.slice(0, 40), 256, 42);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(size, 1.6), Math.min(size, 1.6) / 8), new THREE.MeshBasicMaterial({ map: t }));
    plaque.position.set(0, -size / 2 - 0.25, 0.05);
    g.add(plaque);
  }
  return g;
}

export function buildRoom(bp: Blueprint, resolve: Resolve, onChange: () => void = () => {}, seed = "room"): Room {
  const archetype = bp.archetype && ARCHETYPES[bp.archetype] ? bp.archetype : "void";
  const rig = LIGHTING[bp.lighting.preset] ?? LIGHTING.dim;
  const k = Math.max(0.05, bp.lighting.intensity) * 2; // 0.5 = the preset as designed
  const r = rng(`${seed}:${archetype}`);
  const kit = makeKit(bp.palette, r, bp.lighting.preset === "neon");
  const wall = surfaceMaterial(bp.surfaces.walls, bp.palette.secondary, resolve, onChange);
  const floor = surfaceMaterial(bp.surfaces.floor, bp.palette.primary, resolve, onChange);
  const shell = ARCHETYPES[archetype](kit, { wall, floor });
  const group = shell.group;
  const updates: ((t: number) => void)[] = shell.update ? [shell.update] : [];

  // sky: a big sphere around everything (seen in open archetypes, and through fog)
  const skyTex = bp.skybox.asset_id ? null : skyTexture(bp.skybox.preset, bp.palette);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, color: "#ffffff" });
  if (bp.skybox.asset_id)
    image(bp.skybox.asset_id, resolve).then((t) => {
      if (t) {
        skyMat.map = t;
        skyMat.needsUpdate = true;
        onChange();
      }
    });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), skyMat);
  if (shell.open) group.add(sky);

  // lights
  const ambient = new THREE.AmbientLight(bp.palette.secondary, rig.ambient * k);
  const hemi = new THREE.HemisphereLight(rig.keyColor, bp.palette.primary, rig.hemi * k);
  const key = new THREE.DirectionalLight(rig.keyColor, rig.key * k);
  key.position.set(8, 20, 10);
  group.add(ambient, hemi, key);
  const pointColor = { accent: bp.palette.accent, secondary: bp.palette.secondary, warm: "#ffb36b", cool: "#9fb8ff", white: "#ffffff" }[rig.pointColor];
  const points = shell.lights.map((p, i) => {
    const l = new THREE.PointLight(i % 2 && rig.pointColor === "accent" ? bp.palette.secondary : pointColor, rig.points * k * 12, 22, 1.6);
    l.position.copy(p);
    group.add(l);
    return l;
  });
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (rig.flicker || rig.strobe) {
    updates.push((t) => {
      points.forEach((l, i) => {
        const base = rig.points * k * 12;
        if (rig.strobe && !calm) l.intensity = base * (Math.sin(t * 9 + i * 2) > 0.85 ? 1.6 : 0.15); // a soft strobe, never a hard flash train
        else l.intensity = base * (1 - rig.flicker / 2 + Math.sin(t * 11 + i * 3.1) * Math.sin(t * 7.3 + i) * rig.flicker);
      });
    });
  }

  // posters
  for (const p of bp.posters) {
    const slot = shell.posterSlots[p.slot - 1];
    if (!slot) continue;
    const frame = poster(image(p.asset_id, resolve), slot.size, p.caption, kit.dark, onChange);
    frame.position.copy(slot.pos);
    frame.rotation.y = slot.rotY;
    group.add(frame);
  }

  // library objects
  for (const o of bp.objects) {
    const make = LIBRARY[o.type];
    if (!make) continue;
    for (const [x, z] of spots(shell.floor, o.placement, Math.min(20, o.count), r)) {
      const b = make(kit);
      b.obj.position.set(x, 0, z);
      b.obj.rotation.y = o.placement === "ring" || o.placement === "center" ? Math.atan2(-x, -z) : r() * Math.PI * 2;
      group.add(b.obj);
      if (b.update) updates.push(b.update);
    }
  }

  const fog = new THREE.FogExp2(bp.palette.fog, 0.004 + bp.fog.density * (shell.open ? 0.06 : 0.09));
  return {
    group,
    shell,
    fog,
    background: new THREE.Color(bp.palette.fog),
    exposure: rig.exposure,
    update: (t) => updates.forEach((u) => u(t)),
    dispose: () => {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((mat) => {
          // cached upload textures live on; preset clones and canvases go
          for (const key of ["map", "emissiveMap"] as const) {
            const t = (mat as THREE.MeshStandardMaterial)[key];
            if (t && !(t.image instanceof HTMLImageElement || (typeof ImageBitmap !== "undefined" && t.image instanceof ImageBitmap))) t.dispose();
          }
          mat.dispose();
        });
      });
    },
  };
}
