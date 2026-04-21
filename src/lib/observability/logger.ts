type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function writeLog(level: LogLevel, event: string, fields: LogFields = {}) {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...fields,
  };
  const serialized = JSON.stringify(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}

export function getRequestLogContext(request: Request, route: string) {
  return {
    route,
    requestId:
      request.headers.get("x-vercel-id") ??
      request.headers.get("x-request-id") ??
      crypto.randomUUID(),
  };
}

export function logInfo(event: string, fields?: LogFields) {
  writeLog("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields) {
  writeLog("warn", event, fields);
}

export function logError(event: string, error: unknown, fields?: LogFields) {
  writeLog("error", event, {
    ...fields,
    error: normalizeError(error),
  });
}

export function getDurationMs(startedAt: number) {
  return Date.now() - startedAt;
}
