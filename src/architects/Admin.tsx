// /admin/architects: the owner's review desk. Needs the server's ADMIN_KEY
// (kept in this browser only). List by status → open a room: applicant, transcript,
// blueprint JSON, uploads, live preview → approve / request changes / reject.
import { lazy, Suspense, useEffect, useState } from "react";
import { adminCall, assetUrl, type Asset, type Message } from "./api";
import type { Blueprint } from "./types";
import { Thumb } from "./Thumb";
import "./architects.scss";
import "./admin.scss";

const RoomPreview = lazy(() => import("./room/RoomPreview"));
const KEY = "seeface-admin-key";
const STATUSES = ["submitted", "draft", "approved", "rejected", "live", "all"];

type Applicant = { alias: string; ig: string; email: string; disciplines: string[]; links: string[]; one_liner: string; country: string; ref: string | null; invite_code: string | null; terms_accepted_at: string; status: string; created_at: string };
type Row = { id: string; status: string; stage: string; title: string; archetype: string | null; created_at: string; submitted_at: string | null; applicant: Applicant | null; messages: number; assets: number; admin_note: string | null };
type Detail = { room: { id: string; status: string; stage: string; blueprint: Blueprint; admin_note: string | null; submitted_at: string | null }; application: Applicant | null; messages: Message[]; assets: Asset[] };

const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
const when = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

