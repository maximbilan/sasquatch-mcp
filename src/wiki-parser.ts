/**
 * wiki-parser.ts
 *
 * Converts raw MediaWiki markup into clean, readable plain text.
 */

/**
 * Parse raw MediaWiki wikitext into clean plain text.
 */
export function parseWikitext(raw: string): string {
  let text = raw;

  // Remove <noinclude>...</noinclude> blocks
  text = text.replace(/<noinclude[\s\S]*?<\/noinclude>/gi, "");

  // Remove <includeonly>...</includeonly> tags but keep content
  text = text.replace(/<\/?includeonly>/gi, "");

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Remove __TOC__, __NOTOC__, __FORCETOC__
  text = text.replace(/__(?:TOC|NOTOC|FORCETOC)__/g, "");

  // Remove {{DISPLAYTITLE:...}}
  text = text.replace(/\{\{DISPLAYTITLE:[^}]*\}\}/gi, "");

  // Remove file/image references: [[File:...]] or [[Image:...]]
  text = text.replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, "");

  // Remove category references: [[Category:...]]
  text = text.replace(/\[\[Category:[^\]]*\]\]/gi, "");

  // Handle templates - remove most, extract useful ones
  text = processTemplates(text);

  // Handle tables - convert to simple text
  text = processTables(text);

  // Convert wikilinks: [[link|display]] → display, [[link]] → link
  text = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  text = text.replace(/\[\[([^\]]+)\]\]/g, "$1");

  // Convert external links: [url text] → text, [url] → url
  text = text.replace(/\[https?:\/\/[^\s\]]+ ([^\]]+)\]/g, "$1");
  text = text.replace(/\[https?:\/\/([^\]]+)\]/g, "$1");

  // Convert section headers: == Title == → \nTitle\n
  text = text.replace(/^={1,6}\s*(.+?)\s*={1,6}\s*$/gm, "\n$1\n");

  // Convert bold/italic markup
  text = text.replace(/'{5}(.+?)'{5}/g, "$1"); // bold+italic
  text = text.replace(/'{3}(.+?)'{3}/g, "$1"); // bold
  text = text.replace(/'{2}(.+?)'{2}/g, "$1"); // italic

  // Remove remaining HTML tags
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?[^>]+>/g, "");

  // Convert bullet/numbered lists to plain text
  text = text.replace(/^\*+\s*/gm, "- ");
  text = text.replace(/^#+\s*/gm, "- ");
  text = text.replace(/^;+\s*/gm, "");
  text = text.replace(/^:+\s*/gm, "  ");

  // Remove horizontal rules
  text = text.replace(/^-{4,}\s*$/gm, "");

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  // Collapse excessive whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

/**
 * Process and remove/simplify MediaWiki templates.
 * Handles nested templates by iterating until no more are found.
 */
function processTemplates(text: string): string {
  // Iteratively remove templates, handling nesting from inside out
  let previous = "";
  let iterations = 0;
  const maxIterations = 50; // safety limit

  while (text !== previous && iterations < maxIterations) {
    previous = text;
    iterations++;

    // Match innermost templates (no nested {{ inside)
    text = text.replace(/\{\{([^{}]*)\}\}/g, (_, content: string) => {
      return extractTemplateText(content);
    });
  }

  return text;
}

/**
 * Extract useful text from a template's content, or discard it.
 */
function extractTemplateText(content: string): string {
  const parts = content.split("|");
  const templateName = parts[0].trim().toLowerCase();

  // Infobox templates - extract key-value pairs
  if (templateName.startsWith("infobox")) {
    return extractInfoboxText(parts.slice(1));
  }

  // Quote templates
  if (templateName === "quote" || templateName === "cquote") {
    return parts[1] ? `"${parts[1].trim()}"` : "";
  }

  // Color/style templates - keep the text content
  if (templateName === "color" && parts.length >= 3) {
    return parts[2].trim();
  }

  // Main/See also templates
  if (templateName === "main" || templateName === "see also") {
    return parts[1] ? `(See: ${parts[1].trim()})` : "";
  }

  // Nihongo template (Japanese text)
  if (templateName === "nihongo") {
    return parts[1] ? parts[1].trim() : "";
  }

  // For most other templates, just discard
  return "";
}

/**
 * Extract readable text from infobox template parameters.
 */
function extractInfoboxText(params: string[]): string {
  const lines: string[] = [];

  for (const param of params) {
    const match = param.match(/^\s*(\w[\w\s]*?)\s*=\s*(.+?)\s*$/s);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      // Skip image/icon/style parameters
      if (
        /^(image|icon|caption|imagewidth|imageheight|style|class|colspan|rowspan)$/i.test(
          key
        )
      ) {
        continue;
      }
      if (value) {
        lines.push(`${key}: ${value}`);
      }
    }
  }

  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

/**
 * Convert wiki tables to plain text.
 */
function processTables(text: string): string {
  // Replace table markup with simplified text
  // Remove table start/end
  text = text.replace(/^\{\|[^\n]*$/gm, "");
  text = text.replace(/^\|\}$/gm, "");

  // Table captions
  text = text.replace(/^\|\+\s*(.*)/gm, "$1");

  // Table row separators
  text = text.replace(/^\|-[^\n]*/gm, "");

  // Table header cells
  text = text.replace(/^!\s*(.*)/gm, "$1");

  // Table cells - handle || as cell separator
  text = text.replace(/^\|\s*(.*)/gm, (_, content: string) => {
    return content
      .split("||")
      .map((cell) => cell.trim())
      .filter(Boolean)
      .join(" | ");
  });

  return text;
}

/**
 * Decode common HTML entities.
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
    "&#39;": "'",
    "&nbsp;": " ",
    "&ndash;": "–",
    "&mdash;": "—",
    "&hellip;": "...",
    "&bull;": "•",
    "&trade;": "™",
    "&copy;": "©",
    "&reg;": "®",
  };

  for (const [entity, replacement] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, "gi"), replacement);
  }

  // Handle numeric entities &#123;
  text = text.replace(/&#(\d+);/g, (_, code: string) =>
    String.fromCharCode(parseInt(code, 10))
  );

  // Handle hex entities &#x1a;
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
    String.fromCharCode(parseInt(code, 16))
  );

  return text;
}
