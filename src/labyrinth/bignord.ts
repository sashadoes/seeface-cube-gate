// BIGNORD NEWS: the only channel in the labyrinth, always live, always right.
// One broadcast, drawn once onto one shared canvas and shown on every screen,
// timed by the wall clock so everyone watches the same second of propaganda.
// The copy is ORIGINAL: a regime cheerfully "rebuilding from the ashes again"
// and insisting everything (and everyone) is under control.
//   corridor screens – flat screens hung on corridor walls (~2.5% of cells),
//                      half in gilded art-deco cases, half in raw black steel
//   the tower        – a giant screen on deco pylons above the walls of "the open"
// Segments (8 s each): deco ident, headlines, the anchor, the numbers, stand by.
import * as THREE from "three";
import { CELL, placeOf, rnd, roomOf, wallEast, wallSouth } from "./maze";

const W = 768, H = 432;

const HEADLINES: [string, string][] = [
  ["WE ARE REBUILDING FROM THE ASHES. AGAIN.", "and again. and again. we are very good at it now."],
  ["WE'RE UNDER CONTROL!!", "the people are thrilled to confirm"],
  ["EVERYTHING IS UNDER CONTROL", "including the things you were about to think"],
  ["THE ASHES ARE STILL WARM", "families are encouraged to gather around them"],
  ["TODAY'S RUBBLE IS TOMORROW'S MONUMENT", "please do not sweep the future"],
  ["THE FLOOD WAS A COMPLETE SUCCESS", "the water has been thanked for its service"],
  ["RECONSTRUCTION AHEAD OF SCHEDULE", "the schedule has been rebuilt to match"],
  ["NOTHING HAPPENED IN 1994", "the ministry repeats: nothing. happened."],
  ["WEATHER TODAY: CONTROLLED", "tomorrow: also controlled"],
  ["THE DARK KING SMILES ON YOUR DISTRICT", "smile back. he can tell."],
  ["DOUBT IS A LEAK", "report leaks to the nearest wall"],
  ["THE SIREN IS FOR YOUR COMFORT", "sleep when it sings"],
  ["THERE IS NO SIGNAL OUTSIDE", "there is no outside"],
  ["WE BURNED IT DOWN TO BUILD IT BETTER", "it was the brave thing to do"],
  ["ALL CITIZENS ACCOUNTED FOR", "all citizens counted. twice."],
  ["THE EDGE IS MOVING IN YOUR FAVOUR", "do not test this"],
  ["NEW SKY INSTALLED", "the old one has been retired with honours"],
  ["GRATITUDE UP 1994%", "a record. the record has been rebuilt too."],
];

const ANCHOR_LINES = [
  "good evening. it is always evening.",
  "we are rebuilding from the ashes again. isn't it wonderful.",
  "we're under control. say it with me.",
  "the fires were scheduled. the ashes are on time.",
  "if you feel afraid, that is the reconstruction working.",
  "stay tuned. there is nothing else to tune to.",
  "the walls listen so you don't have to speak.",
  "every ending is a ribbon-cutting.",
];

const TICKER =
  "BIGNORD NEWS  ◆  WE'RE UNDER CONTROL!!  ◆  REBUILDING FROM THE ASHES AGAIN · PHASE ∞ OF ∞  ◆  " +
  "ASH RATIONS DOUBLED · ASH RATIONS HALVED · ASH RATIONS RESTORED  ◆  THE FLOOD HAS BEEN FORGIVEN  ◆  " +
  "LOST? YOU ARE EXACTLY WHERE YOU WERE PUT  ◆  CURFEW EXTENDED TO FOREVER, BY POPULAR DEMAND  ◆  " +
  "THE LABYRINTH GREW TODAY · THE LABYRINTH THANKS YOU  ◆  NEW MONUMENT TO THE OLD MONUMENT UNVEILED  ◆  " +
  "REMEMBER: NOTHING HAPPENED  ◆  KEEP WALKING  ◆  ";

