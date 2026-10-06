// Snapshot: turns what you're seeing right now into a 9:16 image for Stories,
// TikTok and Reels: the view, your nickname, where you are, the logo, and a
// link that drops whoever opens it right next to you (invite link).

export type SnapInfo = { nick: string; place: string; event: string | null; inviteUrl: string };

function load(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

export async function makeSnapshot(view: HTMLCanvasElement, info: SnapInfo): Promise<Blob> {
  const W = 1080, H = 1920;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);

  // the view, cropped to fill 9:16
  const vr = view.width / view.height, tr = W / H;
  let sw = view.width, sh = view.height, sx = 0, sy = 0;
  if (vr > tr) {
    sw = view.height * tr;
    sx = (view.width - sw) / 2;
  } else {
    sh = view.width / tr;
    sy = (view.height - sh) / 2;
  }
  g.drawImage(view, sx, sy, sw, sh, 0, 0, W, H);

  // film grain + vignette so it looks like a found photo
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.65)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < 9000; k++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  // top: logo + where
  try {
    const logo = await load("/imgs/seeface-logo-transparent.png");
    g.shadowColor = "rgba(255,255,255,0.7)";
    g.shadowBlur = 24;
    g.drawImage(logo, W / 2 - 110, 70, 220, 220);
    g.shadowBlur = 0;
  } catch {
    // logo missing: still fine
  }
  g.textAlign = "center";
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.font = "italic 44px 'Times New Roman', serif";
  g.fillText(info.place, W / 2, 350);
  if (info.event) {
    g.font = "italic 58px 'Times New Roman', serif";
    g.fillStyle = "#fff6d8";
    g.shadowColor = "rgba(255,230,160,0.9)";
    g.shadowBlur = 30;
    g.fillText(info.event, W / 2, 430);
    g.shadowBlur = 0;
  }

  // bottom: who + the way in
  const grad = g.createLinearGradient(0, H - 420, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.85)");
  g.fillStyle = grad;
  g.fillRect(0, H - 420, W, 420);
  g.fillStyle = "#ffffff";
  g.font = "italic 64px 'Times New Roman', serif";
  g.fillText(`${info.nick} was here`, W / 2, H - 250);
  g.fillStyle = "#cfc6b8";
  g.font = "italic 42px 'Times New Roman', serif";
  g.fillText("find me in the labyrinth", W / 2, H - 175);
  g.fillStyle = "#ffe6b8";
  g.font = "44px 'Times New Roman', serif";
  g.fillText("seeface1.world/labyrinth", W / 2, H - 100);

  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.9));
}

export async function shareSnapshot(blob: Blob, inviteUrl: string) {
  const file = new File([blob], "seeface1-snapshot.jpg", { type: "image/jpeg" });
  const data = { files: [file], title: "seeface1", text: `find me in the labyrinth ${inviteUrl}` };
  try {
    if (navigator.canShare?.(data)) {
      await navigator.share(data);
      return "shared";
    }
  } catch {
    return "cancelled";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "seeface1-snapshot.jpg";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "downloaded";
}
