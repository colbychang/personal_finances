import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("PWA Manifest", () => {
  const manifestPath = path.resolve(__dirname, "../../../public/manifest.json");

  it("manifest.json exists in public directory", () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it("manifest.json is valid JSON", () => {
    const content = fs.readFileSync(manifestPath, "utf-8");
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it("has required name field", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.name).toBe("Glacier Finance Tracker");
  });

  it("has required short_name field", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.short_name).toBe("Glacier");
  });

  it("has display set to standalone", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.display).toBe("standalone");
  });

  it("has start_url set to /", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.start_url).toBe("/");
  });

  it("has theme_color", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("has background_color", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.background_color).toBeTruthy();
    expect(manifest.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("has icons with 192x192 and 512x512 sizes", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(manifest.icons).toBeDefined();
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("all icons have type image/png", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    for (const icon of manifest.icons) {
      expect(icon.type).toBe("image/png");
    }
  });

  it("icon files exist on disk", () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const publicDir = path.resolve(__dirname, "../../../public");
    for (const icon of manifest.icons) {
      const iconPath = path.join(publicDir, icon.src);
      expect(fs.existsSync(iconPath)).toBe(true);
    }
  });
});

describe("PWA Service Worker", () => {
  const swPath = path.resolve(__dirname, "../../../public/sw.js");

  it("service worker file exists in public directory", () => {
    expect(fs.existsSync(swPath)).toBe(true);
  });

  it("service worker handles install event", () => {
    const content = fs.readFileSync(swPath, "utf-8");
    expect(content).toContain('addEventListener("install"');
  });

  it("service worker handles activate event", () => {
    const content = fs.readFileSync(swPath, "utf-8");
    expect(content).toContain('addEventListener("activate"');
  });

  it("service worker handles fetch event", () => {
    const content = fs.readFileSync(swPath, "utf-8");
    expect(content).toContain('addEventListener("fetch"');
  });

  it("service worker caches static assets", () => {
    const content = fs.readFileSync(swPath, "utf-8");
    expect(content).toContain("caches");
    expect(content).toContain("CACHE_NAME");
  });

  it("service worker skips API requests from caching", () => {
    const content = fs.readFileSync(swPath, "utf-8");
    expect(content).toContain("/api/");
  });
});

describe("PWA Icons", () => {
  const publicDir = path.resolve(__dirname, "../../../public");

  it("192x192 icon exists and is a valid PNG", () => {
    const iconPath = path.join(publicDir, "icon-192x192.png");
    expect(fs.existsSync(iconPath)).toBe(true);
    const buffer = fs.readFileSync(iconPath);
    // PNG magic bytes
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50); // P
    expect(buffer[2]).toBe(0x4e); // N
    expect(buffer[3]).toBe(0x47); // G
  });

  it("512x512 icon exists and is a valid PNG", () => {
    const iconPath = path.join(publicDir, "icon-512x512.png");
    expect(fs.existsSync(iconPath)).toBe(true);
    const buffer = fs.readFileSync(iconPath);
    // PNG magic bytes
    expect(buffer[0]).toBe(0x89);
    expect(buffer[1]).toBe(0x50); // P
    expect(buffer[2]).toBe(0x4e); // N
    expect(buffer[3]).toBe(0x47); // G
  });
});

describe("Root Layout PWA Integration", () => {
  const layoutPath = path.resolve(__dirname, "../../app/layout.tsx");

  it("root layout imports PWA components", () => {
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("ServiceWorkerRegistration");
    expect(content).toContain("OfflineIndicator");
  });

  it("root layout references manifest", () => {
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("manifest");
  });

  it("root layout includes apple-touch-icon link", () => {
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("apple-touch-icon");
  });

  it("root layout exports viewport with theme color", () => {
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("viewport");
    expect(content).toContain("themeColor");
  });
});
