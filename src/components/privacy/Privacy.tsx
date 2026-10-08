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
        <h2 style={{ fontWeight: "normal" }}>instagram</h2>
        <p>If you sign in with Instagram, we receive only your Instagram account number and your username, which becomes your name in the labyrinth. We never get your password, your photos, your followers or your messages, and we never post anything. You can disconnect it any time in Instagram's settings, and delete your account from the entry screen.</p>
        <h2 style={{ fontWeight: "normal" }}>what others see</h2>
        <p>Other players, and the people who run seeface1, see your nickname and where you walk in the labyrinth (live, and the path you took in the last few minutes). Nobody sees your email there.</p>
        <h2 style={{ fontWeight: "normal" }}>keepers</h2>
        <p>Masked figures marked ✶ (the cartographer, the collector, the jester, the mourner) are characters of the game, not people.</p>
        <h2 style={{ fontWeight: "normal" }}>analytics</h2>
        <p>We count visits with GoatCounter: no cookies, no personal data. Your browser keeps a small note of the day you first came, the day you last came and which link brought you, so we can count how many people come back. It holds nothing about who you are.</p>
        <h2 style={{ fontWeight: "normal" }}>play journal</h2>
        <p>To make the game better, your browser also keeps a short play journal: how long you played on the cube and in the labyrinth, which days you came, the ◈ you earned and spent (and on what), and which things you did in the game (for example "opened the chat" or "used a teleport card"). It is shared with the people who run seeface1, tied only to a random number for your device and the nickname you already show to other players. It never contains your email, your IP address or your messages. If your browser sends Do Not Track or Global Privacy Control, no journal is shared.</p>
        <h2 style={{ fontWeight: "normal" }}>deleting your data</h2>
        <p>Email us and we'll delete everything we hold about you. Every news email has an unsubscribe link.</p>
        <p style={{ marginTop: 40 }}>
          <a href="/labyrinth" style={{ color: "#ffe6b8" }}>← back to the labyrinth</a>
        </p>
      </div>
    </main>
  );
}
