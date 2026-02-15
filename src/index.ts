/**
 * index.ts
 *
 * MCP server entry point for the Sneaky Sasquatch Wiki.
 * Exposes 4 tools: search_wiki, get_wiki_page, list_wiki_categories, get_category_pages
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { WikiDatabase } from "./database.js";

// Initialize the database (auto-creates schema on first run)
const db = new WikiDatabase();

const server = new McpServer({
  name: "sneaky-sasquatch-wiki",
  version: "1.0.0",
});

// --- Tool 1: search_wiki ---
server.tool(
  "search_wiki",
  "Search the Sneaky Sasquatch wiki for articles matching a query. Use this for general questions about the game.",
  {
    query: z
      .string()
      .describe(
        'The search query (e.g., "how to make money", "fishing rod location")'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("Number of results to return (default: 5, max: 10)"),
  },
  async ({ query, limit }) => {
    try {
      const results = db.searchPages(query, limit);

      if (results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No results found for "${query}". Try different search terms or browse categories with list_wiki_categories.`,
            },
          ],
        };
      }

      const formatted = results.map((r, i) => ({
        rank: i + 1,
        title: r.title,
        snippet: r.snippet,
        url: r.url,
        relevance_score: r.relevance_score,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(formatted, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Search error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Tool 2: get_wiki_page ---
server.tool(
  "get_wiki_page",
  "Fetch the full content of a specific Sneaky Sasquatch wiki page by title. Use this when you know the exact page name.",
  {
    title: z
      .string()
      .describe(
        'The exact page title (e.g., "Fishing", "Making money", "Storyline")'
      ),
  },
  async ({ title }) => {
    try {
      const page = db.getPage(title);

      if (!page) {
        // Try a search to suggest alternatives
        const suggestions = db.searchPages(title, 3);
        const suggestionText =
          suggestions.length > 0
            ? `\n\nDid you mean one of these?\n${suggestions.map((s) => `  - ${s.title}`).join("\n")}`
            : "";

        return {
          content: [
            {
              type: "text" as const,
              text: `Page not found: "${title}".${suggestionText}`,
            },
          ],
        };
      }

      const result = {
        title: page.title,
        url: page.url,
        categories: page.categories,
        last_modified: page.last_modified,
        content: page.content,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching page: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Tool 3: list_wiki_categories ---
server.tool(
  "list_wiki_categories",
  "List all categories in the Sneaky Sasquatch wiki, useful for browsing what topics are covered.",
  {},
  async () => {
    try {
      const categories = db.getCategories();

      if (categories.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No categories found. The wiki database may need to be scraped first (run: npm run scrape).",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(categories, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error listing categories: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Tool 4: get_category_pages ---
server.tool(
  "get_category_pages",
  "List all pages within a specific Sneaky Sasquatch wiki category.",
  {
    category: z
      .string()
      .describe(
        'Category name (e.g., "Food", "Characters", "Locations")'
      ),
  },
  async ({ category }) => {
    try {
      const pages = db.getPagesByCategory(category);

      if (pages.length === 0) {
        // Check if the category exists at all
        const allCats = db.getCategories();
        const suggestions = allCats
          .filter((c) =>
            c.name.toLowerCase().includes(category.toLowerCase())
          )
          .slice(0, 5);

        const suggestionText =
          suggestions.length > 0
            ? `\n\nSimilar categories:\n${suggestions.map((s) => `  - ${s.name} (${s.page_count} pages)`).join("\n")}`
            : "\n\nUse list_wiki_categories to see all available categories.";

        return {
          content: [
            {
              type: "text" as const,
              text: `No pages found in category "${category}".${suggestionText}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { category, page_count: pages.length, pages },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error fetching category pages: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Start the server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error starting MCP server:", error);
  process.exit(1);
});
