import { describe, expect, it, beforeEach } from "vitest";
import {
  checkRateLimit,
  getClientIp,
  resetRateLimitsForTests,
} from "@/lib/rate-limit";

beforeEach(() => {
  resetRateLimitsForTests();
});

describe("checkRateLimit", () => {
  it("allows requests until a bucket reaches its limit", () => {
    const first = checkRateLimit({
      key: "workspace:1:categorize",
      limit: 2,
      windowMs: 60_000,
      now: 1000,
    });
    const second = checkRateLimit({
      key: "workspace:1:categorize",
      limit: 2,
      windowMs: 60_000,
      now: 1001,
    });
    const third = checkRateLimit({
      key: "workspace:1:categorize",
      limit: 2,
      windowMs: 60_000,
      now: 1002,
    });

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets a bucket after its window expires", () => {
    checkRateLimit({
      key: "ip:1.2.3.4:health",
      limit: 1,
      windowMs: 1_000,
      now: 1000,
    });

    const nextWindow = checkRateLimit({
      key: "ip:1.2.3.4:health",
      limit: 1,
      windowMs: 1_000,
      now: 2500,
    });

    expect(nextWindow.allowed).toBe(true);
    expect(nextWindow.remaining).toBe(0);
  });
});

describe("getClientIp", () => {
  it("prefers the first x-forwarded-for address", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        "x-real-ip": "198.51.100.5",
      },
    });

    expect(getClientIp(request)).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip", () => {
    const request = new Request("https://example.com", {
      headers: {
        "x-real-ip": "198.51.100.5",
      },
    });

    expect(getClientIp(request)).toBe("198.51.100.5");
  });
});
