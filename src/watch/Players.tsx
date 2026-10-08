// /the-eye → "players & insights": every player's journal (time, ◈ earned /
// spent / lost and on what, new or returning, what they did), the whole
// picture (funnel, where people quit, feature use, sources, vibes) and plain
// suggestions. "copy for analysis" puts it all in one text block for Claude.
import { useMemo, useState } from "react";
import type { Journal } from "../insight";
import { analyse, exportForAnalysis, fmtTime, playMs, statusOf, type Row, type Status } from "./insights";

type Sort = "last" | "time" | "spent" | "earned" | "days";
const STATUSES: (Status | "all")[] = ["all", "new today", "new", "back today", "returning", "lapsed"];
const ago = (ms: number) => (ms < 3_600_000 ? `${Math.max(1, Math.round(ms / 60_000))}m` : ms < 86_400_000 ? `${Math.round(ms / 3_600_000)}h` : `${Math.round(ms / 86_400_000)}d`);
const clock = (t: number) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function Bars({ rows, of, unit = "", limit = 12, value = (r: Row) => r.players }: { rows: Row[]; of: number; unit?: string; limit?: number; value?: (r: Row) => number }) {
  const max = Math.max(1, of, ...rows.map(value));
  if (!rows.length) return <div className="pi-empty">nothing yet</div>;
  return (
    <div className="pi-bars">
      {rows.slice(0, limit).map((r) => (
        <div key={r.key} className="pi-bar" title={`${r.key}: ${r.players} players · ${r.times} total`}>
          <span className="k">{r.key}</span>
          <span className="track">
            <i style={{ width: `${(value(r) / max) * 100}%` }} />
          </span>
          <span className="v">
            {value(r)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Players({ journals }: { journals: Journal[] }) {
  const [sort, setSort] = useState<Sort>("last");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const now = Date.now();
  const ins = useMemo(() => analyse(journals), [journals]);

  const rows = journals
    .filter((j) => filter === "all" || statusOf(j, now) === filter)
    .sort((a, b) =>
      sort === "time" ? playMs(b) - playMs(a) : sort === "spent" ? b.spent - a.spent : sort === "earned" ? b.earned - a.earned : sort === "days" ? b.days - a.days : b.last - a.last,
    );
  const sel = open ? journals.find((j) => j.id === open) : null;

  async function copy() {
    const text = exportForAnalysis(journals, ins);
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied · paste it to Claude");
    } catch {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      a.download = `seeface1-players-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      setCopied("downloaded");
    }
    setTimeout(() => setCopied(""), 4000);
  }

  const top = ins.funnel[0]?.n || 1;
  return (
    <div className="pi">
      <div className="pi-kpis">
        <div><b>{ins.total}</b><span>players (devices)</span></div>
        <div><b>{ins.newToday}</b><span>new today</span></div>
        <div><b>{ins.activeToday}</b><span>played today</span></div>
        <div><b>{ins.returning}</b><span>came back another day</span></div>
        <div><b>{ins.returnRate}%</b><span>return rate</span></div>
        <div><b>{fmtTime(ins.medianMs)}</b><span>median time, all visits</span></div>
        <div><b>{fmtTime(ins.medianSessionMs)}</b><span>median visit</span></div>
        <div className="blood"><b>{ins.earned}</b><span>◈ earned</span></div>
        <div className="blood"><b>{ins.spent}</b><span>◈ spent</span></div>
        <div className="blood"><b>{ins.lost}</b><span>◈ taken (knife, plague, queen)</span></div>
        <div><b>{ins.spenders}</b><span>players who spent ◈</span></div>
        <div className="pi-actions">
          <button onClick={() => void copy()}>copy for analysis</button>
          <small>{copied || "summary + every player, ready to paste to Claude"}</small>
        </div>
      </div>

      <div className="pi-card pi-hints">
        <h3>what to improve</h3>
        {ins.suggestions.length ? <ul>{ins.suggestions.map((s) => <li key={s}>{s}</li>)}</ul> : <div className="pi-empty">no clear leak yet</div>}
      </div>

      <div className="pi-grid">
        <div className="pi-card">
          <h3>the funnel · players reaching each step</h3>
          <div className="pi-bars">
            {ins.funnel.map((s) => (
              <div key={s.label} className="pi-bar" title={`${s.label}: ${s.n} of ${top} (${Math.round((s.n / top) * 100)}%)`}>
                <span className="k">{s.label}</span>
                <span className="track"><i style={{ width: `${(s.n / top) * 100}%` }} /></span>
                <span className="v">{s.n} · {Math.round((s.n / top) * 100)}%</span>
              </div>
            ))}
          </div>
          <p className="pi-note">time on the cube {fmtTime(ins.cubeMs)} · in the labyrinth {fmtTime(ins.labMs)} (everyone together)</p>
        </div>
        <div className="pi-card">
          <h3>where one-day players stopped · the last thing they did</h3>
          <Bars rows={ins.lastActs} of={0} limit={10} />
        </div>
        <div className="pi-card">
          <h3>◈ spent on · and taken</h3>
          <Bars rows={ins.spentOn} of={0} value={(r) => r.times} unit=" ◈" />
        </div>
        <div className="pi-card">
          <h3>◈ earned from</h3>
          <Bars rows={ins.earnedFrom} of={0} value={(r) => r.times} unit=" ◈" />
        </div>
        <div className="pi-card">
          <h3>what people do · players who did it</h3>
          <Bars rows={ins.features} of={ins.total} limit={30} />
        </div>
        <div className="pi-card">
          <h3>by source · by vibe</h3>
          <table className="pi-table small">
            <thead><tr><th>source</th><th>players</th><th>came back</th><th>median time</th></tr></thead>
            <tbody>{ins.bySource.map((g) => <tr key={g.key}><td>{g.key}</td><td>{g.players}</td><td>{g.returned}%</td><td>{fmtTime(g.medianMs)}</td></tr>)}</tbody>
          </table>
          <table className="pi-table small">
            <thead><tr><th>vibe</th><th>players</th><th>came back</th><th>median time</th></tr></thead>
            <tbody>{ins.byVibe.map((g) => <tr key={g.key}><td>{g.key}</td><td>{g.players}</td><td>{g.returned}%</td><td>{fmtTime(g.medianMs)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="pi-card">
        <h3>
          every player · {rows.length}
          <span className="pi-filters">
            {STATUSES.map((s) => (
              <button key={s} className={filter === s ? "on" : ""} onClick={() => setFilter(s)}>{s}</button>
            ))}
          </span>
        </h3>
        <div className="pi-scroll">
          <table className="pi-table">
            <thead>
              <tr>
                <th>name</th>
                <th>status</th>
                <th className="sort" onClick={() => setSort("days")}>days{sort === "days" && " ↓"}</th>
                <th>visits</th>
                <th className="sort" onClick={() => setSort("time")}>time{sort === "time" && " ↓"}</th>
                <th>cube / labyrinth</th>
                <th className="sort" onClick={() => setSort("earned")}>◈ earned{sort === "earned" && " ↓"}</th>
                <th className="sort" onClick={() => setSort("spent")}>◈ spent{sort === "spent" && " ↓"}</th>
                <th>◈ taken</th>
                <th>◈ now</th>
                <th className="sort" onClick={() => setSort("last")}>last seen{sort === "last" && " ↓"}</th>
                <th>from</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((j) => {
                const st = statusOf(j, now);
                return (
                  <tr key={j.id} className={open === j.id ? "sel" : ""} onClick={() => setOpen(open === j.id ? null : j.id)}>
                    <td className="nick">{j.nick ?? "(no name yet)"}</td>
                    <td><span className={`pi-st ${st.replace(" ", "-")}`}>{st}</span></td>
                    <td>{j.days}</td>
                    <td>{j.sessions}</td>
                    <td>{fmtTime(playMs(j))}</td>
                    <td>{fmtTime(j.ms.cube)} / {fmtTime(j.ms.lab)}</td>
                    <td>{j.earned}</td>
                    <td>{j.spent}</td>
                    <td>{j.lost}</td>
                    <td>{j.blood}</td>
                    <td>{ago(now - j.last)} ago</td>
                    <td>{j.ref ?? "direct"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <div className="pi-empty">no journals yet. they arrive as people play (within a minute of their visit).</div>}
        </div>
      </div>

      {sel && (
        <div className="pi-card pi-detail" role="dialog">
          <h3>
            {sel.nick ?? "(no name yet)"} · {statusOf(sel, now)} · first {clock(sel.first)} · last {clock(sel.last)}
            <button onClick={() => setOpen(null)}>×</button>
          </h3>
          <div className="pi-grid">
            <div>
              <h4>◈ by reason</h4>
              <table className="pi-table small">
                <tbody>
                  {Object.entries(sel.on).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td className={v < 0 ? "neg" : "pos"}>{v > 0 ? `+${v}` : v}</td></tr>
                  ))}
                </tbody>
              </table>
              <h4>visits</h4>
              <table className="pi-table small">
                <tbody>
                  {[...sel.sess].reverse().map((s) => (
                    <tr key={s.t}><td>{clock(s.t)}</td><td>{fmtTime(s.ms)}</td><td>{s.page}</td><td>ended: {s.end || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="pi-note">best run {sel.best} m · {sel.metres} m in all · {sel.runs} runs · vibe {sel.vibe ?? "—"} · from {sel.ref ?? "direct"}</p>
            </div>
            <div>
              <h4>everything they did</h4>
              <Bars rows={Object.entries(sel.did).map(([key, times]) => ({ key, times, players: times })).sort((a, b) => b.times - a.times)} of={0} limit={40} />
            </div>
            <div>
              <h4>last moments</h4>
              <ol className="pi-timeline">
                {[...sel.recent].reverse().map(([t, e], k) => (
                  <li key={k}><time>{clock(t)}</time> {e}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
      <p className="pi-note">
        one row = one device (a person on two phones counts twice). journals arrive within a minute of play and stay on the relay. players with Do Not Track or Global Privacy Control on aren't counted.
      </p>
    </div>
  );
}
