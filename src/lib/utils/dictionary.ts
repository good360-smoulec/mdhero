/**
 * Word definitions from WiktApi (https://wiktapi.dev), a JSON API over the
 * Wiktionary editions. The edition decides the language the definitions are
 * written in, so it follows the interface language; the word itself may be in
 * any language, and every language that spells it that way comes back.
 */

export const DICTIONARY_API = "https://api.wiktapi.dev";

export interface Sense {
  text: string;
  example?: string;
}

export interface PartOfSpeech {
  pos: string;
  ipa?: string;
  senses: Sense[];
}

export interface LanguageEntries {
  /** Wiktionary language code of the word, e.g. "en", "fr", "mul". */
  lang: string;
  parts: PartOfSpeech[];
}

export interface Definition {
  word: string;
  edition: string;
  /** The interface language's own entries first, then English, then the rest. */
  languages: LanguageEntries[];
}

interface ApiExample {
  text?: string;
  type?: string | null;
}

interface ApiSense {
  glosses?: string[];
  examples?: ApiExample[];
}

interface ApiDefinitions {
  definitions?: { pos?: string; lang_code?: string; senses?: ApiSense[] }[];
}

interface ApiPronunciations {
  pronunciations?: { pos?: string; lang_code?: string; sounds?: { ipa?: string | null }[] }[];
}

/** The Wiktionary edition for an interface locale: "zh-CN" reads the Chinese one. */
export function dictionaryEdition(locale: string): string {
  return locale.split("-")[0].toLowerCase();
}

const MAX_WORD_LENGTH = 60;

/**
 * The word or short phrase to look up from a selection, without the
 * punctuation around it. Null for nothing, or for more than a phrase.
 */
export function lookupText(selection: string): string | null {
  const text = selection
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "");
  if (!text || text.length > MAX_WORD_LENGTH || text.split(" ").length > 4) return null;
  return text;
}

/**
 * The word at `offset` in `text`, for a right-click with nothing selected.
 * Intl.Segmenter finds word edges in scripts without spaces, like Chinese.
 */
export function wordAround(text: string, offset: number, locale?: string): string | null {
  const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
  for (const seg of segmenter.segment(text)) {
    if (offset >= seg.index && offset < seg.index + seg.segment.length) {
      return seg.isWordLike ? seg.segment : null;
    }
  }
  return null;
}

export function wiktionaryUrl(edition: string, word: string): string {
  return `https://${edition}.wiktionary.org/wiki/${encodeURIComponent(word.replace(/ /g, "_"))}`;
}

/** What a sense means: Wiktionary lists a sub-sense after its parent's gloss. */
function senseText(sense: ApiSense): string {
  const glosses = (sense.glosses ?? [])
    .map((g) => g.split("\n").filter((line) => !line.trim().startsWith("__")).join(" ").trim())
    .filter(Boolean);
  return glosses[glosses.length - 1] ?? "";
}

/**
 * A short usage example, not a long quotation from a book. Some editions don't
 * mark quotations as such, so length tells them apart too.
 */
function senseExample(sense: ApiSense): string | undefined {
  const ex = (sense.examples ?? []).find((e) => e.text && e.type !== "quotation" && e.text.length <= 120);
  return ex?.text?.trim() || undefined;
}

