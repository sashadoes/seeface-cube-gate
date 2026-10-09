// The share card: a dark, Story-sized (1080×1920) image of how far you got.
// Shared through the phone's share sheet (Instagram, TikTok, WhatsApp…), or
// downloaded on computers. This is the main way the game spreads.

export type RunResult = { metres: number; shards: number; depth: number; seconds: number; best: boolean };

function load(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

export async function makeCard(r: RunResult): Promise<Blob> {
  const W = 1080, H = 1920;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  g.fillStyle = "#050505";
  g.fillRect(0, 0, W, H);

  // faint corridor vanishing into the dark
  g.strokeStyle = "rgba(255,255,255,0.06)";
  g.lineWidth = 2;
  for (let k = 1; k < 14; k++) {
    const inset = k * 34;
    g.strokeRect(inset, inset * 1.75, W - inset * 2, H - inset * 3.5);
  }
  const vg = g.createRadialGradient(W / 2, H * 0.42, 50, W / 2, H * 0.42, H * 0.7);
  vg.addColorStop(0, "rgba(255,240,210,0.12)");
  vg.addColorStop(1, "rgba(0,0,0,0.9)");
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);

  try {
    const logo = await load("/imgs/seeface-logo-transparent.png");
    g.globalAlpha = 0.95;
    g.shadowColor = "rgba(255,255,255,0.6)";
    g.shadowBlur = 40;
    g.drawImage(logo, W / 2 - 260, 220, 520, 520);
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  } catch {
    // logo missing: card still works
  }

  g.textAlign = "center";
  g.fillStyle = "#f3efe6";
  g.font = "italic 92px 'Times New Roman', serif";
  g.fillText(r.best ? "a new depth." : "it found me.", W / 2, 900);

  g.font = "bold 260px 'Times New Roman', serif";
  g.fillStyle = "#ffffff";
  g.shadowColor = "rgba(255,240,200,0.7)";
  g.shadowBlur = 50;
  g.fillText(`${Math.round(r.metres)} m`, W / 2, 1180);
  g.shadowBlur = 0;

  g.font = "italic 56px 'Times New Roman', serif";
  g.fillStyle = "#bdb7aa";
  g.fillText(`${r.shards} shards  ·  depth ${r.depth + 1}  ·  ${Math.floor(r.seconds / 60)}:${String(Math.floor(r.seconds % 60)).padStart(2, "0")}`, W / 2, 1300);

  g.font = "italic 64px 'Times New Roman', serif";
  g.fillStyle = "#8f8a80";
  g.fillText("can you go deeper?", W / 2, 1560);

  g.font = "48px 'Times New Roman', serif";
  g.fillStyle = "#e9e4da";
  g.fillText("seeface.world/labyrinth", W / 2, 1720);

  return new Promise((res) => c.toBlob((b) => res(b!), "image/jpeg", 0.9));
}

/** Share the card (phones) or download it (computers). */
export async function shareCard(r: RunResult) {
  const blob = await makeCard(r);
  const file = new File([blob], "seeface1-labyrinth.jpg", { type: "image/jpeg" });
  const data = { files: [file], title: "seeface1", text: "seeface.world/labyrinth" };
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
  a.download = "seeface1-labyrinth.jpg";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "downloaded";
}
