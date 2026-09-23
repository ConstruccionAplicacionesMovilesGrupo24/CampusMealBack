/** Emails are stored and compared trimmed and lowercase (enforced by a DB check). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
