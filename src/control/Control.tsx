// The owner's control room (/control): is everything up, what is running,
// and buttons to redeploy / restart. Hidden + noindex; the buttons and process
// details need the ADMIN_KEY (same one as /api/stats, set on Render).
//
// What runs where:
//   site      seeface1.world: GitHub Pages, built by .github/workflows/deploy.yml
//   api       server/ on Render (seeface1-api): accounts, sign-ups, Instagram login
//   database  MongoDB Atlas (MONGODB_URI on Render)
//   relays    public MQTT brokers: live presence, chat, voice signalling
//   jobs      GitHub Actions: deploy (every push to main), dream (daily 00:05 UTC), claude (@claude)
import { useCallback, useEffect, useRef, useState } from "react";
import mqtt from "mqtt";
import { apiBase } from "../api";
import "./Control.scss";

const RELAYS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
const KEY_STORE = "seeface-control-key";
const REFRESH_MS = 30_000;

type Check = { state: "wait" | "up" | "down"; ms?: number; note?: string };
type Run = { id: number; name: string; file?: string; status: string; conclusion: string | null; branch: string; event: string; at: string; url: string; title: string };
type Deploy = { id: string; status: string; at: string; finished?: string; commit?: string; trigger?: string };
type Overview = {
  at: string;
  process: { started: string; uptimeSec: number; node: string; pid: number; rssMb: number; heapMb: number; region: string | null; commit: string | null };
  config: { mongodb: boolean; instagram: boolean; github: boolean; render: boolean; origins: string[] };
  database: { ok: boolean; error?: string; kind?: string; note?: string; pingMs?: number; players?: number; accounts?: number };
  github: { ok: boolean; error?: string; repo?: string; runs?: Run[] };
  render: { ok: boolean; error?: string; name?: string; suspended?: string; url?: string; dashboard?: string; deploys?: Deploy[] };
};
type Summary = { total: number; new_today: number; active_1d: number; active_7d: number; active_30d: number; retained_d1: { pct: number | null }; retained_d7: { pct: number | null } };
type Stats = { accounts: Summary; signups: Summary & { with_email_consent: number; sources: Record<string, number> } };

const readKey = () => {
  try {
    return localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
};
const ago = (iso?: string) => {
  if (!iso) return "–";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 60 ? `${Math.round(s)}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${(s / 3600).toFixed(1)}h ago` : `${Math.round(s / 86400)}d ago`;
};
const dur = (sec: number) => (sec < 3600 ? `${Math.round(sec / 60)}m` : sec < 86400 ? `${(sec / 3600).toFixed(1)}h` : `${(sec / 86400).toFixed(1)}d`);

async function timed(url: string, init?: RequestInit): Promise<Check & { body?: unknown }> {
  const t = performance.now();
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000), ...init });
    const ms = Math.round(performance.now() - t);
    const body = r.headers.get("content-type")?.includes("json") ? await r.json() : undefined;
    return { state: r.ok ? "up" : "down", ms, note: r.ok ? undefined : `HTTP ${r.status}`, body };
  } catch (e) {
    return { state: "down", note: (e as Error).name === "TimeoutError" ? "timeout" : "unreachable" };
  }
}

function relayCheck(url: string): Promise<Check> {
  return new Promise((resolve) => {
    const t = performance.now();
    const c = mqtt.connect(url, { connectTimeout: 8000, reconnectPeriod: 0, clientId: `ctl_${Math.random().toString(16).slice(2, 10)}` });
    const done = (ch: Check) => {
      c.end(true);
      resolve(ch);
    };
    c.once("connect", () => done({ state: "up", ms: Math.round(performance.now() - t) }));
    c.once("error", () => done({ state: "down", note: "error" }));
    setTimeout(() => done({ state: "down", note: "timeout" }), 9000);
  });
}

const Dot = ({ c }: { c: Check["state"] | "off" }) => <span className={`ctl-dot ctl-${c}`} />;

function runState(r: Run): Check["state"] {
  if (r.status !== "completed") return "wait";
  return r.conclusion === "success" || r.conclusion === "skipped" ? "up" : "down";
}
function deployState(d: Deploy): Check["state"] {
  if (d.status === "live") return "up";
  if (/failed|canceled|deactivated/.test(d.status)) return d.status === "deactivated" ? "up" : "down";
  return "wait";
}

/** a button that needs a second tap to fire (no accidental redeploys) */
function Confirm({ label, run, disabled }: { label: string; run: () => Promise<string>; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <span className="ctl-action">
      <button
        disabled={disabled}
        className={armed ? "armed" : ""}
        onClick={async () => {
          if (!armed) return setArmed(true);
          setArmed(false);
          setMsg("…");
          setMsg(await run());
        }}
      >
        {armed ? `sure? ${label}` : label}
      </button>
      {msg && <small>{msg}</small>}
    </span>
  );
}

