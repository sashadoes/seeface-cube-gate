// Procedural looks that need no upload: surface textures, skies, lighting and
// ambient sound. Names match the lists in server/architects/blueprint.mjs.
import * as THREE from "three";

// small deterministic random, so a room looks the same for everyone
export function rng(seed: string | number) {
  let h = typeof seed === "number" ? seed : [...seed].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function canvas(size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!] as const;
}
function noise(g: CanvasRenderingContext2D, n: number, alpha: number, r: () => number, size = 256) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(r() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
  }
}

export type Surface = { map: THREE.Texture; roughness: number; metalness: number; emissive?: boolean; repeat: number };

/** Light greyscale textures; the material colour (from the palette) tints them. */
const SURFACES: Record<string, () => Surface> = {
  concrete: () => {
    const [c, g] = canvas();
    g.fillStyle = "#b8b8b8";
    g.fillRect(0, 0, 256, 256);
    noise(g, 5000, 0.18, rng("concrete"));
    return { map: tex(c), roughness: 0.95, metalness: 0, repeat: 4 };
  },
  marble: () => {
    const [c, g] = canvas();
    const r = rng("marble");
    g.fillStyle = "#eeeeee";
    g.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(90,90,90,${0.1 + r() * 0.25})`;
      g.lineWidth = 0.5 + r() * 2;
      g.beginPath();
      let x = r() * 256,
        y = 0;
      g.moveTo(x, y);
      while (y < 256) g.lineTo((x += (r() - 0.5) * 30), (y += 8 + r() * 14));
      g.stroke();
    }
    return { map: tex(c), roughness: 0.25, metalness: 0.05, repeat: 2 };
  },
  velvet: () => {
    const [c, g] = canvas();
    for (let x = 0; x < 256; x++) {
      const v = 150 + Math.sin(x / 9) * 50 + Math.sin(x / 3.1) * 12;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1, 256);
    }
    return { map: tex(c), roughness: 1, metalness: 0, repeat: 3 };
  },
  tile: () => {
    const [c, g] = canvas();
    g.fillStyle = "#e6e6e6";
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#777";
    for (let i = 0; i <= 256; i += 32) {
      g.fillRect(i - 1, 0, 2, 256);
      g.fillRect(0, i - 1, 256, 2);
    }
    return { map: tex(c), roughness: 0.35, metalness: 0, repeat: 6 };
  },
  sand: () => {
    const [c, g] = canvas();
    g.fillStyle = "#d9cbb0";
    g.fillRect(0, 0, 256, 256);
    noise(g, 9000, 0.2, rng("sand"));
    for (let y = 0; y < 256; y += 6) {
      g.strokeStyle = "rgba(120,100,70,0.12)";
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x / 20 + y) * 3);
      g.stroke();
    }
    return { map: tex(c), roughness: 1, metalness: 0, repeat: 8 };
  },
  moss: () => {
    const [c, g] = canvas();
    const r = rng("moss");
    g.fillStyle = "#8a9a7a";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(${40 + r() * 60},${90 + r() * 80},${40 + r() * 40},0.35)`;
      g.beginPath();
      g.arc(r() * 256, r() * 256, 2 + r() * 9, 0, 7);
      g.fill();
    }
    return { map: tex(c), roughness: 1, metalness: 0, repeat: 6 };
  },
  metal: () => {
    const [c, g] = canvas();
    const r = rng("metal");
    g.fillStyle = "#bdbdbd";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) {
      g.fillStyle = `rgba(255,255,255,${r() * 0.12})`;
      g.fillRect(0, y, 256, 1);
    }
    return { map: tex(c), roughness: 0.35, metalness: 0.85, repeat: 3 };
  },
  wood: () => {
    const [c, g] = canvas();
    const r = rng("wood");
    for (let p = 0; p < 8; p++) {
      const base = 150 + r() * 40;
      for (let x = 0; x < 256; x++) {
        const v = base + Math.sin(x / 6 + p * 3) * 14 + (r() - 0.5) * 10;
        g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.85})`;
        g.fillRect(x, p * 32, 1, 31);
      }
      g.fillStyle = "#444";
      g.fillRect(0, p * 32 + 31, 256, 1);
    }
    return { map: tex(c), roughness: 0.7, metalness: 0, repeat: 4 };
  },
  stone: () => {
    const [c, g] = canvas();
    const r = rng("stone");
    g.fillStyle = "#555";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 42) {
      const off = (y / 42) % 2 ? 40 : 0;
      for (let x = -80; x < 256; x += 80) {
        const v = 150 + r() * 50;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x + off + 2, y + 2, 76, 38);
      }
    }
    noise(g, 3000, 0.15, r);
    return { map: tex(c), roughness: 0.9, metalness: 0, repeat: 3 };
  },
  black_mirror: () => {
    const [c, g] = canvas(64);
    g.fillStyle = "#1a1a1a";
    g.fillRect(0, 0, 64, 64);
    return { map: tex(c), roughness: 0.06, metalness: 0.9, repeat: 1 };
  },
  neon_grid: () => {
    const [c, g] = canvas();
    g.fillStyle = "#0a0a0a";
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#ffffff";
    g.shadowColor = "#ffffff";
    g.shadowBlur = 8;
    g.lineWidth = 2;
    for (let i = 0; i <= 256; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
    return { map: tex(c), roughness: 0.5, metalness: 0.2, emissive: true, repeat: 4 };
  },
};
function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const surfaceCache = new Map<string, Surface>();
export function surfacePreset(name: string): Surface | null {
  const make = SURFACES[name];
  if (!make) return null;
  if (!surfaceCache.has(name)) surfaceCache.set(name, make());
  return surfaceCache.get(name)!;
}

// ------------------------------------------------------------------ sky
/** A vertical gradient (+ stars / aurora bands) painted for the inside of a big sphere. */
export function skyTexture(preset: string | null, palette: { primary: string; secondary: string; accent: string; fog: string }) {
  const [c, g] = canvas(512);
  const grad = (stops: [number, string][]) => {
    const gr = g.createLinearGradient(0, 0, 0, 512);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
  };
  const r = rng(preset ?? "sky");
  const stars = (n: number) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
      g.fillRect(r() * 512, r() * 300, r() < 0.1 ? 2 : 1, r() < 0.1 ? 2 : 1);
    }
  };
  switch (preset) {
    case "night_stars":
      grad([[0, "#02030a"], [0.6, "#0a0f24"], [1, palette.fog]]);
      stars(700);
      break;
    case "dusk":
      grad([[0, "#1b1035"], [0.45, "#7a2f55"], [0.62, "#f08a4b"], [1, "#2a1a20"]]);
      stars(60);
      break;
    case "dawn":
      grad([[0, "#2b3a67"], [0.5, "#c8a2c8"], [0.65, "#ffd8a8"], [1, "#e9e4da"]]);
      break;
    case "aurora":
      grad([[0, "#010409"], [1, "#071a1a"]]);
      stars(300);
      for (let k = 0; k < 5; k++) {
        const gr = g.createLinearGradient(0, 60 + k * 30, 0, 200 + k * 30);
        gr.addColorStop(0, "rgba(0,0,0,0)");
        gr.addColorStop(0.5, k % 2 ? "rgba(120,255,200,0.25)" : `${palette.accent}44`);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(0, 120 + k * 25);
        for (let x = 0; x <= 512; x += 32) g.lineTo(x, 110 + k * 25 + Math.sin(x / 50 + k) * 30);
        g.lineTo(512, 300);
        g.lineTo(0, 300);
        g.fill();
      }
      break;
    case "overcast":
      grad([[0, "#6b6f76"], [1, "#a9adb3"]]);
      break;
    case "deep_water":
      grad([[0, "#0e5c7a"], [0.4, "#06324a"], [1, "#010a12"]]);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(200,240,255,${r() * 0.15})`;
        g.fillRect(r() * 512, 0, 2 + r() * 8, 200 + r() * 200);
      }
      break;
    case "void":
      grad([[0, "#000"], [1, "#000"]]);
      break;
    default:
      grad([[0, palette.fog], [0.7, palette.secondary], [1, palette.fog]]);
      stars(120);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ lighting
