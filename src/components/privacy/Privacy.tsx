// /privacy: what seeface1 collects and why. Plain, short, honest.
export default function Privacy() {
  return (
    <main style={{ position: "fixed", inset: 0, overflow: "auto", touchAction: "pan-y", userSelect: "text", padding: "48px 22px", background: "#050505", color: "#d8d2c6", fontFamily: "'Times New Roman', serif", lineHeight: 1.6 }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <h1 style={{ fontWeight: "normal", fontStyle: "italic" }}>privacy · seeface1</h1>
        <p>When you enter the labyrinth you choose a nickname. You can also leave an email; that's optional.</p>
        <h2 style={{ fontWeight: "normal" }}>what we keep</h2>
        <ul>
          <li>your nickname, and your email if you give it</li>
          <li>whether you ticked "send me news" (we only email you if you did)</li>
          <li>which invite link brought you, if any</li>
          <li>a scrambled fingerprint of your connection, only to stop spam (no raw IP address)</li>
        </ul>
        <h2 style={{ fontWeight: "normal" }}>accounts (optional)</h2>
        <p>If you register to save your progress, we keep your nickname, a scrambled (hashed) version of your password, never the password itself, your progress (◈, best distance, levels found) and your email if you gave one. You can delete your account any time from the entry screen: everything is removed and your name becomes free again.</p>
        <h2 style={{ fontWeight: "normal" }}>what others see</h2>
        <p>Other players, and the people who run seeface1, see your nickname and where you walk in the labyrinth (live, and the path you took in the last few minutes). Nobody sees your email there.</p>
        <h2 style={{ fontWeight: "normal" }}>keepers</h2>
        <p>Masked figures marked ✶ (the cartographer, the collector, the jester, the mourner) are characters of the game, not people.</p>
        <h2 style={{ fontWeight: "normal" }}>analytics</h2>
        <p>We count visits with GoatCounter: no cookies, no personal data. Your browser keeps a small note of the day you first came, the day you last came and which link brought you, so we can count how many people come back. It stays on your device and holds nothing about who you are.</p>
        <h2 style={{ fontWeight: "normal" }}>deleting your data</h2>
        <p>Email us and we'll delete everything we hold about you. Every news email has an unsubscribe link.</p>
        <p style={{ marginTop: 40 }}>
          <a href="/labyrinth" style={{ color: "#ffe6b8" }}>← back to the labyrinth</a>
        </p>
      </div>
    </main>
  );
}