export default function Control() {
  const [key, setKey] = useState(readKey);
  const [draft, setDraft] = useState("");
  const [site, setSite] = useState<Check>({ state: "wait" });
  const [api, setApi] = useState<Check & { body?: { storage?: string; instagram?: boolean } }>({ state: "wait" });
  const [relays, setRelays] = useState<Check[]>(RELAYS.map(() => ({ state: "wait" })));
  const [ov, setOv] = useState<Overview | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [keyBad, setKeyBad] = useState(false);
  const [checked, setChecked] = useState<Date | null>(null);
  const busy = useRef(false);

  const admin = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(`${apiBase}${path}`, { cache: "no-store", ...init, headers: { "x-admin-key": key, "Content-Type": "application/json", ...(init?.headers || {}) } }),
    [key]
  );

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const jobs: Promise<unknown>[] = [
      timed(`${location.origin}/?ping=${Date.now()}`).then(setSite),
      apiBase ? timed(`${apiBase}/api/health`).then((c) => setApi(c as typeof api)) : Promise.resolve(setApi({ state: "down", note: "VITE_API_URL not set in this build" })),
      Promise.all(RELAYS.map(relayCheck)).then(setRelays),
    ];
    if (key && apiBase) {
      jobs.push(
        admin("/api/admin/overview")
          .then(async (r) => {
            if (r.status === 404) return setKeyBad(true);
            setKeyBad(false);
            if (r.ok) setOv(await r.json());
          })
          .catch(() => {}),
        admin("/api/stats")
          .then(async (r) => r.ok && setStats(await r.json()))
          .catch(() => {})
      );
    }
    await Promise.all(jobs);
    setChecked(new Date());
    busy.current = false;
  }, [key, admin]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const saveKey = (k: string) => {
    setKey(k);
    try {
      if (k) localStorage.setItem(KEY_STORE, k);
      else localStorage.removeItem(KEY_STORE);
    } catch {
      // ignore
    }
  };

  const post = (path: string, body: object) => async () => {
    try {
      const r = await admin(path, { method: "POST", body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      setTimeout(refresh, 4000);
      return r.ok ? "started ✓" : `failed: ${j.error ?? r.status}`;
    } catch {
      return "failed: unreachable";
    }
  };

  const apiHost = apiBase ? new URL(apiBase).host : "not configured";
  const s = stats?.signups;

  return (
    <div className="ctl">
      <header className="ctl-top">
        <h1>seeface1 · control room</h1>
        <span className="ctl-muted">{checked ? `checked ${ago(checked.toISOString())} · every 30s` : "checking…"}</span>
        <button onClick={refresh}>refresh</button>
        <a href="/the-eye">the eye →</a>
      </header>

      <section className="ctl-grid">
        <div className="ctl-card">
          <h2>services</h2>
          <ul className="ctl-list">
            <li>
              <Dot c={site.state} /> <b>website</b> <span className="ctl-muted">seeface1.world · GitHub Pages</span>
              <span className="ctl-r">{site.ms != null ? `${site.ms} ms` : site.note}</span>
            </li>
            <li>
              <Dot c={api.state} /> <b>api</b> <span className="ctl-muted">{apiHost} · Render</span>
              <span className="ctl-r">{api.ms != null ? `${api.ms} ms` : api.note}</span>
            </li>
            <li>
              <Dot c={api.state === "up" ? (api.body?.storage === "mongodb" ? "up" : "down") : api.state} /> <b>database</b>{" "}
              <span className="ctl-muted">MongoDB Atlas</span>
              <span className="ctl-r">{ov?.database.pingMs != null ? `${ov.database.pingMs} ms` : api.body?.storage ?? "–"}</span>
            </li>
            <li>
              <Dot c={api.state === "up" ? (api.body?.instagram ? "up" : "off") : api.state} /> <b>instagram login</b>
              <span className="ctl-r">{api.body ? (api.body.instagram ? "on" : "not configured") : "–"}</span>
            </li>
            {RELAYS.map((r, i) => (
              <li key={r}>
                <Dot c={relays[i].state} /> <b>relay</b> <span className="ctl-muted">{new URL(r).hostname} · live presence/chat</span>
                <span className="ctl-r">{relays[i].ms != null ? `${relays[i].ms} ms` : relays[i].note}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="ctl-card">
          <h2>admin key</h2>
          {key ? (
            <p>
              {keyBad ? <span className="ctl-bad">key rejected (or ADMIN_KEY not set on Render)</span> : <span className="ctl-good">key saved in this browser</span>}{" "}
              <button onClick={() => saveKey("")}>forget</button>
            </p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveKey(draft.trim());
                setDraft("");
              }}
            >
              <p className="ctl-muted">Render → seeface1-api → Environment → ADMIN_KEY</p>
              <input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="paste ADMIN_KEY" autoComplete="off" />
              <button type="submit">unlock</button>
            </form>
          )}
          <h2>links</h2>
          <ul className="ctl-links">
            <li><a href="https://dashboard.render.com" target="_blank" rel="noreferrer">Render dashboard</a></li>
            <li><a href={`https://github.com/${ov?.github.repo ?? "sashadoes/seeface-cube-gate"}/actions`} target="_blank" rel="noreferrer">GitHub Actions</a></li>
            <li><a href="https://cloud.mongodb.com" target="_blank" rel="noreferrer">MongoDB Atlas</a></li>
            <li><a href="https://seeface1.goatcounter.com" target="_blank" rel="noreferrer">GoatCounter analytics</a></li>
          </ul>
        </div>

        {ov && (
          <div className="ctl-card">
            <h2>api process</h2>
            <dl className="ctl-dl">
              <dt>uptime</dt><dd>{dur(ov.process.uptimeSec)} <span className="ctl-muted">(since {new Date(ov.process.started).toLocaleString()})</span></dd>
              <dt>memory</dt><dd>{ov.process.rssMb} MB <span className="ctl-muted">(heap {ov.process.heapMb} MB)</span></dd>
              <dt>node</dt><dd>{ov.process.node} · pid {ov.process.pid}</dd>
              <dt>commit</dt><dd>{ov.process.commit ?? "–"}{ov.process.region ? ` · ${ov.process.region}` : ""}</dd>
              <dt>database</dt>
              <dd>
                {ov.database.ok ? `${ov.database.kind}${ov.database.players != null ? ` · ${ov.database.players} sign-ups · ${ov.database.accounts} accounts` : ""}` : <span className="ctl-bad">{ov.database.error}</span>}
              </dd>
              <dt>allowed sites</dt><dd>{ov.config.origins.join(", ")}</dd>
            </dl>
          </div>
        )}

        {s && stats && (
          <div className="ctl-card">
            <h2>players</h2>
            <dl className="ctl-dl">
              <dt>sign-ups</dt><dd>{s.total} <span className="ctl-muted">(+{s.new_today} today)</span></dd>
              <dt>active</dt><dd>{s.active_1d} today · {s.active_7d} week · {s.active_30d} month</dd>
              <dt>came back</dt><dd>day 1: {s.retained_d1.pct ?? "–"}% · day 7: {s.retained_d7.pct ?? "–"}%</dd>
              <dt>accounts</dt><dd>{stats.accounts.total} <span className="ctl-muted">(+{stats.accounts.new_today} today)</span></dd>
              <dt>top sources</dt>
              <dd>
                {Object.entries(s.sources).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(" · ")}
              </dd>
            </dl>
          </div>
        )}

        {ov && (
          <div className="ctl-card ctl-wide">
            <h2>render · api server</h2>
            {ov.render.ok ? (
              <>
                <p>
                  <b>{ov.render.name}</b> {ov.render.suspended === "suspended" ? <span className="ctl-bad">suspended</span> : <span className="ctl-good">running</span>}{" "}
                  {ov.render.dashboard && <a href={ov.render.dashboard} target="_blank" rel="noreferrer">open on Render →</a>}
                </p>
                <div className="ctl-buttons">
                  <Confirm label="restart api" run={post("/api/admin/render", { action: "restart" })} />
                  <Confirm label="redeploy api" run={post("/api/admin/render", { action: "deploy" })} />
                </div>
                <table className="ctl-table">
                  <tbody>
                    {ov.render.deploys?.map((d) => (
                      <tr key={d.id}>
                        <td><Dot c={deployState(d)} /> {d.status}</td>
                        <td>{d.commit ?? d.trigger}</td>
                        <td className="ctl-muted">{ago(d.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="ctl-muted">
                {ov.render.error}. To get restart/redeploy here: Render → Account settings → API keys → create one, then on seeface1-api → Environment add
                RENDER_API_KEY and RENDER_SERVICE_ID (the srv-… id from the service URL).
              </p>
            )}
          </div>
        )}

        {ov && (
          <div className="ctl-card ctl-wide">
            <h2>github actions · jobs</h2>
            {ov.github.ok ? (
              <>
                <div className="ctl-buttons">
                  <Confirm label="deploy site now" run={post("/api/admin/workflow", { workflow: "deploy.yml" })} />
                  <Confirm label="run dream drop" run={post("/api/admin/workflow", { workflow: "dream.yml" })} />
                </div>
                <table className="ctl-table">
                  <tbody>
                    {ov.github.runs?.map((r) => (
                      <tr key={r.id}>
                        <td><Dot c={runState(r)} /> {r.name}</td>
                        <td><a href={r.url} target="_blank" rel="noreferrer">{r.title}</a></td>
                        <td className="ctl-muted">{r.status === "completed" ? r.conclusion : r.status} · {r.event} · {r.branch}</td>
                        <td className="ctl-muted">{ago(r.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="ctl-muted">
                {ov.github.error}. To see and start jobs here: GitHub → Settings → Developer settings → Fine-grained tokens → repo {ov.github.repo}, permission
                "Actions: read and write" → add it on Render as GITHUB_TOKEN.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
