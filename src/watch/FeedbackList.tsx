// Feedback from players (asked once after 15 min in the labyrinth). Unlike the
// rest of /the-eye this is private: the server only answers with ADMIN_KEY,
// which stays in this browser (localStorage `seeface-eye-admin`).
import { useEffect, useState } from "react";
import { apiBase } from "../api";

type Item = { stars: number; text: string; ig: string | null; nick: string | null; lang: string | null; minutes: number | null; at: string };
type Answer = { count: number; avg: number | null; items: Item[] };

const KEY = "seeface-eye-admin";
const savedKey = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

export default function FeedbackList() {
  const [key, setKey] = useState(savedKey);
  const [draft, setDraft] = useState("");
  const [data, setData] = useState<Answer | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!key || !apiBase) return;
    let gone = false;
    fetch(`${apiBase}/api/feedback`, { headers: { "x-admin-key": key } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Answer) => !gone && (setData(d), setErr("")))
      .catch((s) => !gone && setErr(s === 404 ? "wrong key" : "api not reachable"));
    return () => {
      gone = true;
    };
  }, [key]);

  if (!apiBase) return <div className="eye-list-head">feedback · no api configured</div>;
  return (
    <>
      <div className="eye-list-head">
        feedback{data ? ` · ${data.count} · ${data.avg ?? "–"} ✦ avg` : ""}
        {key && (
          <button className="eye-fb-out" onClick={() => (localStorage.removeItem(KEY), setKey(""), setData(null))}>
            forget key
          </button>
        )}
      </div>
      {!key && (
        <form
          className="eye-mod"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              localStorage.setItem(KEY, draft);
            } catch {
              // fine: works for this visit
            }
            setKey(draft);
          }}
        >
          <input type="password" placeholder="ADMIN_KEY" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit">read feedback</button>
        </form>
      )}
      {err && <div className="eye-empty">{err}</div>}
      {data?.items.map((f, i) => (
        <div key={i} className="eye-fb">
          <b>{"✦".repeat(f.stars)}</b>
          <span className="m">
            {f.nick ?? "?"}
            {f.ig && (
              <>
                {" · "}
                <a href={`https://instagram.com/${f.ig}`} target="_blank" rel="noreferrer">
                  @{f.ig}
                </a>
              </>
            )}
            {" · "}
            {f.minutes ?? "?"} min · {f.lang ?? "?"} · {new Date(f.at).toLocaleString()}
          </span>
          {f.text && <p>{f.text}</p>}
        </div>
      ))}
    </>
  );
}
