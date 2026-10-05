import { useState } from "react";
import { WEB3FORMS_ACCESS_KEY } from "../../config/form";
import "./WinForm.scss";

type Status = "idle" | "sending" | "sent" | "error";

export default function WinForm({ code }: { code: string }) {
  const [instagram, setInstagram] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const handle = instagram.trim().replace(/^@/, "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!handle) return;
    setStatus("sending");
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          subject: `Cube cracked by @${handle}`,
          from_name: "seeface1.world cube gate",
          instagram: `@${handle}`,
          instagram_url: `https://instagram.com/${handle}`,
          code,
          cracked_at: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      setStatus(data.success ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div id="overlay" className="win-overlay">
      <div className="win-form fade-in">
        {status === "sent" ? (
          <>
            <h1>We see you.</h1>
            <p>Expect a message on Instagram from us.</p>
            <p className="win-handle">@{handle}</p>
          </>
        ) : (
          <>
            <h1>You cracked it.</h1>
            <p>Few get this far. Leave your Instagram and we will find you.</p>
            <form onSubmit={submit}>
              <input
                type="text"
                placeholder="@your.instagram"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                autoFocus
                autoComplete="off"
                maxLength={40}
              />
              <button type="submit" disabled={!handle || status === "sending"}>
                {status === "sending" ? "Sending…" : "Send"}
              </button>
            </form>
            {status === "error" && (
              <p className="win-error">Something went wrong. Try again.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
