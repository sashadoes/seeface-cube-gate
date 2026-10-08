// Frees graphics memory of things that leave the world.
// The labyrinth streams rooms, props, bubbles, players… in and out as you walk.
// three.js keeps every geometry, material and texture on the graphics chip until
// it is disposed, so without this a long visit slowly fills the GPU until the
// tab stutters or crashes.
//   release(obj)  → takes obj out of the scene and queues it
//   sweep(scene)  → every couple of seconds: disposes the queued geometries and
//                   textures (the real GPU memory), except anything still used
//                   by something in the scene (shared or cached ones stay alive).
// Materials are left alone on purpose: they hold almost no GPU memory, their
// shader programs are shared, and freeing them would make three.js recompile a
// shader the next time a similar thing appears (a visible stutter).
import * as THREE from "three";

const queued = new Set<THREE.Object3D>();

/** take an object out of the world and free its GPU memory soon */
export function release(obj: THREE.Object3D | null | undefined) {
  if (!obj) return;
  obj.removeFromParent();
  queued.add(obj);
}

/** release every child of a group (instead of group.clear()) */
export function releaseChildren(group: THREE.Object3D) {
  for (const c of [...group.children]) release(c);
}

type Res = THREE.BufferGeometry | THREE.Texture;

function texturesOf(m: THREE.Material, out: Set<Res>) {
  const rec = m as unknown as Record<string, unknown>;
  for (const k in rec) {
    const v = rec[k] as THREE.Texture | undefined;
    if (v && (v as THREE.Texture).isTexture) out.add(v);
  }
  const u = (m as THREE.ShaderMaterial).uniforms;
  if (u) for (const k in u) if ((u[k]?.value as THREE.Texture)?.isTexture) out.add(u[k].value);
}

function collect(root: THREE.Object3D, out: Set<Res>) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) out.add(m.geometry);
    const mats = m.material;
    if (!mats) return;
    for (const mat of Array.isArray(mats) ? mats : [mats]) texturesOf(mat, out);
  });
}

let next = 0;
/** call every frame; does real work only every 2 s and only when something was released */
export function sweep(scene: THREE.Scene) {
  const now = performance.now();
  if (now < next || !queued.size) return;
  next = now + 2000;
  const gone = new Set<Res>();
  for (const o of queued) if (!o.parent) collect(o, gone); // re-added since? then it's still alive
  queued.clear();
  if (!gone.size) return;
  const used = new Set<Res>();
  collect(scene, used);
  for (const r of gone) if (!used.has(r)) r.dispose();
}
