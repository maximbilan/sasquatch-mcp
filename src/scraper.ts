/**
 * scraper.ts
 *
 * Scrapes the Sneaky Sasquatch Fandom wiki using the MediaWiki API.
 * Handles pagination, rate limiting, and incremental updates.
 */

import { parseWikitext } from "./wiki-parser.js";
import { WikiDatabase } from "./database.js";
import type {
  AllPagesResponse,
  ParseResponse,
  RevisionsResponse,
  PageData,
} from "./types.js";

const BASE_URL = "https://sneaky-sasquatch.fandom.com/api.php";
const WIKI_BASE = "https://sneaky-sasquatch.fandom.com/wiki/";
const USER_AGENT =
  "SneakySasquatchMCP/1.0 (MCP Wiki Server; Node.js)";
const RATE_LIMIT_MS = 250; // 250ms between requests

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make a rate-limited request to the MediaWiki API.
 */
async function apiRequest<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(BASE_URL);
  url.searchParams.set("format", "json");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Encode a page title for use in a URL.
 */
function titleToUrl(title: string): string {
  return WIKI_BASE + encodeURIComponent(title.replace(/ /g, "_"));
}

/**
 * Fetch all page titles from the wiki using the allpages API with pagination.
 */
export async function fetchAllPageTitles(
  log: (msg: string) => void = console.log
): Promise<string[]> {
  const titles: string[] = [];
  let continueToken: string | undefined;

  log("Fetching all page titles...");

  do {
    const params: Record<string, string> = {
      action: "query",
      list: "allpages",
      aplimit: "500",
      apnamespace: "0", // main namespace only
    };

    if (continueToken) {
      params.apcontinue = continueToken;
    }

    const data = await apiRequest<AllPagesResponse>(params);

    if (data.query?.allpages) {
      for (const page of data.query.allpages) {
        titles.push(page.title);
      }
    }

    continueToken = data.continue?.apcontinue;

    log(`  Fetched ${titles.length} titles so far...`);
    await sleep(RATE_LIMIT_MS);
  } while (continueToken);

  log(`Found ${titles.length} total pages.`);
  return titles;
}

/**
 * Fetch the wikitext content and categories for a single page.
 */
export async function fetchPageContent(
  title: string
): Promise<{ wikitext: string; categories: string[] } | null> {
  try {
    const data = await apiRequest<ParseResponse>({
      action: "parse",
      page: title,
      prop: "wikitext|categories",
      redirects: "1",
    });

    if (data.error) {
      return null;
    }

    if (!data.parse?.wikitext) {
      return null;
    }

    const wikitext = data.parse.wikitext["*"];
    const categories = (data.parse.categories ?? [])
      .map((c) => c["*"].replace(/_/g, " "))
      .filter((c) => !c.startsWith("__")); // filter internal categories

    return { wikitext, categories };
  } catch {
    return null;
  }
}

/**
 * Fetch the last revision timestamp for a page.
 */
export async function fetchLastModified(
  title: string
): Promise<string | null> {
  try {
    const data = await apiRequest<RevisionsResponse>({
      action: "query",
      titles: title,
      prop: "revisions",
      rvprop: "timestamp",
      rvlimit: "1",
    });

    if (data.query?.pages) {
      const pages = Object.values(data.query.pages);
      if (pages[0]?.revisions?.[0]) {
        return pages[0].revisions[0].timestamp;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Options for the scraping process.
 */
export interface ScrapeOptions {
  /** Only scrape pages that haven't been scraped yet or were modified since last scrape */
  incremental?: boolean;
  /** Database instance to use (creates a new one if not provided) */
  db?: WikiDatabase;
  /** Logging function */
  log?: (msg: string) => void;
  /** Batch size for database writes */
  batchSize?: number;
}

/**
 * Run the full wiki scrape: fetch all pages, parse, and store in the database.
 */
export async function scrapeWiki(options: ScrapeOptions = {}): Promise<void> {
  const {
    incremental = false,
    log = console.log,
    batchSize = 25,
  } = options;

  const db = options.db ?? new WikiDatabase();
  const ownDb = !options.db; // track if we created it so we can close it

  try {
    // Step 1: Get all page titles
    const titles = await fetchAllPageTitles(log);

    // Step 2: If incremental, filter to only new/changed pages
    let pagesToScrape = titles;
    if (incremental) {
      const existingTitles = new Set(db.getAllTitles());
      const newPages = titles.filter((t) => !existingTitles.has(t));
      if (newPages.length === 0) {
        log("No new pages to scrape (incremental mode).");
        return;
      }
      pagesToScrape = newPages;
      log(
        `Incremental mode: ${newPages.length} new pages to scrape (${existingTitles.size} already in database).`
      );
    }

    // Step 3: Fetch and process each page
    const total = pagesToScrape.length;
    let processed = 0;
    let failed = 0;
    let batch: PageData[] = [];

    for (const title of pagesToScrape) {
      processed++;

      // Fetch page content
      const content = await fetchPageContent(title);
      await sleep(RATE_LIMIT_MS);

      if (!content) {
        failed++;
        log(`  [${processed}/${total}] FAILED: ${title}`);
        continue;
      }

      // Parse wikitext to plain text
      const plainText = parseWikitext(content.wikitext);

      // Skip pages with very little content (likely redirects or stubs)
      if (plainText.length < 20) {
        log(`  [${processed}/${total}] SKIPPED (stub): ${title}`);
        continue;
      }

      // Fetch last modified timestamp
      const lastModified = await fetchLastModified(title);
      await sleep(RATE_LIMIT_MS);

      const pageData: PageData = {
        title,
        content: plainText,
        url: titleToUrl(title),
        categories: content.categories,
        last_modified: lastModified,
      };

      batch.push(pageData);

      // Write batch to database
      if (batch.length >= batchSize) {
        db.upsertPages(batch);
        batch = [];
      }

      if (processed % 50 === 0 || processed === total) {
        log(
          `  [${processed}/${total}] Scraped: ${title} (${failed} failures)`
        );
      }
    }

    // Write any remaining pages
    if (batch.length > 0) {
      db.upsertPages(batch);
    }

    // Step 4: Refresh category counts
    log("Refreshing category index...");
    db.refreshCategories();

    log(
      `\nScraping complete! ${processed - failed}/${total} pages stored. ${failed} failures.`
    );
    log(`Total pages in database: ${db.getPageCount()}`);
  } finally {
    if (ownDb) {
      db.close();
    }
  }
}
