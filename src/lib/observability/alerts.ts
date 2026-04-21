type AlertFields = Record<string, unknown>;

function sanitizeAlertFields(fields: AlertFields) {
  const sanitized: AlertFields = {};

  for (const [key, value] of Object.entries(fields)) {
    if (key.toLowerCase().includes("token") || key.toLowerCase().includes("password")) {
      sanitized[key] = "[redacted]";
      continue;
    }

    if (key === "error" && value && typeof value === "object") {
      const error = value as { name?: unknown; message?: unknown };
      sanitized.error = {
        name: error.name,
        message: error.message,
      };
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

export function sendErrorAlert(event: string, fields: AlertFields = {}) {
  const url = process.env.ERROR_ALERT_WEBHOOK_URL;

  if (!url) {
    return;
  }

  const payload = {
    source: "glacier-finance-tracker",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    event,
    timestamp: new Date().toISOString(),
    fields: sanitizeAlertFields(fields),
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (process.env.ERROR_ALERT_WEBHOOK_TOKEN) {
    headers.Authorization = `Bearer ${process.env.ERROR_ALERT_WEBHOOK_TOKEN}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);

  void fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: controller.signal,
  })
    .catch(() => {
      // Avoid recursively logging alert delivery failures from the logger itself.
    })
    .finally(() => clearTimeout(timeout));
}
