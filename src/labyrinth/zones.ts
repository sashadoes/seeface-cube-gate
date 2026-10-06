// Locations. The surface labyrinth is split into zones (10×10 cells), each with
// its own walls, floor, ceiling, fog and light. Secret levels live far away
// along x (LEVEL_OFFSET apart) on the same infinite maze, so the same rules
// and multiplayer work everywhere; a secret level is one zone, everywhere.
import * as THREE from "three";
import { CELL, rnd } from "./maze";

export const ZONE_CELLS = 10;
export const LEVEL_OFFSET = 100_000; // metres between the surface and each secret level

export type ZoneKind = "monogram" | "pools" | "red" | "neon" | "photo" | "white";

export type ZoneDef = {
  kind: ZoneKind;
  fog: number; // colour
  fogDensity: number;
  ambient: number; // colour
  ambientIntensity: number;
  ceiling: number;
  panel: number; // fluorescent colour
  exposure: number;
};

export const ZONES: Record<ZoneKind, ZoneDef> = {
  monogram: { kind: "monogram", fog: 0x0c0c0b, fogDensity: 0.06, ambient: 0xb8b6ae, ambientIntensity: 0.13, ceiling: 0x8c8a85, panel: 0xf2f5ff, exposure: 1.25 },
  pools: { kind: "pools", fog: 0x0a1416, fogDensity: 0.07, ambient: 0x9fd8e0, ambientIntensity: 0.22, ceiling: 0xd8e4e4, panel: 0xdff8ff, exposure: 1.3 },
  red: { kind: "red", fog: 0x120404, fogDensity: 0.075, ambient: 0xff6a5a, ambientIntensity: 0.12, ceiling: 0x3a0e0c, panel: 0xffb08a, exposure: 1.2 },
  neon: { kind: "neon", fog: 0x05020a, fogDensity: 0.05, ambient: 0x8a5cff, ambientIntensity: 0.08, ceiling: 0x050308, panel: 0xff3cf0, exposure: 1.35 },
  photo: { kind: "photo", fog: 0x0a0d08, fogDensity: 0.065, ambient: 0xc8e0b0, ambientIntensity: 0.16, ceiling: 0x2a3324, panel: 0xf6ffe0, exposure: 1.25 },
  white: { kind: "white", fog: 0xd2cfc7, fogDensity: 0.035, ambient: 0xfffcf4, ambientIntensity: 0.55, ceiling: 0xeeebe3, panel: 0xffffff, exposure: 0.95 },
};

const SURFACE: ZoneKind[] = ["monogram", "pools", "red", "neon", "photo", "white"];

/** Secret levels: 1 = The Below (pools), 2 = The Static (neon), 3 = The White. */
export const LEVELS: { name: string; zone: ZoneKind; colour: number }[] = [
  { name: "surface", zone: "monogram", colour: 0xffffff },
  { name: "the below", zone: "pools", colour: 0x3cf2ff },
  { name: "the static", zone: "neon", colour: 0xff3cf0 },
  { name: "the white", zone: "white", colour: 0xffffff },
];

export function levelAtX(x: number) {
  const k = Math.round(x / LEVEL_OFFSET);
  return k >= 1 && k < LEVELS.length ? k : 0;
}

export function zoneOfCell(i: number, j: number): ZoneDef {
  const level = levelAtX((i + 0.5) * CELL);
  if (level > 0) return ZONES[LEVELS[level].zone];
  const zi = Math.floor(i / ZONE_CELLS), zj = Math.floor(j / ZONE_CELLS);
  if (zi === 0 && zj === 0) return ZONES.monogram; // everyone arrives in the monogram halls
  return ZONES[SURFACE[Math.floor(rnd(zi, zj, 70) * SURFACE.length)]];
}

export const zoneAt = (x: number, z: number) => zoneOfCell(Math.floor(x / CELL), Math.floor(z / CELL));

// ------------------------------------------------------------------ textures (drawn in code)

function tex(draw: (g: CanvasRenderingContext2D, s: number) => void, logoAlpha = 0, invertLogo = false) {
  const s = 512;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  draw(g, s);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (logoAlpha > 0) {
    const img = new Image();
    img.onload = () => {
      g.globalAlpha = logoAlpha;
      g.filter = invertLogo ? "invert(1)" : "none";
      g.drawImage(img, s * 0.3, s * 0.3, s * 0.4, s * 0.4);
      g.globalAlpha = 1;
      g.filter = "none";
      t.needsUpdate = true;
    };
    img.src = "/imgs/seeface-logo.png";
  }
  return t;
}