export type LightRig = { ambient: number; hemi: number; key: number; keyColor: string; points: number; pointColor: "accent" | "secondary" | "warm" | "cool" | "white"; flicker: number; strobe: boolean; exposure: number };
export const LIGHTING: Record<string, LightRig> = {
  dim: { ambient: 0.25, hemi: 0.35, key: 0.4, keyColor: "#ffe8cc", points: 1.2, pointColor: "warm", flicker: 0, strobe: false, exposure: 0.95 },
  neon: { ambient: 0.12, hemi: 0.15, key: 0.15, keyColor: "#b9a4ff", points: 3.2, pointColor: "accent", flicker: 0.05, strobe: false, exposure: 1.05 },
  candle: { ambient: 0.1, hemi: 0.12, key: 0.1, keyColor: "#ffb36b", points: 2.6, pointColor: "warm", flicker: 0.35, strobe: false, exposure: 1 },
  daylight: { ambient: 0.65, hemi: 0.9, key: 2.2, keyColor: "#fff6e8", points: 0.3, pointColor: "white", flicker: 0, strobe: false, exposure: 1.1 },
  strobe: { ambient: 0.08, hemi: 0.1, key: 0.1, keyColor: "#ffffff", points: 3, pointColor: "white", flicker: 0, strobe: true, exposure: 1 },
  moonlight: { ambient: 0.15, hemi: 0.3, key: 0.9, keyColor: "#9fb8ff", points: 0.6, pointColor: "cool", flicker: 0, strobe: false, exposure: 0.95 },
};

