/**
 * Stop-word matching (spec section 7). Pure functions: the list lives in the database
 * (services/stop-words.ts), uploads and the admin check both come through here.
 *
 * Text is normalised before matching: lower case, no diacritics, the simple substitutions
 * from the spec (0→o, 1→i, 3→e, @→a, $→s), and spaces and punctuation inside a word are
 * taken out ("f.u.c.k", "f u c k"). On top of the spec, Cyrillic letters that look like
 * Latin ones are folded together (а→a, о→o, х→x…), so mixing the two alphabets inside a
 * word does not hide it. A stop word goes through the same normalisation, so a list entry
 * and a text always meet in the same form.
 */

export const STOP_WORD_MATCHES = ["word", "substring"] as const;
export type StopWordMatch = (typeof STOP_WORD_MATCHES)[number];

/** Longest stop word a moderator can enter, in characters. */
export const STOP_WORD_MAX_LENGTH = 64;

const SUBSTITUTIONS: Record<string, string> = {
  // From the spec.
  "0": "o",
  "1": "i",
  "3": "e",
  "@": "a",
  $: "s",
  // Cyrillic look-alikes of Latin letters (lower case; text is lower-cased first).
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  і: "i",
  ј: "j",
  ѕ: "s",
  к: "k",
};

const MARK_OR_FORMAT = /[\p{M}\p{Cf}]/u;
const NOT_WORD_CHARS = /[^\p{L}\p{N}]+/gu;
const SPACES = /[\p{Z}\s]+/u;

/**
 * Lower case, compatibility forms (fullwidth letters and the like) to plain ones, accents
 * and zero-width characters removed, substitutions applied. Separators are kept.
 */
export function foldText(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFKD").toLowerCase()) {
    if (MARK_OR_FORMAT.test(ch)) continue;
    out += SUBSTITUTIONS[ch] ?? ch;
  }
  return out;
}

export type AnalysedText = {
  /** Words split on any space or punctuation. */
  tokens: string[];
  /** Everything a whole-word stop word may equal (see analyseText). */
  words: Set<string>;
  /** The text with every separator removed, for substring stop words. */
  compact: string;
};

/**
 * What a text offers for matching. Whole-word candidates are its words, each
 * space-separated chunk with the punctuation inside it removed ("f.u.c.k" → "fuck",
 * "п'ять" → "пять"), and single letters in a row joined ("f u c k" → "fuck").
 */
export function analyseText(text: string): AnalysedText {
  const folded = foldText(text);
  const tokens = folded.split(NOT_WORD_CHARS).filter(Boolean);
  const words = new Set(tokens);

  for (const chunk of folded.split(SPACES)) {
    const joined = chunk.replace(NOT_WORD_CHARS, "");
    if (joined) words.add(joined);
  }

  // Single letters in a row ("f u c k"): every stretch of two or more of them, because a
  // run often takes in a neighbouring one-letter word ("х у й і…", "і", "в", "з", "а").
  let run: string[] = [];
  for (const token of [...tokens, ""]) {
    if ([...token].length === 1) {
      run.push(token);
      continue;
    }
    for (let start = 0; start < run.length - 1; start++) {
      const end = Math.min(run.length, start + STOP_WORD_MAX_LENGTH);
      for (let stop = start + 2; stop <= end; stop++) words.add(run.slice(start, stop).join(""));
    }
    run = [];
  }

  return { tokens, words, compact: tokens.join("") };
}

export type CompiledStopWord = {
  /** Normalised words of the entry; more than one for a phrase. */
  tokens: string[];
  /** The entry with every separator removed. */
  compact: string;
  match: StopWordMatch;
};

/** Normalised form of a stop word, or null when nothing is left of it (only punctuation). */
export function compileStopWord(word: string, match: StopWordMatch): CompiledStopWord | null {
  const tokens = foldText(word).split(NOT_WORD_CHARS).filter(Boolean);
  if (tokens.length === 0) return null;

  return { tokens, compact: tokens.join(""), match };
}

/**
 * The key two entries are duplicates by: the same words after normalisation. "Fück" and
 * "fuck" are one entry; a whole-word and a substring entry for the same word are too.
 */
export function stopWordKey(compiled: CompiledStopWord): string {
  return compiled.tokens.join(" ");
}

/**
 * A whole-word entry matches a candidate word of the text, or, for a phrase, the same
 * words in a row ("kill yourself" in "Kill   yourself!"). A substring entry matches
 * anywhere once separators are gone.
 */
export function matchesStopWord(text: AnalysedText, entry: CompiledStopWord): boolean {
  if (entry.match === "substring") return text.compact.includes(entry.compact);
  if (text.words.has(entry.compact)) return true;
  if (entry.tokens.length < 2) return false;

  const last = text.tokens.length - entry.tokens.length;
  for (let start = 0; start <= last; start++) {
    if (entry.tokens.every((token, i) => text.tokens[start + i] === token)) return true;
  }

  return false;
}

/** Shown to the moderator by the check: the text the way matching sees it. */
export function normalisedPreview(text: AnalysedText): string {
  return text.tokens.join(" ");
}
