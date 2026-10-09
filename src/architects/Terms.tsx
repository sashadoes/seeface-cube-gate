// /architects/terms: placeholder Architect Terms. Not legal text yet.
import "./architects.scss";

export default function Terms() {
  return (
    <main className="arch">
      <div className="arch-wrap arch-terms">
        <p className="arch-small">
          <a href="/architects/" style={{ textDecoration: "none" }}>
            ← the call
          </a>
        </p>
        <h1>Architect Terms</h1>
        <p className="todo">TODO: LEGAL REVIEW. This is a plain-language placeholder written for Phase 1. It is not legal advice and has not been reviewed by a lawyer.</p>

        <h2>1. Your work stays yours</h2>
        <p>You keep all intellectual property in the images, sounds, words and ideas you bring into the Creation Chamber. You confirm that you made them yourself or have the right to share them, and that they don't show a real person who hasn't agreed to it.</p>

        <h2>2. What you let us do</h2>
        <p>
          You give seeface1 a non-exclusive, worldwide, royalty-free licence to store, display and perform your work inside your room in the labyrinth, and to show it in seeface1's own promotion
          of the labyrinth and your room, always credited to you. Non-exclusive means you can publish, sell or license your work anywhere else. <span className="todo">TODO: LEGAL REVIEW: licence scope, term, territory.</span>
        </p>

        <h2>3. Your room</h2>
        <p>
          Your room is created free of charge. Every room is reviewed by hand before it becomes visible to others. Approved rooms stay in the labyrinth permanently, unless you ask us to remove
          your room or it breaks these terms. <span className="todo">TODO: LEGAL REVIEW: "permanently", removal, what happens if the service ends.</span>
        </p>

        <h2>4. Shows and money (coming in the next phase)</h2>
        <p>
          When ticketed shows open: you keep 70% of ticket revenue and seeface1 keeps 30%. Founding Architects (the first 100 approved rooms) pay 0% commission for their first 3 months of
          ticketed shows. No payments happen in Phase 1. <span className="todo">TODO: LEGAL REVIEW: payouts, taxes, refunds, payment provider terms, when the 3 months start.</span>
        </p>

        <h2>5. Content rules</h2>
        <p>No hateful content, no sexual content involving minors, nothing illegal, nothing that infringes someone else's rights. We may refuse, pause or remove a room that breaks these rules.</p>

        <h2>6. SeeFace and your data</h2>
        <p>
          SeeFace is powered by AI tools. What you type, and the text of what you say, is sent to an AI provider to generate SeeFace's replies and your room's blueprint. Your images may be sent
          to describe them. <b>Your voice is never recorded or stored:</b> speech is turned into text (in your browser where possible, otherwise on our server, where the audio is discarded
          immediately) and only the text is kept. Your uploads are private until your room is approved. You can ask us to delete your application, room and uploads at any time.{" "}
          <span className="todo">TODO: LEGAL REVIEW: processors list, retention, GDPR basis, data deletion process.</span>
        </p>

        <h2>7. Changes</h2>
        <p>We may update these terms. If a change affects your rights or your share of revenue, we'll tell you by email before it applies.</p>

        <p style={{ marginTop: 40 }}>
          <a href="/architects/join/">Answer the call →</a>
        </p>
      </div>
    </main>
  );
}
