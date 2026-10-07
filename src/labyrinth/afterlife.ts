// The After Life™: the labyrinth is a showroom for the life after this one.
// Old cream-and-gold TV sets stand in the corridors playing an infomercial for
// it (original copy, retro styling). Walk up
// to a TV and tap it to ORDER: it costs 5 ◈ (in-game blood dollars only, never
// real money) and ships you an afterlife object for your inventory.
import * as THREE from "three";
import { CELL, placeOf, rnd, roomOf, wallEast, wallSouth } from "./maze";

export const ORDER_COST = 5;

const AD: string[][] = [
  ["AFTER LIFE™", "now playing in your hallway"],
  ["tired of being alive?", "upgrade."],
  ["eternity", "in easy installments"],
  ["critics agree:", "\"I never came back\""],
  ["act now", "only 4.95 ◈"],
  ["limited time offer", "(all time is limited)"],
  ["our operators", "are dead and waiting"],
  ["satisfaction guaranteed", "or your soul back"],
  ["tap the screen", "to order AFTER LIFE™"],
  ["warning:", "may cause eternity"],
];

type TV = { group: THREE.Group; screen: THREE.CanvasTexture; ctx: CanvasRenderingContext2D; x: number; z: number; key: string };

function makeTV(): TV {
  const group = new THREE.Group();
  const cream = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.45, metalness: 0.1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.7 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 0.7), cream);
  body.position.y = 1.15;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.5), new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.6 }));
  legs.position.y = 0.35;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.06, 0.72), gold);
  trim.position.y = 1.6;
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.7), gold);
  antenna.position.set(0.15, 1.9, 0);
  antenna.rotation.z = -0.5;
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 240;
  const ctx = c.getContext("2d")!;
  const screen = new THREE.CanvasTexture(c);
  screen.colorSpace = THREE.SRGBColorSpace;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.6), new THREE.MeshBasicMaterial({ map: screen, toneMapped: false }));
  glass.position.set(0, 1.17, 0.352);
  group.add(body, legs, trim, antenna, glass);
  return { group, screen, ctx, x: 0, z: 0, key: "" };
}

function drawScreen(tv: TV, t: number, seed: number) {
  const g = tv.ctx, W = 320, H = 240;
  const slide = Math.floor(t / 2.6 + seed) % AD.length;
  const k = (t / 2.6 + seed) % 1;
  g.fillStyle = "#0d1a1c";
  g.fillRect(0, 0, W, H);
  // deco frame
  g.strokeStyle = "#c9a24a";
  g.lineWidth = 3;
  g.strokeRect(10, 10, W - 20, H - 20);
  g.textAlign = "center";
  g.fillStyle = slide === 0 ? "#f2c864" : "#f2e6c8";
  g.font = slide === 0 ? "bold 40px 'Arial Narrow', Arial, sans-serif" : "bold 30px 'Arial Narrow', Arial, sans-serif";
  g.fillText(AD[slide][0], W / 2, 108, W - 40);
  g.fillStyle = "#c9a24a";
  g.font = "italic 22px 'Times New Roman', serif";
  g.fillText(AD[slide][1], W / 2, 148, W - 40);
  g.font = "bold 14px Arial, sans-serif";
  g.fillStyle = "#8fb8a8";
  g.fillText("AFTER LIFE™ · TAP TO ORDER · 4.95 ◈", W / 2, 205);
  // scanlines + a rolling bar + snow
  g.fillStyle = "rgba(0,0,0,0.25)";
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  g.fillStyle = "rgba(255,255,255,0.06)";
  g.fillRect(0, ((t * 60) % (H + 40)) - 40, W, 30);
  for (let n = 0; n < 160; n++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.2})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 1);
  }
  if (k < 0.04) {
    g.fillStyle = "rgba(255,255,255,0.4)";
    g.fillRect(0, 0, W, H); // channel flash
  }
  tv.screen.needsUpdate = true;
}

export function createAfterlife() {
  const group = new THREE.Group();
  const tvs = Array.from({ length: 5 }, () => {
    const tv = makeTV();
    tv.group.visible = false;
    group.add(tv.group);
    return tv;
  });
  const glow = new THREE.PointLight(0x9fe8d8, 0, 5, 1.6);
  group.add(glow);
  let lastCell = "";
  let frame = 0;

  function place(px: number, pz: number) {
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
    let k = 0;
    for (let i = ci - 6; i <= ci + 6 && k < tvs.length; i++)
      for (let j = cj - 6; j <= cj + 6 && k < tvs.length; j++) {
        if (roomOf(i, j) || placeOf(i, j) || rnd(i, j, 140) > 0.05) continue;
        // stand it against a wall of this cell, facing into the corridor
        const sides: [boolean, number, number, number][] = [
          [wallEast(i, j), (i + 1) * CELL - 0.55, (j + 0.5) * CELL, -Math.PI / 2],
          [wallEast(i - 1, j), i * CELL + 0.55, (j + 0.5) * CELL, Math.PI / 2],
          [wallSouth(i, j), (i + 0.5) * CELL, (j + 1) * CELL - 0.55, Math.PI],
          [wallSouth(i, j - 1), (i + 0.5) * CELL, j * CELL + 0.55, 0],
        ];
        const s = sides.find((x) => x[0]);
        if (!s) continue;
        const tv = tvs[k++];
        tv.group.position.set(s[1], 0, s[2]);
        tv.group.rotation.y = s[3];
        tv.group.visible = true;
        tv.x = s[1];
        tv.z = s[2];
        tv.key = `${i}:${j}`;
      }
    for (; k < tvs.length; k++) tvs[k].group.visible = false;
  }

  return {
    group,
    update(px: number, pz: number, t: number) {
      const cell = `${Math.floor(px / CELL)}:${Math.floor(pz / CELL)}`;
      if (cell !== lastCell) {
        lastCell = cell;
        place(px, pz);
      }
      // redraw screens at ~15 fps; the nearest TV lights the corridor
      frame++;
      let near: TV | null = null, nd = Infinity;
      tvs.forEach((tv, k) => {
        if (!tv.group.visible) return;
        const d = Math.hypot(tv.x - px, tv.z - pz);
        if (d < nd) (nd = d), (near = tv);
        if (d < 14 && frame % 4 === k % 4) drawScreen(tv, t, k * 3.7);
      });
      if (near) glow.position.set((near as TV).x, 1.3, (near as TV).z);
      glow.intensity = near && nd < 10 ? 3 : 0;
      return { nearTV: nd < 2.2 };
    },
  };
}
