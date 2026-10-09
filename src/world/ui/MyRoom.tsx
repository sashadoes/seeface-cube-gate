// ME → My Room: own one (500), enter it, name + topic, public/private, an invite link that drops
// friends straight in, decor (buy, then drag it around inside), and the room's transcript
// (owner only, 90 days, only from people who opted in).
import { useState } from "react";
import { DECOR, PACKS, PRICES } from "../../../shared/world/ledger.ts";
import { useUi, type Session } from "../session.ts";

export function MyRoom({ session, onClose }: { session: Session; onClose: () => void }) {
  const mine = useUi("myRoom");
  const coins = useUi("coins");
  const [view, setView] = useState<"main" | "decor" | "coins" | "transcript">("main");
  const [lines, setLines] = useState<{ name: string; text: string; at: number }[] | null>(null);
  const [copied, setCopied] = useState(false);

  if (view === "coins") return <Packs session={session} onBack={() => setView("main")} />;

  if (!mine)
    return (
      <div className="w-myroom">
        <div className="w-row">
          <button data-testid="buy-room" disabled={coins < PRICES.room} onClick={() => session.buyRoom()}>
            🚪 own a room · {PRICES.room}
          </button>
          <button onClick={() => setView("coins")} data-testid="get-coins">
            get coins
          </button>
        </div>
        {coins < PRICES.room && <div className="w-dim small">{PRICES.room - coins} more coins. Show up, listen, talk, or bring a friend who stays.</div>}
      </div>
    );

  const link = `${location.origin}/world/?invite=${mine.invite}`;
  if (view === "decor")
    return (
      <div className="w-myroom">
        <div className="w-lib-h">decor · tap to buy, then drag it in your room</div>
        <div className="w-decor-grid">
          {Object.entries(DECOR).map(([k, d]) => (
            <button key={k} onClick={() => session.decorBuy(k)} disabled={coins < d.price}>
              {d.name}
              <small>{d.price}</small>
            </button>
          ))}
        </div>
        <div className="w-row">
          <button
            onClick={() => {
              session.jumpTo(mine.id);
              session.setEditing(true);
              onClose();
            }}
          >
            ✋ arrange my room
          </button>
          <button onClick={() => setView("main")}>back</button>
        </div>
      </div>
    );

  if (view === "transcript")
    return (
      <div className="w-myroom">
        <div className="w-lib-h">transcript · last 90 days · only people who switched on Transcribe me</div>
        <div className="w-library">
          {lines === null ? <div className="w-dim">opening…</div> : lines.length === 0 ? <div className="w-dim">nothing yet.</div> : lines.map((l, i) => <div key={i}><b>{l.name}</b> {l.text}</div>)}
        </div>
        <button className="w-back" onClick={() => setView("main")}>
          back
        </button>
      </div>
    );

  return (
    <div className="w-myroom" data-testid="my-room">
      <input className="w-in" defaultValue={mine.name} maxLength={32} onBlur={(e) => e.target.value !== mine.name && session.roomEdit({ name: e.target.value })} aria-label="room name" />
      <input className="w-in" defaultValue={mine.topic} maxLength={60} onBlur={(e) => e.target.value !== mine.topic && session.roomEdit({ topic: e.target.value })} aria-label="topic" />
      <div className="w-row">
        <button
          data-testid="enter-room"
          onClick={() => {
            session.jumpTo(mine.id);
            onClose();
          }}
        >
          enter
        </button>
        <button onClick={() => session.roomEdit({ public: !mine.public })}>{mine.public ? "public" : "private"}</button>
        <button onClick={() => setView("decor")}>decor</button>
      </div>
      <div className="w-row">
        <button
          onClick={async () => {
            const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
            if (nav.share) await nav.share({ title: mine.name, text: "come talk in my room", url: link }).catch(() => {});
            else await navigator.clipboard?.writeText(link).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? "link ready ✓" : "invite link"}
        </button>
        <button
          onClick={() => {
            setView("transcript");
            void session.api<{ lines: { name: string; text: string; at: number }[] }>(`/transcript?room=${encodeURIComponent(mine.id)}`).then((r) => setLines(r?.lines ?? []));
          }}
        >
          transcript
        </button>
        <button onClick={() => setView("coins")}>get coins</button>
      </div>
    </div>
  );
}

function Packs({ session, onBack }: { session: Session; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const buy = async (pack: string) => {
    setBusy(true);
    const r = await session.api<{ ok: boolean; url: string }>("/pay/checkout", { pack });
    setBusy(false);
    if (!r?.url) return;
    const u = new URL(r.url, location.href);
    const mock = u.searchParams.get("mockpay");
    // dev mock: complete right here (never in production; the server refuses it there)
    if (mock) await session.api("/pay/mock-complete", { id: mock });
    else location.assign(r.url);
  };
  return (
    <div className="w-myroom">
      <div className="w-lib-h">coin packs · fixed amounts, no random bonuses</div>
      <div className="w-decor-grid">
        {Object.entries(PACKS).map(([k, p]) => (
          <button key={k} disabled={busy} onClick={() => buy(k)} data-testid={`pack-${k}`}>
            {p.label}
            <small>€{(p.cents / 100).toFixed(2)}</small>
          </button>
        ))}
      </div>
      <div className="w-dim small">test mode: no real money moves.</div>
      <button className="w-back" onClick={onBack}>
        back
      </button>
    </div>
  );
}
