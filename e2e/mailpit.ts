/**
 * Helper to interact with the Mailpit API during E2E tests.
 * Mailpit captures all emails sent by the server when configured with local SMTP.
 *
 * Mailpit API docs: https://mailpit.axllent.org/docs/api-v1/
 */

const MAILPIT_API = 'http://127.0.0.1:8025/api/v1';

export interface MailpitMessage {
  ID: string;
  MessageID: string;
  From: { Name: string; Address: string };
  To: Array<{ Name: string; Address: string }>;
  Subject: string;
  Date: string;
  Size: number;
  Snippet: string;
}

export interface MailpitMessageDetail extends MailpitMessage {
  Text: string;
  HTML: string;
}

/**
 * Wait for an email to arrive for a given recipient.
 * Polls Mailpit every 500ms up to the timeout.
 */
export async function waitForEmail(
  toEmail: string,
  opts: { subjectContains?: string; timeout?: number } = {}
): Promise<MailpitMessage> {
  const { subjectContains, timeout = 15000 } = opts;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const res = await fetch(`${MAILPIT_API}/search?query=to:${encodeURIComponent(toEmail)}`);
    if (!res.ok) throw new Error(`Mailpit search failed: ${res.status}`);
    const data = await res.json();

    const messages: MailpitMessage[] = data.messages || [];
    const match = messages.find((m) => {
      if (subjectContains && !m.Subject.toLowerCase().includes(subjectContains.toLowerCase())) {
        return false;
      }
      return true;
    });

    if (match) return match;

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(
    `No email found for ${toEmail}${subjectContains ? ` with subject containing "${subjectContains}"` : ''} within ${timeout}ms`
  );
}

/**
 * Get the full message detail (HTML + text body) for a message ID.
 */
export async function getMessageDetail(messageId: string): Promise<MailpitMessageDetail> {
  const res = await fetch(`${MAILPIT_API}/message/${messageId}`);
  if (!res.ok) throw new Error(`Mailpit get message failed: ${res.status}`);
  return res.json();
}

/**
 * Extract all URLs from email HTML content.
 */
export function extractUrls(html: string): string[] {
  const urlRegex = /href="(https?:\/\/[^"]+)"/g;
  const urls: string[] = [];
  let match;
  while ((match = urlRegex.exec(html)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

/**
 * Extract a specific URL from an email that contains a given path segment.
 * For example, extractUrlWithPath(html, '/verify-email') returns the verification URL.
 */
export function extractUrlWithPath(html: string, pathSegment: string): string | null {
  const urls = extractUrls(html);
  return urls.find((u) => u.includes(pathSegment)) || null;
}

/**
 * Delete all messages in Mailpit (useful for cleanup between tests).
 */
export async function clearMailpit(): Promise<void> {
  await fetch(`${MAILPIT_API}/messages`, { method: 'DELETE' });
}