// ------------------------------------------------------------------ ambient sound (Web Audio, no files)
/** Starts a looping synthesised ambience into `out`; returns stop(). */
export function playAmbience(ctx: AudioContext, preset: string, out: AudioNode): () => void {
  const nodes: AudioNode[] = [];
  const stops: (() => void)[] = [];
  const osc = (type: OscillatorType, f: number, gain: number, dest: AudioNode = out) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.value = gain;
    o.connect(g).connect(dest);
    o.start();
    nodes.push(o, g);
    stops.push(() => o.stop());
    return { o, g };
  };
  const noiseSrc = () => {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.loop = true;
    s.start();
    nodes.push(s);
    stops.push(() => s.stop());
    return s;
  };
  const filter = (type: BiquadFilterType, f: number, q = 1) => {
    const n = ctx.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    n.Q.value = q;
    nodes.push(n);
    return n;
  };
  const lfo = (target: AudioParam, rate: number, depth: number) => osc("sine", rate, depth, target as unknown as AudioNode);

  switch (preset) {
    case "drone": {
      const lp = filter("lowpass", 420);
      lp.connect(out);
      osc("sawtooth", 55, 0.12, lp);
      osc("sawtooth", 55.4, 0.12, lp);
      osc("sine", 110, 0.08, lp);
      lfo(lp.frequency, 0.05, 160);
      break;
    }
    case "rain": {
      const hp = filter("highpass", 900);
      const g = ctx.createGain();
      g.gain.value = 0.35;
      noiseSrc().connect(hp).connect(g).connect(out);
      nodes.push(g);
      break;
    }
    case "hum": {
      osc("sine", 60, 0.12);
      osc("sine", 120, 0.05);
      osc("sine", 180, 0.025);
      break;
    }
    case "waves": {
      const lp = filter("lowpass", 600);
      const g = ctx.createGain();
      g.gain.value = 0.25;
      noiseSrc().connect(lp).connect(g).connect(out);
      lfo(g.gain, 0.09, 0.22);
      nodes.push(g);
      break;
    }
    case "wind": {
      const bp = filter("bandpass", 500, 0.8);
      const g = ctx.createGain();
      g.gain.value = 0.45;
      noiseSrc().connect(bp).connect(g).connect(out);
      lfo(bp.frequency, 0.07, 300);
      nodes.push(g);
      break;
    }
    case "choir": {
      const lp = filter("lowpass", 1400);
      lp.connect(out);
      for (const f of [220, 261.6, 329.6, 392]) {
        const v = osc("triangle", f, 0.05, lp);
        lfo(v.o.frequency, 5 + Math.random(), 2.5);
      }
      break;
    }
    case "heartbeat": {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(out);
      osc("sine", 48, 1, g);
      const beat = () => {
        const t = ctx.currentTime;
        for (const off of [0, 0.28]) {
          g.gain.setValueAtTime(0, t + off);
          g.gain.linearRampToValueAtTime(0.5, t + off + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.22);
        }
      };
      beat();
      const id = setInterval(beat, 1100);
      stops.push(() => clearInterval(id));
      nodes.push(g);
      break;
    }
    default:
      break; // "silence"
  }
  return () => {
    stops.forEach((s) => {
      try {
        s();
      } catch {
        // already stopped
      }
    });
    nodes.forEach((n) => n.disconnect());
  };
}
