import { describe, it, expect } from "vitest";
import { formatCurrency, formatDate, formatMonth } from "@/lib/format";

describe("formatCurrency", () => {
  it("formats cents to currency string", () => {
    expect(formatCurrency(812543)).toBe("$8,125.43");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("formats negative values", () => {
    expect(formatCurrency(-50025)).toBe("-$500.25");
  });

  it("formats small amounts", () => {
    expect(formatCurrency(99)).toBe("$0.99");
  });
});

describe("formatDate", () => {
  it("formats ISO date string", () => {
    const result = formatDate("2026-03-15");
    expect(result).toBe("Mar 15, 2026");
  });
});

describe("formatMonth", () => {
  it("formats month string", () => {
    const result = formatMonth("2026-03");
    expect(result).toBe("March 2026");
  });
});
