// Email for The Architects (sign-in links, "your door is open"). Sends through
// Resend's HTTP API when RESEND_API_KEY + MAIL_FROM are set; otherwise it only
// logs, so local runs and an un-configured server never fail on email.
//   RESEND_API_KEY  re_...           MAIL_FROM  "seeface <architects@seeface.world>" (a verified domain)
export const mailReady = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

export async function sendMail({ to, subject, text }) {
  if (!mailReady()) {
    console.log(`mail (not sent, no RESEND_API_KEY): to=${to} subject="${subject}"\n${text}`);
    return false;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.error("mail failed", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e) {
    console.error("mail failed", e.message);
    return false;
  }
}
