"use client";

import { useEffect } from "react";
import { reportClientDiagnostic } from "@/lib/client-error-reporting";

export function ClientErrorReporter() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      reportClientDiagnostic({
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

      reportClientDiagnostic({
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