export function parseDefinition(
  word: string,
  edition: string,
  definitions: ApiDefinitions[],
  pronunciations: ApiPronunciations[],
): Definition {
  const ipa = new Map<string, string>();
  for (const p of pronunciations.flatMap((r) => r.pronunciations ?? [])) {
    const key = `${p.lang_code}|${p.pos}`;
    const found = p.sounds?.find((s) => s.ipa)?.ipa;
    if (found && !ipa.has(key)) ipa.set(key, found);
  }

  const languages = new Map<string, LanguageEntries>();
  const seen = new Set<string>();
  for (const d of definitions.flatMap((r) => r.definitions ?? [])) {
    const lang = d.lang_code || "und";
    const pos = d.pos || "unknown";
    const senses: Sense[] = [];
    for (const s of d.senses ?? []) {
      const text = senseText(s);
      const key = `${lang}|${pos}|${text}`;
      if (!text || seen.has(key)) continue;
      seen.add(key);
      senses.push({ text, example: senseExample(s) });
    }
    if (senses.length === 0) continue;

    let entry = languages.get(lang);
    if (!entry) languages.set(lang, (entry = { lang, parts: [] }));
    const part = entry.parts.find((p) => p.pos === pos);
    if (part) part.senses.push(...senses);
    else entry.parts.push({ pos, ipa: ipa.get(`${lang}|${pos}`), senses });
  }

  const rank = (lang: string) => (lang === edition ? 0 : lang === "en" ? 1 : 2);
  return {
    word,
    edition,
    languages: [...languages.values()].sort((a, b) => rank(a.lang) - rank(b.lang)),
  };
}

export function senseCount(languages: readonly LanguageEntries[]): number {
  return languages.reduce((n, l) => n + l.parts.reduce((m, p) => m + p.senses.length, 0), 0);
}

/**
 * The short view: the first language only, at most `max` senses across its
 * parts of speech and `perPart` from each, so a verb isn't crowded out by
 * a long list of noun senses.
 */
export function briefView(def: Definition, max = 4, perPart = 3): LanguageEntries[] {
  const first = def.languages[0];
  if (!first) return [];
  let left = max;
  const parts: PartOfSpeech[] = [];
  for (const part of first.parts) {
    if (left === 0) break;
    const senses = part.senses.slice(0, Math.min(perPart, left));
    left -= senses.length;
    parts.push({ ...part, senses });
  }
  return [{ lang: first.lang, parts }];
}

/** The request failed without a response the page may read. */
const UNREADABLE = Symbol("unreadable");

async function getJson<T>(url: string, fetchFn: typeof fetch): Promise<T | null | typeof UNREADABLE> {
  let res: Response;
  try {
    res = await fetchFn(url, { headers: { Accept: "application/json" } });
  } catch {
    return UNREADABLE;
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Whether the API answers at all: its editions list carries CORS headers. */
async function apiReachable(fetchFn: typeof fetch): Promise<boolean> {
  try {
    return (await fetchFn(`${DICTIONARY_API}/v1/editions`)).ok;
  } catch {
    return false;
  }
}

const isFound = <T>(r: T | null | typeof UNREADABLE): r is T => r !== null && r !== UNREADABLE;

/**
 * Look a word up. The lowercase form is asked for too, and listed first: a
 * capitalised word is more often the start of a sentence than a name. Null
 * when nothing matched; throws when the dictionary can't be reached.
 */
export async function fetchDefinition(
  word: string,
  edition: string,
  fetchFn: typeof fetch = fetch,
): Promise<Definition | null> {
  const forms = [...new Set([word.toLowerCase(), word])];
  const base = `${DICTIONARY_API}/v1/${encodeURIComponent(edition)}/word/`;
  const [definitions, pronunciations] = await Promise.all([
    Promise.all(forms.map((w) => getJson<ApiDefinitions>(`${base}${encodeURIComponent(w)}/definitions`, fetchFn))),
    Promise.all(
      forms.map((w) =>
        getJson<ApiPronunciations>(`${base}${encodeURIComponent(w)}/pronunciations`, fetchFn).catch(() => null),
      ),
    ),
  ]);
  const found = definitions.filter(isFound);
  // The API's 404 has no CORS header, so the webview sees a word it doesn't
  // know as a failed request: only a second, readable request tells that
  // apart from being offline.
  if (found.length === 0 && definitions.includes(UNREADABLE) && !(await apiReachable(fetchFn))) {
    throw new Error("Dictionary unreachable");
  }
  const def = parseDefinition(word, edition, found, pronunciations.filter(isFound));
  return def.languages.length > 0 ? def : null;
}