const GOLD = "#c9a24a", GOLD_HI = "#f2c864", BONE = "#e9e2cf", INK = "#07080a", TEAL = "#7affd8", OX = "#5e0d12";
const COND = "'Arial Narrow', 'Helvetica Neue', Arial, sans-serif";
const SERIF = "'Didot', 'Bodoni 72', 'Times New Roman', serif";

// ------------------------------------------------------------------ the shared broadcast
const canvas = document.createElement("canvas");
canvas.width = W;
canvas.height = H;
const g = canvas.getContext("2d")!;
export const NEWS_TEXTURE = new THREE.CanvasTexture(canvas);
NEWS_TEXTURE.colorSpace = THREE.SRGBColorSpace;

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function spaced(text: string, px: number) {
  // letter-spacing where the browser supports it (deco caps look wrong without it)
  (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
  return text;
}

function wrap(text: string, maxW: number) {
  const words = text.split(" "), lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (g.measureText(t).width > maxW && line) lines.push(line), (line = w);
    else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function sunburst(cx: number, cy: number, rays: number, len: number, spin: number, color: string) {
  g.save();
  g.translate(cx, cy);
  g.rotate(spin);
  g.fillStyle = color;
  for (let k = 0; k < rays; k++) {
    g.rotate((Math.PI * 2) / rays);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(len, -len * 0.06);
    g.lineTo(len, len * 0.06);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** stepped ziggurat frame: the deco signature */
function decoFrame(inset: number, color: string) {
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
  g.lineWidth = 1.5;
  g.strokeRect(inset + 10, inset + 10, W - inset * 2 - 20, H - inset * 2 - 20);
  // stepped corners
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x0 = sx > 0 ? inset : W - inset, y0 = sy > 0 ? inset : H - inset;
    g.fillStyle = color;
    for (let s = 0; s < 3; s++) g.fillRect(x0 + sx * (14 + s * 10) - (sx < 0 ? 6 : 0), y0 + sy * 14 - (sy < 0 ? 22 - s * 8 : 0), 6, 22 - s * 8);
  }
}

function halftone(t: number, color: string, alpha: number) {
  g.fillStyle = color;
  g.globalAlpha = alpha;
  const step = 14, off = (t * 6) % step;
  for (let y = -step; y < H + step; y += step)
    for (let x = -step; x < W + step; x += step) {
      const r = 1 + 3.2 * (0.5 + 0.5 * Math.sin(x * 0.012 + y * 0.018 + t * 0.7));
      g.beginPath();
      g.arc(x + off, y + (x / step) % 2 * 7, r, 0, Math.PI * 2);
      g.fill();
    }
  g.globalAlpha = 1;
}

// ---- segments
function ident(t: number, k: number) {
  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H * 0.62, 10, W / 2, H * 0.62, W * 0.6);
  glow.addColorStop(0, "rgba(201,162,74,0.35)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  sunburst(W / 2, H * 0.62, 36, W * 0.75, t * 0.05, "rgba(201,162,74,0.16)");
  decoFrame(16, GOLD);
  // the crest: a rising half-sun over three steps
  g.fillStyle = GOLD;
  g.beginPath();
  g.arc(W / 2, 128, 46, Math.PI, 0);
  g.fill();
  g.fillStyle = INK;
  for (let s = 0; s < 4; s++) g.fillRect(W / 2 - 46, 128 - 10 - s * 11, 92, 3);
  g.fillStyle = GOLD;
  for (let s = 0; s < 3; s++) g.fillRect(W / 2 - 70 + s * 14, 130 + s * 8, 140 - s * 28, 7);
  const rise = Math.min(1, k * 3);
  g.globalAlpha = rise;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = GOLD_HI;
  g.shadowColor = GOLD_HI;
  g.shadowBlur = 24;
  g.font = `bold 112px ${COND}`;
  g.fillText(spaced("BIGNORD", 18), W / 2 + 9, 268);
  g.shadowBlur = 0;
  g.fillStyle = BONE;
  g.font = `italic 34px ${SERIF}`;
  g.fillText(spaced("N  E  W  S", 10), W / 2 + 5, 318);
  spaced("", 0);
  g.strokeStyle = GOLD;
  g.lineWidth = 1.5;
  for (const y of [290, 296, 334, 340]) {
    g.beginPath();
    g.moveTo(W / 2 - 220, y);
    g.lineTo(W / 2 - 110, y);
    g.moveTo(W / 2 + 110, y);
    g.lineTo(W / 2 + 220, y);
    g.stroke();
  }
  g.fillStyle = GOLD;
  g.font = `bold 15px ${COND}`;
  g.fillText(spaced("THE ONLY NEWS  ·  ALWAYS LIVE  ·  ALWAYS RIGHT", 4), W / 2, 372);
  spaced("", 0);
  g.globalAlpha = 1;
}

function headline(t: number, k: number, n: number) {
  const [head, sub] = HEADLINES[Math.floor(hash(n) * HEADLINES.length)];
  const inverted = hash(n + 0.5) < 0.35;
  g.fillStyle = inverted ? BONE : INK;
  g.fillRect(0, 0, W, H);
  halftone(t, inverted ? "#000" : "#fff", inverted ? 0.09 : 0.05);
  // the BREAKING tab + a heavy rule
  g.fillStyle = OX;
  g.fillRect(0, 70, 230, 42);
  g.fillStyle = BONE;
  g.font = `bold 26px ${COND}`;
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(spaced(Math.sin(t * 6) > 0 ? "▲ BREAKING" : "  BREAKING", 3), 26, 92);
  spaced("", 0);
  g.fillStyle = inverted ? INK : GOLD;
  g.fillRect(230, 89, W - 230, 4);
  // the headline slams in, then shakes a little, like it means it
  const slam = Math.min(1, k * 5);
  const shake = k < 0.25 ? (1 - k * 4) * 8 : 0;
  g.save();
  g.translate((Math.random() - 0.5) * shake, (1 - slam) * -60 + (Math.random() - 0.5) * shake);
  g.globalAlpha = slam;
  g.fillStyle = inverted ? INK : BONE;
  let size = 88;
  let lines: string[];
  do {
    g.font = `bold ${size}px ${COND}`;
    lines = wrap(head, W - 70);
    size -= 6;
  } while (lines.length * size * 1.02 > 210 && size > 36);
  g.textBaseline = "alphabetic";
  lines.forEach((l, i) => g.fillText(l, 34, 180 + i * (size + 6)));
  g.restore();
  g.globalAlpha = Math.max(0, Math.min(1, (k - 0.3) * 4));
  g.fillStyle = inverted ? "#4a4436" : GOLD;
  g.font = `italic 24px ${SERIF}`;
  g.textAlign = "left";
  g.fillText(sub, 36, 344, W - 72);
  g.globalAlpha = 1;
}

function anchor(t: number, k: number, n: number) {
  // the studio: black, a deco fan behind, a faceless anchor who never blinks
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#10141a");
  bg.addColorStop(1, "#030405");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const cx = W * 0.62, cy = H * 0.86;
  for (let r = 7; r >= 1; r--) {
    g.fillStyle = r % 2 ? "rgba(201,162,74,0.10)" : "rgba(0,0,0,0.5)";
    g.beginPath();
    g.arc(cx, cy, r * 46, Math.PI, 0);
    g.fill();
  }
  sunburst(cx, cy, 24, 330, 0, "rgba(201,162,74,0.07)");
  // shoulders + a deco lapel pin
  g.fillStyle = "#0b0c0e";
  g.beginPath();
  g.moveTo(cx - 170, H);
  g.quadraticCurveTo(cx - 150, cy - 110, cx, cy - 120);
  g.quadraticCurveTo(cx + 150, cy - 110, cx + 170, H);
  g.fill();
  g.fillStyle = BONE;
  g.beginPath();
  g.moveTo(cx - 18, cy - 118);
  g.lineTo(cx, cy - 40);
  g.lineTo(cx + 18, cy - 118);
  g.fill();
  g.fillStyle = GOLD_HI;
  g.beginPath();
  g.arc(cx - 80, cy - 70, 7, 0, Math.PI * 2);
  g.fill();
  // the head: a smooth bone oval, two dark sockets, a drawn-on smile
  const bob = Math.sin(t * 1.3) * 3;
  const hx = cx + Math.sin(t * 0.7) * 4, hy = cy - 205 + bob;
  const face = g.createRadialGradient(hx - 20, hy - 30, 10, hx, hy, 90);
  face.addColorStop(0, "#f4eedc");
  face.addColorStop(1, "#8d8674");
  g.fillStyle = face;
  g.beginPath();
  g.ellipse(hx, hy, 64, 84, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = INK;
  for (const sx of [-24, 24]) {
    g.beginPath();
    g.ellipse(hx + sx, hy - 10, 11, 15, 0, 0, Math.PI * 2);
    g.fill();
  }
  // tiny glints that follow the viewer, slowly
  g.fillStyle = TEAL;
  const look = Math.sin(t * 0.4) * 3;
  for (const sx of [-24, 24]) g.fillRect(hx + sx + look - 1.5, hy - 12, 3, 3);
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.beginPath();
  const talk = Math.abs(Math.sin(t * 9)) * (k < 0.85 ? 6 : 0);
  g.moveTo(hx - 26, hy + 34);
  g.quadraticCurveTo(hx, hy + 50 + talk, hx + 26, hy + 34);
  g.stroke();
  // the microphone: a deco ribbed capsule
  g.fillStyle = "#2a2620";
  g.fillRect(cx - 230, cy - 60, 10, 140);
  g.fillStyle = GOLD;
  g.beginPath();
  g.ellipse(cx - 225, cy - 80, 22, 34, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = INK;
  for (let s = -3; s <= 3; s++) g.fillRect(cx - 245, cy - 80 + s * 8, 40, 2);
  // lower third + the subtitle, typed out
  const line = ANCHOR_LINES[Math.floor(hash(n * 3.1) * ANCHOR_LINES.length)];
  g.fillStyle = "rgba(7,8,10,0.85)";
  g.fillRect(0, H - 120, W, 72);
  g.fillStyle = GOLD;
  g.fillRect(0, H - 120, 8, 72);
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillStyle = GOLD_HI;
  g.font = `bold 16px ${COND}`;
  g.fillText(spaced("THE ANCHOR  ·  SPEAKING FOR YOU", 3), 24, H - 102);
  spaced("", 0);
  g.fillStyle = BONE;
  g.font = `italic 25px ${SERIF}`;
  g.fillText(line.slice(0, Math.floor(line.length * Math.min(1, k * 1.6))), 24, H - 70, W - 48);
}

function numbers(t: number, k: number, n: number) {
  g.fillStyle = "#0a0f0e";
  g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(122,255,216,0.08)";
  g.lineWidth = 1;
  for (let x = 0; x < W; x += 32) g.strokeRect(x, 0, 32, H);
  for (let y = 0; y < H; y += 32) g.strokeRect(0, y, W, 32);
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillStyle = GOLD_HI;
  g.font = `bold 30px ${COND}`;
  g.fillText(spaced("THE NUMBERS ARE GOOD", 5), 34, 86);
  spaced("", 0);
  g.fillStyle = "#8f897c";
  g.font = `italic 19px ${SERIF}`;
  g.fillText("certified by the ministry of the numbers", 34, 114);
  // a bar chart that only goes up (and off the chart)
  const bars = 8, grow = Math.min(1, k * 2);
  for (let b = 0; b < bars; b++) {
    const h = (40 + b * b * 4.4) * grow;
    const x = 40 + b * 40;
    g.fillStyle = b === bars - 1 ? GOLD_HI : "rgba(122,255,216,0.55)";
    g.fillRect(x, 360 - h, 26, b === bars - 1 && grow === 1 ? h + 400 : h);
  }
  g.fillStyle = BONE;
  g.font = `bold 15px ${COND}`;
  g.fillText(spaced("PUBLIC JOY · SINCE THE LAST FIRE", 2), 40, 392);
  spaced("", 0);
  // a deco gauge pinned at CONTENT
  const gx = 590, gy = 250;
  g.strokeStyle = GOLD;
  g.lineWidth = 3;
  g.beginPath();
  g.arc(gx, gy, 110, Math.PI, 0);
  g.stroke();
  for (let s = 0; s <= 10; s++) {
    const a = Math.PI + (s / 10) * Math.PI;
    g.beginPath();
    g.moveTo(gx + Math.cos(a) * 96, gy + Math.sin(a) * 96);
    g.lineTo(gx + Math.cos(a) * 110, gy + Math.sin(a) * 110);
    g.stroke();
  }
  g.fillStyle = "#8f897c";
  g.font = `bold 13px ${COND}`;
  g.textAlign = "center";
  g.fillText("DOUBT", gx - 92, gy + 22);
  g.fillText("CONTENT", gx + 88, gy + 22);
  const a = Math.PI * 1.97 + Math.sin(t * 23) * 0.012;
  g.strokeStyle = TEAL;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(gx, gy);
  g.lineTo(gx + Math.cos(a) * 100, gy + Math.sin(a) * 100);
  g.stroke();
  g.fillStyle = GOLD_HI;
  g.beginPath();
  g.arc(gx, gy, 8, 0, Math.PI * 2);
  g.fill();
  // live counters
  const ash = Math.floor(t * 37 + n * 1000) % 10_000_000;
  g.textAlign = "left";
  g.font = `bold 15px ${COND}`;
  g.fillStyle = "#8f897c";
  g.fillText("ASH RECLAIMED TODAY", 470, 310);
  g.fillText("DOUBT DETECTED", 470, 366);
  g.font = `bold 34px ${COND}`;
  g.fillStyle = BONE;
  g.fillText(`${ash.toLocaleString("en")} kg`, 470, 344);
  g.fillStyle = TEAL;
  g.fillText("0.000 %", 470, 400);
}

function standBy(t: number) {
  g.fillStyle = INK;
  g.fillRect(0, 0, W, H);
  // a deco test card with an eye at its heart
  const cx = W / 2, cy = H / 2 - 14;
  for (let r = 9; r >= 1; r--) {
    g.strokeStyle = r % 2 ? GOLD : "rgba(201,162,74,0.35)";
    g.lineWidth = r % 3 ? 1.5 : 4;
    g.beginPath();
    g.arc(cx, cy, r * 20, 0, Math.PI * 2);
    g.stroke();
  }
  sunburst(cx, cy, 16, 260, -t * 0.08, "rgba(201,162,74,0.12)");
  const cols = ["#e9e2cf", "#c9a24a", "#7affd8", "#3a4a8a", "#5e0d12", "#1c1a20", "#8f897c"];
  cols.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(40 + i * ((W - 80) / cols.length), H - 92, (W - 80) / cols.length, 22);
  });
  // the eye
  g.fillStyle = BONE;
  g.beginPath();
  g.ellipse(cx, cy, 58, 30, 0, 0, Math.PI * 2);
  g.fill();
  const look = Math.sin(t * 0.9) * 18;
  g.fillStyle = INK;
  g.beginPath();
  g.arc(cx + look, cy, 19, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = TEAL;
  g.beginPath();
  g.arc(cx + look, cy, 5, 0, Math.PI * 2);
  g.fill();
  // blink, rarely
  if ((t % 6.3) < 0.14) {
    g.fillStyle = INK;
    g.fillRect(cx - 62, cy - 34, 124, 68);
  }
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = BONE;
  g.font = `bold 28px ${COND}`;
  g.fillText(spaced("PLEASE STAND BY", 8), cx + 4, 60);
  spaced("", 0);
  g.fillStyle = GOLD;
  g.font = `italic 20px ${SERIF}`;
  g.fillText("you are being rebuilt", cx, H - 30);
}

// ---- the broadcast chrome: live bug, clock, ticker, signal damage
const DAY0 = Date.UTC(2026, 9, 6); // the first day of the latest rebuild

function chrome(now: number, t: number) {
  g.fillStyle = "rgba(7,8,10,0.78)";
  g.fillRect(0, 0, W, 40);
  g.textBaseline = "middle";
  g.textAlign = "left";
  g.fillStyle = Math.sin(t * 4) > 0 ? "#d8323c" : "#5e0d12";
  g.beginPath();
  g.arc(22, 20, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = BONE;
  g.font = `bold 17px ${COND}`;
  g.fillText(spaced("LIVE", 3), 36, 21);
  g.fillStyle = GOLD_HI;
  g.fillText(spaced("BIGNORD NEWS", 3), 94, 21);
  spaced("", 0);
  const d = new Date(now);
  const day = Math.max(1, Math.floor((now - DAY0) / 86_400_000) + 1);
  g.textAlign = "right";
  g.fillStyle = "#8f897c";
  g.font = `bold 15px ${COND}`;
  g.fillText(
    `YEAR ZERO · REBUILD DAY ${String(day).padStart(4, "0")} · ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    W - 16,
    21,
  );
  // the ticker never stops
  g.fillStyle = GOLD;
  g.fillRect(0, H - 40, W, 40);
  g.fillStyle = INK;
  g.fillRect(0, H - 40, 120, 40);
  g.font = `bold 20px ${COND}`;
  g.textAlign = "left";
  const tw = g.measureText(TICKER).width;
  const x = 120 - ((t * 90) % tw);
  g.save();
  g.beginPath();
  g.rect(120, H - 40, W - 120, 40);
  g.clip();
  g.fillStyle = INK;
  g.fillText(TICKER, x, H - 19);
  g.fillText(TICKER, x + tw, H - 19);
  g.restore();
  g.fillStyle = GOLD_HI;
  g.font = `bold 17px ${COND}`;
  g.fillText(spaced("◆ NOW", 2), 18, H - 19);
  spaced("", 0);
}

function damage(t: number, sec: number) {
  // scanlines
  g.fillStyle = "rgba(0,0,0,0.22)";
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
  // a rolling bar
  g.fillStyle = "rgba(255,255,255,0.04)";
  g.fillRect(0, ((t * 50) % (H + 80)) - 80, W, 60);
  // the signal tears now and then
  if (hash(Math.floor(t * 3)) > 0.86) {
    for (let s = 0; s < 4; s++) {
      const y = Math.random() * H, h = 6 + Math.random() * 28;
      g.drawImage(canvas, 0, y, W, h, (Math.random() - 0.5) * 60, y, W, h);
    }
    g.fillStyle = "rgba(122,255,216,0.08)";
    g.fillRect(0, Math.random() * H, W, 3);
  }
  // a subliminal frame, a few times a minute
  const blip = sec % 23;
  if (blip > 11.0 && blip < 11.09) {
    g.fillStyle = BONE;
    g.fillRect(0, 0, W, H);
    g.fillStyle = INK;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `bold 150px ${COND}`;
    g.fillText(["SMILE", "OBEY THE ASH", "WE SEE YOU", "REBUILD"][Math.floor(sec / 23) % 4], W / 2, H / 2, W - 40);
  }
  // snow
  for (let k = 0; k < 220; k++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 1);
  }
}

const SEG = 8; // seconds per segment
let lastDraw = -1;

/** draw the broadcast for this moment (the same moment for everyone) */
function drawBroadcast() {
  const now = Date.now();
  const sec = now / 1000;
  if (sec - lastDraw < 1 / 12) return false; // ~12 fps is plenty for a tired regime
  lastDraw = sec;
  const n = Math.floor(sec / SEG), k = (sec % SEG) / SEG, t = sec % 100_000;
  // the running order: ident, headline, headline, anchor, headline, numbers, headline, stand by
  const slot = n % 8;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.shadowBlur = 0;
  g.globalAlpha = 1;
  if (slot === 0) ident(t, k);
  else if (slot === 3) anchor(t, k, n);
  else if (slot === 5) numbers(t, k, n);
  else if (slot === 7) standBy(t);
  else headline(t, k, n);
  if (slot !== 7) chrome(now, t);
  // a white flash on every cut
  if (k < 0.025) {
    g.fillStyle = "rgba(233,226,207,0.55)";
    g.fillRect(0, 0, W, H);
  }
  damage(t, sec);
  NEWS_TEXTURE.needsUpdate = true;
  return true;
}

// ------------------------------------------------------------------ the screens
const screenMat = () => new THREE.MeshBasicMaterial({ map: NEWS_TEXTURE, toneMapped: false });

/** a gilded art-deco case: stepped crown with a fan, fluted sides */
function decoCase(w: number, h: number) {
  const grp = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.75, emissive: 0x2a1c04, emissiveIntensity: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.4, metalness: 0.4 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.24, h + 0.24, 0.12), black);
  back.position.z = -0.06;
  grp.add(back);
  for (const [bw, bh, x, y] of [[w + 0.3, 0.06, 0, h / 2 + 0.12], [w + 0.3, 0.06, 0, -h / 2 - 0.12], [0.06, h + 0.3, w / 2 + 0.12, 0], [0.06, h + 0.3, -w / 2 - 0.12, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.08), gold);
    b.position.set(x, y, 0);
    grp.add(b);
  }
  // the stepped crown
  for (let s = 0; s < 3; s++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w * (0.5 - s * 0.14), 0.09, 0.1), s === 2 ? gold : black);
    b.position.set(0, h / 2 + 0.2 + s * 0.09, -0.02);
    grp.add(b);
  }
  const fan = new THREE.Mesh(new THREE.CircleGeometry(0.26, 24, 0, Math.PI), gold);
  fan.position.set(0, h / 2 + 0.47, 0);
  grp.add(fan);
  // fluted pilasters
  for (const sx of [-1, 1])
    for (let f = 0; f < 3; f++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.025, h * 0.9, 0.05), gold);
      p.position.set(sx * (w / 2 + 0.2 + f * 0.05), 0, 0);
      grp.add(p);
    }
  return grp;
}

/** raw black steel, bolted, with a cable hanging down */
function brutalCase(w: number, h: number) {
  const grp = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.55, metalness: 0.6 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, h + 0.16, 0.16), steel);
  back.position.z = -0.08;
  grp.add(back);
  const bolt = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.4, metalness: 0.8 });
  for (const [x, y] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 8), bolt);
    b.rotation.x = Math.PI / 2;
    b.position.set(x * (w / 2 + 0.04), y * (h / 2 + 0.04), 0.01);
    grp.add(b);
  }
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.8 }));
  cable.position.set(w / 2 - 0.2, -h / 2 - 0.7, -0.05);
  cable.rotation.z = 0.08;
  grp.add(cable);
  return grp;
}

function screenPlane(w: number, h: number) {
  const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), screenMat());
  s.position.z = 0.012;
  return s;
}

/** the giant tower screen above the open: deco pylons, a crown, a sunburst halo */
export function newsTower(g: THREE.Group, L: number) {
  const w = 14, h = w * (H / W);
  const grp = new THREE.Group();
  grp.position.set(L / 2, 0, 0.2);
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.75, emissive: 0x2a1c04, emissiveIntensity: 0.8 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.5, metalness: 0.4 });
  const y0 = 6.2;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: NEWS_TEXTURE, toneMapped: false, fog: false }));
  scr.position.set(0, y0 + h / 2, 0.2);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, h + 0.8, 0.3), black);
  back.position.set(0, y0 + h / 2, 0);
  grp.add(scr, back);
  // stepped pylons, narrowing upward
  for (const sx of [-1, 1]) {
    for (let s = 0; s < 4; s++) {
      const ph = (y0 + h + 2) * (1 - s * 0.18);
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9 - s * 0.18, ph, 0.9 - s * 0.18), s % 2 ? gold : black);
      p.position.set(sx * (w / 2 + 0.9), ph / 2, 0);
      grp.add(p);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.6, 4), gold);
    tip.position.set(sx * (w / 2 + 0.9), y0 + h + 2.8, 0);
    tip.rotation.y = Math.PI / 4;
    grp.add(tip);
  }
  // the crown: three steps and a rising sun
  for (let s = 0; s < 3; s++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w * (0.62 - s * 0.16), 0.35, 0.4), s === 2 ? gold : black);
    b.position.set(0, y0 + h + 0.55 + s * 0.35, 0);
    grp.add(b);
  }
  const sun = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32, 0, Math.PI), gold);
  sun.position.set(0, y0 + h + 1.4, 0.21);
  grp.add(sun);
  // a halo of rays behind the screen (slowly turning)
  const rays = new THREE.Group();
  const rayMat = new THREE.MeshBasicMaterial({ color: 0xc9a24a, transparent: true, opacity: 0.14, side: THREE.DoubleSide, fog: false, depthWrite: false });
  for (let k = 0; k < 28; k++) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 16), rayMat);
    r.geometry.translate(0, 8, 0);
    r.rotation.z = (k / 28) * Math.PI * 2;
    rays.add(r);
  }
  rays.position.set(0, y0 + h / 2, -0.25);
  grp.add(rays);
  // floodlights from below
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(2.2, y0, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf2c864, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  for (const sx of [-0.3, 0.3]) {
    const b = beam.clone();
    b.position.set(sx * w, y0 / 2, 0.8);
    grp.add(b);
  }
  g.add(grp);
  return (t: number) => {
    rays.rotation.z = t * 0.03;
    drawBroadcast();
  };
}

type Wall = { group: THREE.Group; deco: THREE.Group; brutal: THREE.Group; x: number; z: number };

export function createBignord() {
  const group = new THREE.Group();
  const SW = 2.2, SH = SW * (H / W);
  const screens: Wall[] = Array.from({ length: 3 }, () => {
    const grp = new THREE.Group();
    const deco = decoCase(SW, SH), brutal = brutalCase(SW, SH);
    grp.add(deco, brutal, screenPlane(SW, SH));
    grp.visible = false;
    group.add(grp);
    return { group: grp, deco, brutal, x: 0, z: 0 };
  });
  const glow = new THREE.PointLight(0xbfe8e0, 0, 7, 1.6);
  group.add(glow);
  let lastCell = "";

  function place(px: number, pz: number) {
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL);
    let k = 0;
    for (let i = ci - 7; i <= ci + 7 && k < screens.length; i++)
      for (let j = cj - 7; j <= cj + 7 && k < screens.length; j++) {
        if (roomOf(i, j) || placeOf(i, j) || rnd(i, j, 151) > 0.025) continue;
        // hang it on a wall of this cell, high, facing into the corridor
        const sides: [boolean, number, number, number][] = [
          [wallEast(i, j), (i + 1) * CELL - 0.2, (j + 0.5) * CELL, -Math.PI / 2],
          [wallEast(i - 1, j), i * CELL + 0.2, (j + 0.5) * CELL, Math.PI / 2],
          [wallSouth(i, j), (i + 0.5) * CELL, (j + 1) * CELL - 0.2, Math.PI],
          [wallSouth(i, j - 1), (i + 0.5) * CELL, j * CELL + 0.2, 0],
        ];
        const s = sides.find((x) => x[0]);
        if (!s) continue;
        const sc = screens[k++];
        sc.group.position.set(s[1], 2.05, s[2]);
        sc.group.rotation.y = s[3];
        sc.group.visible = true;
        const deco = rnd(i, j, 152) < 0.5; // art deco at times
        sc.deco.visible = deco;
        sc.brutal.visible = !deco;
        sc.x = s[1];
        sc.z = s[2];
      }
    for (; k < screens.length; k++) screens[k].group.visible = false;
  }

  return {
    group,
    update(px: number, pz: number) {
      const cell = `${Math.floor(px / CELL)}:${Math.floor(pz / CELL)}`;
      if (cell !== lastCell) {
        lastCell = cell;
        place(px, pz);
      }
      let nd = Infinity, near: Wall | null = null;
      for (const s of screens) {
        if (!s.group.visible) continue;
        const d = Math.hypot(s.x - px, s.z - pz);
        if (d < nd) (nd = d), (near = s);
      }
      // only spend the redraw when someone could be watching
      if (nd < 22) drawBroadcast();
      if (near) glow.position.set((near as Wall).x, 2, (near as Wall).z);
      glow.intensity = nd < 12 ? 2.4 + Math.random() * 0.6 : 0;
    },
  };
}
