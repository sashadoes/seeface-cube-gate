// /artists: the agreement artists accept when they hang their work in the
// labyrinth. Plain language. (A draft written for seeface1, not legal advice:
// have a lawyer look at it before any commercial use.)
export default function Artists() {
  const h2 = { fontWeight: "normal" as const, fontStyle: "italic" as const, marginTop: 28 };
  return (
    <main style={{ position: "fixed", inset: 0, overflow: "auto", touchAction: "pan-y", userSelect: "text", padding: "48px 22px", background: "#050505", color: "#d8d2c6", fontFamily: "'Times New Roman', serif", lineHeight: 1.6 }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <h1 style={{ fontWeight: "normal", fontStyle: "italic" }}>artists · seeface1</h1>
        <p>seeface1 is a place for artists first. When you hang a photo or a drawing on a wall in the labyrinth, you agree to this:</p>
        <h2 style={h2}>1. it's yours</h2>
        <p>You made it yourself, or you have the right to share it. It doesn't copy anyone else's work, and it doesn't show a real person who didn't agree to it.</p>
        <h2 style={h2}>2. you let us show it, for free</h2>
        <p>You give seeface1 a free, non-exclusive permission to show your work inside the labyrinth (on the walls, in galleries and exhibitions), and in seeface1's own promotion (for example a video or post about the labyrinth), always with your name. We never sell your work or give it to anyone else to use.</p>
        <h2 style={h2}>3. it stays yours</h2>
        <p>You keep all rights to your work. You can show, sell or publish it anywhere else as you like.</p>
        <h2 style={h2}>4. you can take it down</h2>
        <p>Ask us any time and we remove it from the labyrinth, and stop using it in anything new. (Things already published, like a past video, may stay up.)</p>
        <h2 style={h2}>5. what we can remove</h2>
        <p>We approve every work before others see it, and we can remove anything that breaks these rules, copies someone else's work, or isn't safe for everyone.</p>
        <h2 style={h2}>6. selling in the market</h2>
        <p>Trades in the open market use ◈, the labyrinth's own currency. It has no money value and can't be bought or cashed out.</p>
        <p style={{ marginTop: 40 }}>
          <a href="/labyrinth" style={{ color: "#ffe6b8" }}>← back to the labyrinth</a>
        </p>
      </div>
    </main>
  );
}
