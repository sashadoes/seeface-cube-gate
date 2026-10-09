// /room/<id>: an approved room, open to anyone with the link (the link in the
// "Your door is open" email). Same renderer as the chamber preview.
import { lazy, Suspense, useEffect, useState } from "react";
import { apiBase } from "./api";
import type { Blueprint } from "./types";
import "./architects.scss";
import "./chamber.scss";

const RoomPreview = lazy(() => import("./room/RoomPreview"));
type Room = { id: string; status: string; blueprint: Blueprint; architect: { alias: string; ig: string } | null };

export default function RoomPage() {
  const id = location.pathname.split("/")[2] ?? "";
  const [room, setRoom] = useState<Room | null>(null);
  const [missing, setMissing] = useState(false);
  const [walk, setWalk] = useState(false);

  useEffect(() => {
    if (!apiBase || !/^[0-9a-f]{24}$/.test(id)) return setMissing(true);
    fetch(`${apiBase}/api/rooms/${id}`)
      .then((r) => r.json())
      .then((d) => (d.ok ? setRoom(d.room) : setMissing(true)))
      .catch(() => setMissing(true));
  }, []);

  if (missing)
    return (
      <main className="arch">
        <div className="arch-wrap" style={{ paddingTop: 80 }}>
          <h1>This door is closed.</h1>
          <p>
            The room doesn't exist, or it hasn't opened yet. <a href="/labyrinth/">Enter the labyrinth →</a>
          </p>
        </div>
      </main>
    );
  if (!room) return <main className="arch" />;

  const bp = room.blueprint;
  const pub = (assetId: string) => Promise.resolve(`${apiBase}/api/rooms/${room.id}/assets/${assetId}`);
  return (
    <main className="arch chamber">
      <header className="ch-top">
        <div className="ch-title">
          <span className="arch-small">a room in the labyrinth{room.architect ? ` · by ${room.architect.alias}` : ""}</span>
          <b>{bp.title}</b>
        </div>
      </header>
      <div className="ch-split">
        <div className="ch-room" style={{ borderLeft: 0 }}>
          <Suspense fallback={<div className="ch-room-wait">the door is opening…</div>}>
            <RoomPreview blueprint={bp} walk={walk} onExit={() => setWalk(false)} resolve={pub} seed={room.id} />
          </Suspense>
          <div className="ch-actions">
            {bp.tagline && <span style={{ width: "100%", textAlign: "center", fontStyle: "italic", color: "var(--dim)" }}>{bp.tagline}</span>}
            <button className="ch-btn primary" onClick={() => setWalk(true)}>
              Enter
            </button>
            {room.architect && (
              <a className="ch-btn" href={`https://instagram.com/${room.architect.ig}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                @{room.architect.ig}
              </a>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
