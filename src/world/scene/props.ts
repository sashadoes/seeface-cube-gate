// Room props: each curated room's theme pack (placed the same for everyone) and the decor owners
// buy for their rooms (everyone sees it). One instanced mesh per kind. Balls can be kicked:
// locally simulated and drifting home after a while (so everyone's rooms converge without the
// server simulating physics).
import * as THREE from "three";
import { hash, roomGeometry, wallE, wallS, cellOf, type RoomPlace } from "../../../shared/world/maze.ts";
import { roomById } from "../../../shared/world/rooms.ts";

export type Decor = { kind: string; x: number; z: number; rot: number };
const KINDS = ["cushion", "lamp", "plant", "speaker", "books", "candle", "tv", "ball"] as const;
type Kind = (typeof KINDS)[number];
const MAX = 160;

function geometryFor(k: Kind) {
  switch (k) {
    case "cushion":
      return new THREE.SphereGeometry(0.55, 14, 8).scale(1, 0.38, 1).translate(0, 0.2, 0);
    case "lamp": {
      const g = new THREE.CylinderGeometry(0.08, 0.18, 1.3, 8).translate(0, 0.65, 0);
      return g;
    }
    case "plant":
      return new THREE.ConeGeometry(0.4, 1.4, 7).translate(0, 0.7, 0);
    case "speaker":
      return new THREE.BoxGeometry(0.7, 1.3, 0.6).translate(0, 0.65, 0);
    case "books":
      return new THREE.BoxGeometry(0.5, 0.9, 0.4).translate(0, 0.45, 0);
    case "candle":
      return new THREE.CylinderGeometry(0.06, 0.07, 0.35, 6).translate(0, 0.17, 0);
    case "tv":
      return new THREE.BoxGeometry(0.9, 0.7, 0.5).translate(0, 0.55, 0);
    case "ball":
      return new THREE.SphereGeometry(0.35, 14, 10).translate(0, 0.35, 0);
  }
}
const COLORS: Record<Kind, number> = { cushion: 0x7a4f9a, lamp: 0xffb070, plant: 0x2f6b4a, speaker: 0x22202c, books: 0x8a5a3a, candle: 0xfff0c8, tv: 0x6cf0e0, ball: 0xff6f91 };
const GLOW: Partial<Record<Kind, number>> = { lamp: 0.9, candle: 1.2, tv: 0.8 };

type Ball = { home: THREE.Vector3; pos: THREE.Vector3; vel: THREE.Vector3; idle: number; slot: number };

export function createProps(scene: THREE.Scene) {
  const meshes = {} as Record<Kind, THREE.InstancedMesh>;
  KINDS.forEach((k) => {
    {
      const mat = new THREE.MeshLambertMaterial({ color: COLORS[k], emissive: new THREE.Color(COLORS[k]).multiplyScalar(GLOW[k] ?? 0) });
      const m = new THREE.InstancedMesh(geometryFor(k), mat, MAX);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
      meshes[k] = m;
    }
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  let balls: Ball[] = [];
  let placed: (Decor & { room: string; index: number })[] = [];

  return {
    /** rebuild from the rooms near you: curated theme props + owned decor (from the server) */
    set(rooms: RoomPlace[], owned: Map<string, Decor[]>) {
      const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
      const oldBalls = new Map(balls.map((b) => [`${b.home.x.toFixed(2)},${b.home.z.toFixed(2)}`, b]));
      balls = [];
      placed = [];
      const put = (d: Decor, room: string, index: number) => {
        const k = d.kind as Kind;
        if (!meshes[k] || counts[k] >= MAX) return;
        const slot = counts[k]++;
        placed.push({ ...d, room, index });
        if (k === "ball") {
          const key = `${d.x.toFixed(2)},${d.z.toFixed(2)}`;
          const prev = oldBalls.get(key);
          balls.push(prev ? { ...prev, slot } : { home: new THREE.Vector3(d.x, 0, d.z), pos: new THREE.Vector3(d.x, 0, d.z), vel: new THREE.Vector3(), idle: 0, slot });
        }
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, d.rot);
        m4.compose(p.set(d.x, 0, d.z), q, one);
        meshes[k].setMatrixAt(slot, m4);
      };
      for (const r of rooms) {
        const g = roomGeometry(r);
        const own = owned.get(r.id);
        if (own) own.forEach((d, i) => put(d, r.id, i));
        else {
          const def = roomById(r.id);
          if (!def) continue;
          // theme props around the room's edge, the same for everyone
          def.theme.props.forEach((kind, i) => {
            const a = hash(i, r.rect.x, r.rect.z) * Math.PI * 2;
            const w = (g.bounds.x1 - g.bounds.x0) / 2 - 1.2, h = (g.bounds.z1 - g.bounds.z0) / 2 - 1.2;
            put({ kind, x: g.center.x + Math.cos(a) * w * 0.85, z: g.center.z + Math.sin(a) * h * 0.85, rot: a }, r.id, -1);
          });
        }
      }
      for (const k of KINDS) {
        meshes[k].count = counts[k];
        meshes[k].instanceMatrix.needsUpdate = true;
      }
    },
    /** kick balls you walk into; they roll, bounce off walls and drift home after 8 s */
    update(dt: number, me: { x: number; z: number; vx: number; vz: number }, onKick: () => void) {
      if (!balls.length) return;
      for (const b of balls) {
        const dx = b.pos.x - me.x, dz = b.pos.z - me.z, d = Math.hypot(dx, dz);
        if (d < 0.8 && d > 1e-3) {
          const sp = Math.max(3, Math.hypot(me.vx, me.vz) * 1.4);
          b.vel.set((dx / d) * sp, 0, (dz / d) * sp);
          b.idle = 0;
          onKick();
        }
        b.idle += dt;
        if (b.idle > 8) b.vel.set((b.home.x - b.pos.x) * 0.8, 0, (b.home.z - b.pos.z) * 0.8);
        const nx = b.pos.x + b.vel.x * dt, nz = b.pos.z + b.vel.z * dt;
        const [ci, cj] = cellOf(b.pos.x, b.pos.z), [ni, nj] = cellOf(nx, nz);
        if (ni !== ci && wallE(Math.min(ci, ni), cj).wall) b.vel.x *= -0.7;
        else b.pos.x = nx;
        if (nj !== cj && wallS(ci, Math.min(cj, nj)).wall) b.vel.z *= -0.7;
        else b.pos.z = nz;
        b.vel.multiplyScalar(Math.max(0, 1 - dt * 1.2));
        m4.compose(p.set(b.pos.x, 0, b.pos.z), q.identity(), one);
        meshes.ball.setMatrixAt(b.slot, m4);
      }
      meshes.ball.instanceMatrix.needsUpdate = true;
    },
    /** owner editing: the decor item nearest to a floor point in a room */
    nearest(room: string, x: number, z: number) {
      let best: (typeof placed)[number] | null = null, bd = 1.6;
      for (const d of placed) {
        if (d.room !== room || d.index < 0) continue;
        const dist = Math.hypot(d.x - x, d.z - z);
        if (dist < bd) ((best = d), (bd = dist));
      }
      return best;
    },
  };
}
export type Props = ReturnType<typeof createProps>;
