// Share videos: a 6-second 9:16 clip of what you're seeing (with the game's
// sound), branded with the logo, your name and your invite link, so friends
// who open it land right next to you. Made in the browser with MediaRecorder;
// MP4 where the browser can (iPhone, new Chrome), otherwise WebM.
import { shareToStory } from "./instagram";

export const CLIP_SECONDS = 6;
const W = 720, H = 1280;

export type ClipInfo = { nick: string; place: string; inviteUrl: string };

function pickType() {
  const types = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

export function clipSupported() {
  return typeof MediaRecorder !== "undefined" && !!pickType() && "captureStream" in HTMLCanvasElement.prototype;
}

export function createClipper(audio: MediaStream[]) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;
  const logo = new Image();
  logo.src = "/imgs/seeface-logo-transparent.png";
  let active: { info: ClipInfo; t0: number } | null = null;

  /** call right after the 3D frame is drawn (the WebGL picture is only readable then) */
  function frame(view: HTMLCanvasElement) {
    if (!active) return;
    const { info, t0 } = active;
    const t = (performance.now() - t0) / 1000;
    // the view, cropped to 9:16
    const vr = view.width / view.height, tr = W / H;
    let sw = view.width, sh = view.height, sx = 0, sy = 0;
    if (vr > tr) (sw = view.height * tr), (sx = (view.width - sw) / 2);
    else (sh = view.width / tr), (sy = (view.height - sh) / 2);
    g.drawImage(view, sx, sy, sw, sh, 0, 0, W, H);
    // a gentle vignette + film grain
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    for (let k = 0; k < 400; k++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    // top: logo + place
    if (logo.complete) g.drawImage(logo, W / 2 - 70, 46, 140, 140);
    g.textAlign = "center";
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.font = "italic 30px 'Times New Roman', serif";
    g.fillText(info.place, W / 2, 228);
    // bottom: the invitation (deco frame), fading in
    const a = Math.min(1, t / 0.8);
    const grad = g.createLinearGradient(0, H - 330, 0, H);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${0.85 * a})`);
    g.fillStyle = grad;
    g.fillRect(0, H - 330, W, 330);
    g.globalAlpha = a;
    g.strokeStyle = "#c9a24a";
    g.lineWidth = 2;
    g.strokeRect(60, H - 250, W - 120, 170);
    g.fillStyle = "#fff6e2";
    g.font = "italic 42px 'Times New Roman', serif";
    g.fillText(`${info.nick} invites you`, W / 2, H - 196);
    g.fillStyle = "#c9a24a";
    g.font = "bold 26px 'Arial Narrow', Arial, sans-serif";
    g.fillText("TO THE AFTER LIFE™", W / 2, H - 156);
    g.fillStyle = "#ffe6b8";
    g.font = "30px 'Times New Roman', serif";
    g.fillText(info.inviteUrl.replace(/^https?:\/\//, ""), W / 2, H - 108, W - 140);
    g.globalAlpha = 1;
    // REC dot
    if (Math.floor(t * 2) % 2 === 0) {
      g.fillStyle = "#ff3c3c";
      g.beginPath();
      g.arc(W - 60, 60, 10, 0, Math.PI * 2);
      g.fill();
    }
  }

  async function record(info: ClipInfo): Promise<{ blob: Blob; type: string }> {
    const type = pickType();
    const mix = new AudioContext();
    await mix.resume().catch(() => {});
    const dest = mix.createMediaStreamDestination();
    for (const s of audio) if (s.getAudioTracks().length) mix.createMediaStreamSource(s).connect(dest);
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    active = { info, t0: performance.now() };
    rec.start(250);
    await new Promise((r) => setTimeout(r, CLIP_SECONDS * 1000));
    rec.stop();
    await new Promise((r) => (rec.onstop = r));
    active = null;
    void mix.close();
    return { blob: new Blob(chunks, { type: type.split(";")[0] }), type };
  }

  return { frame, record, busy: () => !!active };
}

export function shareClip(blob: Blob, inviteUrl: string) {
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  const file = new File([blob], `seeface1-after-life.${ext}`, { type: blob.type });
  return shareToStory(file, "meet me in the after life", inviteUrl);
}
