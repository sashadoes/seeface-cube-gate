// The moderators' queue: open reports (people's and the AI host's flags), the reported person's own
// transcript lines only, the AI's read, and three actions. Needs WORLD_ADMIN_KEY (typed here, kept
// for this tab only).
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { worldUrl } from "../net/client.ts";

type R = { id: string; at: number; reporter: string; target: string; targetName: string; reason: string; room: string | null; excerpt: string[]; aiFlag: string | null; strikes: number };
const base = worldUrl().replace(/^ws/, "http");

function Admin() {
  const [key, setKey] = useState(() => sessionStorage.getItem("sf1w.admin") ?? "");
  const [items, setItems] = useState<R[] | null>(null);
  const [err, setErr] = useState("");
  const load = async () => {
    const r = await fetch(`${base}/admin/queue`, { headers: { "x-admin-key": key } }).catch(() => null);
    if (!r?.ok) return setErr(r ? "wrong key" : "server unreachable");
    setErr("");
    sessionStorage.setItem("sf1w.admin", key);
    setItems((await r.json()).reports);
  };
  useEffect(() => {
    if (key) void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (id: string, action: "dismiss" | "strike" | "ban") => {
    await fetch(`${base}/admin/action`, { method: "POST", headers: { "x-admin-key": key, "content-type": "application/json" }, body: JSON.stringify({ report: id, action }) });
    void load();
  };
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <h1 style={{ font: "italic 24px Georgia, serif" }}>world · moderation queue</h1>
      <form onSubmit={(e) => (e.preventDefault(), void load())} style={{ display: "flex", gap: 8 }}>
        <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="moderator key" style={{ flex: 1, padding: 10, background: "#000", color: "#fff", border: "1px solid #333", borderRadius: 8 }} />
        <button style={{ padding: "0 16px" }}>open</button>
      </form>
      {err && <p style={{ color: "#ff8fa3" }}>{err}</p>}
      {items?.length === 0 && <p style={{ color: "#8b84a8" }}>queue is empty.</p>}
      {items?.map((r) => (
        <div key={r.id} style={{ border: "1px solid #2a2638", borderRadius: 12, padding: 12, marginTop: 12 }}>
          <div>
            <b>{r.targetName}</b> · {r.reason} · {r.room ?? "corridor"} · {new Date(r.at).toLocaleString()} · strikes: {r.strikes}
            {r.reporter === "ai-host" && <span style={{ marginLeft: 8, background: "#6c9cff", color: "#000", borderRadius: 6, padding: "1px 6px", fontSize: 11 }}>AI FLAG</span>}
          </div>
          {r.aiFlag && <div style={{ color: "#ffd1a8" }}>AI read: {r.aiFlag}</div>}
          <div style={{ color: "#b8b2d0", marginTop: 6 }}>{r.excerpt.length ? r.excerpt.map((l, i) => <div key={i}>“{l}”</div>) : <i>no transcript (they weren't transcribed). judge from the report and their history.</i>}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => act(r.id, "dismiss")}>dismiss</button>
            <button onClick={() => act(r.id, "strike")}>strike (1: 24 h · 2: 7 days · 3: ban)</button>
            <button onClick={() => act(r.id, "ban")}>ban</button>
          </div>
        </div>
      ))}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<Admin />);
