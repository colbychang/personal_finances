"use client";

import { useEffect } from "react";

type ClientErrorPayload = {
  type: "error" | "unhandledrejection";
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  pathname: string;
  href: string;
};

const REPORTED_ERRORS = new Set<string>();

function reportClientError(payload: ClientErrorPayload) {
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

export function ClientErrorReporter() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      reportClientError({
        type: "error",
        message: event.message || "Unknown client error",
        stack: event.error instanceof Error ? event.error.stack : undefined,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        pathname: window.location.pathname,
        href: window.location.href,
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const reason =
        event.reason instanceof Error
          ? { message: event.reason.message, stack: event.reason.stack }
          : { message: String(event.reason) };

      reportClientError({
        type: "unhandledrejection",
        message: reason.message,
        stack: reason.stack,
        pathname: window.location.pathname,
        href: window.location.href,
      });
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
