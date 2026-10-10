// Say it, it appears as text: the chat's microphone.
//
// Two ways to turn a voice into words:
//   1. the browser's own speech recognition (Chrome, Safari): live words while you talk, no audio reaches
//      our server;
//   2. where that's missing or blocked (Instagram's / Facebook's in-app browser, Firefox): record in memory,
//      notice when you stop talking, and send the clip to our server once (`/api/voice/transcribe`), which
//      turns it into words and drops it. Nothing is ever stored.
// Either way it stops by itself after ~1.4 s of quiet, and the caller gets the words.
import { apiBase } from "../api";
import { lang } from "../i18n";

export type DictateFail = "blocked" | "nothing" | "off" | "failed";
export type DictateEvents = {
  /** live words so far (browser recognition only) */
  onText: (text: string) => void;
  /** the microphone level 0..1 (recording only), for the button's wave */
  onLevel: (level: number) => void;
  /** recording finished; the words are on their way back from the server */
  onThinking: () => void;
  onDone: (text: string) => void;
  onFail: (why: DictateFail) => void;
};
export type Dictation = { finish: () => void; cancel: () => void };

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
// in-app browsers expose recognition but it never works there (WebKit bug 239816)
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|Threads|TikTok|musical_ly|Line\//i.test(navigator.userAgent);
const canRecord = typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

const QUIET_MS = 1400; // this much quiet after speaking = done
const WAIT_MS = 7000; // nothing said for this long = give up
const MAX_MS = 20000; // one message is never longer

let server: Promise<boolean> | null = null;
/** does our server turn voices into words? (asked once) */
function serverVoice(): Promise<boolean> {
  if (!apiBase || !canRecord) return Promise.resolve(false);
  server ??= fetch(`${apiBase}/api/health`)
    .then((r) => r.json())
    .then((h: { voice?: boolean }) => Boolean(h.voice))
    .catch(() => {
      server = null; // a sleeping server: ask again next time
      return false;
    });
  return server;
}

/** can this browser speak into the chat at all? */
export async function voiceAvailable(): Promise<boolean> {
  if (SR && !IN_APP) return true;
  return serverVoice();
}

function speechLang() {
  const nav = navigator.language || "en-US";
  return nav.toLowerCase().startsWith(lang()) ? nav : lang();
}

export function dictate(ev: DictateEvents): Dictation {
  let stopped = false;
  let current: Dictation = { finish: () => {}, cancel: () => {} };
  const viaServer = async () => {
    if (stopped) return;
    if (!(await serverVoice())) return ev.onFail(SR ? "blocked" : "off");
    if (!stopped) current = record(ev);
  };
  if (SR && !IN_APP) current = recognise(ev, (why) => (why === "blocked" && canRecord ? void viaServer() : ev.onFail(why)));
  else void viaServer();
  return {
    finish: () => current.finish(),
    cancel: () => {
      stopped = true;
      current.cancel();
    },
  };
}

// ---------------------------------------------------------------- 1. the browser's own recognition
function recognise(ev: DictateEvents, fail: (why: DictateFail) => void): Dictation {
  const r = new SR!();
  r.lang = speechLang();
  r.interimResults = true;
  r.continuous = true;
  let text = "";
  let over = false;
  let cancelled = false;
  let quiet = setTimeout(() => r.stop(), WAIT_MS);
  const cap = setTimeout(() => r.stop(), MAX_MS);
  const clear = () => {
    clearTimeout(quiet);
    clearTimeout(cap);
  };
  r.onresult = (e) => {
    text = "";
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    text = text.trim();
    ev.onText(text);
    clearTimeout(quiet);
    quiet = setTimeout(() => r.stop(), QUIET_MS);
  };
  r.onerror = (e) => {
    if (over) return;
    over = true;
    clear();
    if (cancelled || e.error === "aborted") return;
    if (e.error === "not-allowed" || e.error === "service-not-allowed") fail("blocked");
    else if (text) ev.onDone(text);
    else fail(e.error === "no-speech" ? "nothing" : "failed");
  };
  r.onend = () => {
    if (over) return;
    over = true;
    clear();
    if (cancelled) return;
    if (text) ev.onDone(text);
    else fail("nothing");
  };
  try {
    r.start();
  } catch {
    over = true;
    clear();
    fail("failed");
  }
  return {
    finish: () => r.stop(),
    cancel: () => {
      cancelled = true;
      try {
        r.abort();
      } catch {
        // already over
      }
    },
  };
}

// ---------------------------------------------------------------- 2. record → our server → words
function record(ev: DictateEvents): Dictation {
  let cancelled = false;
  let wantEnd = false;
  let end: (() => void) | null = null;
  const run = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      return ev.onFail("blocked");
    }
    if (cancelled) return stream.getTracks().forEach((t) => t.stop());
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // a level meter: hears when you start and stop talking
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    const an = ac.createAnalyser();
    an.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    const t0 = performance.now();
    let floor = 0.01;
    let spoke = false;
    let lastLoud = t0;
    let over = false;

    end = () => {
      if (over) return;
      over = true;
      clearInterval(tick);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        void ac.close();
        if (cancelled) return;
        if (!spoke) return ev.onFail("nothing");
        ev.onThinking();
        const clip = new Blob(chunks, { type: (rec.mimeType || type || "audio/webm").split(";")[0] });
        chunks.length = 0;
        try {
          const r = await fetch(`${apiBase}/api/voice/transcribe`, { method: "POST", headers: { "Content-Type": clip.type }, body: clip });
          const d = (await r.json().catch(() => ({}))) as { text?: string };
          if (cancelled) return;
          if (r.ok && d.text?.trim()) ev.onDone(d.text.trim());
          else ev.onFail(r.status === 503 ? "off" : r.ok ? "nothing" : "failed");
        } catch {
          if (!cancelled) ev.onFail("failed");
        }
      };
      if (rec.state === "recording") rec.stop();
      else void rec.onstop(new Event("stop"));
    };

    const tick = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      if (now - t0 < 300) floor = Math.max(floor, rms); // the room's own noise
      if (rms > Math.max(0.02, floor * 2.2)) {
        spoke = true;
        lastLoud = now;
      }
      ev.onLevel(Math.min(1, rms * 8));
      if ((spoke && now - lastLoud > QUIET_MS) || (!spoke && now - t0 > WAIT_MS) || now - t0 > MAX_MS) end?.();
    }, 50);
    rec.start(250);
    if (wantEnd) end();
  };
  void run();
  const finish = () => {
    wantEnd = true;
    end?.();
  };
  return {
    finish,
    cancel: () => {
      cancelled = true;
      finish();
    },
  };
}
