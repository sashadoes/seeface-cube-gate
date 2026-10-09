// The Library: each finished session's verdict (title, conclusions, key arguments, quotes the
// speakers approved), plus quotes of yours waiting for your yes/no.
import { useEffect, useState } from "react";
import type { Verdict } from "../../../shared/world/transcripts.ts";
import type { Session } from "../session.ts";

type Pending = { verdict: string; title: string; quote: string; text: string };

export function Library({ session }: { session: Session }) {
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const [mine, setMine] = useState<Pending[]>([]);
  const load = () => {
    void session.api<{ verdicts: Verdict[] }>("/library").then((r) => setVerdicts(r?.verdicts ?? []));
    void session.api<{ quotes: Pending[] }>("/my/quotes").then((r) => setMine(r?.quotes ?? []));
  };
  useEffect(load, [session]);
  const answer = async (p: Pending, yes: boolean) => {
    await session.api("/my/quotes", { verdict: p.verdict, quote: p.quote, yes });
    load();
  };
  return (
    <div className="w-library">
      {mine.length > 0 && (
        <div className="w-lib-mine">
          <div className="w-lib-h">quotes of yours, waiting for your ok</div>
          {mine.map((p) => (
            <div key={p.quote} className="w-lib-q">
              “{p.text}” <span className="w-dim">— {p.title}</span>
              <div className="w-row">
                <button onClick={() => answer(p, true)}>show it</button>
                <button onClick={() => answer(p, false)}>keep it out</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="w-lib-h">the Library</div>
      {verdicts === null && <div className="w-dim">opening…</div>}
      {verdicts?.length === 0 && <div className="w-dim">no verdicts yet. sessions leave one here when they end.</div>}
      {verdicts?.map((v) => (
        <div key={v.id} className="w-lib-v">
          <div className="w-lib-t">{v.title}</div>
          {v.conclusions.map((c, i) => (
            <div key={i}>· {c}</div>
          ))}
          {v.quotes.map((q) => (
            <div key={q.id} className="w-lib-quote">
              “{q.text}” — {q.name}
            </div>
          ))}
          <div className="w-dim small">{v.aiWritten ? "summary written by the AI host" : "summary from the transcript"}</div>
        </div>
      ))}
    </div>
  );
}
