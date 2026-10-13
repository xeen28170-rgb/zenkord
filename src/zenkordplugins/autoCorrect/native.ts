/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";

import { buildLexicon, correctMessage, CorrectOptions, Lexicon } from "./engine";

// Word lists, downloaded once and cached in Discord's user data folder.
// - an-array-of-*-words (MIT): every inflected form of the language
// - FrequencyWords by Hermit Dave (OpenSubtitles 2018, CC BY-SA 4.0): spoken
//   frequency, so slang and insults are known and suggestions are realistic
const SOURCES = {
    frWords: "https://cdn.jsdelivr.net/npm/an-array-of-french-words@2.0.0/index.json",
    enWords: "https://cdn.jsdelivr.net/npm/an-array-of-english-words@2.0.0/index.json",
    frFreq: "https://cdn.jsdelivr.net/gh/hermitdave/FrequencyWords@525f9b560de45753a5ea01069454e72e9aa541c6/content/2018/fr/fr_50k.txt",
    enFreq: "https://cdn.jsdelivr.net/gh/hermitdave/FrequencyWords@525f9b560de45753a5ea01069454e72e9aa541c6/content/2018/en/en_50k.txt",
} as const;

type SourceName = keyof typeof SOURCES;

let lexicon: Lexicon | null = null;
let loading: Promise<void> | null = null;
let lastError: string | null = null;

function cacheDir(): string {
    const dir = join(app.getPath("userData"), "ZenkordAutoCorrect");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
}

async function fetchSource(name: SourceName): Promise<string> {
    // bump the suffix when a source URL changes
    const file = join(cacheDir(), `${name}.v1`);
    if (existsSync(file)) return readFileSync(file, "utf8");

    const res = await fetch(SOURCES[name], { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    const text = await res.text();
    if (text.length < 100_000) throw new Error(`${name}: file too small`);
    if (name.endsWith("Words")) JSON.parse(text); // reject a truncated download

    writeFileSync(file + ".tmp", text);
    renameSync(file + ".tmp", file);
    return text;
}

function load(): Promise<void> {
    if (lexicon) return Promise.resolve();
    loading ??= (async () => {
        try {
            const [frWords, enWords, frFreq, enFreq] = await Promise.all(
                (Object.keys(SOURCES) as SourceName[]).map(fetchSource)
            );
            lexicon = buildLexicon({ frWords: JSON.parse(frWords), enWords: JSON.parse(enWords), frFreq, enFreq });
            lastError = null;
        } catch (e) {
            lastError = String(e);
            console.warn("[AutoCorrect] dictionaries unavailable:", e);
        } finally {
            loading = null;
        }
    })();
    return loading;
}

/**
 * Starts downloading/loading the dictionaries in the background. Parsing them
 * takes about a second on the main process, so it waits for Discord to finish
 * starting up first (a message sent before then triggers the load itself).
 */
export function warmup(_: unknown): void {
    setTimeout(load, 15_000);
}

export function getStatus(_: unknown): { ready: boolean; loading: boolean; error: string | null; } {
    return { ready: lexicon !== null, loading: loading !== null, error: lastError };
}

// ── LanguageTool (grammar) ─────────────────────────────────────────────────────

const LANGUAGE_TOOL_URL = "https://api.languagetool.org/v2/check";
const LANGUAGE_TOOL_TIMEOUT_MS = 5000;
const LANGUAGE_TOOL_CODES: Record<string, string> = { en: "en-US", de: "de-DE", pt: "pt-PT" };
// Case, spacing and punctuation are handled by the offline engine and its settings.
// The chat register is kept: no added "ne" ("j'ai pas" stays), no forced subjunctive.
const DISABLED_CATEGORIES = "CASING,TYPOGRAPHY,STYLE,REDUNDANCY,PONCTUATION_VIRGULE,PUNCTUATION,CAT_TOURS_CRITIQUES";
const DISABLED_RULES = "FRENCH_WHITESPACE,UPPERCASE_SENTENCE_START,WHITESPACE_RULE,P_V_PAS,IL_Y_A,SUBJ_SUBOR";
// Dictionary spell checkers flag slang, nicknames and the other language of a
// mixed message. Grammalecte rules chain on neighbouring errors ("sa allait" → "allée").
const SKIPPED_RULE = /^(?:FR_SPELLING_RULE|MORFOLOGIK_RULE_|HUNSPELL_|grammalecte_)|_SPELLER_RULE$/;

interface LanguageToolResponse {
    matches: Array<{
        offset: number;
        length: number;
        replacements: Array<{ value: string; }>;
        rule: { id: string; };
    }>;
}

export interface GrammarMatch {
    offset: number;
    length: number;
    replacement: string;
}

/** Only the matches with a single suggestion: anything ambiguous is left as typed. */
export async function checkGrammar(_: unknown, text: string, language: string): Promise<GrammarMatch[]> {
    const body = new URLSearchParams({
        text,
        language: LANGUAGE_TOOL_CODES[language] ?? language,
        disabledCategories: DISABLED_CATEGORIES,
        disabledRules: DISABLED_RULES,
    });
    const res = await fetch(LANGUAGE_TOOL_URL, { method: "POST", body, signal: AbortSignal.timeout(LANGUAGE_TOOL_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`LanguageTool answered HTTP ${res.status}`);
    const { matches } = await res.json() as LanguageToolResponse;
    return matches
        .filter(m => m.replacements.length === 1 && !SKIPPED_RULE.test(m.rule.id))
        .map(m => ({ offset: m.offset, length: m.length, replacement: m.replacements[0].value }));
}

export async function correct(_: unknown, text: string, opts: CorrectOptions): Promise<string> {
    if (!lexicon) {
        // First message after start-up: wait a little for the dictionaries,
        // otherwise fall back to the rules that need none (punctuation, case).
        await Promise.race([load(), new Promise(r => setTimeout(r, 2500))]);
    }
    try {
        return correctMessage(text, lexicon, opts);
    } catch (e) {
        console.error("[AutoCorrect] correction failed:", e);
        return text;
    }
}
