// The interface of SEEFACE1 WORLD's places (plots.ts) and shows (shows.ts):
//   · a prompt when you stand in a room on the land (claim it / call the
//     architect / ♥ someone's place and see their instagram)
//   · the world guide (▦): explore everyone's places, my place, shows & prices
//   · the architect: a step-by-step conversation that becomes a build brief
//   · the ribbon: opening your place to everyone, with a link to share
//   · a "● live" chip while a booked show is on
import { useEffect, useMemo, useState } from "react";
import { t as tr } from "../i18n";
import { track } from "../analytics";
import { apiBase, apiReady } from "../api";
import { roomCentre } from "./maze";
import { shrink } from "./posts";
import {
  ALL_LOTS, IG, MAX_WALL_PIECES, PALETTE, PIECES, PURPOSES, STYLES, cleanText, districtOf, doorstep, parsePlotId, plotId,
  type Design, type PieceId, type Plot, type Plots, type StyleId,
} from "./plots";
import { FOUNDING, PACKS, liveShow, nextShows, type Pack, type Show } from "./shows";

export type WorldTab = "explore" | "mine" | "shows";
type Props = {
  plots: Plots;
  /** the room on the land you're standing in */
  here: { I: number; J: number } | null;
  nearArchitect: boolean;
  nick: string;
  tab: WorldTab | null;
  setTab: (t: WorldTab | null) => void;
  /** free travel to a place (null = ok, else why not) */
  go: (x: number, z: number, yaw: number) => string | null;
  guide: (x: number, z: number, name: string) => void;
  say: (text: string) => void;
};

const BLANK: Design = { name: "", purpose: "gallery", style: "luxury", colors: [PALETTE[0], PALETTE[1]], pieces: ["screen", "frames", "sofa", "rug"], products: [], ig: "", about: "" };
export const placeLink = (id: string) => `${location.origin}/labyrinth/?place=${id}`;

