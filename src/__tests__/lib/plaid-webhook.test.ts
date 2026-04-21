import { afterEach, describe, expect, it } from "vitest";
import { buildPlaidWebhookUrl } from "@/lib/plaid/webhook";

const ORIGINAL_ENV = {
  PLAID_WEBHOOK_URL: process.env.PLAID_WEBHOOK_URL,
  PLAID_WEBHOOK_SECRET: process.env.PLAID_WEBHOOK_SECRET,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
};

afterEach(() => {
  process.env.PLAID_WEBHOOK_URL = ORIGINAL_ENV.PLAID_WEBHOOK_URL;
  process.env.PLAID_WEBHOOK_SECRET = ORIGINAL_ENV.PLAID_WEBHOOK_SECRET;
  process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_ENV.NEXT_PUBLIC_SITE_URL;
});

describe("buildPlaidWebhookUrl", () => {
  it("uses an explicit HTTPS webhook URL when provided", () => {
    process.env.PLAID_WEBHOOK_URL = "https://example.com/api/plaid/webhook?secret=abc";
    process.env.NEXT_PUBLIC_SITE_URL = "https://ignored.example.com";

    expect(buildPlaidWebhookUrl()).toBe("https://example.com/api/plaid/webhook?secret=abc");
  });

  it("derives a signed webhook URL from the public site URL", () => {
    process.env.PLAID_WEBHOOK_URL = "";
    process.env.PLAID_WEBHOOK_SECRET = "test secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://finance.example.com";

    expect(buildPlaidWebhookUrl()).toBe(
      "https://finance.example.com/api/plaid/webhook?secret=test+secret",
    );
  });

  it("does not build a webhook URL for non-HTTPS site URLs", () => {
    process.env.PLAID_WEBHOOK_URL = "";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

    expect(buildPlaidWebhookUrl()).toBeUndefined();
  });
});
