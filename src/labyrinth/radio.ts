// Pocket radio static (Silent Hill style): generated noise, band-limited like
// an old radio, that crackles louder and harsher as the Hollow gets closer.
// No audio files: it's synthesised in the browser with the Web Audio API.

export type Radio = {
  /** 0 = silent, 1 = it's right behind you */
  set: (danger: number) => void;
  resume: () => void;
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
  band.frequency.value = 1800;
  band.Q.value = 0.9;

  // crackle: the gain jumps around in bursts
  const crackle = ctx.createGain();
  crackle.gain.value = 0;
  const master = ctx.createGain();
  master.gain.value = 0;

  noise.connect(band).connect(crackle).connect(master).connect(ctx.destination);
  noise.start();

  let danger = 0;
  const tick = () => {
    const now = ctx.currentTime;
    // bursts get denser and longer as danger rises
    const burst = Math.random() < 0.25 + danger * 0.7 ? 0.35 + Math.random() * 0.65 : Math.random() * 0.12;
    crackle.gain.setTargetAtTime(burst, now, 0.012);
    band.frequency.setTargetAtTime(1200 + Math.random() * 1600 + danger * 900, now, 0.05);
    setTimeout(tick, 40 + Math.random() * (140 - danger * 100));
  };
  tick();

  const pause = () => (document.hidden ? ctx.suspend() : ctx.resume());
  document.addEventListener("visibilitychange", pause);

  return {
    set(d: number) {
      danger = Math.max(0, Math.min(1, d));
      // silent until it's within reach, then rising sharply
      master.gain.setTargetAtTime(danger < 0.05 ? 0 : 0.04 + danger * danger * 0.32, ctx.currentTime, 0.15);
    },
    resume() {
      if (ctx.state !== "running") ctx.resume();
    },
  };
}
