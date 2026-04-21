import {
  getRequestLogContext,
  logError,
} from "@/lib/observability/logger";

export async function POST(request: Request) {
  const context = getRequestLogContext(request, "/api/client-error");
  const eventId = crypto.randomUUID();

  try {
    const payload = await request.json();
    logError("client.error", new Error(String(payload?.message ?? "Client error")), {
      ...context,
      eventId,
      diagnosticType: payload?.type ?? "unknown",
      pathname: payload?.pathname,
      href: payload?.href,
      scope: payload?.scope,
      url: payload?.url,
      status: payload?.status,
      statusText: payload?.statusText,
      source: payload?.source,
      line: payload?.lineno,
      column: payload?.colno,
      stack: payload?.stack,
    });
  } catch (error) {
    logError("client.error.parse_failed", error, {
      ...context,
      eventId,
    });
  }

  return Response.json({ ok: true, eventId });
}
