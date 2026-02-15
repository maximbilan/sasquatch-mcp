import { describe, it, expect } from "vitest";
import { parseWikitext } from "../wiki-parser.js";

describe("parseWikitext", () => {
  describe("wikilinks", () => {
    it("converts piped wikilinks to display text", () => {
      expect(parseWikitext("[[Fishing Rod|rod]]")).toBe("rod");
    });

    it("converts simple wikilinks to plain text", () => {
      expect(parseWikitext("[[Fishing]]")).toBe("Fishing");
    });

    it("handles multiple wikilinks in one line", () => {
      expect(parseWikitext("Use [[Fishing Rod|rod]] at [[Lake]]")).toBe(
        "Use rod at Lake"
      );
    });
  });

  describe("external links", () => {
    it("converts external links with text to just the text", () => {
      expect(parseWikitext("[https://example.com Example Site]")).toBe(
        "Example Site"
      );
    });

    it("converts bare external links to URL without brackets", () => {
      expect(parseWikitext("[https://example.com/page]")).toBe(
        "example.com/page"
      );
    });
  });

  describe("section headers", () => {
    it("converts h2 headers to plain text", () => {
      const result = parseWikitext("== Getting Started ==");
      expect(result).toBe("Getting Started");
    });

    it("converts h3 headers to plain text", () => {
      const result = parseWikitext("=== Tips and Tricks ===");
      expect(result).toBe("Tips and Tricks");
    });

    it("converts h4 headers to plain text", () => {
      const result = parseWikitext("==== Substep ====");
      expect(result).toBe("Substep");
    });
  });

  describe("bold and italic markup", () => {
    it("strips bold markup", () => {
      expect(parseWikitext("'''bold text'''")).toBe("bold text");
    });

    it("strips italic markup", () => {
      expect(parseWikitext("''italic text''")).toBe("italic text");
    });

    it("strips bold+italic markup", () => {
      expect(parseWikitext("'''''bold italic'''''")).toBe("bold italic");
    });
  });

  describe("file and image references", () => {
    it("removes [[File:...]] references", () => {
      expect(parseWikitext("[[File:Screenshot.png|thumb|A screenshot]]")).toBe(
        ""
      );
    });

    it("removes [[Image:...]] references", () => {
      expect(parseWikitext("[[Image:Map.jpg]]")).toBe("");
    });

    it("preserves surrounding text when removing files", () => {
      expect(
        parseWikitext("Before [[File:Pic.png|200px]] after")
      ).toBe("Before after");
    });
  });

  describe("category references", () => {
    it("removes [[Category:...]] references", () => {
      expect(parseWikitext("[[Category:Food]]")).toBe("");
    });

    it("removes multiple category references", () => {
      expect(
        parseWikitext("[[Category:Food]]\n[[Category:Items]]")
      ).toBe("");
    });
  });

  describe("templates", () => {
    it("removes simple templates", () => {
      expect(parseWikitext("{{stub}}")).toBe("");
    });

    it("handles nested templates", () => {
      expect(parseWikitext("{{outer|{{inner}}}}")).toBe("");
    });

    it("extracts quote template text", () => {
      expect(parseWikitext("{{quote|Hello world}}")).toBe('"Hello world"');
    });

    it("extracts main/see also templates", () => {
      expect(parseWikitext("{{main|Fishing}}")).toBe("(See: Fishing)");
    });

    it("extracts color template text", () => {
      expect(parseWikitext("{{color|red|important text}}")).toBe(
        "important text"
      );
    });

    it("extracts nihongo template text", () => {
      expect(parseWikitext("{{nihongo|Sasquatch}}")).toBe("Sasquatch");
    });

    it("extracts infobox key-value pairs", () => {
      const result = parseWikitext(
        "{{Infobox character|name = Sasquatch|type = Player}}"
      );
      expect(result).toContain("name: Sasquatch");
      expect(result).toContain("type: Player");
    });

    it("skips infobox image/style parameters", () => {
      const result = parseWikitext(
        "{{Infobox item|name = Apple|image = apple.png|caption = An apple}}"
      );
      expect(result).toContain("name: Apple");
      expect(result).not.toContain("image");
      expect(result).not.toContain("caption");
    });
  });

  describe("HTML handling", () => {
    it("converts <br> tags to newlines", () => {
      const result = parseWikitext("Line one<br/>Line two");
      expect(result).toContain("Line one\nLine two");
    });

    it("converts <br /> tags to newlines", () => {
      const result = parseWikitext("A<br />B");
      expect(result).toContain("A\nB");
    });

    it("strips other HTML tags", () => {
      expect(parseWikitext("<div>content</div>")).toBe("content");
    });

    it("strips span tags with attributes", () => {
      expect(
        parseWikitext('<span style="color:red">warning</span>')
      ).toBe("warning");
    });

    it("removes HTML comments", () => {
      expect(parseWikitext("visible <!-- hidden --> text")).toBe(
        "visible text"
      );
    });

    it("removes multiline HTML comments", () => {
      expect(
        parseWikitext("before\n<!-- multi\nline\ncomment -->\nafter")
      ).toBe("before\n\nafter");
    });
  });

  describe("HTML entities", () => {
    it("decodes &amp;", () => {
      expect(parseWikitext("Tom &amp; Jerry")).toBe("Tom & Jerry");
    });

    it("decodes &lt; and &gt;", () => {
      expect(parseWikitext("&lt;tag&gt;")).toBe("<tag>");
    });

    it("decodes &nbsp;", () => {
      expect(parseWikitext("word&nbsp;word")).toBe("word word");
    });

    it("decodes numeric entities", () => {
      expect(parseWikitext("&#65;&#66;&#67;")).toBe("ABC");
    });

    it("decodes hex entities", () => {
      expect(parseWikitext("&#x41;&#x42;&#x43;")).toBe("ABC");
    });

    it("decodes &ndash; and &mdash;", () => {
      expect(parseWikitext("a&ndash;b&mdash;c")).toBe("a–b—c");
    });
  });

  describe("lists", () => {
    it("converts bullet lists", () => {
      const result = parseWikitext("* Item one\n* Item two");
      expect(result).toBe("- Item one\n- Item two");
    });

    it("converts nested bullet lists", () => {
      const result = parseWikitext("* Item\n** Sub-item");
      expect(result).toBe("- Item\n- Sub-item");
    });

    it("converts numbered lists", () => {
      const result = parseWikitext("# First\n# Second");
      expect(result).toBe("- First\n- Second");
    });

    it("converts definition lists (indentation)", () => {
      const result = parseWikitext(": Indented text");
      expect(result).toBe("Indented text");
    });
  });

  describe("tables", () => {
    it("extracts table content as plain text", () => {
      const wikiTable = `{| class="wikitable"
|-
! Header1
! Header2
|-
| Cell1
| Cell2
|}`;
      const result = parseWikitext(wikiTable);
      expect(result).toContain("Header1");
      expect(result).toContain("Header2");
      expect(result).toContain("Cell1");
      expect(result).toContain("Cell2");
    });

    it("handles table cell separators (||)", () => {
      const result = parseWikitext("| Apple || 5 || Common");
      expect(result).toContain("Apple");
      expect(result).toContain("5");
      expect(result).toContain("Common");
    });

    it("extracts table captions", () => {
      const result = parseWikitext("|+ My Table Caption");
      expect(result).toContain("My Table Caption");
    });
  });

  describe("magic words and special markup", () => {
    it("removes __TOC__", () => {
      expect(parseWikitext("__TOC__")).toBe("");
    });

    it("removes __NOTOC__", () => {
      expect(parseWikitext("__NOTOC__")).toBe("");
    });

    it("removes __FORCETOC__", () => {
      expect(parseWikitext("__FORCETOC__")).toBe("");
    });

    it("removes {{DISPLAYTITLE:...}}", () => {
      expect(parseWikitext("{{DISPLAYTITLE:Custom Title}}")).toBe("");
    });

    it("removes horizontal rules", () => {
      expect(parseWikitext("above\n----\nbelow")).toBe("above\n\nbelow");
    });
  });

  describe("noinclude / includeonly", () => {
    it("removes <noinclude> blocks entirely", () => {
      expect(
        parseWikitext("Keep <noinclude>Remove this</noinclude> this")
      ).toBe("Keep this");
    });

    it("keeps content inside <includeonly> tags", () => {
      expect(
        parseWikitext("A <includeonly>B</includeonly> C")
      ).toBe("A B C");
    });
  });

  describe("whitespace handling", () => {
    it("collapses multiple spaces into one", () => {
      expect(parseWikitext("too    many    spaces")).toBe("too many spaces");
    });

    it("collapses 3+ newlines into 2", () => {
      const result = parseWikitext("para one\n\n\n\n\npara two");
      expect(result).toBe("para one\n\npara two");
    });

    it("trims leading and trailing whitespace", () => {
      expect(parseWikitext("  \n  hello  \n  ")).toBe("hello");
    });
  });

  describe("complex real-world-like input", () => {
    it("handles a page with mixed markup", () => {
      const input = `== Overview ==
'''Fishing''' is an [[Activities|activity]] in ''[[Sneaky Sasquatch]]''.

Players can catch [[Fish]] using a [[Fishing Rod|rod]].

{{main|Fish}}

=== Locations ===
* [[Lake]]
* [[River]]
* [[Ocean]]

[[Category:Activities]]
[[File:Fishing.png|thumb|250px]]`;

      const result = parseWikitext(input);

      expect(result).toContain("Overview");
      expect(result).toContain("Fishing is an activity in Sneaky Sasquatch");
      expect(result).toContain("Players can catch Fish using a rod");
      expect(result).toContain("(See: Fish)");
      expect(result).toContain("Locations");
      expect(result).toContain("- Lake");
      expect(result).toContain("- River");
      expect(result).toContain("- Ocean");
      expect(result).not.toContain("[[");
      expect(result).not.toContain("]]");
      expect(result).not.toContain("'''");
      expect(result).not.toContain("''");
      expect(result).not.toContain("Category:");
      expect(result).not.toContain("File:");
    });

    it("returns empty string for empty input", () => {
      expect(parseWikitext("")).toBe("");
    });

    it("handles input with only whitespace", () => {
      expect(parseWikitext("   \n\n   ")).toBe("");
    });
  });
});
