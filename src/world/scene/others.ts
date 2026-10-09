// Other people: their blobs, names floating over their heads (with 🎙 when they talk, ✋ when a
// hand is up), text bubbles, the speaking ring pulsing with their real voice level, and soft
// bumps ("boop") when you walk into each other. Never blocks a path.
import * as THREE from "three";
import type { PeerView } from "../../../shared/world/protocol.ts";
import { createBlob, type Blob, type BlobKind } from "../avatar/blob.ts";
import type { Body } from "../player/controller.ts";

type Other = { view: PeerView; blob: Blob; label: THREE.Sprite; labelKey: string; canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; x: number; y: number; z: number; f: number; vy: number; lastY: number; bumpT: number };

export function createOthers(scene: THREE.Scene, fog: { color: THREE.Color; density: number; cam: THREE.Vector3 }) {
  const others = new Map<string, Other>();
  const ray = new THREE.Raycaster();

  function labelFor(o: Other, extra: { muted: boolean; followed: boolean }) {
    const v = o.view;
    const bubble = v.bubble && Date.now() - v.bubble.at < 6500 ? v.bubble.text : "";
    const key = `${v.name}|${v.talking}|${v.hand}|${v.role}|${bubble}|${extra.muted}|${extra.followed}`;
    if (key === o.labelKey) return;
    o.labelKey = key;
    const c = o.canvas, g = c.getContext("2d")!;
    g.clearRect(0, 0, c.width, c.height);
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (bubble) {
      g.font = "500 30px 'Helvetica Neue', Arial, sans-serif";
      const w = Math.min(500, g.measureText(bubble).width + 40);
      g.fillStyle = "rgba(244,240,252,0.94)";
      roundRect(g, 256 - w / 2, 8, w, 58, 22);
      g.fill();
      g.fillStyle = "#151022";
      g.fillText(bubble.length > 34 ? bubble.slice(0, 33) + "…" : bubble, 256, 38);
    }
    const tag = `${v.talking === 2 ? "🤫 " : v.talking ? "🎙 " : ""}${v.hand ? "✋ " : ""}${v.name}${v.role === "host" || v.role === "owner" ? " ★" : ""}${extra.muted ? " (muted)" : ""}${extra.followed ? " ·♥" : ""}`;
    g.font = "600 30px 'Helvetica Neue', Arial, sans-serif";
    g.shadowColor = "rgba(0,0,0,0.9)";
    g.shadowBlur = 8;
    g.fillStyle = v.talking ? "#ffd1ef" : "#ece8f6";
    g.fillText(tag, 256, 104);
    g.shadowBlur = 0;
    o.tex.needsUpdate = true;
  }

  return {
    update(peers: PeerView[], gone: string[]) {
      for (const id of gone) {
        const o = others.get(id);
        if (!o) continue;
        scene.remove(o.blob.group, o.label);
        o.blob.dispose();
        o.tex.dispose();
        others.delete(id);
      }
      for (const v of peers) {
        let o = others.get(v.id);
        if (!o) {
          const blob = createBlob(v.blob as BlobKind, fog);
          const canvas = document.createElement("canvas");
          canvas.width = 512;
          canvas.height = 128;
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false, transparent: true }));
          label.scale.set(2.6, 0.65, 1);
          label.renderOrder = 3;
          scene.add(blob.group, label);
          o = { view: v, blob, label, labelKey: "", canvas, tex, x: v.x, y: v.y, z: v.z, f: v.f, vy: 0, lastY: v.y, bumpT: 0 };
          others.set(v.id, o);
        }
        o.view = v;
      }
    },
    /** per frame: smooth movement, squash from their vertical motion, voice rings, labels, bumps */
    animate(t: number, dt: number, levelOf: (id: string) => number, me: Body, flags: { muted: Set<string>; follows: Set<string> }, onBump: (id: string) => void) {
      const k = Math.min(1, dt * 10);
      for (const o of others.values()) {
        const v = o.view;
        const jump = Math.hypot(v.x - o.x, v.z - o.z);
        if (jump > 12) ((o.x = v.x), (o.z = v.z), (o.y = v.y)); // they fell somewhere: snap
        o.x += (v.x - o.x) * k;
        o.y += (v.y - o.y) * k;
        o.z += (v.z - o.z) * k;
        let d = v.f - o.f;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        o.f += d * k;
        const vy = (o.y - o.lastY) / Math.max(dt, 1e-3);
        o.lastY = o.y;
        if (o.vy < -3 && vy > -0.5 && o.y < 0.05) o.blob.wobble(0.8);
        o.vy = vy;
        o.blob.group.position.set(o.x, o.y, o.z);
        o.blob.group.rotation.y = o.f;
        const level = flags.muted.has(v.id) ? 0 : levelOf(v.id);
        o.blob.animate(t, dt, Math.max(-0.4, Math.min(0.4, vy / 30)), level, 0);
        o.blob.setSpeaking(v.talking ? Math.max(0.15, level) : 0);
        o.label.position.set(o.x, o.y + 1.75, o.z);
        labelFor(o, { muted: flags.muted.has(v.id), followed: flags.follows.has(v.id) });

        // bumping: soft push for me, a wobble for both, a boop
        const dx = me.x - o.x, dz = me.z - o.z, dist = Math.hypot(dx, dz);
        o.bumpT = Math.max(0, o.bumpT - dt);
        if (dist < 0.85 && dist > 1e-3 && Math.abs(me.y - o.y) < 0.9) {
          const push = (0.85 - dist) / dist;
          me.x += dx * push * 0.6;
          me.z += dz * push * 0.6;
          if (o.bumpT <= 0) {
            o.bumpT = 0.6;
            me.vx += (dx / dist) * 3.5;
            me.vz += (dz / dist) * 3.5;
            if (me.onGround) ((me.vy = 3.2), (me.onGround = false));
            me.squash = -0.35;
            o.blob.wobble(0.9);
            onBump(v.id);
          }
        }
      }
    },
    /** tap → which person is under the finger */
    pick(ndc: { x: number; y: number }, camera: THREE.Camera): string | null {
      ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
      let best: string | null = null, bestD = Infinity;
      for (const [id, o] of others) {
        const c = new THREE.Vector3(o.x, o.y + 0.5, o.z);
        const dist = ray.ray.distanceToPoint(c);
        const along = ray.ray.origin.distanceTo(c);
        if (dist < 0.75 && along < bestD) ((best = id), (bestD = along));
      }
      return best;
    },
    view: (id: string) => others.get(id)?.view ?? null,
    poses() {
      const m = new Map<string, { x: number; y: number; z: number; room: string | null; talking: 0 | 1 | 2 }>();
      for (const [id, o] of others) m.set(id, { x: o.x, y: o.y, z: o.z, room: o.view.room, talking: o.view.talking });
      return m;
    },
    count: () => others.size,
  };
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
export type Others = ReturnType<typeof createOthers>;
