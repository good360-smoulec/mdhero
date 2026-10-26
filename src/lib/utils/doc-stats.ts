/**
 * Document statistics for the status bar and its panel. Counts come from the
 * rendered text, not the markdown, so `#`, `-` and table pipes aren't words;
 * readability and sentence measures leave code out. The token estimate is the
 * exception: it's about the file as you'd paste it into an AI, so it reads
 * the raw source.
 */

/** Text pulled out of a rendered document. */
export interface DocText {
  /** All visible text, code included, for word and character counts. */
  allText: string;
  /** Text of each prose block (paragraph, list item, quote, definition). */
  prose: string[];
  paragraphs: number;
  headings: number;
  codeBlocks: number;
  tables: number;
  images: number;
  links: number;
}

export interface Readability {
  /** Flesch Reading Ease, roughly 0 (very hard) to 100 (very easy). */
  ease: number;
  /** Flesch–Kincaid grade level: years of US schooling to follow the text. */
  grade: number;
  level: "veryEasy" | "easy" | "fairlyEasy" | "plain" | "fairlyDifficult" | "difficult" | "veryDifficult";
}

export interface DocStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  headings: number;
  codeBlocks: number;
  tables: number;
  images: number;
  links: number;
  readingMinutes: number;
  speakingMinutes: number;
  averageSentenceWords: number;
  longestSentence: { words: number; text: string } | null;
  /** Sentences over LONG_SENTENCE words. */
  longSentences: number;
  /** Null unless the prose is mostly English: the formulas count English syllables. */
  readability: Readability | null;
  /** Most used words (no common English words), with counts. */
  repeatedWords: { word: string; count: number }[];
  tokens: number;
}

export const READING_WPM = 230;
export const SPEAKING_WPM = 130;
export const LONG_SENTENCE = 30;

// Han, Hiragana, Katakana, Hangul: written without spaces, so each character
// is counted as a word, and AI tokenizers spend about a token on each.
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/gu;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu;

export function countWords(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const rest = text.replace(CJK, " ").match(WORD)?.length ?? 0;
  return cjk + rest;
}

/**
 * Roughly how many tokens an AI model would read for this text. Tokenizers
 * split text into pieces of about four characters of English (so about three
 * quarters of a word each); code and symbols split finer, and Chinese,
 * Japanese and Korean take about one token per character. Exact counts depend
 * on the model.
 */
export function estimateTokens(source: string): number {
  if (!source.trim()) return 0;
  const cjk = source.match(CJK)?.length ?? 0;
  return Math.round((source.length - cjk) / 4 + cjk);
}

/** Split prose into sentences on ., !, ?, … and their CJK forms. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…。！？]["'”’)\]]*)\s+|(?<=[。！？])/u)
    .map((s) => s.trim())
    .filter((s) => countWords(s) > 0);
}

/** English syllables, by the usual vowel-group rule; good enough for Flesch. */
export function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, w.match(/[aeiouy]{1,2}/g)?.length ?? 1);
}

function readabilityLevel(ease: number): Readability["level"] {
  if (ease >= 90) return "veryEasy";
  if (ease >= 80) return "easy";
  if (ease >= 70) return "fairlyEasy";
  if (ease >= 60) return "plain";
  if (ease >= 50) return "fairlyDifficult";
  if (ease >= 30) return "difficult";
  return "veryDifficult";
}

// Common English words, left out of the repeated-words list.
const STOPWORDS = new Set(
  ("about above after again against also because been before being below between both but cannot could " +
    "does doing down during each every from further have having here hers herself himself however into itself just " +
    "more most much must myself only other ought ours ourselves over same shall should some such than that their " +
    "theirs them themselves then there these they this those through under until upon very want were what when " +
    "where which while whom whose will with within without would your yours yourself yourselves always often " +
    "many like make made need needs used using uses well even still back much another")
    .split(" "),
);

