// Streams the labyrinth around the player: the 3×3 chunks around you become ONE instanced wall
// mesh, one floor, one mesh per toy kind, well shafts, door glows and neon signs. Rebuilt only
// when you cross into a new chunk (a few ms), never per frame.
import * as THREE from "three";
import { CELL, CH, WALL_H, WALL_T, WELL_R, chunkAt, hash, roomGeometry, wallE, wallS, type Chunk, type RoomPlace, type Well } from "../../../shared/world/maze.ts";
import { roomById } from "../../../shared/world/rooms.ts";
import { MAX_LIGHTS, MAX_ROOMS, MAX_WELLS, floorFrag, floorVert, shaftFrag, shaftVert, toyFrag, toyVert, wallFrag, wallVert } from "./shaders.ts";
import { makeSign, type Sign } from "./signs.ts";

const WRITINGS = [
  "YOU WERE HERE BEFORE", "THE ROOMS ARE LISTENING", "follow the warm light", "1994", "SAY IT OUT LOUD", "nobody is a stranger twice",
  "the radio knows your name", "DOWN IS A DIRECTION", "we hear you", "keep talking", "if you can read this, speak", "ALL VOICES WELCOME",
  "the walls have ears (we gave them ears)", "lost? listen", "hold the mic", "the night shift never ends",
];

export type RoomStatus = { people: number; speaking: string[]; transcribed: boolean; variant?: number };

export type Labyrinth = {
  group: THREE.Group;
  update: (px: number, pz: number, cam: THREE.Vector3, t: number) => void;
  /** live info per room id → door light brightness and the neon sign text */
  setRoomStatus: (id: string, s: RoomStatus) => void;
  wells: () => Well[];
  rooms: () => RoomPlace[];
  /** open a hole under (x, z) — for radio jumps and the onboarding drop; null closes it */
  portal: (at: { x: number; z: number; r: number } | null) => void;
  fog: { color: THREE.Color; density: number };
  drawInfo: () => { walls: number; chunks: string };
};

const FOG = new THREE.Color(0x07060c);

