import { describe, it, expect, vi } from "vitest";

// The unit env has no DOM, so DOMPurify is a passthrough here, as in
// rtl-direction.test.ts. What survives the real sanitizer is checked by
// rendering in the app.
vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

const { render } = await import("../../src/lib/renderer/pipeline");

describe("GitHub-style callouts", () => {
  it.each([
    ["NOTE", "note", "Note"],
    ["TIP", "tip", "Tip"],
    ["IMPORTANT", "important", "Important"],
    ["WARNING", "warning", "Warning"],
    ["CAUTION", "caution", "Caution"],
  ])("renders [!%s] as a %s callout titled %s", (marker, type, title) => {
    const html = render(`> [!${marker}]\n> Body text.`);
    expect(html).toMatch(new RegExp(`<div class="markdown-alert markdown-alert-${type}" role="note"`));
    expect(html).toContain(`</svg>${title}</p>`);
    expect(html).toMatch(/<p[^>]*>Body text\.<\/p>/);
    expect(html).not.toContain("blockquote");
    expect(html).not.toContain(`[!${marker}]`);
  });

  it("accepts the marker in any case", () => {
    expect(render("> [!warning]\n> Careful.")).toContain("markdown-alert-warning");
  });

  it("drops the paragraph a marker on its own line leaves behind", () => {
    const html = render("> [!TIP]\n>\n> First.\n>\n> Second.");
    expect(html).not.toMatch(/<p[^>]*>\s*<\/p>/);
    expect(html).toMatch(/<p[^>]*>First\.<\/p>\s*<p[^>]*>Second\.<\/p>/);
  });

  it("keeps block content inside the callout", () => {
    const html = render("> [!NOTE]\n> - one\n> - two");
    expect(html).toMatch(/markdown-alert-note[\s\S]*<ul[\s\S]*<li[^>]*>one<\/li>[\s\S]*<\/ul>\s*<\/div>/);
  });

  it("leaves a quote alone when the marker isn't alone on the first line", () => {
    const html = render("> [!NOTE] text on the same line");
    expect(html).toContain("<blockquote");
    expect(html).toContain("[!NOTE] text on the same line");
  });

  it("leaves unknown markers and ordinary quotes alone", () => {
    expect(render("> [!DANGER]\n> x")).toContain("<blockquote");
    expect(render("> just a quote")).toContain("<blockquote");
  });

  it("keeps the source line on the callout for scroll sync", () => {
    expect(render("Intro.\n\n> [!NOTE]\n> x")).toMatch(/markdown-alert-note"[^>]*data-source-line="2"/);
  });

  it("still escapes raw HTML inside a callout", () => {
    const html = render('> [!CAUTION]\n> <img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("footnotes", () => {
  const html = render("A claim[^1] and another[^note], and the first again[^1].\n\n[^1]: First.\n[^note]: Second, *styled*.");

  it("numbers references in order of first use, as bare superscripts", () => {
    expect(html).toContain('<sup class="footnote-ref"><a href="#fn1" id="fnref1">1</a></sup>');
    expect(html).toContain('<sup class="footnote-ref"><a href="#fn2" id="fnref2">2</a></sup>');
  });

  it("shows a repeated reference with the same number", () => {
    expect(html).toContain('<a href="#fn1" id="fnref1:1">1</a>');
  });

  it("lists the notes at the end with links back to each reference", () => {
    expect(html).toMatch(/<section class="footnotes">[\s\S]*<li id="fn1"[\s\S]*<li id="fn2"/);
    expect(html).toContain('href="#fnref1" class="footnote-backref"');
    expect(html).toContain('href="#fnref1:1" class="footnote-backref"');
    expect(html).toContain("<em>styled</em>");
  });

  it("leaves an undefined reference as text", () => {
    expect(render("Nothing defined[^x].")).toContain("[^x]");
  });
});