const tiles = (base: string, grout: string, n: number) => (g: CanvasRenderingContext2D, s: number) => {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = grout;
  g.lineWidth = 3;
  const step = s / n;
  for (let k = 0; k <= n; k++) {
    g.beginPath();
    g.moveTo(k * step, 0);
    g.lineTo(k * step, s);
    g.moveTo(0, k * step);
    g.lineTo(s, k * step);
    g.stroke();
  }
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    g.fillRect(Math.random() * s, Math.random() * s, 3, 3);
  }
};

const neonGrid = (g: CanvasRenderingContext2D, s: number) => {
  g.fillStyle = "#050308";
  g.fillRect(0, 0, s, s);
  const cols = ["#ff3cf0", "#3cf2ff", "#a4ff3c", "#ffb13c"];
  g.lineWidth = 4;
  for (let k = 0; k < 6; k++) {
    g.strokeStyle = cols[k % cols.length];
    g.shadowColor = g.strokeStyle;
    g.shadowBlur = 14;
    g.beginPath();
    const y = (k + 0.5) * (s / 6);
    g.moveTo(0, y);
    for (let x = 0; x <= s; x += 32) g.lineTo(x, y + Math.sin(x / 40 + k) * 10);
    g.stroke();
  }
  g.shadowBlur = 0;
};

const damask = (g: CanvasRenderingContext2D, s: number) => {
  g.fillStyle = "#5a0d0b";
  g.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 64) {
    g.fillStyle = x % 128 ? "rgba(0,0,0,0.18)" : "rgba(255,120,90,0.06)";
    g.fillRect(x, 0, 32, s);
  }
  g.strokeStyle = "rgba(255,170,120,0.12)";
  g.lineWidth = 2;
  for (let y = 32; y < s; y += 96)
    for (let x = 32; x < s; x += 96) {
      g.beginPath();
      g.ellipse(x, y, 18, 30, 0, 0, Math.PI * 2);
      g.stroke();
    }
};

const moss = (g: CanvasRenderingContext2D, s: number) => {
  g.fillStyle = "#1d2a16";
  g.fillRect(0, 0, s, s);
  for (let k = 0; k < 5000; k++) {
    const v = 30 + Math.random() * 60;
    g.fillStyle = `rgba(${v * 0.6},${v},${v * 0.4},0.35)`;
    g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 3, 2 + Math.random() * 3);
  }
};

const plain = (c: string, noise = 0.02) => (g: CanvasRenderingContext2D, s: number) => {
  g.fillStyle = c;
  g.fillRect(0, 0, s, s);
  for (let k = 0; k < 1200; k++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * noise})`;
    g.fillRect(Math.random() * s, Math.random() * s, 4, 4);
  }
};

/** Wall + floor materials for every zone except monogram/photo (those use world.ts textures). */
export function zoneMaterials() {
  return {
    pools: {
      wall: new THREE.MeshStandardMaterial({ map: tex(tiles("#e9f1f0", "#b9cccb", 8), 0.12), roughness: 0.25, metalness: 0.05 }),
      floor: new THREE.MeshStandardMaterial({ map: tex(tiles("#2fa6ad", "#1d7a80", 10)), roughness: 0.08, metalness: 0.4, color: 0xcfffff }),
    },
    red: {
      wall: new THREE.MeshStandardMaterial({ map: tex(damask, 0.18), roughness: 0.9 }),
      floor: new THREE.MeshStandardMaterial({ map: tex(plain("#2a0706", 0.05)), roughness: 0.95 }),
    },
    neon: {
      wall: new THREE.MeshStandardMaterial({ map: tex(neonGrid, 0.35, true), emissive: 0xffffff, emissiveMap: tex(neonGrid), emissiveIntensity: 0.9, roughness: 0.4 }),
      floor: new THREE.MeshStandardMaterial({ map: tex(neonGrid), color: 0x444444, roughness: 0.1, metalness: 0.6, emissive: 0xffffff, emissiveMap: tex(neonGrid), emissiveIntensity: 0.25 }),
    },
    photo: {
      floor: new THREE.MeshStandardMaterial({ map: tex(moss), roughness: 1 }),
    },
    white: {
      wall: new THREE.MeshStandardMaterial({ map: tex(plain("#dcd8cf", 0.03), 0.16), roughness: 0.9 }),
      floor: new THREE.MeshStandardMaterial({ map: tex(tiles("#c9c6be", "#b3afa6", 6)), roughness: 0.5 }),
    },
  };
}
