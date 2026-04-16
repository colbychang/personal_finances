const AUTHORIZED_EMAILS_ENV = "AUTHORIZED_EMAILS";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getAuthorizedEmails() {
  const raw = process.env[AUTHORIZED_EMAILS_ENV] ?? "";

  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .map(normalizeEmail);
}

export function isAuthorizedEmail(email?: string | null) {
  const allowed = getAuthorizedEmails();

  if (allowed.length === 0) {
    return true;
  }

  if (!email) {
    return false;
  }

  return allowed.includes(normalizeEmail(email));
}