export function createLabyrinth(): Labyrinth {
  const group = new THREE.Group();
  const shared = {
    uLights: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4()) },
    uLightCol: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(0)) },
    uFogCol: { value: FOG },
    uFogDensity: { value: 0.028 },
    uCam: { value: new THREE.Vector3() },
    uPlayer: { value: new THREE.Vector3() },
    uTime: { value: 0 },
  };

  // ------------------------------------------------------------------ walls
  const writingTex = makeWritingAtlas();
  const MAX_WALLS = 7000;
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const aInfo = new THREE.InstancedBufferAttribute(new Float32Array(MAX_WALLS * 4), 4);
  const aTint = new THREE.InstancedBufferAttribute(new Float32Array(MAX_WALLS * 3), 3);
  wallGeo.setAttribute("aInfo", aInfo);
  wallGeo.setAttribute("aTint", aTint);
  const wallMat = new THREE.ShaderMaterial({ vertexShader: wallVert, fragmentShader: wallFrag, uniforms: { ...shared, uWriting: { value: writingTex } } });
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, MAX_WALLS);
  walls.frustumCulled = false; // one mesh around you; per-instance culling isn't worth it here
  group.add(walls);

  // ------------------------------------------------------------------ floor
  const floorUniforms = {
    ...shared,
    uRooms: { value: Array.from({ length: MAX_ROOMS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uRoomCol: { value: Array.from({ length: MAX_ROOMS }, () => new THREE.Color(0)) },
    uWells: { value: Array.from({ length: MAX_WELLS }, () => new THREE.Vector3(0, 0, 0)) },
  };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 220).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: floorVert, fragmentShader: floorFrag, uniforms: floorUniforms }));
  floor.frustumCulled = false;
  group.add(floor);

  // ------------------------------------------------------------------ toys (pads, vents, speed strips)
  const toyMeshes = (["pad", "vent", "speed"] as const).map((_, kind) => {
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    g.setAttribute("aTint", new THREE.InstancedBufferAttribute(new Float32Array(400 * 3), 3));
    const m = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({ vertexShader: toyVert, fragmentShader: toyFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...shared, uKind: { value: kind } } }), 400);
    m.frustumCulled = false;
    m.count = 0;
    group.add(m);
    return m;
  });

  // ------------------------------------------------------------------ wells (shaft + sign), signs over doors
  const shaftGeo = new THREE.CylinderGeometry(WELL_R, WELL_R, 130, 28, 1, true).translate(0, -65, 0);
  const shaftMat = new THREE.ShaderMaterial({ vertexShader: shaftVert, fragmentShader: shaftFrag, side: THREE.BackSide, uniforms: { uTime: shared.uTime, uColor: { value: new THREE.Color(0x4a7dff) } } });
  const shafts: THREE.Mesh[] = [];
  const signs = new Map<string, Sign>();
  const status = new Map<string, RoomStatus>();
  let visibleRooms: RoomPlace[] = [];
  let visibleWells: Well[] = [];
  let builtKey = "";
  let wallCount = 0;

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();

  function build(ccx: number, ccz: number) {
    let n = 0;
    const chunks: Chunk[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) chunks.push(chunkAt(ccx + dx, ccz + dz));
    visibleRooms = chunks.flatMap((c) => c.rooms);
    visibleWells = chunks.flatMap((c) => (c.well ? [c.well] : []));
    const toyCounts = [0, 0, 0];
    const roomTint = (c: Chunk, li: number, lj: number) => {
      if (li < 0 || lj < 0 || li >= CH || lj >= CH) return null;
      const ri = c.roomAt[lj * CH + li];
      if (ri < 0) return null;
      const def = roomById(c.rooms[ri].id);
      return def ? new THREE.Color(def.theme.wall) : new THREE.Color(0x2a2630);
    };
    const DEFAULT_TINT = new THREE.Color(0x5a5468);
    for (const c of chunks) {
      const oi = c.cx * CH, oj = c.cz * CH;
      for (let lj = 0; lj < CH; lj++)
        for (let li = 0; li < CH; li++) {
          const i = oi + li, j = oj + lj;
          for (const east of [true, false]) {
            const w = east ? wallE(i, j) : wallS(i, j);
            if (!w.wall || n >= MAX_WALLS) continue;
            const len = CELL + WALL_T;
            if (east) {
              p.set((i + 1) * CELL, WALL_H / 2, (j + 0.5) * CELL);
              s.set(WALL_T, WALL_H, len);
            } else {
              p.set((i + 0.5) * CELL, WALL_H / 2, (j + 1) * CELL);
              s.set(len, WALL_H, WALL_T);
            }
            m4.compose(p, q, s);
            walls.setMatrixAt(n, m4);
            const hseed = hash(i, j, east ? 41 : 42);
            const tint = roomTint(c, li, lj) ?? roomTint(c, east ? li + 1 : li, east ? lj : lj + 1) ?? DEFAULT_TINT;
            const writing = hseed < 0.09 ? Math.floor(hash(i, j, 43) * WRITINGS.length) : -1;
            aInfo.setXYZW(n, writing, -1, hseed > 0.93 ? 1 : 0, hseed * 10);
            aTint.setXYZ(n, tint.r, tint.g, tint.b);
            n++;
          }
          const k = lj * CH + li, toy = c.toy[k];
          if (toy) {
            const mesh = toyMeshes[toy - 1];
            const ti = toyCounts[toy - 1]++;
            if (ti < 400) {
              const size = toy === 3 ? 2.4 : 2.6;
              p.set((i + 0.5) * CELL, 0.02 + toy * 0.002, (j + 0.5) * CELL);
              // speed strips point along the open corridor
              const along = toy === 3 && wallE(i, j).wall ? 0 : Math.PI / 2;
              q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, toy === 3 ? along : 0);
              s.set(size, 1, toy === 3 ? 3.6 : size);
              m4.compose(p, q, s);
              mesh.setMatrixAt(ti, m4);
              const col = toy === 1 ? [1, 0.25, 0.85] : toy === 2 ? [0.4, 0.9, 1] : [1, 0.85, 0.25];
              (mesh.geometry.getAttribute("aTint") as THREE.InstancedBufferAttribute).setXYZ(ti, col[0], col[1], col[2]);
              q.identity();
            }
          }
        }
    }
    wallCount = n;
    walls.count = n;
    walls.instanceMatrix.needsUpdate = true;
    aInfo.needsUpdate = true;
    aTint.needsUpdate = true;
    toyMeshes.forEach((m, i) => {
      m.count = Math.min(400, toyCounts[i]);
      m.instanceMatrix.needsUpdate = true;
      m.geometry.getAttribute("aTint").needsUpdate = true;
    });

    // shafts
    while (shafts.length < visibleWells.length) {
      const m = new THREE.Mesh(shaftGeo, shaftMat);
      group.add(m);
      shafts.push(m);
    }
    shafts.forEach((m, i) => {
      const w = visibleWells[i];
      m.visible = !!w;
      if (w) m.position.set(w.x, 0, w.z);
    });
    floorUniforms.uWells.value.forEach((v, i) => {
      if (i === MAX_WELLS - 1) return; // the portal slot
      const w = visibleWells[i];
      v.set(w ? w.x : 0, w ? w.z : 0, w ? WELL_R : 0);
    });

    // rooms: floor tint + signs
    floorUniforms.uRooms.value.forEach((v, i) => v.set(0, 0, 0, 0));
    const near = visibleRooms.filter((r) => roomById(r.id));
    near.slice(0, MAX_ROOMS).forEach((r, i) => {
      const b = roomGeometry(r).bounds;
      floorUniforms.uRooms.value[i].set(b.x0, b.z0, b.x1, b.z1);
      floorUniforms.uRoomCol.value[i].set(roomById(r.id)!.theme.floor).multiplyScalar(3.2);
    });
    const keep = new Set<string>();
    for (const r of near) {
      keep.add(r.id);
      if (!signs.has(r.id)) {
        const def = roomById(r.id)!;
        const g = roomGeometry(r);
        const sign = makeSign(def.name, def.theme.neon);
        sign.mesh.position.set(g.door.x - g.door.nx * 0.05, WALL_H + 0.75, g.door.z - g.door.nz * 0.05);
        sign.mesh.rotation.y = Math.atan2(g.door.nx, g.door.nz);
        group.add(sign.mesh);
        signs.set(r.id, sign);
        applyStatus(r.id);
      }
    }
    for (const w of visibleWells) {
      keep.add(w.id);
      if (!signs.has(w.id)) {
        const def = roomById(w.target);
        const sign = makeSign(`↓ ${def?.name ?? "somewhere"}`, 0x6c9cff, true);
        sign.mesh.position.set(w.x, WALL_H + 2.2, w.z);
        group.add(sign.mesh);
        signs.set(w.id, sign);
      }
    }
    for (const [id, sign] of signs)
      if (!keep.has(id)) {
        group.remove(sign.mesh);
        sign.dispose();
        signs.delete(id);
      }
  }

  function applyStatus(id: string) {
    const sign = signs.get(id);
    const st = status.get(id);
    if (sign) sign.setSub(st ? subline(st) : "");
  }

  // door lights: the nearest MAX_LIGHTS doors; brighter when people are inside (warm light = people)
  const doorList: { x: number; z: number; col: THREE.Color; id: string }[] = [];
  function refreshDoors() {
    doorList.length = 0;
    for (const r of visibleRooms) {
      const def = roomById(r.id);
      const g = roomGeometry(r);
      doorList.push({ x: g.door.x - g.door.nx * 1.2, z: g.door.z - g.door.nz * 1.2, col: new THREE.Color(def?.theme.light ?? 0x806040), id: r.id });
      doorList.push({ x: g.center.x, z: g.center.z, col: new THREE.Color(def?.theme.light ?? 0x806040), id: r.id + "#in" });
    }
  }

  const portalShaft = new THREE.Mesh(shaftGeo, new THREE.ShaderMaterial({ vertexShader: shaftVert, fragmentShader: shaftFrag, side: THREE.BackSide, uniforms: { uTime: shared.uTime, uColor: { value: new THREE.Color(0xff5ad8) } } }));
  portalShaft.visible = false;
  group.add(portalShaft);

  return {
    group,
    portal(at) {
      const v = floorUniforms.uWells.value[MAX_WELLS - 1];
      if (!at) {
        v.set(0, 0, 0);
        portalShaft.visible = false;
        return;
      }
      v.set(at.x, at.z, at.r);
      portalShaft.visible = true;
      portalShaft.position.set(at.x, 0, at.z);
      portalShaft.scale.set(at.r / WELL_R, 1, at.r / WELL_R);
    },
    fog: { color: FOG, density: shared.uFogDensity.value },
    update(px, pz, cam, t) {
      const ccx = Math.floor(px / CELL / CH), ccz = Math.floor(pz / CELL / CH);
      const key = `${ccx},${ccz}`;
      if (key !== builtKey) {
        builtKey = key;
        build(ccx, ccz);
        refreshDoors();
      }
      shared.uTime.value = t;
      shared.uCam.value.copy(cam);
      shared.uPlayer.value.set(px, 0, pz);
      floor.position.set(Math.round(px / 2) * 2, 0, Math.round(pz / 2) * 2);
      // nearest doors get the light slots
      doorList.sort((a, b) => (a.x - px) ** 2 + (a.z - pz) ** 2 - ((b.x - px) ** 2 + (b.z - pz) ** 2));
      for (let i = 0; i < MAX_LIGHTS; i++) {
        const d = doorList[i];
        if (!d) {
          shared.uLights.value[i].set(0, -100, 0, 0);
          continue;
        }
        const id = d.id.replace("#in", "");
        const people = status.get(id)?.people ?? 0;
        const inside = d.id.endsWith("#in");
        const base = inside ? 2.2 : 1.0;
        const flicker = 0.92 + 0.08 * Math.sin(t * 7 + i * 3) * Math.sin(t * 2.3 + i);
        shared.uLights.value[i].set(d.x, inside ? 2.6 : 1.6, d.z, (base * (0.45 + Math.min(1.2, people * 0.25))) * flicker * 6);
        shared.uLightCol.value[i].copy(d.col);
        // the room grows with the conversation: the host's theme variant shifts its light
        const v = status.get(id)?.variant ?? 0;
        if (v) shared.uLightCol.value[i].offsetHSL(v * 0.07, 0.05, 0);
      }
      for (const sign of signs.values()) sign.tick(t, cam);
    },
    setRoomStatus(id, st) {
      status.set(id, st);
      applyStatus(id);
    },
    wells: () => visibleWells,
    rooms: () => visibleRooms,
    drawInfo: () => ({ walls: wallCount, chunks: builtKey }),
  };
}

function subline(s: RoomStatus) {
  const who = s.people === 0 ? "quiet right now" : `${s.people} listening`;
  const speaking = s.speaking.length ? ` · 🎙 ${s.speaking.slice(0, 2).join(", ")}` : "";
  return `${who}${speaking}${s.transcribed ? " · TRANSCRIBED" : ""}`;
}

function makeWritingAtlas() {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  WRITINGS.forEach((w, k) => {
    const x = (k % 4) * 256, y = Math.floor(k / 4) * 256;
    g.save();
    g.translate(x + 128, 1024 - (y + 128));
    g.rotate((hash(k, 1, 2) - 0.5) * 0.12);
    g.font = `${hash(k, 3, 4) < 0.5 ? "italic " : ""}${w.length > 18 ? 22 : 30}px Georgia, serif`;
    const words = w.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if ((line + " " + word).length > 14 && line) ((lines.push(line), (line = word)));
      else line = line ? line + " " + word : word;
    }
    lines.push(line);
    lines.forEach((l, li) => g.fillText(l, 0, (li - (lines.length - 1) / 2) * 34));
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
