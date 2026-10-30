import { describe, expect, it, vi } from "vitest";
import {
  briefView,
  dictionaryEdition,
  fetchDefinition,
  lookupText,
  parseDefinition,
  senseCount,
  wiktionaryUrl,
  wordAround,
} from "../../src/lib/utils/dictionary";

// Trimmed from real WiktApi responses for "segment" in the English edition.
const SEGMENT_DEFINITIONS = {
  word: "segment",
  edition: "en",
  definitions: [
    { pos: "noun", lang_code: "ca", senses: [{ glosses: ["segment"], examples: [], tags: ["masculine"] }] },
    {
      pos: "noun",
      lang_code: "en",
      senses: [
        {
          glosses: ["A length of some object."],
          examples: [{ text: "a segment of rope", type: "example" }],
        },
        {
          glosses: ["One of the parts into which any body naturally separates or is divided."],
          examples: [
            { text: "The ability of a segment of a glass sphere to magnify whatever is placed before it…", type: "quotation" },
          ],
        },
        { glosses: ["A portion.", "The part of a sphere cut off by a plane."], examples: [] },
        { glosses: ["A portion.", "A discrete unit of speech: a consonant or a vowel."], examples: [] },
        { glosses: ["A part of a broadcast program, devoted to a topic."], examples: [] },
      ],
    },
    {
      pos: "verb",
      lang_code: "en",
      senses: [
        {
          glosses: ["To divide into segments or sections."],
          examples: [{ text: "Segment the essay by topic.", type: "example" }],
          tags: ["ambitransitive"],
        },
      ],
    },
  ],
};

const SEGMENT_PRONUNCIATIONS = {
  pronunciations: [
    {
      pos: "noun",
      lang_code: "en",
      sounds: [{ ipa: null }, { ipa: "/ˈsɛɡ.mənt/" }],
    },
    { pos: "verb", lang_code: "en", sounds: [{ ipa: "/sɛɡˈmɛnt/" }] },
  ],
};

describe("the dictionary edition", () => {
  it("is the interface language, with Chinese reading the zh edition", () => {
    expect(dictionaryEdition("en")).toBe("en");
    expect(dictionaryEdition("fr")).toBe("fr");
    expect(dictionaryEdition("zh-CN")).toBe("zh");
  });
});

describe("lookupText", () => {
  it("drops the punctuation around a word", () => {
    expect(lookupText("  segment, ")).toBe("segment");
    expect(lookupText("«maison»")).toBe("maison");
    expect(lookupText("(don't)")).toBe("don't");
  });

  it("keeps a short phrase", () => {
    expect(lookupText("line\n segment")).toBe("line segment");
  });

  it("refuses nothing, and anything longer than a phrase", () => {
    expect(lookupText("   ")).toBeNull();
    expect(lookupText("…")).toBeNull();
    expect(lookupText("one two three four five")).toBeNull();
    expect(lookupText("x".repeat(61))).toBeNull();
  });
});

describe("parseDefinition", () => {
  const def = parseDefinition("segment", "en", [SEGMENT_DEFINITIONS], [SEGMENT_PRONUNCIATIONS]);

  it("puts the interface language's entries first", () => {
    expect(def.languages.map((l) => l.lang)).toEqual(["en", "ca"]);
  });

  it("puts English before the other languages under another edition", () => {
    const fr = parseDefinition("segment", "fr", [SEGMENT_DEFINITIONS], []);
    expect(fr.languages.map((l) => l.lang)).toEqual(["en", "ca"]);
    const withFrench = parseDefinition(
      "segment",
      "fr",
      [
        SEGMENT_DEFINITIONS,
        { definitions: [{ pos: "noun", lang_code: "fr", senses: [{ glosses: ["Partie de la ligne droite."] }] }] },
      ],
      [],
    );
    expect(withFrench.languages.map((l) => l.lang)).toEqual(["fr", "en", "ca"]);
  });

  it("gives each part of speech its own pronunciation", () => {
    const [noun, verb] = def.languages[0].parts;
    expect(noun).toMatchObject({ pos: "noun", ipa: "/ˈsɛɡ.mənt/" });
    expect(verb).toMatchObject({ pos: "verb", ipa: "/sɛɡˈmɛnt/" });
  });

  it("shows a sub-sense without its parent's gloss", () => {
    const texts = def.languages[0].parts[0].senses.map((s) => s.text);
    expect(texts).toContain("The part of a sphere cut off by a plane.");
    expect(texts).not.toContain("A portion.");
  });

  it("keeps short examples and leaves quotations out", () => {
    const [first, second] = def.languages[0].parts[0].senses;
    expect(first.example).toBe("a segment of rope");
    expect(second.example).toBeUndefined();
  });

  it("leaves out a long citation an edition doesn't mark as a quotation", () => {
    const fr = parseDefinition(
      "maison",
      "fr",
      [
        {
          definitions: [
            {
              pos: "noun",
              lang_code: "fr",
              senses: [
                {
                  glosses: ["Bâtiment servant de logis, d’habitation, de demeure."],
                  examples: [
                    {
                      text: "Les maisons peuvent brûler, les fortunes sombrer, les pères revenir de voyage, les empires crouler, le choléra ravager la cité.",
                      type: null,
                    },
                  ],
                },
                { glosses: ["Ménage, famille."], examples: [{ text: "Une maison bien tenue.", type: null }] },
              ],
            },
          ],
        },
      ],
      [],
    );
    expect(fr.languages[0].parts[0].senses.map((s) => s.example)).toEqual([undefined, "Une maison bien tenue."]);
  });

  it("drops wiki markup lines and senses with no gloss", () => {
    const zh = parseDefinition(
      "书",
      "zh",
      [
        {
          definitions: [
            { pos: "character", lang_code: "mul", senses: [{ glosses: [] }] },
            { pos: "unknown", lang_code: "zh", senses: [{ glosses: ["__NOTITLECONVERT__\n 「书」是「書」的簡化字。"] }] },
          ],
        },
      ],
      [],
    );
    expect(zh.languages).toEqual([{ lang: "zh", parts: [{ pos: "unknown", ipa: undefined, senses: [{ text: "「书」是「書」的簡化字。", example: undefined }] }] }]);
  });

  it("merges the as-written and lowercase lookups without repeating a sense", () => {
    const twice = parseDefinition("Segment", "en", [SEGMENT_DEFINITIONS, SEGMENT_DEFINITIONS], []);
    expect(senseCount(twice.languages)).toBe(senseCount(def.languages));
  });
});

