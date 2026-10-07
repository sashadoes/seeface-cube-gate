// The pocket radio, now with a dial. Stations:
//   0.0   static        – the old radio: it crackles when the Hollow is near (always on underneath)
//   66.6  after life fm – a lounge station; a voice reads After Life™ adverts now and then
//   19.94 numbers       – a number station: beeps, then a voice reading digits
//   88.0  gramophone    – whatever record is playing nearest to you, wherever you are
// Voices use the browser's own speech (speechSynthesis), slowed and lowered.
import { playRecord, type FxId, type RecordId } from "./music";

export type StationId = "static" | "fm" | "numbers" | "gramophone";
export const STATIONS: { id: StationId; freq: string; name: string }[] = [
  { id: "static", freq: "0.0", name: "static" },
  { id: "fm", freq: "66.6", name: "after life fm" },
  { id: "numbers", freq: "19.94", name: "numbers" },
  { id: "gramophone", freq: "88.0", name: "gramophone" },
];

const ADS = [
  "after life. now open in your hallway.",
  "tired of being alive? upgrade.",
  "eternity, in easy installments.",
  "satisfaction guaranteed, or your soul back.",
  "operators are dead and waiting.",
  "you are listening to after life f m. you never left.",
];
const FM_EPOCH = Date.UTC(2026, 9, 1); // everyone hears the same bar of the station's song

function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.82;
    u.pitch = 0.55;
    u.volume = 0.8;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {
    // no speech on this device
  }
}

export function createStations(ctx: AudioContext, out: AudioNode, nearestRecord: () => { rec: RecordId; fx: FxId; t0: number } | null) {
  let current: StationId = "static";
  let stopMusic: (() => void) | null = null;
  let musicKey = "";
  const timers: ReturnType<typeof setInterval>[] = [];
  // a radio sounds like a radio: band-limited
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1400;
  band.Q.value = 0.6;
  band.connect(out);

  function music(rec: RecordId, fx: FxId, t0: number) {
    const key = `${rec}:${fx}:${t0}`;
    if (key === musicKey) return;
    stopMusic?.();
    const r = playRecord(ctx, rec, fx, t0);
    r.output.connect(band);
    stopMusic = r.stop;
    musicKey = key;
  }
  function silence() {
    stopMusic?.();
    stopMusic = null;
    musicKey = "";
    try {
      speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
  function beep(f: number, at: number, dur = 0.18) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.18, at + 0.01);
    g.gain.setValueAtTime(0.18, at + dur - 0.02);
    g.gain.linearRampToValueAtTime(0, at + dur);
    o.connect(g).connect(band);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  timers.push(
    setInterval(() => {
      if (document.hidden) return;
      if (current === "fm" && Math.random() < 0.35) speak(ADS[Math.floor(Math.random() * ADS.length)]);
      if (current === "numbers") {
        const now = ctx.currentTime;
        [0, 0.3, 0.6].forEach((d) => beep(880, now + d));
        setTimeout(() => {
          if (current !== "numbers") return;
          const digits = Math.random() < 0.4 ? "1 9 9 4" : Array.from({ length: 4 }, () => Math.floor(Math.random() * 10)).join(" ");
          speak(digits + ". " + digits + ".");
        }, 1200);
      }
    }, 14000),
  );
  timers.push(
    setInterval(() => {
      if (current !== "gramophone") return;
      const p = nearestRecord();
      if (p) music(p.rec, p.fx, p.t0);
      else silence();
    }, 1500),
  );

  return {
    current: () => current,
    /** turn the dial to the next station */
    next() {
      const k = STATIONS.findIndex((s) => s.id === current);
      current = STATIONS[(k + 1) % STATIONS.length].id;
      silence();
      if (current === "fm") {
        music("elevator", "warm", FM_EPOCH);
        setTimeout(() => current === "fm" && speak(ADS[ADS.length - 1]), 1500);
      }
      if (current === "numbers") speak("one. nine. nine. four.");
      if (current === "gramophone") {
        const p = nearestRecord();
        if (p) music(p.rec, p.fx, p.t0);
      }
      return STATIONS.find((s) => s.id === current)!;
    },
    stop() {
      silence();
      timers.forEach(clearInterval);
    },
  };
}
