import { NextResponse } from "next/server";
import { logWarn } from "@/lib/observability/logger";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  key: string;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

const buckets = new Map<string, Bucket>();

function cleanupExpiredBuckets(now: number) {
  if (buckets.size < 1_000) {
    return;
  }

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function checkRateLimit(input: RateLimitInput): RateLimitResult {
  const now = input.now ?? Date.now();
  cleanupExpiredBuckets(now);

  const existing = buckets.get(input.key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : {
          count: 0,
          resetAt: now + input.windowMs,
        };

  bucket.count += 1;
  buckets.set(input.key, bucket);

  const remaining = Math.max(0, input.limit - bucket.count);
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  return {
    allowed: bucket.count <= input.limit,
    key: input.key,
    limit: input.limit,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds,
  };
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

export function buildRateLimitHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
  };
}

export function rateLimitResponse(
  result: RateLimitResult,
  {
    route,
    message = "Too many requests. Please try again soon.",
  }: {
    route: string;
    message?: string;
  },
) {
  logWarn("rate_limit.exceeded", {
    route,
    key: result.key,
    limit: result.limit,
    retryAfterSeconds: result.retryAfterSeconds,
  });

  return NextResponse.json(
    {
      error: message,
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: buildRateLimitHeaders(result),
    },
  );
}

export function checkWorkspaceRateLimit({
  workspaceId,
  scope,
  limit,
  windowMs,
}: {
  workspaceId: number;
  scope: string;
  limit: number;
  windowMs: number;
}) {
  return checkRateLimit({
    key: `workspace:${workspaceId}:${scope}`,
    limit,
    windowMs,
  });
}

export function checkIpRateLimit({
  request,
  scope,
  limit,
  windowMs,
}: {
  request: Request;
  scope: string;
  limit: number;
  windowMs: number;
}) {
  return checkRateLimit({
    key: `ip:${getClientIp(request)}:${scope}`,
    limit,
    windowMs,
  });
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