export function documentStats(doc: DocText, source: string): DocStats {
  const words = countWords(doc.allText);
  const sentences = doc.prose.flatMap(splitSentences);
  const sentenceWords = sentences.map(countWords);
  const proseWords = sentenceWords.reduce((a, b) => a + b, 0);

  let longest: DocStats["longestSentence"] = null;
  for (let i = 0; i < sentences.length; i++) {
    if (!longest || sentenceWords[i] > longest.words) longest = { words: sentenceWords[i], text: sentences[i] };
  }

  const proseText = doc.prose.join(" ");
  const latinWords = proseText.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  const letters = proseText.match(/\p{L}/gu)?.length ?? 0;
  const asciiLetters = proseText.match(/[A-Za-z]/g)?.length ?? 0;
  let readability: Readability | null = null;
  if (sentences.length > 0 && latinWords.length >= 30 && asciiLetters / Math.max(letters, 1) >= 0.9) {
    const syl = latinWords.reduce((sum, w) => sum + syllables(w), 0);
    const wps = latinWords.length / sentences.length;
    const spw = syl / latinWords.length;
    const ease = Math.round((206.835 - 1.015 * wps - 84.6 * spw) * 10) / 10;
    const grade = Math.round((0.39 * wps + 11.8 * spw - 15.59) * 10) / 10;
    readability = { ease, grade: Math.max(0, grade), level: readabilityLevel(ease) };
  }

  const counts = new Map<string, number>();
  for (const w of proseText.toLowerCase().match(WORD) ?? []) {
    const word = w.replace(/['’]s$/, "");
    if (word.length < 4 || STOPWORDS.has(word) || /^\d/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const repeatedWords = [...counts]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));

  const characters = doc.allText.replace(/\s+/g, " ").trim().length;
  return {
    words,
    characters,
    charactersNoSpaces: doc.allText.replace(/\s/g, "").length,
    sentences: sentences.length,
    paragraphs: doc.paragraphs,
    headings: doc.headings,
    codeBlocks: doc.codeBlocks,
    tables: doc.tables,
    images: doc.images,
    links: doc.links,
    readingMinutes: words / READING_WPM,
    speakingMinutes: words / SPEAKING_WPM,
    averageSentenceWords: sentences.length ? Math.round((proseWords / sentences.length) * 10) / 10 : 0,
    longestSentence: longest,
    longSentences: sentenceWords.filter((n) => n > LONG_SENTENCE).length,
    readability,
    repeatedWords,
    tokens: estimateTokens(source),
  };
}

// Table cells are left out: "Cost" and "$40,000" aren't sentences, and counting
// them would make every table read as very easy text.
const PROSE_BLOCKS = "p, li, blockquote, dd";

/**
 * Pull the text measures need out of rendered HTML (the pipeline's output, so
 * it's already sanitized). Parsed into an inert document, never the page.
 */
export function extractDocText(html: string): DocText {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const body = doc.body;
  const codeBlocks = body.querySelectorAll("pre").length;
  const tables = body.querySelectorAll("table").length;
  const images = body.querySelectorAll("img").length;
  const links = body.querySelectorAll("a[href]:not(.footnote-backref):not(.footnote-ref a)").length;
  const headings = body.querySelectorAll("h1, h2, h3, h4, h5, h6").length;
  // Math markup, footnote back-arrows and callout titles ("Note") aren't words.
  body.querySelectorAll(".katex-mathml, annotation, .footnote-backref, .markdown-alert-title").forEach((el) => el.remove());
  const allText = body.textContent ?? "";
  body.querySelectorAll("pre, .katex, code.language-mermaid, table").forEach((el) => el.remove());
  const prose: string[] = [];
  body.querySelectorAll<HTMLElement>(PROSE_BLOCKS).forEach((el) => {
    // A list item's nested list and a quote's paragraphs are counted on their own.
    if (el.querySelector(PROSE_BLOCKS)) {
      const own = Array.from(el.childNodes)
        .filter((n) => !(n instanceof Element && n.matches(`${PROSE_BLOCKS}, ul, ol, table`)))
        .map((n) => n.textContent ?? "")
        .join(" ")
        .trim();
      if (own) prose.push(own);
      return;
    }
    const text = (el.textContent ?? "").trim();
    if (text) prose.push(text);
  });
  return {
    allText,
    prose,
    paragraphs: body.querySelectorAll("p").length,
    headings,
    codeBlocks,
    tables,
    images,
    links,
  };
}
