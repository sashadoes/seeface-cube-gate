// /brands: the page for brand deals. What a brand gets in the world, how
// little it takes to plug in (one object in brands/campaigns.ts), and the link
// a brand gives its people to come and play: straight into the brand's place.
// Numbers shown here are real people only (the same live pulse as the cube page).
import { useEffect, useState } from "react";
import { CAMPAIGNS, brandLink, brandName, showsBrand, BRAND_CONTACT } from "../../brands/campaigns";
import { onOnline } from "../../online";
import "./Brands.scss";

const PLAY = "https://seeface1.world/labyrinth/";

function CopyLink({ url, label }: { url: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="brands-link">
      <code>{url.replace("https://", "")}</code>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          });
        }}
      >
        {done ? "copied" : label}
      </button>
      <a href={url}>enter ➝</a>
    </div>
  );
}

export default function Brands() {
  const [online, setOnline] = useState(0);
  useEffect(() => onOnline(setOnline), []);
  useEffect(() => {
    document.title = "seeface1 · for brands";
  }, []);

  return (
    <main className="brands">
      <div className="brands-wrap">
        <header>
          <img src="/imgs/seeface-logo-transparent.png" alt="" />
          <h1>seeface world · for brands</h1>
          <p className="lead">An endless 3D labyrinth that strangers walk together, in the browser, on any phone. They talk, go live with their voice, trade, hang their art on the walls and get lost. Your brand can live inside it.</p>
          {online > 0 && (
            <p className="live">
              <i /> {online} {online === 1 ? "person" : "people"} on seeface1 right now
            </p>
          )}
        </header>

        <div className="brands-block">
          <h2>play it first</h2>
          <p>No app, no sign-up. Open the link, pick a name, walk in.</p>
          <CopyLink url={PLAY} label="copy link" />
        </div>

        <div className="brands-block">
          <h2>what your brand gets</h2>
          <div className="brands-grid">
            <div>
              <b>posters</b>
              <span>your posters on the corridor walls, in your colours, seen by everyone walking past</span>
            </div>
            <div>
              <b>your place</b>
              <span>a hall of its own in the maze, a café, a shop, a stage, on the map for everyone</span>
            </div>
            <div>
              <b>your goods</b>
              <span>things players want, sold at your counter: teleports, boosts, objects to collect</span>
            </div>
            <div>
              <b>your link</b>
              <span>one link that drops your people straight inside your place</span>
            </div>
            <div>
              <b>your moments</b>
              <span>world events everyone sees at the same time: a coffee rain, a show, a treasure hunt</span>
            </div>
            <div>
              <b>real people</b>
              <span>chat and live voice between strangers who meet in your place</span>
            </div>
          </div>
        </div>

        <div className="brands-block">
          <h2>campaigns</h2>
          {CAMPAIGNS.map((c) => (
            <div key={c.id} className="brands-campaign" style={{ "--deep": c.colors.deep, "--accent": c.colors.accent, "--cream": c.colors.cream } as React.CSSProperties}>
              <div className="brands-campaign-head">
                <b>{brandName(c)}</b>
                <span>{c.licensed ? "live" : showsBrand(c) ? "pitch preview" : "first campaign · coffee"}</span>
              </div>
              <p>
                {c.cafe.tagline} · posters in the corridors · a café east of the entrance · {c.menu.map((m) => m.name).join(", ")}
              </p>
              <p className="small">give your people this link: they arrive inside the café.</p>
              <CopyLink url={brandLink(c)} label="copy link" />
            </div>
          ))}
        </div>

        <div className="brands-block">
          <h2>integration: easy</h2>
          <p>A brand is one small description. You send us your name, colours, a few poster lines and what your counter sells; it's live in the world the same day. No SDK, no code on your side.</p>
          <pre>{`{
  brand: "your brand",
  colors: { deep: "#00382b", accent: "#00a862", cream: "#f2ead8" },
  posters: [["a warm cup", "in the cold labyrinth", "open now"]],
  cafe: { sign: "your brand", tagline: "coffee · teleports · warmth" },
  menu: [{ name: "a teleport", price: 12 }, { name: "espresso", price: 3 }],
}`}</pre>
          <p className="small">Players pay at your counter with ◈, the world's own currency that they earn by playing. It has no money value and can't be bought: your brand is part of the fun, never a paywall.</p>
        </div>

        <div className="brands-block">
          <h2>honest by design</h2>
          <ul>
            <li>only real people are counted, never bots or padded numbers</li>
            <li>no real money from players, ever</li>
            <li>your logo only with your permission, under a signed deal</li>
          </ul>
        </div>

        <div className="brands-block">
          <h2>let's talk</h2>
          {BRAND_CONTACT ? (
            <p>
              <a className="brands-cta" href={BRAND_CONTACT}>
                start a campaign ➝
              </a>
            </p>
          ) : (
            <p>Walk in and find us: the owner is often inside, writing as ◉ seeface.</p>
          )}
        </div>

        <footer>
          <a href="/labyrinth/">← into the labyrinth</a> · <a href="/privacy/">privacy</a>
        </footer>
      </div>
    </main>
  );
}
