// What we can tell about this device from a plain WebGL context: name, graphics
// chip, cores, memory, screen, and a first guess at the graphics tier.
// No three.js here on purpose: the cube page (pre-launch) uses it too, so the
// very first frame of the labyrinth already starts on the right tier.
import type { Tier } from "./tiers";

/** What we can tell about this device (for the first-visit check and the metrics). */
export type Device = { label: string; gpu: string; cores: number; mem: number; dpr: number; screen: string; phone: boolean; hint: Tier };

const GPU_NAME = /(Apple [MA]\d+[\w ]*?(?= ?,|$)|Apple GPU|Adreno \(TM\) \d+|Adreno \d+|Mali-[\w-]+|PowerVR [\w ]+|Intel\(R\) [\w ]*Graphics[\w ]*|NVIDIA GeForce [\w ]+|GeForce [\w ]+|AMD Radeon[\w ]*|Radeon[\w ]*|Xclipse \d+)/i;
const WEAK_GPU = /Mali-[4T]|Mali-G(31|51|52|57)|Adreno \(TM\) [3-5]\d\d|Adreno [3-5]\d\d|PowerVR|SGX|Intel\(R\) HD Graphics [2-5]\d{2,3}\b/i;

/** the graphics chip's name ("" when the browser hides it) */
export function gpuName(gl: WebGLRenderingContext | WebGL2RenderingContext | null): string {
  try {
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
  } catch {
    return "";
  }
}

/** the chip's name from a throwaway context (the cube page has no renderer); frees the context right after */
export function probeGpu(): string | null {
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return null; // no WebGL at all
    const name = gpuName(gl);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return null;
  }
}

export function guessDevice(gpu: string): Device {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 4; // Safari doesn't say: 4 = "unknown, ordinary"
  const phone = matchMedia("(pointer: coarse)").matches;
  const ua = navigator.userAgent;
  const model = /Android [\d.]+; ([^;)]+)/.exec(ua)?.[1]?.trim();
  const name = /iPhone/.test(ua)
    ? "an iPhone"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
      ? "an iPad"
      : /Android/.test(ua)
        ? model && model !== "K" ? model : phone ? "an Android phone" : "an Android tablet"
        : /Macintosh/.test(ua)
          ? "a Mac"
          : /Windows/.test(ua)
            ? "a Windows PC"
            : /CrOS/.test(ua)
              ? "a Chromebook"
              : "this computer";
  const chip = GPU_NAME.exec(gpu)?.[1]?.trim() ?? "";
  const label = chip && chip !== "Apple GPU" ? `${name} · ${chip}` : name;
  // the first guess, before the frame-rate check
  const weak = WEAK_GPU.test(gpu);
  const apple = /Apple/.test(gpu);
  let hint: Tier = "medium";
  if (mem <= 2 || (phone && weak) || (phone && !apple && (mem <= 3 || cores <= 4))) hint = "low";
  else if (!phone && cores >= 8 && mem >= 8 && !weak) hint = "high";
  else if (weak) hint = "low";
  return { label, gpu, cores, mem, dpr: Math.round(devicePixelRatio * 100) / 100, screen: `${screen.width}x${screen.height}`, phone, hint };
}