describe("briefView", () => {
  const def = parseDefinition("segment", "en", [SEGMENT_DEFINITIONS], [SEGMENT_PRONUNCIATIONS]);

  it("shows the first language only, leaving room for the verb", () => {
    const brief = briefView(def);
    expect(brief).toHaveLength(1);
    expect(brief[0].parts.map((p) => [p.pos, p.senses.length])).toEqual([
      ["noun", 3],
      ["verb", 1],
    ]);
    expect(senseCount(def.languages) - senseCount(brief)).toBe(3);
  });
});

describe("fetchDefinition", () => {
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("asks the interface language's edition, as written and in lowercase", async () => {
    const fetchFn = vi.fn((url: string) =>
      url.includes("/word/segment/definitions") ? json(SEGMENT_DEFINITIONS) : json({ error: true }, 404),
    );
    const def = await fetchDefinition("Segment", "fr", fetchFn as unknown as typeof fetch);
    const urls = fetchFn.mock.calls.map(([u]) => u);
    expect(urls).toContain("https://api.wiktapi.dev/v1/fr/word/Segment/definitions");
    expect(urls).toContain("https://api.wiktapi.dev/v1/fr/word/segment/definitions");
    expect(def?.languages[0].lang).toBe("en");
  });

  it("encodes the word", async () => {
    const fetchFn = vi.fn(() => json({ error: true }, 404));
    await fetchDefinition("书", "zh", fetchFn as unknown as typeof fetch);
    expect(fetchFn).toHaveBeenCalledWith("https://api.wiktapi.dev/v1/zh/word/%E4%B9%A6/definitions", expect.anything());
  });

  it("is null when no edition entry matches", async () => {
    const fetchFn = vi.fn(() => json({ error: true }, 404));
    expect(await fetchDefinition("zzqxw", "en", fetchFn as unknown as typeof fetch)).toBeNull();
  });

  it("reads a blocked request as an unknown word while the API answers", async () => {
    // The real 404 has no CORS header, so in the webview fetch rejects.
    const fetchFn = vi.fn((url: string) =>
      url.endsWith("/v1/editions") ? json({ editions: ["en"] }) : Promise.reject(new TypeError("Failed to fetch")),
    );
    expect(await fetchDefinition("zzqxw", "en", fetchFn as unknown as typeof fetch)).toBeNull();
  });

  it("throws when nothing answers, rather than claiming the word doesn't exist", async () => {
    const fetchFn = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(fetchDefinition("segment", "en", fetchFn as unknown as typeof fetch)).rejects.toThrow("unreachable");
  });

  it("uses the form that answered when the other one is blocked", async () => {
    const fetchFn = vi.fn((url: string) =>
      url.includes("/word/segment/definitions") ? json(SEGMENT_DEFINITIONS) : Promise.reject(new TypeError("Failed to fetch")),
    );
    const def = await fetchDefinition("Segment", "en", fetchFn as unknown as typeof fetch);
    expect(def?.languages[0].lang).toBe("en");
    expect(fetchFn).not.toHaveBeenCalledWith("https://api.wiktapi.dev/v1/editions");
  });

  it("throws on a server error, rather than claiming the word doesn't exist", async () => {
    const fetchFn = vi.fn(() => json({ error: true }, 503));
    await expect(fetchDefinition("segment", "en", fetchFn as unknown as typeof fetch)).rejects.toThrow("HTTP 503");
  });

  it("still defines the word when only the pronunciations fail", async () => {
    const fetchFn = vi.fn((url: string) =>
      url.endsWith("/definitions") ? json(SEGMENT_DEFINITIONS) : json({ error: true }, 500),
    );
    const def = await fetchDefinition("segment", "en", fetchFn as unknown as typeof fetch);
    expect(def?.languages[0].parts[0].ipa).toBeUndefined();
  });
});

describe("wordAround", () => {
  it("finds the word under the pointer", () => {
    const text = "Cut the rope into segments.";
    expect(wordAround(text, 0)).toBe("Cut");
    expect(wordAround(text, 20)).toBe("segments");
    expect(wordAround(text, 25)).toBe("segments");
  });

  it("finds nothing on a space or punctuation", () => {
    expect(wordAround("a, b", 1)).toBeNull();
    expect(wordAround("a, b", 2)).toBeNull();
    expect(wordAround("ab", 5)).toBeNull();
  });

  it("keeps an apostrophe inside the word", () => {
    expect(wordAround("I don't know", 4)).toBe("don't");
  });
});

describe("wiktionaryUrl", () => {
  it("links the edition's own page for the word", () => {
    expect(wiktionaryUrl("fr", "line segment")).toBe("https://fr.wiktionary.org/wiki/line_segment");
    expect(wiktionaryUrl("zh", "书")).toBe("https://zh.wiktionary.org/wiki/%E4%B9%A6");
  });
});