async function shareLink(id: string, name: string) {
  const url = placeLink(id);
  try {
    if (navigator.share) {
      await navigator.share({ title: name, text: tr("walk into {name} in seeface1 world", { name }), url });
      return "shared";
    }
  } catch {
    return "cancelled";
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

const stop = (e: React.PointerEvent) => e.stopPropagation();

export function PlotPanel(p: Props) {
  const { plots, here } = p;
  const [, bump] = useState(0);
  useEffect(() => {
    const off = plots.onChange(() => bump((n) => n + 1));
    return () => void off();
  }, [plots]);
  // the live chip re-checks every 30 s
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [architect, setArchitect] = useState(false);
  const [ribbon, setRibbon] = useState<Plot | null>(null);
  const mine = plots.mine();
  const herePlot = here ? plots.at(here.I, here.J) : null;
  const hereId = here ? plotId(here.I, here.J) : "";

  // count a visit when you walk into someone's opened place
  useEffect(() => {
    if (herePlot?.opened && !plots.isMine(herePlot)) {
      plots.visit(herePlot.id);
      track("place-visit");
    }
  }, [hereId, herePlot?.opened]); // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (pl: Plot | { I: number; J: number }, name: string) => {
    const d = doorstep(pl.I, pl.J);
    const why = p.go(d.x, d.z, d.yaw);
    if (why) p.say(why);
    else {
      p.setTab(null);
      track("place-go");
    }
    void name;
  };

  const claimHere = () => {
    if (!here) return;
    const r = plots.claim(here.I, here.J);
    if (r === "ok") {
      track("place-claim");
      setArchitect(true);
    } else if (r === "have") p.say(tr("you already have a place · give it back first to move"));
    else if (r === "taken") p.say(tr("someone was faster"));
  };

  const live = liveShow(now);

  return (
    <>
      {/* ---------------------------------------------------------- the live chip */}
      {live && <LiveChip show={live} plots={plots} goTo={goTo} go={p.go} say={p.say} />}

      {/* ---------------------------------------------------------- in a room */}
      {!p.tab && !architect && here && !herePlot && !mine && (
        <button className="lab-market-btn lab-plot-btn" onPointerDown={stop} onPointerUp={stop} onClick={claimHere}>
          {tr("this room is free · make it yours")}
        </button>
      )}
      {!p.tab && !architect && herePlot && plots.isMine(herePlot) && (
        <div className="lab-plot-bar mine" onPointerDown={stop} onPointerUp={stop}>
          <span>
            <b>{herePlot.d?.name ?? tr("your room")}</b>
            <i>{herePlot.opened ? tr("{v} visits · ♥ {l}", { v: plots.visits(herePlot.id), l: plots.loves(herePlot.id) }) : herePlot.d ? tr("built · not open yet") : tr("empty · waiting for the architect")}</i>
          </span>
          <button onClick={() => setArchitect(true)}>✎ {tr("architect")}</button>
          {herePlot.d && !herePlot.opened && (
            <button className="hot" onClick={() => {
              const q = plots.openToAll();
              if (q) (setRibbon(q), track("place-open"));
            }}>
              ✂ {tr("open it")}
            </button>
          )}
        </div>
      )}
      {!p.tab && !architect && herePlot?.d && !plots.isMine(herePlot) && (
        <div className="lab-plot-bar" onPointerDown={stop} onPointerUp={stop}>
          <span>
            <b>{herePlot.d.name}</b>
            <i>
              {tr("by @{nick}", { nick: herePlot.nick })} · {tr(PURPOSES.find((x) => x.id === herePlot.d!.purpose)!.label)}
              {herePlot.d.about ? ` · ${herePlot.d.about}` : ""}
            </i>
          </span>
          <button className={plots.loved(herePlot.id) ? "on" : ""} onClick={() => (plots.love(herePlot.id, !plots.loved(herePlot.id)), track("place-love"))}>
            ♥ {plots.loves(herePlot.id)}
          </button>
          {plots.instagram(herePlot) && (
            <a href={`https://instagram.com/${plots.instagram(herePlot)}`} target="_blank" rel="noopener noreferrer nofollow" onClick={() => track("place-instagram")}>
              ig ↗
            </a>
          )}
        </div>
      )}
      {!p.tab && !architect && p.nearArchitect && !here && (
        <button className="lab-market-btn lab-plot-btn" onPointerDown={stop} onPointerUp={stop} onClick={() => (mine ? setArchitect(true) : p.setTab("mine"))}>
          ✎ {mine ? tr("ask the architect to change my place") : tr("ask the architect for a place of my own")}
        </button>
      )}

      {/* ---------------------------------------------------------- the world guide */}
      {p.tab && (
        <div className="lab-settings" onPointerDown={stop} onPointerUp={stop}>
          <div className="lab-settings-box lab-world">
            <div className="lab-settings-tabs">
              {(["explore", "mine", "shows"] as const).map((t) => (
                <button key={t} className={p.tab === t ? "on" : ""} onClick={() => p.setTab(t)}>
                  {t === "explore" ? tr("explore") : t === "mine" ? tr("my place") : tr("shows")}
                </button>
              ))}
            </div>
            <div className="lab-settings-body">
              {p.tab === "explore" && <Explore plots={plots} goTo={goTo} guide={p.guide} live={live} now={now} />}
              {p.tab === "mine" && (
                <Mine
                  plots={plots}
                  build={() => (p.setTab(null), setArchitect(true))}
                  goTo={goTo}
                  guide={p.guide}
                  say={p.say}
                  open={() => {
                    const q = plots.openToAll();
                    if (q) (p.setTab(null), setRibbon(q), track("place-open"));
                  }}
                />
              )}
              {p.tab === "shows" && <Shows nick={p.nick} mine={mine} />}
            </div>
            <div className="lab-settings-foot">
              <button onClick={() => p.setTab(null)}>{tr("close")}</button>
              <span className="lab-world-count">{tr("{n} of {all} rooms still free", { n: plots.freeCount(), all: ALL_LOTS.length })}</span>
            </div>
          </div>
        </div>
      )}

      {architect && mine && (
        <Architect
          plot={mine}
          plots={plots}
          close={() => setArchitect(false)}
          built={(open) => {
            setArchitect(false);
            track("place-built");
            if (open) {
              const q = plots.openToAll();
              if (q) (setRibbon(q), track("place-open"));
            } else p.say(tr("built. walk in and look · open it when it's ready"));
          }}
        />
      )}

      {ribbon && <Ribbon plot={ribbon} close={() => setRibbon(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ explore
function Explore({ plots, goTo, guide, live, now }: { plots: Plots; goTo: (pl: Plot, name: string) => void; guide: Props["guide"]; live: Show | null; now: number }) {
  const [sort, setSort] = useState<"hot" | "new">("hot");
  const list = useMemo(() => {
    const l = plots.open();
    return sort === "new" ? [...l].sort((a, b) => (b.opened ?? 0) - (a.opened ?? 0)) : l;
  }, [plots, sort, now, plots.all().length]); // eslint-disable-line react-hooks/exhaustive-deps
  const soon = nextShows(now).filter((s) => s !== live).slice(0, 3);
  return (
    <>
      {soon.length > 0 && (
        <div className="lab-world-soon">
          {soon.map((s) => (
            <div key={s.id}>
              <b>{s.title}</b> <i>{tr("by {artist}", { artist: s.artist })} · {new Date(s.start).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</i>
            </div>
          ))}
        </div>
      )}
      <div className="lab-world-sort">
        <button className={sort === "hot" ? "on" : ""} onClick={() => setSort("hot")}>{tr("hot this week")}</button>
        <button className={sort === "new" ? "on" : ""} onClick={() => setSort("new")}>{tr("just opened")}</button>
      </div>
      <div className="lab-market-list lab-world-list">
        {list.map((pl, k) => {
          const c = roomCentre(pl.I, pl.J);
          return (
            <div key={pl.id}>
              <span className="g" style={{ color: pl.d!.colors[0] }}>{sort === "hot" && k < 3 ? ["①", "②", "③"][k] : PURPOSES.find((x) => x.id === pl.d!.purpose)?.glyph}</span>
              <span className="n">
                {pl.d!.name}
                <i>
                  @{pl.nick} · {tr(STYLES[pl.d!.style].label)} · {tr(districtOf(pl.I, pl.J)!.name)}
                  <br />♥ {plots.loves(pl.id)} · {tr("{n} this week", { n: plots.week(pl.id) })}
                </i>
              </span>
              <span className="lab-world-go">
                <button onClick={() => goTo(pl, pl.d!.name)}>{tr("go")}</button>
                <button className="soft" onClick={() => (guide(c.x, c.z, pl.d!.name), track("place-guide"))}>{tr("walk")}</button>
              </span>
            </div>
          );
        })}
        {!list.length && <p className="note">{tr("no places open yet. the first one gets every visitor: claim a free room in my place.")}</p>}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ my place
function Mine({ plots, build, goTo, guide, say, open }: { plots: Plots; build: () => void; goTo: (pl: Plot | { I: number; J: number }, name: string) => void; guide: Props["guide"]; say: (t: string) => void; open: () => void }) {
  const mine = plots.mine();
  const [sure, setSure] = useState(false);
  if (!mine) {
    const pick = (() => {
      // the realtor: the nearest free room to the entrance
      const l = ALL_LOTS.find((x) => !plots.get(x.id));
      return l ?? null;
    })();
    return (
      <>
        <p className="lab-world-lead">{tr("a room of your own in the labyrinth. free while the opening lasts. you describe it, the architect builds it, your name goes on the door.")}</p>
        <ol className="lab-world-steps">
          <li>{tr("walk into any room with a gold \"free room\" sign, or let the realtor pick one")}</li>
          <li>{tr("tell the architect what it's for, the style, the colours, what goes inside")}</li>
          <li>{tr("open it: you get a link that drops people right at your door")}</li>
        </ol>
        {pick && (
          <div className="lab-world-realtor">
            <i>◇ {tr("the realtor")}: “{tr("location, location, labyrinth. this one's {d}. {name}.", { d: Math.round(pick.d) + " m", name: tr(districtOf(pick.I, pick.J)!.name) })}”</i>
            <span className="lab-world-go">
              <button onClick={() => goTo(pick, "")}>{tr("take me there")}</button>
              <button className="soft" onClick={() => {
                const c = roomCentre(pick.I, pick.J);
                guide(c.x, c.z, tr("free room"));
                track("place-guide-free");
              }}>{tr("walk")}</button>
            </span>
          </div>
        )}
        <div className="lab-world-districts">
          {(["front", "streets", "deep"] as const).map((d) => {
            const lots = ALL_LOTS.filter((l) => districtOf(l.I, l.J)!.id === d);
            const free = lots.filter((l) => !plots.get(l.id)).length;
            const dist = districtOf(lots[0].I, lots[0].J)!;
            return (
              <div key={d}>
                <b>{tr(dist.name)}</b>
                <i>{tr(dist.blurb)}</i>
                <small>{tr("{n} of {all} free", { n: free, all: lots.length })}</small>
              </div>
            );
          })}
        </div>
      </>
    );
  }
  const name = mine.d?.name ?? tr("your room");
  return (
    <>
      <div className="lab-world-mine">
        <b style={{ color: mine.d?.colors[0] }}>{name}</b>
        <i>
          {tr(districtOf(mine.I, mine.J)!.name)} · {mine.opened ? tr("open") : mine.d ? tr("built · not open yet") : tr("empty")}
        </i>
        {mine.opened && <i>{tr("{v} visits · {w} this week · ♥ {l}", { v: plots.visits(mine.id), w: plots.week(mine.id), l: plots.loves(mine.id) })}</i>}
        {plots.pendingReview(mine) && <small>{tr("your picture and instagram show to others after a quick check")}</small>}
      </div>
      <div className="lab-world-actions">
        <button className="done" onClick={build}>✎ {mine.d ? tr("change it with the architect") : tr("build it with the architect")}</button>
        {mine.d && !mine.opened && <button className="done" onClick={open}>✂ {tr("open it to everyone")}</button>}
        {mine.opened && (
          <button className="done" onClick={async () => {
            const r = await shareLink(mine.id, name);
            track(`place-share-${r}`);
            if (r === "copied") say(tr("link copied: put it in your bio"));
          }}>⇪ {tr("share my place")}</button>
        )}
        <button onClick={() => goTo(mine, name)}>{tr("go to my place")}</button>
        {!sure ? <button className="soft" onClick={() => setSure(true)}>{tr("give it back")}</button> : (
          <button className="soft" onClick={() => (plots.giveBack(), setSure(false), track("place-give-back"))}>{tr("yes, give it back: it's gone for everyone")}</button>
        )}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ shows & prices
function Shows({ nick, mine }: { nick: string; mine: Plot | null }) {
  const [pack, setPack] = useState<Pack["id"] | null>(null);
  const [ig, setIg] = useState(mine?.d?.ig ?? "");
  const [when, setWhen] = useState("");
  const [about, setAbout] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"" | "busy" | "sent" | "failed">("");
  const pick = (id: Pack["id"]) => {
    setPack(id);
    track(`show-interest-${id}`);
  };
  const send = async () => {
    if (!IG.test(ig.replace(/^@/, "").toLowerCase())) return setState("failed");
    setState("busy");
    try {
      const r = await fetch(`${apiBase}/api/show-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nick, ig: ig.replace(/^@/, "").toLowerCase(), pack, when: when.slice(0, 60), about: about.slice(0, 300), email: email.trim() || undefined, place: mine?.id ?? null }),
      });
      setState(r.ok ? "sent" : "failed");
      if (r.ok) track(`show-request-${pack}`);
    } catch {
      setState("failed");
    }
  };
  if (pack && pack !== "room") {
    const pk = PACKS.find((x) => x.id === pack)!;
    return (
      <>
        <p className="lab-world-lead">
          <b>{tr(pk.name)}</b> · {pk.price} {tr(pk.per)}
        </p>
        {!apiReady ? (
          <p className="note">{tr("booking opens very soon. we counted your interest. meanwhile, build your place: shows happen in it.")}</p>
        ) : state === "sent" ? (
          <p className="lab-world-lead">{tr("got it. we'll write to you on instagram to set the night. nothing is paid until you say yes.")}</p>
        ) : (
          <>
            <label className="toggle"><span>{tr("your instagram")}</span><input className="lab-post-cap" value={ig} onChange={(e) => setIg(e.target.value)} placeholder="@" maxLength={31} /></label>
            <label className="toggle"><span>{tr("when")}</span><input className="lab-post-cap" value={when} onChange={(e) => setWhen(e.target.value)} placeholder={tr("e.g. a friday in november")} maxLength={60} /></label>
            <label className="toggle"><span>{tr("email (optional)")}</span><input className="lab-post-cap" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} /></label>
            <textarea className="lab-post-cap lab-world-about" value={about} onChange={(e) => setAbout(e.target.value)} placeholder={tr("what's the show? (a release, a drop, a listening party, an exhibition…)")} maxLength={300} />
            <p className="note">{tr("a request, not a payment. we only use this to plan your show with you.")}</p>
            {state === "failed" && <p className="note">{tr("check your instagram handle and try again")}</p>}
          </>
        )}
        <div className="lab-world-actions">
          {apiReady && state !== "sent" && <button className="done" disabled={state === "busy"} onClick={() => void send()}>{tr("request this show")}</button>}
          <button onClick={() => (setPack(null), setState(""))}>{tr("back")}</button>
        </div>
      </>
    );
  }
  return (
    <>
      <p className="lab-world-lead">{tr("seeface1 world is a world for artists. build your place for free. when you want the whole world to come, book a show night.")}</p>
      <div className="lab-world-packs">
        {PACKS.map((pk) => (
          <button key={pk.id} className={"lab-world-pack" + (pk.hot ? " hot" : "")} onClick={() => pick(pk.id)}>
            <span className="h">
              <b>{tr(pk.name)}</b>
              <em>{pk.price === "free" ? tr("free") : pk.price}</em>
            </span>
            <small>{tr(pk.per)}{pk.price !== "free" ? ` · ${tr("planned price")}` : ""}</small>
            <ul>{pk.lines.map((l) => <li key={l}>{tr(l)}</li>)}</ul>
          </button>
        ))}
      </div>
      <p className="note">{tr(FOUNDING)}</p>
      <p className="note">{tr("places and shows are a service inside seeface1 world, not an investment: they don't gain value and can't be cashed out. ◈ has no money value.")}</p>
    </>
  );
}

// ------------------------------------------------------------------ the live chip
function LiveChip({ show, plots, goTo, go, say }: { show: Show; plots: Plots; goTo: (pl: { I: number; J: number }, name: string) => void; go: Props["go"]; say: (t: string) => void }) {
  const at = typeof show.at === "string" ? parsePlotId(show.at) : null;
  void plots;
  return (
    <button
      className="lab-live-chip"
      onPointerDown={stop}
      onPointerUp={stop}
      onClick={() => {
        track("show-live-go");
        if (at) return goTo(at, show.title);
        if (typeof show.at !== "string") {
          const why = go(show.at.x, show.at.z, 0);
          if (why) say(why);
        }
      }}
    >
      <i>●</i> {tr("live")} · {show.title} · <b>{tr("go")}</b>
    </button>
  );
}

// ------------------------------------------------------------------ the ribbon
function Ribbon({ plot, close }: { plot: Plot; close: () => void }) {
  const [msg, setMsg] = useState("");
  const name = plot.d?.name ?? "";
  return (
    <div className="lab-settings lab-ribbon" onPointerDown={stop} onPointerUp={stop}>
      <div className="lab-ribbon-fx" aria-hidden>
        {Array.from({ length: 36 }, (_, k) => (
          <span key={k} style={{ left: `${(k * 37) % 100}%`, animationDelay: `${(k % 9) * 0.12}s`, background: k % 2 ? plot.d?.colors[0] : plot.d?.colors[1] }} />
        ))}
      </div>
      <div className="lab-settings-box lab-ribbon-box">
        <div className="lab-ribbon-cut">✂</div>
        <b style={{ color: plot.d?.colors[0] }}>{name}</b>
        <p>{tr("is open. anyone walking past sees your name on the door.")}</p>
        <p className="note">{tr("now bring people: this link drops them right at your door.")}</p>
        <code>{placeLink(plot.id).replace(/^https?:\/\//, "")}</code>
        {msg && <p className="note">{msg}</p>}
        <div className="lab-world-actions">
          <button className="done" onClick={async () => {
            const r = await shareLink(plot.id, name);
            track(`place-share-${r}`);
            if (r === "copied") setMsg(tr("link copied: put it in your bio"));
          }}>⇪ {tr("share my place")}</button>
          <button onClick={close}>{tr("later")}</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the architect
const LINES = [
  "so. you want a room of your own. what is it for?",
  "what does it feel like inside?",
  "two colours. the neon remembers them.",
  "what goes inside? up to eight things on the walls.",
  "what's on the sign above the door?",
  "how do people find you outside the labyrinth?",
  "here's the brief. say the word and i build it.",
];

function Architect({ plot, plots, close, built }: { plot: Plot; plots: Plots; close: () => void; built: (open: boolean) => void }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Design>(() => plot.d ?? { ...BLANK, ig: "" });
  const [img, setImg] = useState<string | null | undefined>(undefined); // undefined = unchanged
  const [agreed, setAgreed] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: Partial<Design>) => setD((x) => ({ ...x, ...k }));
  const shownImg = img === undefined ? plots.picture(plot) : img;
  const wallCount = d.pieces.filter((x) => PIECES.find((y) => y.id === x)?.wall).length;
  const togglePiece = (id: PieceId) =>
    setD((x) => {
      const isWall = PIECES.find((y) => y.id === id)!.wall;
      const walls = x.pieces.filter((p) => PIECES.find((y) => y.id === p)?.wall).length;
      if (x.pieces.includes(id)) return { ...x, pieces: x.pieces.filter((p) => p !== id) };
      return !isWall || walls < MAX_WALL_PIECES ? { ...x, pieces: [...x.pieces, id] } : x;
    });
  const next = () => {
    setErr("");
    if (step === 4 && !cleanText(d.name, 24)) return setErr(tr("the sign needs a name (no links or @handles here)"));
    if (step === 5) {
      const h = d.ig.replace(/^@/, "").toLowerCase();
      if (h && !IG.test(h)) return setErr(tr("that doesn't look like an instagram handle"));
      set({ ig: h });
      if (img && !agreed) return setErr(tr("tick the artist agreement to show your picture"));
    }
    setStep((s) => Math.min(LINES.length - 1, s + 1));
  };
  const finish = (open: boolean) => {
    const ok = plots.build({ ...d, ig: d.ig.replace(/^@/, "").toLowerCase() }, img);
    if (!ok) return setErr(tr("the architect couldn't read that. check the name."));
    built(open && !plot.opened);
  };

  return (
    <div className="lab-settings" onPointerDown={stop} onPointerUp={stop}>
      <div className="lab-settings-box lab-architect">
        <div className="lab-architect-head">
          <i>◇ {tr("the architect")}</i>
          <span>{step + 1} / {LINES.length}</span>
        </div>
        <p className="lab-architect-line">“{tr(LINES[step])}”</p>
        <div className="lab-architect-layout">
          <div className="lab-architect-left">
            <div className="lab-settings-body">
          {step === 0 && (
            <div className="lab-architect-grid">
              {PURPOSES.map((x) => (
                <button key={x.id} className={d.purpose === x.id ? "on" : ""} onClick={() => set({ purpose: x.id })}>
                  <span>{x.glyph}</span>{tr(x.label)}
                </button>
              ))}
            </div>
          )}
          {step === 1 && (
            <div className="lab-architect-grid">
              {(Object.keys(STYLES) as StyleId[]).map((id) => (
                <button key={id} className={d.style === id ? "on" : ""} onClick={() => set({ style: id })}>
                  <span className="sw" style={{ background: `#${STYLES[id].wall.toString(16).padStart(6, "0")}`, boxShadow: `inset 0 -6px 0 #${STYLES[id].light.toString(16).padStart(6, "0")}` }} />
                  {tr(STYLES[id].label)}
                </button>
              ))}
            </div>
          )}
          {step === 2 && (
            <>
              {[0, 1].map((k) => (
                <div key={k} className="lab-architect-colors">
                  <small>{k ? tr("second") : tr("first")}</small>
                  {PALETTE.map((c) => (
                    <button key={c} aria-label={c} className={d.colors[k] === c ? "on" : ""} style={{ background: c, color: c }} onClick={() => set({ colors: (k ? [d.colors[0], c] : [c, d.colors[1]]) as [string, string] })} />
                  ))}
                </div>
              ))}
            </>
          )}
          {step === 3 && (
            <>
              <div className="lab-architect-grid">
                {PIECES.map((x) => (
                  <button key={x.id} className={d.pieces.includes(x.id) ? "on" : ""} onClick={() => togglePiece(x.id)}>
                    <span>{x.glyph}</span>{tr(x.label)}
                  </button>
                ))}
              </div>
              <p className="note">{tr("{n} of {max} wall pieces · the mirror ball and the rug are extra", { n: wallCount, max: MAX_WALL_PIECES })}</p>
            </>
          )}
          {step === 4 && (
            <>
              <label className="toggle"><span>{tr("name on the sign")}</span><input className="lab-post-cap" value={d.name} maxLength={24} onChange={(e) => set({ name: e.target.value })} placeholder={tr("e.g. velvet static")} /></label>
              <label className="toggle"><span>{tr("one line about it")}</span><input className="lab-post-cap" value={d.about} maxLength={80} onChange={(e) => set({ about: e.target.value })} placeholder={tr("e.g. prints, beats and bad decisions")} /></label>
              {(d.purpose === "shop" || d.pieces.includes("shelves")) && (
                <>
                  <p className="note">{tr("on the shelves (up to 3): what you make, and its price")}</p>
                  {[0, 1, 2].map((k) => (
                    <div key={k} className="lab-architect-product">
                      <input className="lab-post-cap" value={d.products[k]?.name ?? ""} maxLength={28} placeholder={tr("item")} onChange={(e) => {
                        const pr = [...d.products];
                        pr[k] = { name: e.target.value, price: pr[k]?.price ?? "" };
                        set({ products: pr.filter((x, i) => x || i < k) });
                      }} />
                      <input className="lab-post-cap" value={d.products[k]?.price ?? ""} maxLength={10} placeholder="€" onChange={(e) => {
                        const pr = [...d.products];
                        pr[k] = { name: pr[k]?.name ?? "", price: e.target.value };
                        set({ products: pr });
                      }} />
                    </div>
                  ))}
                  <p className="note">{tr("people buy from you on your instagram for now. checkout inside the world comes later.")}</p>
                </>
              )}
            </>
          )}
          {step === 5 && (
            <>
              <label className="toggle"><span>{tr("your instagram")}</span><input className="lab-post-cap" value={d.ig} maxLength={31} onChange={(e) => set({ ig: e.target.value })} placeholder="@" /></label>
              <label className="toggle">
                <span>{tr("a picture for the big screen")}</span>
                <input type="file" accept="image/*" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setImg(await shrink(f, 320));
                }} />
              </label>
              {shownImg && (
                <div className="lab-architect-pic">
                  <img src={shownImg} alt="" />
                  <button onClick={() => setImg(null)}>{tr("remove")}</button>
                </div>
              )}
              {img && (
                <label className="lab-agree">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                  <span>
                    {tr("it's my own work and i agree to the")} <a href="/artists" target="_blank" rel="noopener">{tr("artist agreement")}</a>
                  </span>
                </label>
              )}
              <p className="note">{tr("your handle and picture show to others after a quick check. your name on the sign shows right away.")}</p>
            </>
          )}
          {step === 6 && (
            <pre className="lab-architect-brief">{JSON.stringify({
              plot_id: plot.id,
              owner: plot.nick,
              instagram: d.ig ? `@${d.ig.replace(/^@/, "")}` : "",
              purpose: d.purpose,
              style: STYLES[d.style].label,
              colours: d.colors,
              must_have: ["neon sign with name", ...d.pieces.map((x) => PIECES.find((y) => y.id === x)!.label)],
              products: d.products.filter((x) => x.name),
              access: "public",
              district: districtOf(plot.I, plot.J)!.name,
            }, null, 1)}</pre>
          )}
          {err && <p className="note lab-architect-err">{err}</p>}
            </div>
          </div>
          <ArchitectPreview design={d} image={shownImg || null} seed={plot.id} />
        </div>
        <div className="lab-settings-foot">
          <button onClick={() => (step ? setStep(step - 1) : close())}>{step ? tr("back") : tr("not now")}</button>
          {step < LINES.length - 1 ? (
            <button className="done" onClick={next}>{tr("next")}</button>
          ) : (
            <span className="lab-architect-finish">
              <button className="done" onClick={() => finish(false)}>{plot.d ? tr("rebuild it") : tr("build it")}</button>
              {!plot.opened && <button className="done hot" onClick={() => finish(true)}>{tr("build + open it")}</button>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** A small live room view, using the same seeded Picsum image family as the maze walls. */
function ArchitectPreview({ design, image, seed }: { design: Design; image: string | null; seed: string }) {
  const style = STYLES[design.style];
  const colors = design.colors;
  const texture = (variant: number) => `url("https://picsum.photos/seed/seeface1-${encodeURIComponent(seed)}-${variant}/256?grayscale")`;
  const panels = design.pieces.filter((x) => PIECES.find((y) => y.id === x)?.wall).slice(0, 4);
  return (
    <aside className="lab-architect-preview" aria-label="Live room preview">
      <div className="lab-architect-room" style={{
        "--preview-wall": `#${style.wall.toString(16).padStart(6, "0")}`,
        "--preview-floor": `#${style.floor.toString(16).padStart(6, "0")}`,
        "--preview-light": colors[0],
        "--preview-second": colors[1],
      } as React.CSSProperties}>
        <div className="lab-architect-back" style={{ backgroundImage: `${texture(0)}, linear-gradient(var(--preview-wall), var(--preview-wall))` }} />
        <div className="lab-architect-side left" style={{ backgroundImage: `${texture(1)}, linear-gradient(var(--preview-wall), var(--preview-wall))` }} />
        <div className="lab-architect-side right" style={{ backgroundImage: `${texture(2)}, linear-gradient(var(--preview-wall), var(--preview-wall))` }} />
        <div className="lab-architect-floor" style={{ backgroundColor: `#${style.floor.toString(16).padStart(6, "0")}` }} />
        <div className="lab-architect-name">{design.name || "THE NULL INDEX"}</div>
        <div className="lab-architect-art" style={{ backgroundImage: image ? `url("${image}")` : texture(3) }} />
        <div className="lab-architect-furniture" aria-hidden="true">
          {panels.map((piece, i) => <i key={piece} className={`piece piece-${i}`} style={{ backgroundColor: i % 2 ? colors[1] : colors[0] }} />)}
          {design.pieces.includes("discoball") && <b className="preview-ball" style={{ backgroundColor: colors[1] }} />}
          {design.pieces.includes("rug") && <b className="preview-rug" style={{ borderColor: colors[0] }} />}
        </div>
      </div>
      <div className="lab-architect-preview-colours"><i style={{ background: colors[0] }} /><i style={{ background: colors[1] }} /></div>
    </aside>
  );
}
