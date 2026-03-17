import { describe, it, expect } from "vitest";
import {
  sidebarLinks,
  mobileTabLinks,
  moreMenuLinks,
  moreTab,
} from "@/components/navigation/nav-links";

describe("Navigation link configuration", () => {
  it("sidebar has all required navigation links", () => {
    const labels = sidebarLinks.map((l) => l.label);
    expect(labels).toEqual([
      "Dashboard",
      "Transactions",
      "Budgets",
      "Accounts",
      "Analytics",
      "Net Worth",
      "Settings",
      "Import",
    ]);
  });

  it("sidebar links have valid hrefs", () => {
    const expectedHrefs = [
      "/",
      "/transactions",
      "/budgets",
      "/accounts",
      "/analytics",
      "/net-worth",
      "/settings",
      "/import",
    ];
    const hrefs = sidebarLinks.map((l) => l.href);
    expect(hrefs).toEqual(expectedHrefs);
  });

  it("all sidebar links have icons", () => {
    for (const link of sidebarLinks) {
      expect(link.icon).toBeDefined();
      expect(typeof link.icon).toMatch(/function|object/); // Lucide icons are React components
    }
  });

  it("mobile tab bar has exactly 4 primary tabs", () => {
    expect(mobileTabLinks).toHaveLength(4);
    const labels = mobileTabLinks.map((l) => l.label);
    expect(labels).toEqual([
      "Dashboard",
      "Transactions",
      "Budgets",
      "Accounts",
    ]);
  });

  it("mobile tab links have valid hrefs", () => {
    const hrefs = mobileTabLinks.map((l) => l.href);
    expect(hrefs).toEqual(["/", "/transactions", "/budgets", "/accounts"]);
  });

  it("more menu has Analytics, Net Worth, Settings, and Import links", () => {
    const labels = moreMenuLinks.map((l) => l.label);
    expect(labels).toEqual(["Analytics", "Net Worth", "Settings", "Import"]);
  });

  it("more menu links have valid hrefs", () => {
    const hrefs = moreMenuLinks.map((l) => l.href);
    expect(hrefs).toEqual(["/analytics", "/net-worth", "/settings", "/import"]);
  });

  it("more tab has label and icon", () => {
    expect(moreTab.label).toBe("More");
    expect(moreTab.icon).toBeDefined();
    expect(typeof moreTab.icon).toMatch(/function|object/);
  });

  it("all navigation links have unique hrefs within their group", () => {
    const sidebarHrefs = new Set(sidebarLinks.map((l) => l.href));
    expect(sidebarHrefs.size).toBe(sidebarLinks.length);

    const mobileHrefs = new Set(mobileTabLinks.map((l) => l.href));
    expect(mobileHrefs.size).toBe(mobileTabLinks.length);

    const moreHrefs = new Set(moreMenuLinks.map((l) => l.href));
    expect(moreHrefs.size).toBe(moreMenuLinks.length);
  });

  it("mobile tabs + more menu cover all sidebar links", () => {
    const mobileAndMoreHrefs = [
      ...mobileTabLinks.map((l) => l.href),
      ...moreMenuLinks.map((l) => l.href),
    ].sort();
    const sidebarHrefs = sidebarLinks.map((l) => l.href).sort();
    expect(mobileAndMoreHrefs).toEqual(sidebarHrefs);
  });

  it("all links start with /", () => {
    const allLinks = [...sidebarLinks, ...mobileTabLinks, ...moreMenuLinks];
    for (const link of allLinks) {
      expect(link.href).toMatch(/^\//);
    }
  });
});
