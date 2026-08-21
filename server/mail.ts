/**
 * Sending a job out by email, through Brevo's HTTP API.
 *
 * Impure by nature — a network call and an API key — so it lives in `server/`
 * and never in `core/`. No SMTP client to write, no mail port to open on the
 * host, and no dependency: it is one `fetch` with a JSON body.
 *
 * ---------------------------------------------------------------------------
 * The one rule that decides whether email arrives
 *
 * **Brevo will not send as an address it cannot prove the sender owns.**
 * `panelsuite.online` is authenticated, so `MAIL_FROM` works with no further
 * setup. An estimator who wants their own address in the From line has to add
 * it under *Senders* in Brevo once and click the confirmation link; until they
 * do, Brevo refuses the request outright.
 *
 * Either way the estimator's own address is the **Reply-To**, so the customer
 * replies to a person and not to the tool. That address is read from Supabase
 * using the caller's own token — not taken from the request, which the browser
 * could say anything in.
 *
 * The attachments are the bytes `/api/export` produces, built the same way from
 * the same spec. Nothing about the BOQ is recomputed to send it: two builds are
 * two chances to disagree, and the sheet the customer opens has to be the sheet
 * the estimator saw.
 */

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

/**
 * Brevo's own ceiling is 10MB for the whole message. Base64 costs a third on
 * top of the raw bytes, so this is checked against the encoded size — the
 * number that actually travels.
 */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface MailAttachment {
  name: string;
  bytes: Uint8Array;
}

export interface MailRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** plain text; the body an estimator typed, sent as they typed it */
  text: string;
  attachments: MailAttachment[];
  /** From. Blank falls back to MAIL_FROM — see the note at the top. */
  from?: string;
  fromName?: string;
  /** the signed-in estimator, read from Supabase rather than from the request */
  replyTo?: string;
}

export interface MailResult {
  ok: boolean;
  /** Brevo's id when it took the message, so a send can be traced */
  messageId?: string;
  error?: string;
}

/**
 * Addresses, one per line or comma separated, the way somebody actually types
 * them into a box.
 *
 * Empty entries are dropped rather than sent as blanks. What is left is checked
 * for shape only — a real check is the mail server's job, and refusing an
 * address that turns out to be fine is worse than letting Brevo answer.
 */
export function parseAddresses(raw: string): string[] {
  return String(raw ?? '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Which of these are not addresses, so the answer names them rather than failing. */
export const badAddresses = (list: string[]) => list.filter((a) => !LOOKS_LIKE_EMAIL.test(a));

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

/**
 * Everything wrong with a request, before a byte is sent.
 *
 * Checked here rather than left to Brevo because Brevo's answers are about its
 * own API — `invalid_parameter` on a missing recipient tells an estimator
 * nothing about the box they left empty.
 */
export function problemWith(req: MailRequest): string | null {
  if (!req.to?.length) return 'Who is it going to? Add at least one address.';

  const bad = badAddresses([...req.to, ...(req.cc ?? []), ...(req.bcc ?? [])]);
  if (bad.length) {
    return `Not an email address: ${bad.join(', ')}`;
  }
  if (req.from && badAddresses([req.from]).length) {
    return `The From address is not an email address: ${req.from}`;
  }
  if (!req.subject?.trim()) return 'The subject is empty.';

  const total = req.attachments.reduce((n, a) => n + Math.ceil((a.bytes.length * 4) / 3), 0);
  if (total > MAX_ATTACHMENT_BYTES) {
    return (
      `The attachments come to ${(total / 1024 / 1024).toFixed(1)}MB and the limit is 10MB. ` +
      'Send the drawing on its own, or share it from Drive instead.'
    );
  }
  return null;
}

/** The JSON Brevo takes. Separated out so a test can read it without a network. */
export function brevoBody(req: MailRequest, fallbackFrom: string) {
  const from = (req.from || '').trim() || fallbackFrom;
  return {
    sender: req.fromName ? { email: from, name: req.fromName } : { email: from },
    to: req.to.map((email) => ({ email })),
    ...(req.cc?.length ? { cc: req.cc.map((email) => ({ email })) } : {}),
    ...(req.bcc?.length ? { bcc: req.bcc.map((email) => ({ email })) } : {}),
    // the estimator, always — so a reply reaches a person, whoever the From is
    ...(req.replyTo ? { replyTo: { email: req.replyTo } } : {}),
    subject: req.subject,
    textContent: req.text,
    attachment: req.attachments.map((a) => ({ name: a.name, content: toBase64(a.bytes) })),
  };
}

/**
 * Brevo says what it refused and why; that is what an estimator needs to read,
 * so it is passed through rather than replaced with a generic failure. The one
 * case worth naming is an unverified sender, because the fix is a specific
 * thing to go and do and Brevo's own wording does not say it.
 */
function readBrevoError(status: number, body: string): string {
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { message?: string; code?: string };
    if (parsed.message) message = parsed.message;
    if (/sender/i.test(parsed.message ?? '') || parsed.code === 'invalid_parameter') {
      return (
        `${message} — if this is about the From address, it has to be verified in Brevo ` +
        'first: Senders → Add a sender, then click the link Brevo emails you. ' +
        'Leave the From box empty to send from the account address instead.'
      );
    }
  } catch {
    /* not JSON: the text is the best answer there is */
  }
  return `${message} (Brevo returned ${status})`;
}

/**
 * Send it.
 *
 * `apiKey` is an environment variable on the server and never reaches the
 * browser — that is the whole reason this goes through our own host rather than
 * straight from the page.
 */
export async function sendMail(
  req: MailRequest,
  apiKey: string,
  fallbackFrom: string,
): Promise<MailResult> {
  const problem = problemWith(req);
  if (problem) return { ok: false, error: problem };

  let res: Response;
  try {
    res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(brevoBody(req, fallbackFrom)),
    });
  } catch (err) {
    return { ok: false, error: `Could not reach Brevo: ${(err as Error).message}` };
  }

  const text = await res.text();
  if (!res.ok) return { ok: false, error: readBrevoError(res.status, text) };

  let messageId: string | undefined;
  try {
    messageId = (JSON.parse(text) as { messageId?: string }).messageId;
  } catch {
    /* it took the message; an id we cannot parse is not a failure */
  }
  return { ok: true, messageId };
}

/**
 * The subject a job goes out with, unless the estimator changes it.
 *
 * The job number leads, because that is what a customer replies about and what
 * anyone searching a mailbox six months later types.
 */
export const defaultSubject = (jobNo: string) =>
  `${(jobNo || '').trim() || 'Panel Suite'} — drawings and BOQ`;
