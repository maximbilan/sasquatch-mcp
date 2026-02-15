import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WikiDatabase } from "../database.js";
import type { PageData } from "../types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Create a temporary database file path for isolated tests.
 */
function tmpDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-test-"));
  return path.join(dir, "test.db");
}

describe("WikiDatabase", () => {
  let db: WikiDatabase;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = new WikiDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    // Clean up temp files
    try {
      fs.unlinkSync(dbPath);
      fs.unlinkSync(dbPath + "-wal");
      fs.unlinkSync(dbPath + "-shm");
    } catch {
      // ignore if files don't exist
    }
    try {
      fs.rmdirSync(path.dirname(dbPath));
    } catch {
      // ignore
    }
  });

  const samplePage: PageData = {
    title: "Fishing",
    content:
      "Fishing is an activity in Sneaky Sasquatch. Players can catch various fish at different locations.",
    url: "https://sneaky-sasquatch.fandom.com/wiki/Fishing",
    categories: ["Activities", "Gameplay"],
    last_modified: "2024-01-15T10:30:00Z",
  };

  const samplePage2: PageData = {
    title: "Cooking",
    content:
      "Cooking allows the player to prepare food items. Different recipes require different ingredients.",
    url: "https://sneaky-sasquatch.fandom.com/wiki/Cooking",
    categories: ["Activities", "Food"],
    last_modified: "2024-02-20T14:00:00Z",
  };

  const samplePage3: PageData = {
    title: "Fishing Rod",
    content:
      "The Fishing Rod is a tool used for fishing. It can be purchased at the store.",
    url: "https://sneaky-sasquatch.fandom.com/wiki/Fishing_Rod",
    categories: ["Items", "Tools"],
    last_modified: "2024-01-10T08:00:00Z",
  };

  describe("initialization", () => {
    it("creates the database file on construction", () => {
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it("starts with zero pages", () => {
      expect(db.getPageCount()).toBe(0);
    });

    it("starts with no categories", () => {
      expect(db.getCategories()).toEqual([]);
    });

    it("starts with no titles", () => {
      expect(db.getAllTitles()).toEqual([]);
    });
  });

  describe("upsertPage", () => {
    it("inserts a new page", () => {
      db.upsertPage(samplePage);
      expect(db.getPageCount()).toBe(1);
    });

    it("can retrieve the inserted page by title", () => {
      db.upsertPage(samplePage);
      const page = db.getPage("Fishing");
      expect(page).not.toBeNull();
      expect(page!.title).toBe("Fishing");
      expect(page!.content).toBe(samplePage.content);
      expect(page!.url).toBe(samplePage.url);
      expect(page!.categories).toEqual(["Activities", "Gameplay"]);
      expect(page!.last_modified).toBe("2024-01-15T10:30:00Z");
    });

    it("updates an existing page on conflict", () => {
      db.upsertPage(samplePage);

      const updated: PageData = {
        ...samplePage,
        content: "Updated fishing content.",
        categories: ["Activities", "Updated"],
      };
      db.upsertPage(updated);

      expect(db.getPageCount()).toBe(1);
      const page = db.getPage("Fishing");
      expect(page!.content).toBe("Updated fishing content.");
      expect(page!.categories).toEqual(["Activities", "Updated"]);
    });
  });

  describe("upsertPages (batch)", () => {
    it("inserts multiple pages in a transaction", () => {
      db.upsertPages([samplePage, samplePage2, samplePage3]);
      expect(db.getPageCount()).toBe(3);
    });

    it("all pages are retrievable after batch insert", () => {
      db.upsertPages([samplePage, samplePage2]);
      expect(db.getPage("Fishing")).not.toBeNull();
      expect(db.getPage("Cooking")).not.toBeNull();
    });
  });

  describe("getPage", () => {
    it("returns null for non-existent page", () => {
      expect(db.getPage("Nonexistent")).toBeNull();
    });

    it("is case-insensitive", () => {
      db.upsertPage(samplePage);
      expect(db.getPage("fishing")).not.toBeNull();
      expect(db.getPage("FISHING")).not.toBeNull();
    });

    it("parses categories from JSON", () => {
      db.upsertPage(samplePage);
      const page = db.getPage("Fishing");
      expect(Array.isArray(page!.categories)).toBe(true);
      expect(page!.categories).toContain("Activities");
    });
  });

  describe("getAllTitles", () => {
    it("returns all titles sorted alphabetically", () => {
      db.upsertPages([samplePage, samplePage2, samplePage3]);
      const titles = db.getAllTitles();
      expect(titles).toEqual(["Cooking", "Fishing", "Fishing Rod"]);
    });
  });

  describe("getPageScrapedAt", () => {
    it("returns null for non-existent page", () => {
      expect(db.getPageScrapedAt("Missing")).toBeNull();
    });

    it("returns a timestamp string for existing page", () => {
      db.upsertPage(samplePage);
      const scrapedAt = db.getPageScrapedAt("Fishing");
      expect(scrapedAt).not.toBeNull();
      expect(typeof scrapedAt).toBe("string");
    });
  });

  describe("searchPages", () => {
    beforeEach(() => {
      db.upsertPages([samplePage, samplePage2, samplePage3]);
    });

    it("finds pages matching a keyword", () => {
      const results = db.searchPages("fishing");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.title === "Fishing")).toBe(true);
    });

    it("returns results with required fields", () => {
      const results = db.searchPages("fishing");
      const first = results[0];
      expect(first).toHaveProperty("title");
      expect(first).toHaveProperty("snippet");
      expect(first).toHaveProperty("url");
      expect(first).toHaveProperty("relevance_score");
    });

    it("respects the limit parameter", () => {
      const results = db.searchPages("activity", 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it("returns empty array for no matches", () => {
      const results = db.searchPages("xyznonexistent");
      expect(results).toEqual([]);
    });

    it("returns empty array for empty query", () => {
      const results = db.searchPages("");
      expect(results).toEqual([]);
    });

    it("returns empty array for query with only special characters", () => {
      const results = db.searchPages("@#$%^&*");
      expect(results).toEqual([]);
    });

    it("handles queries with special characters gracefully", () => {
      const results = db.searchPages('fish "rod');
      expect(results.length).toBeGreaterThan(0);
    });

    it("finds pages by content keywords", () => {
      const results = db.searchPages("ingredients");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.title === "Cooking")).toBe(true);
    });

    it("ranks title matches highly", () => {
      const results = db.searchPages("fishing");
      // "Fishing" (exact title match) should appear before "Fishing Rod"
      const fishingIdx = results.findIndex((r) => r.title === "Fishing");
      const rodIdx = results.findIndex((r) => r.title === "Fishing Rod");
      if (fishingIdx !== -1 && rodIdx !== -1) {
        expect(fishingIdx).toBeLessThan(rodIdx);
      }
    });
  });

  describe("FTS sync on update", () => {
    it("search reflects updated content", () => {
      db.upsertPage(samplePage);

      // Initially should match "activity"
      let results = db.searchPages("activity");
      expect(results.some((r) => r.title === "Fishing")).toBe(true);

      // Update the page with different content
      db.upsertPage({
        ...samplePage,
        content: "Fishing is a hobby where you relax by the water.",
      });

      // Now should match "hobby" and "relax"
      results = db.searchPages("hobby");
      expect(results.some((r) => r.title === "Fishing")).toBe(true);

      results = db.searchPages("relax");
      expect(results.some((r) => r.title === "Fishing")).toBe(true);
    });
  });

  describe("categories", () => {
    beforeEach(() => {
      db.upsertPages([samplePage, samplePage2, samplePage3]);
      db.refreshCategories();
    });

    it("refreshCategories populates categories table", () => {
      const cats = db.getCategories();
      expect(cats.length).toBeGreaterThan(0);
    });

    it("counts pages per category correctly", () => {
      const cats = db.getCategories();
      const activities = cats.find((c) => c.name === "Activities");
      expect(activities).toBeDefined();
      expect(activities!.page_count).toBe(2); // Fishing + Cooking
    });

    it("includes all categories across pages", () => {
      const cats = db.getCategories();
      const names = cats.map((c) => c.name);
      expect(names).toContain("Activities");
      expect(names).toContain("Gameplay");
      expect(names).toContain("Food");
      expect(names).toContain("Items");
      expect(names).toContain("Tools");
    });

    it("returns categories sorted by name", () => {
      const cats = db.getCategories();
      const names = cats.map((c) => c.name);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });

    it("refreshCategories replaces old data", () => {
      // Refresh again — should not duplicate
      db.refreshCategories();
      const cats = db.getCategories();
      const activities = cats.filter((c) => c.name === "Activities");
      expect(activities.length).toBe(1);
    });
  });

  describe("getPagesByCategory", () => {
    beforeEach(() => {
      db.upsertPages([samplePage, samplePage2, samplePage3]);
    });

    it("returns pages in a given category", () => {
      const pages = db.getPagesByCategory("Activities");
      expect(pages).toContain("Fishing");
      expect(pages).toContain("Cooking");
      expect(pages).not.toContain("Fishing Rod");
    });

    it("returns pages sorted alphabetically", () => {
      const pages = db.getPagesByCategory("Activities");
      const sorted = [...pages].sort();
      expect(pages).toEqual(sorted);
    });

    it("returns empty array for non-existent category", () => {
      const pages = db.getPagesByCategory("Nonexistent");
      expect(pages).toEqual([]);
    });

    it("returns correct pages for single-page category", () => {
      const pages = db.getPagesByCategory("Tools");
      expect(pages).toEqual(["Fishing Rod"]);
    });
  });

  describe("edge cases", () => {
    it("handles page with empty categories array", () => {
      db.upsertPage({
        ...samplePage,
        categories: [],
      });
      const page = db.getPage("Fishing");
      expect(page!.categories).toEqual([]);
    });

    it("handles page with null last_modified", () => {
      db.upsertPage({
        ...samplePage,
        last_modified: null,
      });
      const page = db.getPage("Fishing");
      expect(page!.last_modified).toBeNull();
    });

    it("handles page with very long content", () => {
      const longContent = "word ".repeat(10000);
      db.upsertPage({ ...samplePage, content: longContent });
      const page = db.getPage("Fishing");
      expect(page!.content).toBe(longContent);
    });

    it("handles special characters in page title", () => {
      db.upsertPage({
        ...samplePage,
        title: "Sasquatch's Guide: Tips & Tricks (2024)",
      });
      const page = db.getPage("Sasquatch's Guide: Tips & Tricks (2024)");
      expect(page).not.toBeNull();
    });
  });
});
