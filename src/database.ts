/**
 * database.ts
 *
 * SQLite database with FTS5 full-text search for the wiki pages.
 */

import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  WikiPage,
  WikiPageRow,
  SearchResult,
  WikiCategory,
  PageData,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, "..", "..", "data", "wiki.db");

export class WikiDatabase {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? DEFAULT_DB_PATH;
    this.db = new Database(resolvedPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.initialize();
  }

  /**
   * Create tables and FTS5 virtual table if they don't exist.
   */
  private initialize(): void {
    this.db.exec(`
      -- Main pages table
      CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT UNIQUE NOT NULL,
        content TEXT NOT NULL,
        url TEXT NOT NULL,
        categories TEXT DEFAULT '[]',
        last_modified TEXT,
        scraped_at TEXT DEFAULT (datetime('now'))
      );

      -- Categories table
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        page_count INTEGER DEFAULT 0
      );
    `);

    // Create FTS5 virtual table if it doesn't exist
    // We check by trying to query it; if it fails, we create it
    try {
      this.db.prepare("SELECT * FROM pages_fts LIMIT 0").run();
    } catch {
      this.db.exec(`
        -- Full-text search virtual table
        CREATE VIRTUAL TABLE pages_fts USING fts5(
          title,
          content,
          content=pages,
          content_rowid=id
        );

        -- Keep FTS in sync with triggers
        CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
          INSERT INTO pages_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
          INSERT INTO pages_fts(pages_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
        END;

        CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
          INSERT INTO pages_fts(pages_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
          INSERT INTO pages_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
        END;
      `);

      // Populate FTS from any existing pages data
      this.db.exec(`
        INSERT INTO pages_fts(rowid, title, content)
        SELECT id, title, content FROM pages;
      `);
    }
  }

  /**
   * Insert or update a wiki page.
   */
  upsertPage(page: PageData): void {
    const stmt = this.db.prepare(`
      INSERT INTO pages (title, content, url, categories, last_modified, scraped_at)
      VALUES (@title, @content, @url, @categories, @last_modified, datetime('now'))
      ON CONFLICT(title) DO UPDATE SET
        content = @content,
        url = @url,
        categories = @categories,
        last_modified = @last_modified,
        scraped_at = datetime('now')
    `);

    stmt.run({
      title: page.title,
      content: page.content,
      url: page.url,
      categories: JSON.stringify(page.categories),
      last_modified: page.last_modified,
    });
  }

  /**
   * Batch insert/update multiple pages within a transaction.
   */
  upsertPages(pages: PageData[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO pages (title, content, url, categories, last_modified, scraped_at)
      VALUES (@title, @content, @url, @categories, @last_modified, datetime('now'))
      ON CONFLICT(title) DO UPDATE SET
        content = @content,
        url = @url,
        categories = @categories,
        last_modified = @last_modified,
        scraped_at = datetime('now')
    `);

    const transaction = this.db.transaction((pages: PageData[]) => {
      for (const page of pages) {
        stmt.run({
          title: page.title,
          content: page.content,
          url: page.url,
          categories: JSON.stringify(page.categories),
          last_modified: page.last_modified,
        });
      }
    });

    transaction(pages);
  }

  /**
   * Search wiki pages using FTS5 full-text search.
   * Boosts title matches by searching title and content separately.
   */
  searchPages(query: string, limit: number = 5): SearchResult[] {
    // Sanitize the query for FTS5
    const ftsQuery = sanitizeFtsQuery(query);

    if (!ftsQuery) {
      return [];
    }

    const stmt = this.db.prepare(`
      SELECT
        p.title,
        snippet(pages_fts, 1, '**', '**', '...', 50) as snippet,
        p.url,
        (rank * -1) as relevance_score
      FROM pages_fts
      JOIN pages p ON p.id = pages_fts.rowid
      WHERE pages_fts MATCH @query
      ORDER BY rank
      LIMIT @limit
    `);

    const rows = stmt.all({ query: ftsQuery, limit }) as Array<{
      title: string;
      snippet: string;
      url: string;
      relevance_score: number;
    }>;

    return rows.map((row) => ({
      title: row.title,
      snippet: row.snippet,
      url: row.url,
      relevance_score: Math.round(row.relevance_score * 1000) / 1000,
    }));
  }

  /**
   * Get a specific wiki page by its exact title.
   */
  getPage(title: string): WikiPage | null {
    const stmt = this.db.prepare(`
      SELECT * FROM pages WHERE title = ? COLLATE NOCASE
    `);

    const row = stmt.get(title) as WikiPageRow | undefined;
    if (!row) return null;

    return {
      ...row,
      categories: JSON.parse(row.categories || "[]"),
    };
  }

  /**
   * Get all distinct categories with page counts.
   */
  getCategories(): WikiCategory[] {
    const stmt = this.db.prepare(`
      SELECT name, page_count FROM categories
      WHERE page_count > 0
      ORDER BY name
    `);

    return stmt.all() as WikiCategory[];
  }

  /**
   * Update the categories table from the pages data.
   */
  refreshCategories(): void {
    this.db.exec(`DELETE FROM categories`);

    // Extract categories from pages JSON and aggregate counts
    const pages = this.db
      .prepare(`SELECT categories FROM pages`)
      .all() as Array<{ categories: string }>;

    const counts = new Map<string, number>();
    for (const page of pages) {
      try {
        const cats: string[] = JSON.parse(page.categories || "[]");
        for (const cat of cats) {
          counts.set(cat, (counts.get(cat) || 0) + 1);
        }
      } catch {
        // skip malformed JSON
      }
    }

    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO categories (name, page_count) VALUES (?, ?)`
    );

    const transaction = this.db.transaction(() => {
      for (const [name, count] of counts) {
        insert.run(name, count);
      }
    });

    transaction();
  }

  /**
   * Get all page titles in a specific category.
   */
  getPagesByCategory(category: string): string[] {
    // Search for pages where the categories JSON array contains the category
    const stmt = this.db.prepare(`
      SELECT title FROM pages
      WHERE categories LIKE @pattern
      ORDER BY title
    `);

    // Use JSON-aware matching
    const rows = stmt.all({
      pattern: `%"${category.replace(/["%_\\]/g, "")}"%`,
    }) as Array<{ title: string }>;

    return rows.map((r) => r.title);
  }

  /**
   * Get the scraped_at timestamp for a page, used for incremental updates.
   */
  getPageScrapedAt(title: string): string | null {
    const stmt = this.db.prepare(
      `SELECT scraped_at FROM pages WHERE title = ?`
    );
    const row = stmt.get(title) as { scraped_at: string } | undefined;
    return row?.scraped_at ?? null;
  }

  /**
   * Get total count of pages in the database.
   */
  getPageCount(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM pages`)
      .get() as { count: number };
    return row.count;
  }

  /**
   * Get all page titles in the database.
   */
  getAllTitles(): string[] {
    const rows = this.db
      .prepare(`SELECT title FROM pages ORDER BY title`)
      .all() as Array<{ title: string }>;
    return rows.map((r) => r.title);
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Sanitize a user query string for FTS5 MATCH syntax.
 * Wraps each word in quotes to avoid syntax errors from special characters.
 */
function sanitizeFtsQuery(query: string): string {
  // Split on whitespace and remove empty tokens
  const tokens = query
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return "";

  // Use implicit AND by quoting each token
  // Boost title matches by weighting: {title content} with title getting 10x weight
  const quoted = tokens.map((t) => `"${t}"`).join(" ");

  // FTS5 column weighting: title matches are boosted
  return `{title content} : ${quoted}`;
}
