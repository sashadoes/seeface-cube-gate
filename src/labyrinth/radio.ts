// Pocket radio static (Silent Hill style): generated noise, band-limited like
// an old radio, that crackles louder and harsher as the Hollow gets closer.
// No audio files: it's synthesised in the browser with the Web Audio API.

export type Radio = {
  /** 0 = silent, 1 = it's right behind you */
  set: (danger: number) => void;
  resume: () => void;
  /** settings: 0–1 */
  setVolume: (v: number) => void;
  /** a MediaStream of the static (for recording trailers) */
  tap: () => MediaStream;
};

export function createRadio(): Radio {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();

  // 2 s of white noise, looped
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;

  // radio band: cut lows and highs, a little resonance
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1500;
  band.Q.value = 0.9;

  // crackle: the gain jumps around in bursts
  const crackle = ctx.createGain();
  crackle.gain.value = 0;
  const master = ctx.createGain();
  master.gain.value = 0;

  const volume = ctx.createGain();
  noise.connect(band).connect(crackle).connect(master).connect(volume).connect(ctx.destination);
  noise.start();

  let danger = 0;
  const tick = () => {
    const now = ctx.currentTime;
    // bursts get denser and longer as danger rises
    const burst = Math.random() < 0.2 + danger * 0.6 ? 0.3 + Math.random() * 0.5 : Math.random() * 0.1;
    crackle.gain.setTargetAtTime(burst, now, 0.012);
    band.frequency.setTargetAtTime(1000 + Math.random() * 1000 + danger * 600, now, 0.05); // lower, less hiss
    setTimeout(tick, 40 + Math.random() * (140 - danger * 100));
  };
  tick();

  const pause = () => (document.hidden ? ctx.suspend() : ctx.resume());
  document.addEventListener("visibilitychange", pause);

  return {
    set(d: number) {
      danger = Math.max(0, Math.min(1, d));
      // silent until it's really close, then rising; kept soft (owner 2026-10-07:
      // "keep it for vibe but not too disturbing")
      master.gain.setTargetAtTime(danger < 0.2 ? 0 : 0.015 + danger * danger * 0.13, ctx.currentTime, 0.3);
    },
    resume() {
      if (ctx.state !== "running") ctx.resume();
    },
    setVolume(v: number) {
      volume.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    },
    tap() {
      const d = ctx.createMediaStreamDestination();
      master.connect(d);
      return d.stream;
    },
  };
}
