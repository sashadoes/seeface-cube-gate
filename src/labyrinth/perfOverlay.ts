// Perf overlay (open the labyrinth with ?perf; not for players): fps, frame
// time, draw calls, textures + their estimated graphics memory, JS heap
// (Chrome only), the tier, sharpness and the locations loaded. Plain DOM,
// refreshed twice a second, so it doesn't disturb what it measures.
import * as THREE from "three";

export type PerfSample = {
  fps: number;
  worstMs: number;
  calls: number;
  triangles: number;
  tier: string;
  fpsCap: number;
  pixelRatio: number;
  scale: number;
  idle: boolean;
  zones: { kinds: string[]; resident: number; parked: number };
};

function textureMB(scene: THREE.Scene) {
  const seen = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture) seen.add(v as THREE.Texture);
    }
  });
  let bytes = 0;
  for (const t of seen) {
    const img = t.image as { width?: number; height?: number } | undefined;
    if (img?.width && img.height) bytes += img.width * img.height * 4 * (t.generateMipmaps ? 1.33 : 1);
  }
  return { count: seen.size, mb: bytes / 1048576 };
}

export function createPerfOverlay(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const box = document.createElement("pre");
  box.className = "lab-perf";
  Object.assign(box.style, {
    position: "fixed",
    left: "8px",
    bottom: "120px",
    zIndex: "2000",
    margin: "0",
    padding: "6px 8px",
    font: "11px/1.35 ui-monospace, Menlo, monospace",
    color: "#cfe",
    background: "rgba(0,0,0,0.72)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "6px",
    pointerEvents: "none",
    whiteSpace: "pre",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(box);
  let tex = { count: 0, mb: 0 };
  let texAt = 0;
  return {
    show(s: PerfSample) {
      const now = performance.now();
      if (now - texAt > 2000) {
        texAt = now;
        tex = textureMB(scene);
      }
      const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
      const gpu = renderer.info.memory;
      box.textContent = [
        `fps ${s.fps} / ${s.fpsCap}${s.idle ? " (idle)" : ""}   worst ${s.worstMs} ms`,
        `draw calls ${s.calls}   tris ${(s.triangles / 1000).toFixed(0)}k`,
        `tier ${s.tier}   px ${s.pixelRatio.toFixed(2)} (×${s.scale.toFixed(2)})`,
        `gpu textures ${gpu.textures}   geometries ${gpu.geometries}`,
        `textures in scene ${tex.count} ≈ ${tex.mb.toFixed(1)} MB (incl. freed)`,
        heap ? `js heap ${(heap / 1048576).toFixed(1)} MB` : "js heap n/a (not Chrome)",
        `zones ${s.zones.kinds.join(", ") || "—"}`,
        `zone textures on GPU ${s.zones.resident}, freed ${s.zones.parked}`,
      ].join("\n");
    },
    dispose() {
      box.remove();
    },
  };
}
