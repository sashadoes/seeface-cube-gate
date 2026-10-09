// Browser-side helpers for the chamber: shrink images before upload (textures
// never need more than 2048 px, and Instagram's browser is often on mobile data),
// measure their dominant colours, and turn speech into text.

const MAX_SIDE = 2048;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/ogg", "audio/vorbis"];

async function bitmap(file: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through (older iOS)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** A ≤2048 px copy (the original if it's already small) + up to 5 dominant colours. */
export async function prepareImage(file: File): Promise<{ blob: Blob; palette: string[] }> {
  const img = await bitmap(file);
  const palette = dominant(img);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  if (scale === 1 && file.size < 3 * 1024 * 1024) return { blob: file, palette };
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  const keepAlpha = file.type === "image/png" || file.type === "image/webp";
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, keepAlpha ? "image/webp" : "image/jpeg", 0.9));
  // Safari without webp encoding hands back a PNG: still fine
  return { blob: blob && IMAGE_TYPES.includes(blob.type) ? blob : file, palette };
}

/** Dominant colours: 48×48 sample, 4-bit buckets, most common first, near-duplicates skipped. */
function dominant(img: CanvasImageSource): string[] {
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, 48, 48);
  const d = g.getImageData(0, 0, 48, 48).data;
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    const v = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    v.n++;
    v.r += d[i];
    v.g += d[i + 1];
    v.b += d[i + 2];
    buckets.set(k, v);
  }
  const out: [number, number, number][] = [];
  for (const v of [...buckets.values()].sort((a, b) => b.n - a.n)) {
    const rgb: [number, number, number] = [v.r / v.n, v.g / v.n, v.b / v.n];
    if (out.some((o) => Math.hypot(o[0] - rgb[0], o[1] - rgb[1], o[2] - rgb[2]) < 48)) continue;
    out.push(rgb);
    if (out.length === 5) break;
  }
  return out.map((rgb) => "#" + rgb.map((x) => Math.round(x).toString(16).padStart(2, "0")).join(""));
}

// ------------------------------------------------------------------ voice → text
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
const SR = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export const browserSpeech = Boolean(SR);
export const canRecord = typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

/** Live recognition in the browser (no audio reaches our server). Returns stop(). */
export function listen(onText: (text: string, final: boolean) => void, onEnd: (error?: string) => void): () => void {
  const r = new SR!();
  r.lang = navigator.language || "en-US";
  r.interimResults = true;
  r.continuous = true;
  r.onresult = (e) => {
    let text = "";
    let final = true;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (!e.results[i].isFinal) final = false;
    }
    onText(text, final);
  };
  r.onerror = (e) => onEnd(e.error);
  r.onend = () => onEnd();
  r.start();
  return () => r.stop();
}

/** Record in memory for the server to transcribe. stop() resolves with the clip; the mic is released at once. */
export async function record(): Promise<{ stop: () => Promise<Blob> }> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const type = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t));
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  // never longer than 2 minutes
  const cap = setTimeout(() => rec.state === "recording" && rec.stop(), 120_000);
  return {
    stop: () =>
      new Promise((ok) => {
        rec.onstop = () => {
          clearTimeout(cap);
          stream.getTracks().forEach((t) => t.stop());
          ok(new Blob(chunks, { type: rec.mimeType || type || "audio/webm" }));
        };
        if (rec.state === "recording") rec.stop();
        else rec.onstop?.(new Event("stop"));
      }),
  };
}
