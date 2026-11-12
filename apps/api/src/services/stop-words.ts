import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { stopWords } from "../db/schema.ts";
import {
  analyseText,
  compileStopWord,
  matchesStopWord,
  normalisedPreview,
  STOP_WORD_MAX_LENGTH,
  stopWordKey,
  type CompiledStopWord,
  type StopWordMatch,
} from "../lib/stop-words.ts";
import { logAdminAction } from "./admin-auth.ts";

export type StopWordItem = { id: number; word: string; match: StopWordMatch; created_at: string };
type Entry = CompiledStopWord & { id: number; word: string };

export type AddResult = {
  added: string[];
  /** Already on the list (or twice in the same batch), in another spelling perhaps. */
  duplicates: string[];
  /** Too long, or nothing left after normalisation (only punctuation). */
  invalid: string[];
};

/** How many entries the target of a journal line lists before "…". */
const JOURNAL_PREVIEW = 10;

/**
 * The stop-word list (spec section 7). Kept compiled in memory, because every upload checks
 * three fields against all of it; one server, so adding or removing an entry here simply
 * drops the copy.
 */
export class StopWords {
  private entries: Promise<Entry[]> | null = null;

  constructor(private readonly db: Db) {}

  async list(): Promise<StopWordItem[]> {
    const rows = await this.db.select().from(stopWords).orderBy(asc(stopWords.normalized));

    return rows.map((r) => ({ id: r.id, word: r.word, match: r.match, created_at: r.createdAt.toISOString() }));
  }

  /** Adds a batch (one entry per line in the admin form) with the same match flag. */
  async add(words: string[], match: StopWordMatch): Promise<AddResult> {
    const result: AddResult = { added: [], duplicates: [], invalid: [] };
    const fresh = new Map<string, string>();

    for (const raw of words) {
      const word = raw.trim();
      const compiled = [...word].length <= STOP_WORD_MAX_LENGTH ? compileStopWord(word, match) : null;
      if (!compiled) {
        result.invalid.push(word);
        continue;
      }

      const key = stopWordKey(compiled);
      if (fresh.has(key)) result.duplicates.push(word);
      else fresh.set(key, word);
    }

    if (fresh.size === 0) return result;

    await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(stopWords)
        .values([...fresh].map(([normalized, word]) => ({ word, normalized, match })))
        .onConflictDoNothing({ target: stopWords.normalized })
        .returning({ normalized: stopWords.normalized });
      const stored = new Set(inserted.map((r) => r.normalized));

      for (const [key, word] of fresh) {
        (stored.has(key) ? result.added : result.duplicates).push(word);
      }

      if (result.added.length) {
        await logAdminAction(tx as unknown as Db, "add_stop_words", journalTarget(result.added));
      }
    });
    this.entries = null;

    return result;
  }

  async remove(id: number): Promise<"ok" | "not_found"> {
    const removed = await this.db.transaction(async (tx) => {
      const [row] = await tx.delete(stopWords).where(eq(stopWords.id, id)).returning({ word: stopWords.word });
      if (row) await logAdminAction(tx as unknown as Db, "remove_stop_word", row.word);

      return row;
    });
    this.entries = null;

    return removed ? "ok" : "not_found";
  }

  /** The admin check: which entries a text hits, and the text as matching sees it. */
  async check(text: string) {
    const analysed = analyseText(text);
    const matches = (await this.compiled())
      .filter((entry) => matchesStopWord(analysed, entry))
      .map(({ id, word, match }) => ({ id, word, match }));

    return { normalized: normalisedPreview(analysed), matches };
  }

  /**
   * For uploads (spec section 5, check 4): the first field whose text hits the list, or
   * null. The player is told only the field, never the word.
   */
  async rejectedField(fields: Record<string, string | null | undefined>): Promise<string | null> {
    const entries = await this.compiled();
    if (entries.length === 0) return null;

    for (const [field, text] of Object.entries(fields)) {
      if (!text) continue;

      const analysed = analyseText(text);
      if (entries.some((entry) => matchesStopWord(analysed, entry))) return field;
    }

    return null;
  }

  private compiled(): Promise<Entry[]> {
    this.entries ??= this.db
      .select()
      .from(stopWords)
      .then((rows) =>
        rows.flatMap((r) => {
          const compiled = compileStopWord(r.word, r.match);
          return compiled ? [{ ...compiled, id: r.id, word: r.word }] : [];
        }),
      )
      .catch((err: unknown) => {
        this.entries = null;
        throw err;
      });

    return this.entries;
  }
}

function journalTarget(words: string[]): string {
  const shown = words.slice(0, JOURNAL_PREVIEW).join(", ");
  const more = words.length > JOURNAL_PREVIEW ? ", …" : "";

  return `${words.length}: ${shown}${more}`;
}
