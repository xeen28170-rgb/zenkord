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
