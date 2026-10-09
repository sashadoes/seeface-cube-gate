// /architects/join: the 60-second application. On submit: a passwordless account,
// the application (status pending) and an empty room, then straight into the chamber.
// Approval gates going public, not creating.
import { useEffect, useState, type FormEvent } from "react";
import { apiReady, apply, requestLink } from "./api";
import { attribution } from "./Invite";
import { track } from "../analytics";
import "./architects.scss";

const DISCIPLINES: [string, string][] = [
  ["visual", "visual"],
  ["3d", "3D"],
  ["ai_art", "AI art"],
  ["sound", "sound / music"],
  ["photography", "photography"],
  ["fashion", "fashion"],
  ["performance", "performance"],
  ["other", "other"],
];

const ERRORS: Record<string, string> = {
  alias: "Tell us what to call you.",
  ig: "That Instagram handle doesn't look right (letters, numbers, . and _).",
  email: "That email doesn't look right.",
  disciplines: "Pick at least one discipline.",
  links: "One of the portfolio links isn't a web address.",
  one_liner: "Describe your world in one sentence.",
  country: "Where are you based?",
  terms: "Accept the Architect Terms to continue.",
  "slow down": "Too many tries. Wait a few minutes.",
  offline: "The labyrinth can't be reached right now. Try again in a minute.",
};

export default function Join() {
  const [f, setF] = useState({ alias: "", ig: "", email: "", one_liner: "", country: "", links: ["", "", ""], disciplines: [] as string[], terms: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const { ref, invite } = attribution();

  useEffect(() => {
    track("architects-join");
    // the ref is usually the artist's own handle (the DM's target): pre-fill it
    if (ref && /^@?[A-Za-z0-9._]{1,30}$/.test(ref)) setF((s) => ({ ...s, ig: s.ig || ref.replace(/^@/, "") }));
  }, []);

  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const toggle = (d: string) => set("disciplines", f.disciplines.includes(d) ? f.disciplines.filter((x) => x !== d) : [...f.disciplines, d]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const r = await apply({ ...f, links: f.links.filter((l) => l.trim()), ref, invite });
    setBusy(false);
    if (r.ok) {
      track("architects-applied");
      location.href = "/chamber/";
      return;
    }
    if (r.error === "exists") {
      setSentTo(f.email);
      return;
    }
    setError(ERRORS[r.error ?? ""] ?? "Something went wrong. Try again.");
  }

  if (sentTo) {
    return (
      <main className="arch">
        <div className="arch-wrap" style={{ paddingTop: 80 }}>
          <h1>You've answered before.</h1>
          <p>Your room is waiting. We sent a link to {sentTo}. Open it on this phone to return to the chamber.</p>
          <button className="arch-cta" onClick={() => requestLink(sentTo)}>
            send it again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="arch">
      <div className="arch-wrap">
        <p className="arch-small">
          <a href="/architects/" style={{ textDecoration: "none" }}>
            ← the call
          </a>
        </p>
        <h1 style={{ fontSize: 34, margin: "18px 0 6px" }}>Answer the call</h1>
        <p style={{ color: "var(--dim)", marginTop: 0 }}>One minute. Then SeeFace is waiting for you.</p>
        {!apiReady && <p className="arch-error">The chamber isn't open on this site yet.</p>}

        <form className="arch-form" onSubmit={submit} noValidate>
          <label htmlFor="a-alias">Name or alias</label>
          <input id="a-alias" type="text" autoComplete="nickname" maxLength={40} value={f.alias} onChange={(e) => set("alias", e.target.value)} required />

          <label htmlFor="a-ig">Instagram handle</label>
          <input id="a-ig" type="text" autoCapitalize="none" autoCorrect="off" placeholder="@" maxLength={31} value={f.ig} onChange={(e) => set("ig", e.target.value)} required />

          <label htmlFor="a-email">Email (for your way back in, and the news your door is open)</label>
          <input id="a-email" type="email" autoComplete="email" inputMode="email" maxLength={254} value={f.email} onChange={(e) => set("email", e.target.value)} required />

          <label>Discipline</label>
          <div className="arch-chips" role="group" aria-label="discipline">
            {DISCIPLINES.map(([id, label]) => (
              <button type="button" key={id} aria-pressed={f.disciplines.includes(id)} onClick={() => toggle(id)}>
                {label}
              </button>
            ))}
          </div>

          <label htmlFor="a-link0">Portfolio links (up to 3)</label>
          {f.links.map((l, i) => (
            <input
              key={i}
              id={`a-link${i}`}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              placeholder={i === 0 ? "behance, site, soundcloud…" : ""}
              maxLength={300}
              value={l}
              onChange={(e) => set("links", f.links.map((x, j) => (j === i ? e.target.value : x)))}
              style={{ marginBottom: 6 }}
            />
          ))}

          <label htmlFor="a-one">Describe the world you would build, in one sentence</label>
          <textarea id="a-one" maxLength={200} rows={2} value={f.one_liner} onChange={(e) => set("one_liner", e.target.value)} required />

          <label htmlFor="a-country">Country</label>
          <input id="a-country" type="text" autoComplete="country-name" maxLength={56} value={f.country} onChange={(e) => set("country", e.target.value)} required />

          <label className="arch-check" style={{ marginTop: 28 }}>
            <input type="checkbox" checked={f.terms} onChange={(e) => set("terms", e.target.checked)} />
            <span>
              I accept the{" "}
              <a href="/architects/terms/" target="_blank" rel="noopener">
                Architect Terms
              </a>
              . I keep my IP; seeface1 may display my work in the labyrinth.
            </span>
          </label>

          <div className="arch-error" role="alert">
            {error}
          </div>
          <button className="arch-cta" type="submit" disabled={busy || !apiReady}>
            {busy ? "the door is opening…" : "Enter the chamber"}
          </button>
        </form>
      </div>
    </main>
  );
}
