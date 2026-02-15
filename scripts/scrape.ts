/**
 * scrape.ts
 *
 * Standalone script to scrape the Sneaky Sasquatch wiki and populate the database.
 * Usage: npm run scrape
 *        npm run scrape -- --incremental
 */

import { scrapeWiki } from "../src/scraper.js";
import { WikiDatabase } from "../src/database.js";

async function main() {
  const args = process.argv.slice(2);
  const incremental = args.includes("--incremental") || args.includes("-i");

  console.log("=".repeat(60));
  console.log("  Sneaky Sasquatch Wiki Scraper");
  console.log("=".repeat(60));
  console.log();

  if (incremental) {
    console.log("Mode: INCREMENTAL (only new pages)");
  } else {
    console.log("Mode: FULL SCRAPE (all pages)");
  }
  console.log();

  const db = new WikiDatabase();

  const existingCount = db.getPageCount();
  if (existingCount > 0) {
    console.log(`Existing database has ${existingCount} pages.`);
    console.log();
  }

  const startTime = Date.now();

  try {
    await scrapeWiki({
      incremental,
      db,
      log: console.log,
    });
  } catch (error) {
    console.error("\nScraping failed:", error);
    process.exit(1);
  } finally {
    db.close();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${elapsed} seconds.`);
}

main();
