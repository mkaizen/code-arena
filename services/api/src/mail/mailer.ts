import { env } from "../env.js";

export interface Email {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback; derived from html if omitted. */
  text?: string;
}

/** True when a real email provider is configured (otherwise we only log). */
export function emailEnabled(): boolean {
  return !!env.RESEND_API_KEY;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Sends one email. Provider-agnostic and safe by default: with no
 * RESEND_API_KEY set the message is logged instead of sent, so the app runs
 * end-to-end without any mail provider. Never throws — a delivery failure is
 * logged and swallowed so a broken provider can't take down a request or a
 * background sweep.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!emailEnabled()) {
    console.log(`[mail:log] to=${email.to} subject="${email.subject}" (RESEND_API_KEY unset — not sent)`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text ?? stripHtml(email.html),
      }),
    });
    if (!res.ok) {
      console.error(`[mail] send failed ${res.status}: ${await res.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[mail] send error", err);
    return false;
  }
}
