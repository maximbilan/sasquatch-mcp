# Sneaky Sasquatch Wiki MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that gives Claude access to the full [Sneaky Sasquatch game wiki](https://sneaky-sasquatch.fandom.com). It scrapes, indexes, and exposes ~986 wiki articles as searchable tools so you can ask natural-language questions about the game and get precise, sourced answers.

## Prerequisites

- **Node.js 18+**
- **npm**

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Build the TypeScript project
npm run build

# 3. Scrape the wiki (takes ~5-10 minutes on first run)
npm run scrape

# 4. (Optional) Run an incremental update later
npm run scrape -- --incremental
```

## Claude Desktop Integration

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sneaky-sasquatch-wiki": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/sneaky-sasquatch-mcp/dist/src/index.js"]
    }
  }
}
```

Replace both paths with actual absolute paths on your system. You can find your `node` binary with `which node` (e.g. `/opt/homebrew/bin/node` on macOS with Homebrew).

**Important:** Use the full absolute path to `node`, not just `"node"`. Claude Desktop does not inherit your shell's `PATH`, so a bare `node` command will fail to resolve.

Then restart Claude Desktop. The wiki tools will be available automatically.

## Claude Code Integration

```bash
claude mcp add sneaky-sasquatch-wiki node /absolute/path/to/sneaky-sasquatch-mcp/dist/src/index.js
```

## Tools

### `search_wiki`

Search the wiki for articles matching a query.

| Parameter | Type   | Required | Default | Description                |
|-----------|--------|----------|---------|----------------------------|
| `query`   | string | yes      | -       | The search query           |
| `limit`   | number | no       | 5       | Number of results (max 10) |

**Example queries:**
- "how to make money"
- "fishing rod location"
- "bear in the campground"
- "racing tips"

### `get_wiki_page`

Fetch the full content of a specific wiki page by its exact title.

| Parameter | Type   | Required | Description         |
|-----------|--------|----------|---------------------|
| `title`   | string | yes      | Exact page title    |

**Examples:** "Fishing", "Storyline", "Sasquatch"

### `list_wiki_categories`

List all categories in the wiki with page counts. No parameters.

### `get_category_pages`

List all page titles within a specific category.

| Parameter  | Type   | Required | Description    |
|------------|--------|----------|----------------|
| `category` | string | yes      | Category name  |

**Examples:** "Food", "Characters", "Locations"

## Architecture

```
src/
├── index.ts          # MCP server entry point, tool definitions
├── scraper.ts        # Fandom wiki scraper using MediaWiki API
├── database.ts       # SQLite + FTS5 indexing and search logic
├── wiki-parser.ts    # Parse MediaWiki markup to clean plain text
└── types.ts          # Shared TypeScript types/interfaces
scripts/
└── scrape.ts         # Standalone script to run the scraper
data/
└── wiki.db           # SQLite database (gitignored, auto-generated)
```

## Updating the Database

To re-scrape all pages:

```bash
npm run scrape
```

To only fetch new pages that aren't in the database yet:

```bash
npm run scrape -- --incremental
```

## How It Works

1. The **scraper** uses the [Fandom MediaWiki API](https://sneaky-sasquatch.fandom.com/api.php) to list all pages and fetch their raw wikitext content.
2. The **wiki parser** converts MediaWiki markup into clean, readable plain text (stripping templates, links, HTML, etc.).
3. Pages are stored in a **SQLite database** with an **FTS5 full-text search** index for fast, relevance-ranked searching.
4. The **MCP server** exposes 4 tools over stdio that Claude can call to search, browse, and read wiki content.

## License

MIT
