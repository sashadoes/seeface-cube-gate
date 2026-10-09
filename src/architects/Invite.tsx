// /architects: the invite artists land on from an Instagram DM.
// Lore on the surface, plain words for anything that matters (money, rights, data).
import { useEffect, useState } from "react";
import { claimedCount } from "./api";
import { track } from "../analytics";
import "./architects.scss";

/** ?ref=<ig_handle> and ?invite=<code> survive the trip to the form (and a reload). */
export function attribution(): { ref: string | null; invite: string | null } {
  const q = new URLSearchParams(location.search);
  const read = (k: string) => {
    const v = q.get(k);
    try {
      if (v) sessionStorage.setItem(`sf1.arch.${k}`, v);
      return v ?? sessionStorage.getItem(`sf1.arch.${k}`);
    } catch {
      return v;
    }
  };
  return { ref: read("ref"), invite: read("invite") };
}

export function joinHref() {
  const { ref, invite } = attribution();
  const q = new URLSearchParams();
  if (ref) q.set("ref", ref);
  if (invite) q.set("invite", invite);
  return `/architects/join/${q.toString() ? `?${q}` : ""}`;
}

export default function Invite() {
  const [count, setCount] = useState<{ claimed: number; of: number } | null>(null);
  useEffect(() => {
    track("architects-invite");
    attribution();
    claimedCount().then((r) => r.ok && setCount({ claimed: r.claimed, of: r.of }));
  }, []);

  return (
    <main className="arch">
      <div className="arch-wrap">
        <header className="arch-hero">
          <div className="arch-small">seeface1 world · a call</div>
          <h1>The labyrinth is choosing its first 100 Architects.</h1>
          <div className="arch-counter" aria-live="polite">
            {count ? (
              <>
                <b>{count.claimed}</b> / {count.of} rooms claimed
              </>
            ) : (
              <>&nbsp;</>
            )}
          </div>
          <div>
            <a className="arch-cta" href={joinHref()} onClick={() => track("architects-cta-top")}>
              Answer the call
            </a>
          </div>
          <div className="arch-scroll">↓ what this is</div>
        </header>

        <section className="arch-section" style={{ position: "static" }}>
          <h2>The world</h2>
          <p>
            seeface1 is a labyrinth that never ends. People walk it together, in the browser, from their phones: they get lost, meet strangers, talk, and find rooms that
            shouldn't exist. Every room was dreamed by someone. Soon, some of them will be yours.
          </p>
        </section>

        <section className="arch-section" style={{ position: "static" }}>
          <h2>How it works</h2>
          <ol className="arch-steps">
            <li>
              <b>Transmit</b>
              <span>Talk to SeeFace, the mind of the labyrinth. Describe your world, by text or voice, and share your images and sounds.</span>
            </li>
            <li>
              <b>Manifest</b>
              <span>SeeFace builds your room while you talk. You see it change in real time, walk inside it, and keep refining.</span>
            </li>
            <li>
              <b>Open your door</b>
              <span>Submit it. We review every room by hand; once approved, its door opens in the labyrinth.</span>
            </li>
            <li>
              <b>Host your show</b>
              <span>Gather people in your room: listening sessions, open mics, premieres, readings. Free or ticketed.</span>
            </li>
          </ol>
        </section>

        <section className="arch-section" style={{ position: "static" }}>
          <h2>What you get</h2>
          <ul className="arch-list">
            <li>A room of your own, built from your work, that stays in the labyrinth permanently.</li>
            <li>Free or ticketed shows. You keep 70% of ticket revenue. Founding Architects pay 0% commission for their first 3 months.</li>
            <li>A marketing kit made for your room and your shows.</li>
            <li>Your work in front of the seeface1 audience.</li>
            <li>Creating your room is free.</li>
          </ul>
          <p className="arch-small" style={{ textTransform: "none", letterSpacing: 0 }}>
            Ticketed shows and the marketing kit arrive in the next phase. Nothing is charged today.
          </p>
        </section>

        <section className="arch-section" style={{ position: "static" }}>
          <h2>In plain words</h2>
          <ul className="arch-list">
            <li>
              <b>You keep your IP.</b> Your work stays yours.
            </li>
            <li>You give seeface1 a non-exclusive licence to display your work inside your room and in promotion of the labyrinth, with your name on it.</li>
            <li>Revenue split on tickets: 70% to you, 30% to seeface1 (0% to seeface1 for Founding Architects' first 3 months).</li>
            <li>Content rules: nothing hateful, nothing illegal, nothing sexual involving minors, nothing you don't have the rights to. We review every room before it opens.</li>
            <li>
              <b>Your voice is never recorded or stored.</b> When you speak to SeeFace it is turned into text, and only the text is kept.
            </li>
            <li>SeeFace is powered by AI tools.</li>
          </ul>
          <p>
            <a href="/architects/terms/">The full Architect Terms →</a>
          </p>
        </section>

        <section className="arch-section" style={{ position: "static", textAlign: "center" }}>
          <p style={{ fontStyle: "italic", fontSize: 22 }}>The door doesn't stay open for long.</p>
          <a className="arch-cta" href={joinHref()} onClick={() => track("architects-cta-bottom")}>
            Answer the call
          </a>
          <p className="arch-small" style={{ marginTop: 30 }}>
            <a href="/chamber/">already an architect? return to the chamber</a>
          </p>
        </section>
      </div>
    </main>
  );
}