export default function Admin() {
  const [key, setKey] = useState(read);
  const [draftKey, setDraftKey] = useState(read); // pre-filled, so "try again" is one click
  const [status, setStatus] = useState("submitted");
  const [rows, setRows] = useState<Row[] | null>(null);
  // "" = fine, "key" = the server refused the key, "offline" = the server couldn't be reached
  const [denied, setDenied] = useState<"" | "key" | "offline">("");
  const [open, setOpen] = useState<Detail | null>(null);

  async function list() {
    if (!key) return;
    const r = await adminCall<{ rooms: Row[] }>(key, "GET", status === "all" ? "" : `?status=${status}`);
    if (r.status === 404) return setDenied("key");
    if (r.status === 0 || !r.ok) return setDenied("offline");
    setDenied("");
    setRows(r.rooms);
  }
  useEffect(() => {
    list();
  }, [key, status]);

  async function show(id: string) {
    const r = await adminCall<Detail>(key, "GET", `/${id}`);
    if (r.ok) setOpen(r);
  }

  if (!key || denied) {
    return (
      <main className="arch">
        <div className="arch-wrap arch-form" style={{ paddingTop: 70 }}>
          <h1>architects · review</h1>
          {denied === "key" && key && <p className="arch-error">That key isn't right. Copy the value of ADMIN_KEY from Render → Environment (not the name).</p>}
          {denied === "offline" && <p className="arch-error">The server can't be reached right now. Try again in a minute.</p>}
          <label htmlFor="ak">admin key (the server's ADMIN_KEY; kept in this browser only)</label>
          <input id="ak" type="text" autoComplete="off" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} />
          <button
            className="arch-cta"
            onClick={() => {
              try {
                localStorage.setItem(KEY, draftKey.trim());
              } catch {
                // this visit only
              }
              setDenied("");
              setKey(draftKey.trim());
            }}
          >
            open the desk
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="arch admin">
      <div className="ad-wrap">
        <header className="ad-head">
          <h1>architects · review</h1>
          <nav className="arch-form">
            <div className="arch-chips">
              {STATUSES.map((s) => (
                <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>
                  {s}
                </button>
              ))}
            </div>
          </nav>
        </header>
        {!rows ? (
          <p className="ad-dim">opening the desk… (a sleeping server can take up to a minute to wake)</p>
        ) : !rows.length ? (
          <p className="ad-dim">Nothing here.</p>
        ) : (
          <table className="ad-table">
            <thead>
              <tr>
                <th>room</th>
                <th>architect</th>
                <th>status</th>
                <th>source</th>
                <th>submitted</th>
                <th>chat · files</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => show(r.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && show(r.id)}>
                  <td>
                    <b>{r.title || "untitled"}</b>
                    <div className="ad-dim">{r.archetype ?? "no shape"} · {r.stage}</div>
                  </td>
                  <td>
                    {r.applicant?.alias}
                    <div className="ad-dim">@{r.applicant?.ig}</div>
                  </td>
                  <td>
                    <span className={`ad-status ${r.status}`}>{r.status}</span>
                  </td>
                  <td className="ad-dim">
                    {r.applicant?.ref ? `ref @${r.applicant.ref}` : "direct"}
                    {r.applicant?.invite_code ? ` · ${r.applicant.invite_code}` : ""}
                  </td>
                  <td className="ad-dim">{when(r.submitted_at)}</td>
                  <td className="ad-dim">
                    {r.messages} · {r.assets}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {open && (
        <Drawer
          d={open}
          admin={key}
          onClose={() => setOpen(null)}
          onDecided={() => {
            setOpen(null);
            list();
          }}
        />
      )}
    </main>
  );
}

function Drawer({ d, admin, onClose, onDecided }: { d: Detail; admin: string; onClose: () => void; onDecided: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [walk, setWalk] = useState(false);
  const a = d.application;

  async function decide(action: "approve" | "reject" | "changes") {
    if (action === "changes" && !note.trim()) return setErr("Write what should change: SeeFace passes it on.");
    if (action === "reject" && !confirm("Reject this room? This is final for the artist.")) return;
    setBusy(true);
    const r = await adminCall(admin, "POST", `/${d.room.id}/decision`, { action, note });
    setBusy(false);
    if (r.ok) onDecided();
    else setErr("That didn't go through.");
  }

  return (
    <div className="ad-drawer" role="dialog" aria-label="room review">
      <div className="ad-drawer-head">
        <div>
          <h2>{d.room.blueprint.title || "untitled"}</h2>
          <span className={`ad-status ${d.room.status}`}>{d.room.status}</span> <span className="ad-dim">submitted {when(d.room.submitted_at)}</span>
        </div>
        <button className="ch-btn" onClick={onClose}>
          close
        </button>
      </div>

      <div className="ad-grid">
        <div className="ad-col">
          <div className="ad-preview">
            <Suspense fallback={null}>
              <RoomPreview blueprint={d.room.blueprint} walk={walk} onExit={() => setWalk(false)} resolve={(id) => assetUrl(id, d.room.id, admin)} seed={d.room.id} />
            </Suspense>
          </div>
          <button className="ch-btn" onClick={() => setWalk(true)}>
            walk the room
          </button>

          {a && (
            <dl className="ad-facts">
              <dt>architect</dt>
              <dd>
                {a.alias} · <a href={`https://instagram.com/${a.ig}`} target="_blank" rel="noopener noreferrer">@{a.ig}</a> · <a href={`mailto:${a.email}`}>{a.email}</a>
              </dd>
              <dt>disciplines</dt>
              <dd>{a.disciplines.join(", ")}</dd>
              <dt>their world</dt>
              <dd>“{a.one_liner}”</dd>
              <dt>portfolio</dt>
              <dd>
                {a.links.length
                  ? a.links.map((l) => (
                      <div key={l}>
                        <a href={l} target="_blank" rel="noopener noreferrer">
                          {l}
                        </a>
                      </div>
                    ))
                  : "—"}
              </dd>
              <dt>country</dt>
              <dd>{a.country}</dd>
              <dt>source</dt>
              <dd>
                {a.ref ? `ref @${a.ref}` : "direct"} {a.invite_code ? `· invite ${a.invite_code}` : ""}
              </dd>
              <dt>terms accepted</dt>
              <dd>{when(a.terms_accepted_at)}</dd>
            </dl>
          )}

          <h3>uploads</h3>
          <div className="ch-attached">
            {d.assets.length ? d.assets.map((x) => <Thumb key={x.id} asset={x} admin={admin} roomId={d.room.id} />) : <span className="ad-dim">none</span>}
          </div>
          {d.assets.some((x) => x.description) && (
            <ul className="ad-dim">
              {d.assets.filter((x) => x.description).map((x) => (
                <li key={x.id}>
                  {x.name}: {x.description}
                </li>
              ))}
            </ul>
          )}

          <h3>decision</h3>
          <textarea className="ad-note" rows={3} placeholder="note to the artist (required for changes)" value={note} onChange={(e) => setNote(e.target.value)} />
          {err && <p className="arch-error">{err}</p>}
          <div className="ad-actions">
            <button className="ch-btn primary" disabled={busy} onClick={() => decide("approve")}>
              approve
            </button>
            <button className="ch-btn" disabled={busy} onClick={() => decide("changes")}>
              request changes
            </button>
            <button className="ch-btn danger" disabled={busy} onClick={() => decide("reject")}>
              reject
            </button>
          </div>
        </div>

        <div className="ad-col">
          <h3>transcript</h3>
          <div className="ad-transcript">
            {d.messages.map((m, i) => (
              <div key={i} className={`ch-msg ${m.role}`}>
                {m.assets?.length ? (
                  <div className="ch-attached">
                    {m.assets.map((id) => {
                      const x = d.assets.find((y) => y.id === id);
                      return x ? <Thumb key={id} asset={x} admin={admin} roomId={d.room.id} /> : null;
                    })}
                  </div>
                ) : null}
                {m.text}
              </div>
            ))}
          </div>
          <h3>blueprint</h3>
          <pre className="ad-json">{JSON.stringify(d.room.blueprint, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
