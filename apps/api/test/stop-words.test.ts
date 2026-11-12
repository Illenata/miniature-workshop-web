import { describe, expect, it } from "vitest";
import {
  analyseText,
  compileStopWord,
  foldText,
  matchesStopWord,
  stopWordKey,
  type StopWordMatch,
} from "../src/lib/stop-words.ts";

function hit(text: string, word: string, match: StopWordMatch = "word"): boolean {
  const entry = compileStopWord(word, match);
  if (!entry) throw new Error(`empty stop word: ${word}`);
  return matchesStopWord(analyseText(text), entry);
}

describe("foldText", () => {
  it("lower-cases, drops diacritics and zero-width characters, applies the substitutions", () => {
    expect(foldText("FÜCK")).toBe("fuck");
    expect(foldText("fu​ck")).toBe("fuck");
    expect(foldText("$h1t")).toBe("shit");
    expect(foldText("h3ll0 @ss")).toBe("hello ass");
    expect(foldText("ｆｕｃｋ")).toBe("fuck");
  });

  it("folds Cyrillic look-alikes into Latin, the same way for the list and the text", () => {
    expect(foldText("хуй")).toBe(foldText("xуй"));
    expect(foldText("Сосок")).toBe("cocok");
    expect(foldText("їжак")).toBe(foldText("іжак"));
  });
});

describe("whole-word stop words", () => {
  it("match a word anywhere in the text, in any case", () => {
    expect(hit("What the FUCK is this", "fuck")).toBe(true);
    expect(hit("Fück.", "fuck")).toBe(true);
    expect(hit("шит$h1t", "shit")).toBe(false);
    expect(hit("this is $h1t", "shit")).toBe(true);
  });

  it("see through spaces and punctuation inside a word", () => {
    expect(hit("f.u.c.k off", "fuck")).toBe(true);
    expect(hit("f u c k", "fuck")).toBe(true);
    expect(hit("f-u-c-k", "fuck")).toBe(true);
    expect(hit("ну ти х у й", "хуй")).toBe(true);
    expect(hit("ну ти x.у.й", "хуй")).toBe(true);
    expect(hit("Мій х у й і в сумці", "хуй")).toBe(true);
    expect(hit("а f u c k", "fuck")).toBe(true);
  });

  it("do not match inside longer words", () => {
    expect(hit("first class glass", "ass")).toBe(false);
    expect(hit("Scunthorpe", "cunt")).toBe(false);
    expect(hit("a s s", "ass")).toBe(true);
  });

  it("match phrases word by word or written together", () => {
    expect(hit("Just kill   yourself!", "kill yourself")).toBe(true);
    expect(hit("killyourself", "kill yourself")).toBe(true);
    expect(hit("skill yourselves", "kill yourself")).toBe(false);
  });

  it("keep Ukrainian apostrophes from splitting a word", () => {
    expect(hit("П'ять разів", "пять")).toBe(true);
    expect(hit("пять", "п'ять")).toBe(true);
  });
});

describe("substring stop words", () => {
  it("match inside longer words and across separators", () => {
    expect(hit("first class", "ass", "substring")).toBe(true);
    expect(hit("Scunthorpe", "cunt", "substring")).toBe(true);
    expect(hit("nig ger", "nigger", "substring")).toBe(true);
    expect(hit("clean title", "ass", "substring")).toBe(false);
  });
});

describe("compileStopWord", () => {
  it("rejects entries with nothing left after normalisation", () => {
    expect(compileStopWord("  ...  ", "word")).toBeNull();
    expect(compileStopWord("", "word")).toBeNull();
  });

  it("gives one key to spellings that normalise the same", () => {
    const key = (w: string) => stopWordKey(compileStopWord(w, "word")!);
    expect(key("Fück")).toBe(key("fuck"));
    expect(key("kill  yourself")).toBe(key("Kill Yourself"));
    expect(key("kill yourself")).not.toBe(key("killyourself"));
  });
});
