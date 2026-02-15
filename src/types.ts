/** Represents a wiki page stored in the database */
export interface WikiPage {
  id: number;
  title: string;
  content: string;
  url: string;
  categories: string[]; // stored as JSON string in DB
  last_modified: string | null;
  scraped_at: string;
}

/** Represents a wiki page row as stored in SQLite (categories as JSON string) */
export interface WikiPageRow {
  id: number;
  title: string;
  content: string;
  url: string;
  categories: string; // JSON array string
  last_modified: string | null;
  scraped_at: string;
}

/** A search result returned by the FTS5 query */
export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  relevance_score: number;
}

/** A wiki category with its page count */
export interface WikiCategory {
  name: string;
  page_count: number;
}

/** Data structure for inserting/updating a page */
export interface PageData {
  title: string;
  content: string;
  url: string;
  categories: string[];
  last_modified: string | null;
}

/** Response from MediaWiki allpages API */
export interface AllPagesResponse {
  query?: {
    allpages: Array<{ pageid: number; ns: number; title: string }>;
  };
  continue?: {
    apcontinue: string;
    continue: string;
  };
}

/** Response from MediaWiki parse API */
export interface ParseResponse {
  parse?: {
    title: string;
    pageid: number;
    wikitext?: { "*": string };
    categories?: Array<{ "*": string; sortkey: string }>;
  };
  error?: {
    code: string;
    info: string;
  };
}

/** Response from MediaWiki allcategories API */
export interface AllCategoriesResponse {
  query?: {
    allcategories: Array<{ "*": string }>;
  };
  continue?: {
    accontinue: string;
    continue: string;
  };
}

/** Response from MediaWiki page revisions API (for last_modified) */
export interface RevisionsResponse {
  query?: {
    pages: Record<
      string,
      {
        pageid: number;
        title: string;
        revisions?: Array<{ timestamp: string }>;
      }
    >;
  };
}
