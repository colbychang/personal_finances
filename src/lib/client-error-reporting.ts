"use client";

type ClientDiagnosticPayload = {
  type: "error" | "unhandledrejection" | "request";
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  pathname: string;
  href: string;
  scope?: string;
  url?: string;
  status?: number;
  statusText?: string;
};

const REPORTED_ERRORS = new Set<string>();

export function reportClientDiagnostic(payload: ClientDiagnosticPayload) {
  const fingerprint = JSON.stringify(payload);
  if (REPORTED_ERRORS.has(fingerprint)) {
    return;
  }

  REPORTED_ERRORS.add(fingerprint);

  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon("/api/client-error", blob);
    return;
  }

  void fetch("/api/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}

export async function fetchJsonWithTimeout<T>(
  url: string,
  options: {
    scope: string;
    timeoutMs?: number;
  },
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 15000;
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      reportClientDiagnostic({
        type: "request",
        message: `${options.scope} request failed with status ${res.status}`,
        pathname: window.location.pathname,
        href: window.location.href,
        scope: options.scope,
        url,
        status: res.status,
        statusText: body.slice(0, 300) || res.statusText,
      });
      throw new Error(`${options.scope} failed with status ${res.status}`);
    }

    return (await res.json()) as T;
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "AbortError"
        ? `${options.scope} timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);

    reportClientDiagnostic({
      type: "request",
      message,
      stack: error instanceof Error ? error.stack : undefined,
      pathname: window.location.pathname,
      href: window.location.href,
      scope: options.scope,
      url,
    });

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
