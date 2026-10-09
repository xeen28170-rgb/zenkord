/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Local (offline, AI-free) correction engine. Pure TypeScript, no DOM or
// Electron import: it runs in Discord's main process through native.ts and is
// also loaded as-is by the test script.
//
// Philosophy: correct word for word and never guess. Every rule only fires in
// an unambiguous situation; anything uncertain is left exactly as typed.

export type Lang = "fr" | "en";

export interface RawDictionaries {
    /** Full French lexicon (every inflected form, accented, no apostrophes). */
    frWords: string[];
    /** Full English lexicon. */
    enWords: string[];
    /** "word count" lines sorted by frequency (OpenSubtitles). */
    frFreq: string;
    enFreq: string;
}

interface Candidate {
    word: string;
    stripped: string;
    count: number;
    lang: Lang;
}

interface WordSet {
    has(word: string): boolean;
}

/** big lexicon + a few extra words, without copying the 300 000 entries */
function union(base: Set<string>, extra: Set<string>): WordSet {
    return { has: word => base.has(word) || extra.has(word) };
}

export interface Lexicon {
    frBig: Set<string>;
    frValid: WordSet;
    enValid: WordSet;
    frRank: Map<string, number>;
    enRank: Map<string, number>;
    frCount: Map<string, number>;
    /** unaccented spelling → the only plausible accented spelling */
    accentFix: Map<string, string>;
    /** unaccented spelling → every accented spelling, most frequent first */
    accentGroups: Map<string, string[]>;
    /** spelling-suggestion candidates bucketed by unaccented length */
    buckets: Map<number, Candidate[]>;
}

export interface CorrectOptions {
    /** main language chosen in the settings */
    language: string;
    punctuation: boolean;
    finalPeriod: boolean;
    frenchSpacing: boolean;
    /** words that must never be spell-corrected (usernames, custom list…) */
    protectedWords: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function stripAccents(s: string): string {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae");
}

const VOWEL_START = /^[aeiouyhàâäéèêëîïôöùûüœæ]/;
const HAS_VOWEL = /[aeiouyàâäéèêëîïôöùûüœæ]/;

function applyCase(original: string, replacement: string): string {
    if (original.length > 1 && original === original.toUpperCase() && original !== original.toLowerCase())
        return replacement.toUpperCase();
    if (original[0] !== original[0].toLowerCase())
        return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
}

function parseFreq(text: string): Array<[string, number]> {
    const out: Array<[string, number]> = [];
    for (const line of text.split("\n")) {
        const space = line.indexOf(" ");
        if (space <= 0) continue;
        const word = line.slice(0, space).toLowerCase();
        if (!/^\p{L}+$/u.test(word)) continue;
        out.push([word, Number(line.slice(space + 1)) || 0]);
    }
    return out;
}

/** "jai" = j + ai, "quil" = qu + il: an elision typed without its apostrophe. */
function splitElision(word: string, isFrWord: (w: string) => boolean): [string, string] | null {
    const m = /^(qu|[jldnmtsc])(.{2,})$/.exec(word);
    if (!m || !VOWEL_START.test(m[2])) return null;
    return isFrWord(m[2]) ? [m[1], m[2]] : null;
}

// ── Lexicon ─────────────────────────────────────────────────────────────────

export function buildLexicon(raw: RawDictionaries): Lexicon {
    const frBig = new Set(raw.frWords.map(w => w.toLowerCase()));
    const enBig = new Set(raw.enWords.map(w => w.toLowerCase()));
    const frList = parseFreq(raw.frFreq);
    const enList = parseFreq(raw.enFreq);

    const frRank = new Map<string, number>();
    const frCount = new Map<string, number>();
    frList.forEach(([w, c], i) => { if (!frRank.has(w)) { frRank.set(w, i + 1); frCount.set(w, c); } });
    const enRank = new Map<string, number>();
    enList.forEach(([w], i) => { if (!enRank.has(w)) enRank.set(w, i + 1); });

    // Accent restoration table. Only kept when one accented spelling clearly
    // dominates the others (≥ 3× more frequent), otherwise it is ambiguous.
    const groups = new Map<string, string[]>();
    const addAccented = (w: string) => {
        const s = stripAccents(w);
        if (s === w) return;
        const g = groups.get(s);
        if (!g) groups.set(s, [w]);
        else if (!g.includes(w)) g.push(w);
    };
    for (const w of frBig) addAccented(w);
    for (const [w] of frList) addAccented(w);

    const accentFix = new Map<string, string>();
    const accentGroups = groups;
    for (const [s, words] of groups) {
        const sorted = words
            .map(w => ({ w, c: frCount.get(w) ?? 0 }))
            .sort((a, b) => b.c - a.c);
        groups.set(s, sorted.map(x => x.w));
        const [best, second] = sorted;
        if (!second || (best.c > 0 && best.c >= 3 * second.c)) accentFix.set(s, best.w);
    }

    // Common spoken forms (meuf, conne, niquer, enculé…) are missing from the
    // academic lexicon; take them from the frequency list unless they are
    // a known misspelling (missing accent or missing apostrophe).
    const isFrBigOrAccent = (w: string) => frBig.has(w) || accentFix.has(w);
    const frExtra = new Set<string>();
    frList.forEach(([w, c], i) => {
        if (frBig.has(w) || i >= 40000) return;
        const accentedTotal = (groups.get(w) ?? []).reduce((sum, v) => sum + (frCount.get(v) ?? 0), 0);
        if (accentedTotal >= 2 * c) return;
        if (splitElision(w, isFrBigOrAccent)) return;
        frExtra.add(w);
    });

    const frValid = union(frBig, frExtra);
    const enExtra = new Set<string>();
    enList.forEach(([w], i) => { if (i < 30000 && !enBig.has(w)) enExtra.add(w); });
    const enValid = union(enBig, enExtra);

    const buckets = new Map<number, Candidate[]>();
    const addCandidate = (word: string, count: number, lang: Lang) => {
        const stripped = stripAccents(word);
        let b = buckets.get(stripped.length);
        if (!b) buckets.set(stripped.length, b = []);
        b.push({ word, stripped, count, lang });
    };
    // "aujourd" (from aujourd'hui) and friends are fragments, never a suggestion
    const fragments = new Set(["aujourd", "presqu", "quelqu", "jusqu", "lorsqu", "puisqu", "quoiqu"]);
    frList.forEach(([w, c], i) => { if (i < 30000 && w.length >= 2 && frBig.has(w) && !fragments.has(w)) addCandidate(w, c, "fr"); });
    enList.forEach(([w, c], i) => { if (i < 30000 && w.length >= 2 && enBig.has(w)) addCandidate(w, c, "en"); });

    return { frBig, frValid, enValid, frRank, enRank, frCount, accentFix, accentGroups, buckets };
}

// ── Word lists ──────────────────────────────────────────────────────────────

/** Internet/SMS shorthand: never corrected, never expanded. */
export const SLANG = new Set([
    // French
    "mdr", "mdrr", "ptdr", "xptdr", "jsp", "jss", "jpp", "wsh", "wesh", "tkt", "tqt", "dsl", "stp", "svp",
    "bcp", "cc", "slt", "bjr", "bsr", "bg", "gg", "ggwp", "wp", "ez", "rip", "osef", "askip", "chelou",
    "grv", "tavu", "jtm", "bnj", "frr", "frero", "frérot", "reuf", "poto", "gow", "ptn", "cimer", "khey",
    "wallah", "wallahi", "oklm", "seum", "nrv", "vnr", "relou", "chanmé", "zbi", "wsp", "dac", "dacc", "auj",
    "ajd", "tlm", "tt", "tjrs", "tjs", "pk", "pq", "qqn", "qqch", "jveux", "jvais", "chuis", "chui", "jsuis",
    "jsais", "jpense", "jcrois", "jte", "jme", "jle", "jpeux", "jfais", "jdois", "jparle", "kikoo", "miskine",
    "nikel", "clc", "ftg", "tg", "ntm", "fdp", "fdb", "mrc", "aprem", "oki", "okk", "okok", "ouais",
    "bah", "ben", "bref", "genre", "grave", "sah", "starfoullah", "hamdoullah", "inchallah", "bsx", "bisous",
    "jsuis", "ptet", "ptetre", "deg", "dég", "tranquille", "tranquilou", "daronne", "daron", "meuf", "keuf",
    "teubé", "boloss", "bolosse", "taff", "taf", "rpz", "cheh", "bsahtek", "zarma", "wsh", "flemme", "nik",
    "triso", "cassos", "bolos", "gogol", "baltringue", "tafiole",
    // English
    "lol", "lmao", "lmfao", "rofl", "omg", "wtf", "idk", "imo", "imho", "tbh", "btw", "afaik", "brb", "gtg",
    "irl", "fyi", "asap", "ngl", "icl", "tbf", "smh", "rn", "ily", "gl", "hf", "afk", "dm", "pm", "noob",
    "pog", "poggers", "kek", "cya", "ty", "yw", "np", "nvm", "ikr", "omw", "wyd", "hbu", "xd", "bro", "bruh",
    "gonna", "wanna", "gotta", "lemme", "dunno", "kinda", "sorta", "yall", "tho", "cuz", "bc", "fr", "ok",
    "okay", "yep", "yup", "nope", "nah", "ya", "yo", "sus", "lowkey", "highkey", "goat", "w", "l", "ratio",
]);

const LAUGHS = /^(?:mdr+|ptdr+|xptdr+|lol+|lmao+|lmfao+|xd+|jpp+|ahah\w*|haha\w*|hihi\w*|héhé\w*|hehe\w*|hah|mdrr+|rofl)$/;

/** French spellings without apostrophe or accent (word → correction). */
const FR_TABLE = new Map(Object.entries({
    ca: "ça", sava: "ça va", cava: "ça va", jai: "j'ai", jen: "j'en", jy: "j'y", cest: "c'est",
    cetait: "c'était", quil: "qu'il", quils: "qu'ils", quon: "qu'on", quest: "qu'est",
    questce: "qu'est-ce", dun: "d'un", daccord: "d'accord", aujourdhui: "aujourd'hui",
    aujourdui: "aujourd'hui", nimporte: "n'importe", jusqua: "jusqu'à", jusquau: "jusqu'au", sil: "s'il",
    sils: "s'ils", sest: "s'est", lun: "l'un", lautre: "l'autre", jaime: "j'aime", jadore: "j'adore", jarrive: "j'arrive", javais: "j'avais",
    jetais: "j'étais", jespere: "j'espère", jattends: "j'attends", jaurais: "j'aurais", jirai: "j'irai",
    tinquiete: "t'inquiète", tinquietes: "t'inquiète", voila: "voilà", ya: "y'a", yen: "y'en",
    peutetre: "peut-être", quelquun: "quelqu'un", quelqun: "quelqu'un", ouai: "ouais", aujourdhi: "aujourd'hui",
    parceque: "parce que", tro: "trop", tinquiet: "t'inquiète", biensur: "bien sûr", ny: "n'y", koi: "quoi",
    pa: "pas", aprés: "après", trés: "très", dejà: "déjà", déja: "déjà",
    // insults: corrected, never censored
    connar: "connard", conar: "connard", batar: "bâtard", batars: "bâtards", encul: "enculé", salo: "salaud",
    connase: "connasse", boufon: "bouffon", boufons: "bouffons", merd: "merde", putin: "putain", ptain: "putain",
    pitain: "putain", putian: "putain", enfoire: "enfoiré", niker: "niquer", niké: "niqué", gueul: "gueule",
    geule: "gueule", gueulle: "gueule", tebé: "teubé", teube: "teubé", pede: "pédé", abrutit: "abruti",
    encule: "enculé", enculee: "enculée", debile: "débile", debiles: "débiles", petasse: "pétasse",
}));
/** "enculer de ta race" → "enculé", but "va te faire enculer" keeps its infinitive */
const INSULT_NOUN_FROM_VERB = new Map([["enculer", "enculé"], ["enfoirer", "enfoiré"]]);
const INSULT_NOUN_PREV = new Set([
    "sale", "gros", "grosse", "petit", "petite", "bande", "espèce", "espece", "d", "ce", "cet", "cette", "un", "une",
    "le", "la", "les", "des", "ces", "mon", "ton", "son", "sa", "ta", "quel", "quelle", "vieux", "vieil",
]);

/** English contractions typed without apostrophe. */
const EN_TABLE = new Map(Object.entries({
    im: "I'm", ive: "I've", dont: "don't", cant: "can't", wont: "won't", didnt: "didn't", doesnt: "doesn't",
    isnt: "isn't", wasnt: "wasn't", arent: "aren't", werent: "weren't", havent: "haven't", hasnt: "hasn't",
    hadnt: "hadn't", couldnt: "couldn't", wouldnt: "wouldn't", shouldnt: "shouldn't", youre: "you're",
    youve: "you've", youll: "you'll", theyre: "they're", theyve: "they've", theyll: "they'll", thats: "that's",
    whats: "what's", wheres: "where's", whos: "who's", theres: "there's", hes: "he's", shes: "she's",
    itll: "it'll", i: "I",
}));

const SUBJECTS_A = new Set(["il", "elle", "on", "qui", "y", "ça", "ca", "cela"]);
const A_ALWAYS_NEXT = new Set(["demain", "bientôt", "bientot", "côté", "cote", "coté", "partir", "travers", "propos", "part"]);
const A_PERSON_NEXT = new Set(["toi", "moi", "vous", "tous", "toutes", "eux", "lui", "plus"]);
const A_PREV = new Set([
    "est", "suis", "es", "sommes", "êtes", "etes", "sont", "vais", "vas", "va", "allons", "allez", "vont",
    "aller", "allé", "allée", "été", "ete", "être", "etre", "était", "etait", "étais", "etais", "pense", "penses",
    "pensé", "parle", "parles", "parlé", "parler", "joue", "joues", "jouer", "joué", "jouons", "grâce", "grace",
    "jusqu", "face", "merci", "bienvenue", "salut", "bonjour", "bonsoir", "coucou", "hello", "bravo", "courage",
    "aille", "ailles", "aillent", "allait", "allais", "allaient", "arrive", "arrives", "arrivé", "habite", "habites",
    "sert", "sers", "servir", "commence", "commencé", "réussi", "reussi",
]);
const GREETINGS_TO_ALL = new Set(["merci", "salut", "bonjour", "bonsoir", "coucou", "hello", "bravo", "courage", "bienvenue"]);
const OU_NEXT = new Set(["est", "es", "sont", "êtes", "etes"]);
const OU_START_NEXT = new Set(["tu", "t", "tes", "t'es", "vous", "on", "il", "elle", "ils", "elles", "ça", "ca"]);
const ETRE = new Set([
    "suis", "es", "est", "sommes", "êtes", "etes", "sont", "était", "etait", "étais", "etais", "étaient", "etaient",
    "serai", "sera", "seras", "être", "etre",
]);
const LA_PREV = new Set(["par", "jusque", "toi", "moi", "lui", "eux", "ici", "reste", "restes", "viens", "vient", "ou", "où"]);
const LA_NEXT = new Set([
    "hier", "demain", "maintenant", "aussi", "avant", "depuis", "ce", "cette", "pour", "quand", "ou", "où", "que",
    "qu", "encore", "toujours", "aujourd",
]);
/** past participles (and adverbs) that can only follow "a"/"as", never "ta"/"ma" */
const PARTICIPLES = new Set([
    "vu", "fait", "dit", "compris", "eu", "été", "ete", "pu", "su", "mis", "pris", "mangé", "joué", "oublié", "réussi",
    "fini", "perdu", "gagné", "entendu", "regardé", "acheté", "reçu", "recu", "trouvé", "essayé", "cru", "lu", "bu",
    "capté", "tué", "frappé", "appelé", "envoyé", "demandé", "donné", "montré", "parlé", "écrit", "ecrit", "répondu",
    "repondu", "aidé", "bloqué", "invité", "quitté", "laissé", "menti", "raconté", "expliqué", "promis", "offert",
    "volé", "cassé", "battu", "soûlé", "saoulé", "soulé", "énervé", "enervé", "gavé", "sauvé", "lâché", "ghosté",
    "ignoré", "insulté", "banni", "ban", "kick", "ghost", "spam", "ping", "mute", "block", "report", "tag", "add",
    "troll", "carry", "unfollow", "encore", "déjà", "deja", "toujours", "jamais", "pas", "rien", "trop", "grave",
]);
/** adverbs of PARTICIPLES: they fit "m'a pas", not "l'a pas" */
const PARTICIPLE_ADVERBS = new Set(["encore", "déjà", "deja", "toujours", "jamais", "pas", "rien", "trop", "grave"]);
/** "il la fait" / "il la dit" are also valid present tenses */
const PRESENT_TOO = new Set(["fait", "dit"]);
/** "le serveur et mort" → "est": states that cannot be joined by "et" to a noun */
const STATE_ADJECTIVES = new Set([
    "mort", "morte", "malade", "chaud", "chaude", "fou", "folle", "nul", "nulle", "con", "conne", "beau", "belle",
    "bête", "bete", "gentil", "gentille", "parti", "partie", "prêt", "pret", "prête", "prete", "cassé", "casse",
    "fini", "finie", "down", "plein", "pleine", "vide", "ouvert", "ouverte", "fermé", "ferme", "cher", "chère",
    "chere", "nickel", "cool", "génial", "genial", "naze", "claqué", "claque", "éclaté", "eclate", "bugué", "bugue",
]);
const DETERMINERS = new Set(["le", "la", "les", "mon", "ton", "son", "ma", "ta", "sa", "ce", "cet", "cette", "notre", "votre", "leur", "mes", "tes", "ses", "nos", "vos", "leurs"]);
const NOT_PLURAL_AFTER_NUMBER = new Set([
    "mille", "cent", "janvier", "février", "fevrier", "mars", "avril", "mai", "juin", "juillet", "août", "aout",
    "septembre", "octobre", "novembre", "décembre", "decembre", "lundi", "mardi", "mercredi", "jeudi", "vendredi",
    "samedi", "dimanche", "h", "min", "fois", "euros", "ans",
]);
/** auxiliary "avoir": "j'ai manger" → "j'ai mangé" */
const AVOIR = new Set(["ai", "as", "a", "avons", "avez", "ont", "j'ai", "t'as", "m'a", "t'a", "l'a", "n'a", "y'a"]);
/** verbs followed by an infinitive: "je vais mangé" → "je vais manger" */
const MODALS = new Set([
    "vais", "vas", "va", "allons", "allez", "vont", "veux", "veut", "voulons", "voulez", "veulent", "peux", "peut",
    "pouvons", "pouvez", "peuvent", "dois", "doit", "devons", "devez", "doivent", "faut", "aller", "pouvoir",
    "vouloir", "devoir", "sais", "sait",
]);
const GRAMMAR_FR = new Set([
    "sur", "sous", "pour", "par", "avec", "dans", "chez", "vers", "entre", "et", "ou", "mais", "donc", "car", "que",
    "qui", "quand", "comme", "avant", "après", "apres", "depuis", "pendant", "contre", "selon", "dont", "le", "la",
    "les", "un", "une", "des", "du", "au", "aux", "mon", "ton", "son", "notre", "votre", "leur", "plus", "moins",
]);
/** "être" as auxiliary of motion/reflexive verbs */
const ETRE_AUX = new Set(["suis", "es", "est", "sommes", "êtes", "etes", "sont", "étais", "etais", "était", "etait", "étaient", "etaient"]);
/** prepositions always followed by an infinitive */
const INFINITIVE_PREV = new Set(["pour", "sans"]);
const ADVERBS = new Set(["pas", "jamais", "déjà", "deja", "trop", "bien", "mal", "encore", "toujours", "rien", "tout", "plus", "vraiment", "grave"]);
const SA_NEXT = new Set([
    "va", "fait", "marche", "passe", "sert", "suffit", "dépend", "depend", "arrive", "me", "m", "te", "t", "nous",
    "vous", "y", "ne", "n", "peut", "doit", "veut", "existe", "change", "craint", "rend", "reste", "coûte", "coute",
    "compte", "fonctionne", "tourne", "donne", "prend", "sent", "saoule", "soule", "casse", "devient", "commence",
    "c", "se", "s", "en", "ma",
]);
const CEST_NEXT = new Set([
    "bon", "pas", "quoi", "vrai", "normal", "mort", "chaud", "grave", "ouf", "fini", "cool", "nul", "sûr", "trop",
    "juste", "bien", "mieux", "pire", "moi", "toi", "lui", "eux", "ok", "possible", "impossible", "clair", "dingue",
    "fou", "faux", "mal", "comme", "qui", "quand", "pour", "ça", "ca", "la", "là", "ma", "ta", "mon", "ton", "un",
    "une", "le", "déjà", "deja", "très", "tres", "vraiment", "tellement", "carrément", "chiant", "drôle", "marrant",
    "nickel", "parfait", "gentil", "beau", "pareil", "logique", "rien", "toujours", "encore", "plus", "moins",
]);
const PREPOSITIONS = new Set([
    "sur", "dans", "de", "à", "a", "par", "pour", "avec", "sous", "entre", "vers", "chez", "et", "ou", "sans", "contre",
    "malgré", "selon", "pendant", "devant", "derrière", "après", "avant", "parmi", "tous", "toutes",
]);
const TES_NEXT = new Set([
    "pas", "ou", "où", "la", "là", "sur", "sûr", "sûre", "bête", "bete", "con", "conne", "fou", "folle", "ouf",
    "chiant", "chiante", "nul", "nulle", "grave", "sérieux", "serieux", "trop", "vraiment", "en", "mort", "morte",
    "malade", "qui", "ici", "bien", "beau", "belle", "moche", "drôle", "drole", "chelou", "relou", "de", "dans",
    "chez", "toujours", "encore", "déjà", "deja", "tellement", "un", "une", "le", "mon", "ma", "genre", "si",
    "trop", "pire", "fort", "forte", "nulle", "réveillé", "reveille", "prêt", "pret", "prête", "prete", "parti",
    "qu", "que",
]);
const TAS_NEXT = new Set([
    "vu", "pas", "raison", "fait", "dit", "compris", "quoi", "quel", "quelle", "eu", "été", "ete", "pu", "su",
    "mis", "pris", "encore", "déjà", "deja", "toujours", "jamais", "combien", "besoin", "envie", "peur", "tort",
    "le", "la", "les", "un", "une", "des", "du", "mangé", "joué", "oublié", "oublie", "réussi", "reussi", "fini",
    "perdu", "gagné", "entendu", "regardé", "acheté", "reçu", "recu", "trouvé", "essayé", "cru", "lu", "bu", "ton",
    "ta", "tes", "mon", "ma", "mes", "rien", "tout", "ça", "ca", "capté", "capte", "vraiment", "trop",
]);
const TAS_PREV_PILE = new Set(["un", "le", "ce", "du", "des", "gros", "petit", "ton", "mon", "son"]);
const EST_NEXT = new Set([
    "là", "pas", "parti", "partie", "mort", "morte", "malade", "chaud", "fou", "folle", "où", "trop", "vraiment",
    "en", "dans", "très", "tres", "grave", "con", "conne", "nul", "nulle", "bête", "bete", "beau", "belle",
    "gentil", "gentille", "toujours", "jamais", "déjà", "deja", "encore", "prêt", "pret", "prête", "prete",
    "bien", "mal", "ici", "chez", "ensemble", "obligé", "oblige", "tellement", "trop",
]);
const SUR_PREV = new Set(["suis", "es", "est", "sommes", "êtes", "etes", "sont", "être", "etre"]);
const SUR_NEXT_OK = new Set(["que", "qu", "de", "d", "et"]);
const JE_ELISION_NEXT = new Set([
    "ai", "aime", "aimais", "adore", "en", "y", "arrive", "avais", "aurais", "étais", "etais", "habite", "espère",
    "espere", "attends", "irai", "ignore", "essaie", "essaye", "oublie", "entends", "avoue", "imagine", "insiste",
    "accepte", "appelle", "achète", "achete", "hésite", "hesite", "étais", "écoute", "ecoute",
]);
const INVERSION_TU = new Set([
    "peux", "veux", "as", "es", "vas", "sais", "viens", "fais", "connais", "pourrais", "voudrais", "crois", "penses",
    "aimes", "joues", "habites",
]);
const INVERSION_VOUS = new Set([
    "pouvez", "voulez", "avez", "êtes", "etes", "savez", "allez", "connaissez", "pourriez", "voudriez", "venez", "faites",
]);
const QUE_ELISION_NEXT = new Set(["il", "ils", "elle", "elles", "on", "un", "une"]);
const CLITICS = new Set([
    "me", "te", "se", "le", "la", "les", "lui", "nous", "vous", "leur", "en", "y", "l", "m", "t", "s", "n", "ne",
]);
const NOT_VERBS = new Set([
    "genre", "comme", "même", "meme", "quelle", "elle", "celle", "cette", "presque", "une", "encore", "que", "ce",
    "de", "le", "me", "te", "se", "ne", "juste", "trop", "seule", "vraiment", "tellement", "toujours", "jamais",
    "les", "mes", "tes", "ses", "des", "ces", "nous", "vous", "leur", "leurs", "lui", "elles", "celles",
]);

// je/tu ↔ il/elle/on forms of the most common irregular verbs
const JE_TU_FORM = new Map(Object.entries({
    peut: "peux", veut: "veux", sait: "sais", fait: "fais", dit: "dis", voit: "vois", doit: "dois", met: "mets",
    prend: "prends", comprend: "comprends", apprend: "apprends", vient: "viens", revient: "reviens", tient: "tiens",
    part: "pars", sort: "sors", dort: "dors", ment: "mens", finit: "finis", choisit: "choisis", connait: "connais",
    connaît: "connais", croit: "crois", boit: "bois", écrit: "écris", ecrit: "écris", vit: "vis", rit: "ris",
    peu: "peux", veu: "veux", sai: "sais", fai: "fais", vien: "viens", par: "pars", cour: "cours", sor: "sors",
    dor: "dors", voi: "vois", croi: "crois", doi: "dois", pren: "prends",
}));
const IL_FORM = new Map(Object.entries({
    peux: "peut", veux: "veut", sais: "sait", fais: "fait", dis: "dit", vois: "voit", dois: "doit", mets: "met",
    prends: "prend", comprends: "comprend", apprends: "apprend", viens: "vient", reviens: "revient", tiens: "tient",
    pars: "part", sors: "sort", dors: "dort", finis: "finit", crois: "croit", connais: "connaît", vas: "va",
    vais: "va", as: "a", es: "est", peu: "peut", vien: "vient", fai: "fait", sai: "sait", veu: "veut",
    par: "part", cour: "court", sor: "sort", dor: "dort", voi: "voit", croi: "croit", doi: "doit", pren: "prend",
}));
/** "mes je sais" → "mais je sais": a possessive is always followed by a noun */
const MAIS_NEXT = new Set([
    "je", "j", "tu", "t", "il", "elle", "on", "nous", "vous", "ils", "elles", "c", "ça", "ca", "non", "oui", "pas",
    "bon", "bref", "après", "apres", "sinon", "moi", "toi", "lui", "eux", "y", "si", "quand", "comme", "pourquoi",
    "comment", "franchement", "sérieux", "serieux", "genre", "bon", "ouais", "vas", "t'es", "c'est", "j'ai", "t'as",
]);
/** plural determiners that are never pronouns: "mes ami" → "mes amis" */
const PLURAL_DET = new Set(["des", "mes", "nos", "vos", "plusieurs", "quelques"]);
const NOT_NOUNS = new Set([
    "fois", "gens", "pas", "plus", "moins", "tout", "tous", "très", "trop", "bien", "mal", "fait", "dit", "mis", "pris",
    "autre", "même", "meme", "seul", "seule", "petit", "grand", "ce", "de", "du", "en", "y", "un", "une",
]);
/** "il c'est trompé" → "il s'est trompé" */
const SEST_SUBJECTS = new Set(["il", "elle", "on"]);
/** "il ni a" → "il n'y a" */
const NY_PREV = new Set(["il", "j", "je", "on", "tu", "t", "elle", "ça", "ca", "y", "nous", "vous"]);
const NY_NEXT = new Set(["a", "avait", "aura", "aurait", "vais", "vas", "va", "allons", "allez", "vont", "est", "suis", "pense", "penses", "arrive", "arrives", "arrivons", "crois", "connais", "comprends", "peux", "peut", "touche", "touchez"]);
/** "je pense quelle est" → "qu'elle": a verb after it, a conjunction-like word before */
const QUELLE_PREV = new Set([
    "pense", "penses", "crois", "sais", "sait", "dit", "dis", "veux", "veut", "faut", "parce", "alors", "pendant",
    "avant", "pour", "bien", "sûr", "espère", "espere", "trouve", "vois", "voit", "comme", "dès", "des", "tant",
    "ainsi", "sauf", "lorsque", "même", "meme", "jure", "dirait",
]);
const QUELLE_NEXT = new Set([
    "est", "a", "va", "fait", "peut", "veut", "sait", "me", "te", "se", "le", "la", "les", "lui", "y", "en", "ne", "n",
    "m", "t", "s", "l", "part", "vient", "dit", "avait", "était", "etait", "sera", "soit", "aille", "ait", "puisse",
    "fasse", "vienne", "aime", "joue", "parle", "mange", "pense", "dort",
]);

/** "il, par exemple" / "il par la suite": "par" is a preposition there */
const PAR_PREPOSITION_NEXT = new Set(["exemple", "contre", "ailleurs", "hasard", "moments", "conséquent", "consequent"]);
/** "qui ce passe" → "qui se passe": a pronoun is what comes before a reflexive verb */
const SE_PREV = new Set(["qui", "il", "elle", "on", "ils", "elles", "ça", "ca", "cela", "ne", "n"]);
const SE_IRREGULAR = new Set([
    "fait", "font", "dit", "disent", "met", "mettent", "sent", "sentent", "sert", "servent", "voit", "voient", "rend",
    "rendent", "prend", "prennent", "tient", "tiennent", "vient", "viennent", "sont", "sera", "serait", "seront",
    "peut", "peuvent", "doit", "doivent", "bat", "battent", "tait", "plaint", "sent", "souvient", "souviennent",
    "fera", "ferait", "fini", "finit", "finissent", "barre", "casse", "calme",
]);
/** "se que tu dis" → "ce que tu dis", "se soir" → "ce soir" */
const CE_NEXT = new Set([
    "que", "qu", "qui", "soir", "matin", "midi", "weekend", "week", "moment", "jour", "mois", "mec", "gars", "truc",
    "jeu", "serveur", "message", "type", "film", "genre", "délire", "delire",
]);

const DUPLICABLE_TYPOS = new Set([
    "le", "les", "de", "des", "du", "un", "une", "et", "que", "qui", "je", "tu", "il", "elle", "ils", "en", "est",
    "the", "to", "of", "and", "for",
]);

const GREETING_COMMA = new Set([
    "salut", "bonjour", "bonsoir", "coucou", "hello", "hey", "yo", "wesh", "cc", "slt", "bjr", "oui", "non",
    "ouais", "ok", "okay", "yes", "yeah",
]);
const NO_COMMA_AFTER_GREETING = new Set([
    "à", "a", "tout", "tous", "toi", "vous", "les", "mon", "ma", "mes", "plus", "pas", "seulement", "guys",
    "everyone", "all", "there", "the", "you", "oui", "non", "ouais", "merci", "et", "ou",
]);

// ── Engine ──────────────────────────────────────────────────────────────────

interface Tok {
    t: string;
    word: boolean;
}

/** Optimal string alignment distance, aborts early beyond `max`. */
function osaDistance(a: string, b: string, max: number): number {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const rows: number[][] = [];
    for (let i = 0; i <= a.length; i++) {
        rows.push(new Array(b.length + 1).fill(0));
        rows[i][0] = i;
    }
    for (let j = 0; j <= b.length; j++) rows[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        let rowMin = Infinity;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
            rows[i][j] = v;
            if (v < rowMin) rowMin = v;
        }
        if (rowMin > max) return max + 1;
    }
    return rows[a.length][b.length];
}

class LineCorrector {
    private toks: Tok[];
    /** indexes of word tokens in `toks` */
    private words: number[];
    private plain: boolean[];
    /** words as typed, before any correction */
    private typed: string[];
    private leans: Array<Lang | "both" | null>;
    lineLang: Lang | null;

    constructor(line: string, private lex: Lexicon | null, private opts: CorrectOptions, private protectedSet: Set<string>) {
        const parts = line.split(/(\p{L}+)/u);
        this.toks = parts.map((t, i) => ({ t, word: i % 2 === 1 }));
        this.words = [];
        this.toks.forEach((tok, i) => { if (tok.word) this.words.push(i); });
        this.plain = this.words.map(i => this.isPlain(i));
        this.typed = this.words.map(i => this.toks[i].t.toLowerCase());
        this.leans = this.words.map(i => this.lean(this.toks[i].t.toLowerCase()));

        let fr = 0, en = 0;
        this.leans.forEach((l, k) => {
            if (!this.plain[k]) return;
            if (l === "fr") fr++;
            else if (l === "en") en++;
        });
        const main = opts.language === "fr" || opts.language === "en" ? opts.language : null;
        this.lineLang = !main ? null : fr > en ? "fr" : en > fr ? "en" : main;
        if (main === "en" && fr <= en) this.lineLang = "en";
    }

    private isPlain(i: number): boolean {
        const before = this.toks[i - 1]?.t ?? "";
        const after = this.toks[i + 1]?.t ?? "";
        const b = before.slice(-1);
        const a = after[0] ?? "";
        const a2 = after[1] ?? this.toks[i + 2]?.t[0] ?? "";
        if (/[0-9@#/\\=<>.:]/.test(b)) {
            // "salut.ça" never happens, but ". ça" does: only a glued dot/colon blocks.
            return false;
        }
        if (before === "_" && i > 1) return false;
        if (after === "_" && i < this.toks.length - 2) return false;
        if (/[0-9@#/\\=<>_]/.test(a)) return false;
        if ((a === "." || a === ":") && /[\p{L}\d]/u.test(a2)) return false;
        return true;
    }

    private isFr(w: string): boolean {
        const lex = this.lex!;
        return lex.frValid.has(w) || FR_TABLE.has(w) || lex.accentFix.has(w);
    }

    private lean(w: string): Lang | "both" | null {
        if (!this.lex) return null;
        const { lex } = this;
        if (LAUGHS.test(w)) return null;
        const f = this.isFr(w);
        const e = lex.enValid.has(w) || EN_TABLE.has(w);
        if (f && !e) return "fr";
        if (e && !f) return "en";
        if (!f && !e) return null;
        const table = FR_TABLE.get(w);
        const frForm = table && /^\p{L}+$/u.test(table) ? table
            : lex.frValid.has(w) ? w : lex.accentFix.get(w) ?? w;
        const fr = lex.frRank.get(frForm) ?? lex.frRank.get(w) ?? 1e6;
        const en = lex.enRank.get(w) ?? 1e6;
        if (fr * 4 <= en) return "fr";
        if (en * 4 <= fr) return "en";
        return "both";
    }

    private low(k: number): string {
        return this.toks[this.words[k]].t.toLowerCase();
    }

    private set(k: number, lower: string) {
        const tok = this.toks[this.words[k]];
        tok.t = applyCase(tok.t, lower);
    }

    /** separator between word k-1 and word k */
    private sepBefore(k: number): string {
        return this.toks[this.words[k] - 1]?.t ?? "";
    }

    /** previous word if only spaces (or an apostrophe when allowed) separate it */
    private prev(k: number, allowApos = false): string | null {
        if (k <= 0) return null;
        const sep = this.sepBefore(k);
        if (/^\s+$/.test(sep) || (allowApos && /^['’]$/.test(sep))) return this.low(k - 1);
        return null;
    }

    private next(k: number, allowApos = false): string | null {
        if (k >= this.words.length - 1) return null;
        const sep = this.sepBefore(k + 1);
        if (/^\s+$/.test(sep) || (allowApos && /^['’]$/.test(sep))) return this.low(k + 1);
        return null;
    }

    /** true when the word ends its clause (end of line or punctuation follows) */
    private endsClause(k: number): boolean {
        if (k >= this.words.length - 1) return !/^['’-]/.test(this.toks[this.words[k] + 1]?.t ?? "");
        return /[.,!?;:…)]/.test(this.sepBefore(k + 1));
    }

    private isSentenceStart(k: number): boolean {
        if (k === 0) return !/\p{L}/u.test(this.toks[0].t);
        const sep = this.sepBefore(k);
        return /[.!?]\s/.test(sep) && !/(\.\.\.|…)\s*$/.test(sep.trimEnd() + " ");
    }

    private neighbourLang(k: number): Lang | null {
        for (const d of [1, -1, 2, -2]) {
            const l = this.leans[k + d];
            if (l === "fr" || l === "en") return l;
        }
        return this.lineLang;
    }

    private ctx(k: number): Lang | null {
        const own = this.leans[k];
        return own === "fr" || own === "en" ? own : this.neighbourLang(k);
    }

    run(): string {
        if (this.lex && this.lineLang) {
            for (let k = 0; k < this.words.length; k++) this.fixWord(k);
            if (this.lineLang === "fr" || this.words.some((_, k) => this.neighbourLang(k) === "fr")) this.frenchPhraseRules();
            this.removeDuplicates();
        }
        if (this.opts.punctuation) this.capitalize();
        return this.toks.map(t => t.t).join("");
    }

    // ── word level ──

    private fixWord(k: number) {
        if (!this.plain[k]) return;
        const lex = this.lex!;
        const original = this.toks[this.words[k]].t;
        const w = original.toLowerCase();

        // iPhone, YouTube…: brand-like casing is intentional
        if (/\p{Lu}/u.test(original.slice(1)) && original !== original.toUpperCase()) return;
        // Capitalised in the middle of a sentence: probably a name
        const isName = original[0] !== w[0] && original !== original.toUpperCase() && !this.isSentenceStart(k);

        const neighbour = this.neighbourLang(k);
        const ctx = this.ctx(k);
        const glued = /^['’-]/.test(this.toks[this.words[k] + 1]?.t ?? "") || /['’-]$/.test(this.sepBefore(k));

        if (!glued && !isName) {
            const fr = FR_TABLE.get(w);
            if (fr && neighbour !== "en" && ctx !== "en") {
                this.set(k, fr);
                return;
            }
            const en = EN_TABLE.get(w);
            if (en && (neighbour === "en" || this.lineLang === "en")) {
                // "i" alone is only English when an English word is next to it
                if (w === "i" && this.leans[k + 1] !== "en" && this.leans[k - 1] !== "en" && this.lineLang !== "en") return;
                this.set(k, en);
                return;
            }
        }

        if (SLANG.has(w) || LAUGHS.test(w)) return;
        const frBig = lex.frBig.has(w);

        // "le meme est drôle" (internet meme) vs "le meme truc" (même)
        if ((w === "meme" || w === "memes") && ["le", "un", "ce", "les", "des", "ces", "mon", "ton", "son", "tes", "mes", "ses"].includes(this.prev(k) ?? "")) {
            const next = this.next(k);
            if (!next || this.endsClause(k) || ETRE.has(next) || ["a", "de", "du", "qui", "que", "sur", "avec"].includes(next)) return;
        }

        // Missing accent: "tres" → "très", "deja" → "déjà", "etait" → "était"
        const englishLine = this.lineLang === "en" && this.leans[k] !== "fr";
        if (!frBig && ctx !== "en" && neighbour !== "en" && !englishLine && !isName) {
            const accented = this.restoreAccents(w);
            if (accented && accented !== w && !lex.frValid.has(w)) {
                this.set(k, accented);
                return;
            }
        }

        const valid = lex.frValid.has(w) || lex.enValid.has(w);
        if (valid || isName || glued || this.protectedSet.has(w)) return;

        // Apostrophe forgotten: "jhabite" → "j'habite", "lhomme" → "l'homme"
        if (ctx !== "en") {
            const split = splitElision(w, x => lex.frBig.has(x) || lex.accentFix.has(x));
            if (split) {
                const rest = lex.frBig.has(split[1]) ? split[1] : lex.accentFix.get(split[1])!;
                this.set(k, `${split[0]}'${rest}`);
                return;
            }
            // "jpense", "jvais": spoken contraction of "je", kept as typed
            if (/^[jtm][^aeiouyhéèêàâîôû]/.test(w) && lex.frValid.has(w.slice(1))) return;
        }

        // Capitalised (even at sentence start) or all-caps: a name or an acronym
        if (original !== w) return;
        // "baraqués", "señoras": an inflection of a known word, just rarer
        for (const suffix of ["s", "e", "es", "x", "nt", "ent"]) {
            const stem = w.slice(0, -suffix.length);
            if (w.endsWith(suffix) && stem.length >= 3 && (lex.frValid.has(stem) || lex.enValid.has(stem))) return;
        }
        const suggestion = this.suggest(w, ctx);
        if (suggestion) this.set(k, suggestion);
    }

    /** "tres" → "très"; "soulé" → "soûlé" (keeps the accents already typed) */
    private restoreAccents(w: string): string | null {
        const lex = this.lex!;
        const s = stripAccents(w);
        if (s === w) return lex.accentFix.get(s) ?? null;
        if (lex.frRank.has(w)) return null;
        // "écrie" is a present form of "écrier", not a typo of "écrié"
        if (w.endsWith("e") && lex.frBig.has(w + "r")) return null;
        const typed = [...w];
        const options = (lex.accentGroups.get(s) ?? []).filter(v => {
            const chars = [...v];
            return chars.length === typed.length && typed.every((ch, i) => stripAccents(ch) === ch || chars[i] === ch);
        });
        return options.length === 1 || (options.length > 1 && (lex.frCount.get(options[0]) ?? 0) >= 3 * (lex.frCount.get(options[1]) ?? 0) && (lex.frCount.get(options[0]) ?? 0) > 0)
            ? options[0] : null;
    }

    private suggest(w: string, ctx: Lang | null): string | null {
        const lex = this.lex!;
        if (w.length < 4 || w.length > 24) return null;
        if (!HAS_VOWEL.test(w) || /(.)\1\1/.test(w)) return null;

        const s = stripAccents(w);
        // one typo at most: two edits away is a different word (or a brand name)
        const maxD = 1;
        const found: Array<Candidate & { d: number; }> = [];
        for (let len = s.length - maxD; len <= s.length + maxD; len++) {
            for (const c of lex.buckets.get(len) ?? []) {
                if (c.stripped === s && c.word === w) return null;
                // only suggest in the language being written
                if (ctx && c.lang !== ctx) continue;
                const d = osaDistance(s, c.stripped, maxD);
                if (d <= maxD) found.push({ ...c, d });
            }
        }
        if (!found.length) return null;
        const dMin = Math.min(...found.map(c => c.d));
        // accent-only difference (d = 0) is always the best explanation
        const best = found
            .filter(c => c.d === dMin)
            .map(c => ({ ...c, score: c.count * (ctx && c.lang === ctx ? 5 : 1) }))
            .sort((a, b) => b.score - a.score);
        // Same spelling in both languages counts once
        const uniq = best.filter((c, i) => best.findIndex(o => o.word === c.word) === i);
        const [first, second] = uniq;
        const margin = s.length <= 5 ? 20 : 5;
        if (second && first.score < margin * second.score) return null;
        // a typo almost never hits the first letter: "busqué" is not "jusque"
        if (stripAccents(first.word[0]) !== s[0]) return null;
        // accents typed on purpose stay: "éclôt" is not "éclat"
        const typedAccents = [...w].filter(ch => stripAccents(ch) !== ch);
        if (typedAccents.some(ch => !first.word.includes(ch))) return null;
        return first.word;
    }

    // ── phrase level (French) ──

    private frenchPhraseRules() {
        const n = this.words.length;
        for (let k = 0; k < n; k++) {
            const local = this.neighbourLang(k);
            if (!this.plain[k]) continue;
            if (this.lineLang === "en" ? local !== "fr" : local === "en" && this.leans[k] !== "fr") continue;
            const w = this.low(k);
            const prev = this.prev(k);
            const next = this.next(k);
            const prevApos = this.prev(k, true);

            switch (w) {
                case "a": {
                    // "c'est a dire" → "c'est-à-dire"
                    if (next === "dire" && (prev === "c'est" || (prev === "est" && this.prev(k - 1, true) === "c"))) {
                        this.toks[this.words[k] - 1].t = "-";
                        this.toks[this.words[k] + 1].t = "-";
                        this.set(k, "à");
                        break;
                    }
                    if (prev && SUBJECTS_A.has(prev)) break;
                    const next2 = k + 2 < n && next ? this.next(k + 1) : null;
                    if (next && A_ALWAYS_NEXT.has(next)) this.set(k, "à");
                    else if (next === "cause" && next2 && ["de", "d", "du", "qu", "que"].includes(next2)) this.set(k, "à");
                    else if (next === "peu" && next2 && ["près", "pres"].includes(next2)) this.set(k, "à");
                    else if (next === "chaque" && next2 === "fois") this.set(k, "à");
                    else if (next && ["tous", "toutes", "vous", "toi"].includes(next) && this.endsClause(k + 1)) this.set(k, "à");
                    else if (next && A_PERSON_NEXT.has(next) && (k === 0 || (prev && (A_PREV.has(prev) || GREETINGS_TO_ALL.has(prev))))) {
                        if (next !== "plus" || k === 0) this.set(k, "à");
                    } else if (prev && A_PREV.has(prev) && next && !["été", "ete", "eu", "fait", "dit", "pas"].includes(next)) this.set(k, "à");
                    else if (prevApos === "jusqu" || prev === "grâce" || prev === "grace") this.set(k, "à");
                    else if ((this.toks[this.words[k] + 1]?.t ?? "").startsWith("+")) this.set(k, "à");
                    // "le stream commence a 20h"
                    else if (prev && A_PREV.has(prev) && /^ \d/.test(this.toks[this.words[k] + 1]?.t ?? "")) this.set(k, "à");
                    break;
                }
                case "à":
                    if (k >= 1 && /-$/.test(this.sepBefore(k - 1))) break;
                    if (prev && SUBJECTS_A.has(prev)) this.set(k, "a");
                    else if (prev === "tu") this.set(k, "as");
                    break;
                case "ou":
                    if ((next && OU_NEXT.has(next)) || prevApos === "d" || prev === "par" || prevApos === "jusqu") this.set(k, "où");
                    else if (k === 0 && next && OU_START_NEXT.has(next)) this.set(k, "où");
                    else if (k > 0 && this.endsClause(k) && prev && prev !== "et" && !this.endsClause(k - 1)) this.set(k, "où");
                    // "on est ou la" → "on est où là"
                    else if (prev && ETRE.has(prev) && (next === "la" || next === "là") && this.endsClause(k + 1)) this.set(k, "où");
                    break;
                case "là":
                    break;
                case "ta":
                    // "ta vu" → "t'as vu", "il ta dit" → "il t'a dit"
                    if (next && (PARTICIPLES.has(next) || this.isErParticiple(next))) this.set(k, prev && SUBJECTS_A.has(prev) ? "t'a" : "t'as");
                    else if (next && ["raison", "tort"].includes(next) && this.isSentenceStart(k)) this.set(k, "t'as");
                    break;
                case "ma":
                    if (next && (PARTICIPLES.has(next) || this.isErParticiple(next))) this.set(k, "m'a");
                    break;
                case "les":
                case "la": {
                    // "je les vu" → "je l'ai vu", "tu la vu" → "tu l'as vu", "il la traité" → "il l'a traité"
                    // "il est la" / "c'est par la" / "il était la hier" → "là"
                    if (w === "la" && prev && (LA_PREV.has(prev) || ETRE.has(prev)) && (this.endsClause(k) || (next && LA_NEXT.has(next)))) {
                        this.set(k, "là");
                        break;
                    }
                    if (!prev || !next || PRESENT_TOO.has(next) || PARTICIPLE_ADVERBS.has(next)) break;
                    if (!PARTICIPLES.has(next) && !this.isErParticiple(next)) break;
                    if (prev === "je") this.set(k, "l'ai");
                    else if (w === "la" && prev === "tu") this.set(k, "l'as");
                    else if (w === "la" && SUBJECTS_A.has(prev)) this.set(k, "l'a");
                    break;
                }
                case "lai":
                case "lavait":
                case "lavais":
                    // "je lai vu" → "je l'ai vu", but "il lavait la vaisselle" is right
                    if (next && PARTICIPLES.has(next)) this.set(k, "l'" + w.slice(1));
                    break;
                case "enculer":
                case "enfoirer":
                    if (k === 0 || this.isSentenceStart(k) || (this.prev(k, true) && INSULT_NOUN_PREV.has(this.prev(k, true)!)))
                        this.set(k, INSULT_NOUN_FROM_VERB.get(w)!);
                    break;
                case "sont": {
                    // "il sont" → "ils sont", but "lui et elle sont" is already right
                    const before = k >= 2 ? this.prev(k - 1) : null;
                    if ((prev === "il" || prev === "elle") && !["et", "ou", "ni"].includes(before ?? "")) this.set(k - 1, prev + "s");
                    break;
                }
                case "sa":
                    if (prev === "part" && k >= 2 && ["à", "a"].includes(this.prev(k - 1) ?? "")) this.set(k, "ça");
                    else if ((next && SA_NEXT.has(next)) || (this.endsClause(k) && k > 0)) this.set(k, "ça");
                    else if (k === 0 && this.endsClause(k)) this.set(k, "ça");
                    break;
                case "ces":
                case "ses":
                    // "sur ses pas", "de ces gens": a determiner after a preposition
                    if (prev && PREPOSITIONS.has(prev)) break;
                    if (next && CEST_NEXT.has(next) && !(w === "ses" && ["la", "le", "un", "une", "mon", "ton", "ma", "ta"].includes(next))) this.set(k, "c'est");
                    break;
                case "tes":
                    if ((next && TES_NEXT.has(next)) || (this.endsClause(k) && k > 0 && prev !== "les")) this.set(k, "t'es");
                    break;
                case "tas":
                    if (next && TAS_NEXT.has(next) && !(prev && TAS_PREV_PILE.has(prev))) this.set(k, "t'as");
                    break;
                case "et":
                    const nounSubject = prev && k >= 2 && DETERMINERS.has(this.prev(k - 1) ?? "") && !this.lex!.frBig.has(prev + "e") && next && STATE_ADJECTIVES.has(next)
                        && (this.endsClause(k + 1) || ["ou", "de", "la", "là"].includes(this.next(k + 1) ?? ""));
                    if (nounSubject) { this.set(k, "est"); break; }
                    if (prevApos === "c" || (prev && ["il", "elle", "on"].includes(prev) && next && (EST_NEXT.has(next) || next === "ou" || (prev === "on" && next === "la")))) {
                        if (prevApos === "c" && this.sepBefore(k) === " ") this.joinWithApostrophe(k - 1, "c", "est");
                        else this.set(k, "est");
                    }
                    break;
                case "son":
                    if (prev === "ils" || prev === "elles") this.set(k, "sont");
                    break;
                case "on":
                    if (prev === "ils" || prev === "elles") this.set(k, "ont");
                    break;
                case "ce": {
                    // "ce qui ce passe" → "ce qui se passe", "ça ce voit" → "ça se voit"
                    if (prev && SE_PREV.has(prev) && next && this.isVerbForm(next)) this.set(k, "se");
                    break;
                }
                case "se":
                    if (next && CE_NEXT.has(next) && !(prev && SE_PREV.has(prev))) this.set(k, "ce");
                    else if (next === "n" && k + 2 < n && this.low(k + 2) === "est") this.set(k, "ce");
                    break;
                case "mes":
                    // "mes je sais pas" → "mais je sais pas"
                    if (next && MAIS_NEXT.has(next) && !(this.toks[this.words[k + 1]]?.t ?? "").match(/^\p{Lu}/u)) this.set(k, "mais");
                    break;
                case "tout":
                    // "tout les jours" → "tous les jours"
                    if (next === "les" || next === "ces" || next === "mes" || next === "tes" || next === "ses" || next === "nos" || next === "vos" || next === "leurs") this.set(k, "tous");
                    break;
                case "tous":
                    // "tous le monde" → "tout le monde"
                    if (next === "le" && k + 2 < n && ["monde", "temps", "reste"].includes(this.low(k + 2))) this.set(k, "tout");
                    else if (next === "la" && k + 2 < n && ["journée", "journee", "nuit", "semaine", "soirée", "soiree"].includes(this.low(k + 2))) this.set(k, "toute");
                    break;
                case "même":
                case "meme":
                    // "comme même" → "quand même"
                    if (prev === "comme" && this.sepBefore(k) === " ") { this.set(k - 1, "quand"); this.set(k, "même"); }
                    break;
                case "été":
                    if (prev && ["il", "elle", "on", "c", "ça", "ca", "cela"].includes(prev) && this.toks[this.words[k]].t.toLowerCase() === "été" && this.typedWithoutAccent(k)) this.set(k, "était");
                    else if (prev && ["je", "j", "tu", "t"].includes(prev) && this.typedWithoutAccent(k)) this.set(k, "étais");
                    break;
                case "fait":
                    // "fait gaffe" → "fais gaffe" (imperative)
                    if (this.isSentenceStart(k) && next && ["gaffe", "attention", "vite", "genre"].includes(next)) this.set(k, "fais");
                    else if (this.isSentenceStart(k) && next === "pas" && k + 2 < n && ["genre", "le", "la", "ça", "ca", "ton", "ta", "chier", "gaffe"].includes(this.low(k + 2)) && this.low(k + 2) !== "chier") this.set(k, "fais");
                    break;
                case "faite":
                    // "en faite" / "au faite" → "en fait" / "au fait"
                    if (prev === "en" || prev === "au") this.set(k, "fait");
                    break;
                case "c'est":
                case "cest":
                    if (prev && SEST_SUBJECTS.has(prev)) this.set(k, "s'est");
                    break;
                case "c":
                    // "on c vu" → "on s'est vu", "c bon" → "c'est bon"
                    if (prev && SEST_SUBJECTS.has(prev) && next && PARTICIPLES.has(next)) this.set(k, "s'est");
                    else if (prev && SEST_SUBJECTS.has(prev) && /^['’]$/.test(this.sepBefore(k + 1)) && this.low(k + 1) === "est") this.set(k, "s");
                    else if (next && CEST_NEXT.has(next) && this.sepBefore(k + 1) === " " && this.toks[this.words[k]].t === w) this.set(k, "c'est");
                    break;
                case "ni":
                    if (prev && NY_PREV.has(prev) && next && NY_NEXT.has(next)) this.set(k, "n'y");
                    break;
                case "na":
                    if (next && ["pas", "plus", "jamais", "rien", "que", "qu", "personne"].includes(next)) this.set(k, "n'a");
                    break;
                case "quelle":
                    if (prev && QUELLE_PREV.has(prev) && next && QUELLE_NEXT.has(next)) this.set(k, "qu'elle");
                    break;
                case "oubli":
                    if (next && ["pas", "jamais", "surtout"].includes(next)) this.set(k, "oublie");
                    break;
                case "peu":
                case "peut":
                    // "peut etre demain" → "peut-être demain" (but "il peut être là")
                    // only where no subject can come before: "le prix peut être élevé" stays
                    if (next && ["etre", "être"].includes(next) && this.sepBefore(k + 1) === " "
                        && (this.isSentenceStart(k) || (prev && ["mais", "et", "ou", "bah", "ben", "oui", "non", "ouais", "alors", "donc", "ok", "sinon", "bon", "enfin"].includes(prev)))) {
                        this.toks[this.words[k + 1] - 1].t = "-";
                        this.set(k, "peut");
                        this.set(k + 1, "être");
                    }
                    break;
                case "bien":
                    // "bien sur" at the end or start → "bien sûr"
                    if (next === "sur" && (this.isSentenceStart(k) || this.endsClause(k + 1))) this.set(k + 1, "sûr");
                    break;
                case "sur":
                    if (prevApos && SUR_PREV.has(prevApos) && (this.endsClause(k) || (next && SUR_NEXT_OK.has(next)))) this.set(k, "sûr");
                    break;
                case "est":
                    if (prev === "tu") this.set(k, "es");
                    else if (prev === "c" && this.sepBefore(k) === " ") this.joinWithApostrophe(k - 1, "c", "est");
                    break;
            }

            // Missing apostrophe after a lone letter: "j ai" → "j'ai", "c est" → "c'est"
            const isLowerLetter = this.toks[this.words[k]].t === w;
            if (isLowerLetter && ["j", "l", "d", "n", "m", "s", "t", "c", "qu"].includes(w) && k < n - 1 && this.sepBefore(k + 1) === " ") {
                const nx = this.low(k + 1);
                if (w === "c" && nx === "et") this.joinWithApostrophe(k, "c", "est");
                else if (VOWEL_START.test(nx) && nx !== "et" && nx !== "ou" && (this.lex!.frValid.has(nx) || nx === "y")) this.joinWithApostrophe(k, w, nx);
            }
            if (w === "je" && next && JE_ELISION_NEXT.has(next)) this.joinWithApostrophe(k, "j", next);
            if ((w === "que" && next && QUE_ELISION_NEXT.has(next)) || (w === "si" && (next === "il" || next === "ils")))
                this.joinWithApostrophe(k, w === "que" ? "qu" : "s", next!);
            if (w === "ce" && next === "est") this.joinWithApostrophe(k, "c", "est");
            // "est ce que" → "est-ce que", "peux tu venir" → "peux-tu venir"
            if (w === "est" && next === "ce" && k + 2 < n && ["que", "qu"].includes(this.low(k + 2)) && this.sepBefore(k + 1) === " ")
                this.toks[this.words[k + 1] - 1].t = "-";
            if (k === 0 && next && this.sepBefore(1) === " " && ((next === "tu" && INVERSION_TU.has(w)) || (next === "vous" && INVERSION_VOUS.has(w))))
                this.toks[this.words[1] - 1].t = "-";

            this.accentFromGrammar(k);
            this.conjugation(k);
            this.participleOrInfinitive(k);
            this.pluralAfterDeterminer(k);
            this.pluralAfterNumber(k);
        }
    }

    private accentFromGrammar(k: number) {
        const lex = this.lex!;
        const w = this.low(k);
        if (!this.plain[k] || stripAccents(w) !== w || lex.frValid.has(w) || lex.accentFix.has(w) || this.neighbourLang(k) === "en") return;
        const options = lex.accentGroups.get(w);
        if (!options || options.length < 2) return;
        let j = k - 1;
        while (j >= 0 && CLITICS.has(this.low(j)) && /^\s+$|^['’]$/.test(this.sepBefore(j + 1))) j--;
        const subj = j >= 0 && /^\s+$|^['’]$/.test(this.sepBefore(j + 1)) ? this.low(j) : null;
        if (!subj) return;
        let pick: string[] = [];
        if (["je", "j", "tu", "il", "elle", "on", "ils", "elles"].includes(subj)) pick = options.filter(o => !o.endsWith("é") && !o.endsWith("ée"));
        else if (AVOIR.has(subj) || ETRE_AUX.has(subj)) pick = options.filter(o => o.endsWith("é"));
        if (pick.length === 1) this.set(k, pick[0]);
    }

    /** "2 minute" → "2 minutes" */
    private pluralAfterNumber(k: number) {
        const lex = this.lex!;
        const w = this.low(k);
        const sep = this.sepBefore(k);
        const m = /(?:^|\s)(\d+) $/.exec(sep);
        if (!m || Number(m[1]) < 2 || Number(m[1]) >= 1000 || !this.plain[k] || w.length < 3 || /[sxz]$/.test(w) || NOT_PLURAL_AFTER_NUMBER.has(w)) return;
        if (this.typed[k] !== this.toks[this.words[k]].t || PREPOSITIONS.has(w) || NOT_NOUNS.has(w) || GRAMMAR_FR.has(w)) return;
        // "le 2 mai", "du 3 au 5": dates
        if (k > 0 && /^\s*$/.test(sep.slice(0, m.index)) && ["le", "la", "du", "au", "les", "version", "page", "saison", "chapitre", "numéro", "numero"].includes(this.low(k - 1))) return;
        if (!lex.frBig.has(w) || this.isFirstGroupVerb(w)) return;
        const plural = lex.frBig.has(w + "s") ? w + "s" : null;
        if (plural && (lex.frCount.get(plural) ?? 0) > 0) this.set(k, plural);
    }

    /** "mes ami" → "mes amis", "des truc" → "des trucs" */
    private pluralAfterDeterminer(k: number) {
        const lex = this.lex!;
        const w = this.low(k);
        const prev = this.prev(k);
        if (!this.plain[k] || !prev || !PLURAL_DET.has(prev) || w.length < 3 || NOT_NOUNS.has(w)) return;
        if (/[sxz]$/.test(w) || !lex.frBig.has(w)) return;
        // a verb form ("des mange") is never what follows: only nouns/adjectives get an "s"
        if (this.isFirstGroupVerb(w) && !lex.frBig.has(w + "s")) return;
        const plural = lex.frBig.has(w + "s") ? w + "s" : /(?:al)$/.test(w) && lex.frBig.has(w.slice(0, -2) + "aux") ? w.slice(0, -2) + "aux"
            : /(?:eau|eu)$/.test(w) && lex.frBig.has(w + "x") ? w + "x" : null;
        // "des" after a verb can be "de + les" before a singular mass noun? never: it is always plural
        if (plural && (lex.frCount.get(plural) ?? 0) > 0) this.set(k, plural);
    }

    /** "j'ai manger" → "j'ai mangé", "je vais mangé" → "je vais manger" */
    private participleOrInfinitive(k: number) {
        const lex = this.lex!;
        const w = this.low(k);
        if (!this.plain[k] || w.length < 5) return;
        let prev = this.prev(k, false);
        if (prev && ADVERBS.has(prev) && k >= 2) prev = this.prev(k - 1, false);
        if (!prev) return;
        // "j'ai était" → "j'ai été"
        if (AVOIR.has(prev) && (w === "était" || w === "etait")) return this.set(k, "été");
        // "je suis aller" → "je suis allé" (être as auxiliary; "c'est manger" stays)
        const beforePrev = k >= 2 ? this.prev(k - 1, true) : null;
        if (ETRE_AUX.has(prev) && beforePrev !== "c" && w.endsWith("er") && lex.frBig.has(w)) {
            const participle = w.slice(0, -2) + "é";
            if (lex.frBig.has(participle) && (lex.frRank.get(w) ?? Infinity) <= 30000) this.set(k, participle);
            return;
        }
        // "pour mangé" → "pour manger", "en train de mangé"
        const infinitivePrev = INFINITIVE_PREV.has(prev) || (prev === "de" && beforePrev === "train");
        if (infinitivePrev && w.endsWith("é") && w !== "été" && lex.frBig.has(w)) {
            const infinitive = w.slice(0, -1) + "er";
            if (lex.frBig.has(infinitive) && (lex.frRank.get(infinitive) ?? Infinity) <= 30000) this.set(k, infinitive);
            return;
        }
        if (AVOIR.has(prev) && w.endsWith("er") && lex.frBig.has(w)) {
            const participle = w.slice(0, -2) + "é";
            // "il a à manger" keeps its infinitive; "a" turned into "à" above already
            if (lex.frBig.has(participle) && (lex.frRank.get(w) ?? Infinity) <= 30000) this.set(k, participle);
        } else if (MODALS.has(prev) && w.endsWith("é") && w !== "été" && lex.frBig.has(w)) {
            const infinitive = w.slice(0, -1) + "er";
            if (lex.frBig.has(infinitive) && (lex.frRank.get(infinitive) ?? Infinity) <= 30000) this.set(k, infinitive);
        }
    }

    /** word k becomes `left'` and swallows the following word */
    private joinWithApostrophe(k: number, left: string, right: string) {
        const tok = this.toks[this.words[k]];
        const nextTok = this.toks[this.words[k + 1]];
        if (!nextTok) return;
        tok.t = applyCase(tok.t, left) + "'" + applyCase(nextTok.t, right);
        this.toks[this.words[k + 1] - 1].t = "";
        nextTok.t = "";
        this.plain[k + 1] = false;
    }

    /** "traité": the past participle of a common -er verb (never a noun like "clé") */
    private isErParticiple(word: string): boolean {
        if (!word.endsWith("é") || word === "été") return false;
        const lex = this.lex!;
        return lex.frBig.has(word) && (lex.frRank.get(word.slice(0, -1) + "er") ?? Infinity) <= 30000;
    }

    /** the word was typed without its accents ("ete") and fixed by the accent pass */
    private typedWithoutAccent(k: number): boolean {
        return this.typed[k] !== undefined && stripAccents(this.typed[k]) === this.typed[k] && this.typed[k] !== this.low(k);
    }

    /** "parle" is a present form of a common -er verb ("parler") */
    private isFirstGroupVerb(form: string): boolean {
        const lex = this.lex!;
        return lex.frBig.has(form) && (lex.frRank.get(form + "r") ?? Infinity) <= 30000;
    }

    /** a conjugated verb that can follow the reflexive "se" */
    private isVerbForm(word: string): boolean {
        if (SE_IRREGULAR.has(word)) return true;
        if (word.endsWith("ent")) return this.isFirstGroupVerb(word.slice(0, -2));
        return word.endsWith("e") && this.isFirstGroupVerb(word);
    }

    /** pronoun/verb agreement: "tu peut" → "tu peux", "il fais" → "il fait" */
    private conjugation(k: number) {
        const lex = this.lex!;
        // "parle" is a present form of a common -er verb ("parler")
        const isFirstGroupVerb = (form: string) => this.isFirstGroupVerb(form);
        const w = this.low(k);
        if (!this.plain[k] || CLITICS.has(w)) return;
        let j = k - 1;
        let hops = 0;
        while (j >= 0 && hops < 2 && CLITICS.has(this.low(j)) && /^\s+$|^['’]$/.test(this.sepBefore(j + 1))) { j--; hops++; }
        if (j < 0 || !/^\s+$|^['’]$/.test(this.sepBefore(j + 1))) return;
        const subj = this.low(j);
        // "c'est elle qui" / "dis-le" etc.: the subject must stand on its own
        if (j > 0 && /-$/.test(this.sepBefore(j))) return;

        const next = this.toks[this.words[k] + 1]?.t ?? "";
        if (/^-/.test(next)) return;
        if (w === "par") {
            const after = this.next(k);
            if (!after || PAR_PREPOSITION_NEXT.has(after) || (after === "la" && this.next(k + 1) === "suite")) return;
        }

        if (subj === "je" || subj === "tu") {
            const form = JE_TU_FORM.get(w);
            if (form) return this.set(k, form);
            if (subj === "je" && w === "vas") return this.set(k, "vais");
            if (subj === "tu" && (w === "vais" || w === "va")) return this.set(k, "vas");
            if (subj === "tu" && w === "a") return this.set(k, "as");
            if (NOT_VERBS.has(w) || w.length < 4) return;
            if (subj === "tu" && w.endsWith("e") && isFirstGroupVerb(w) && lex.frBig.has(w + "s")) return this.set(k, w + "s");
            if (subj === "je" && w.length >= 5 && w.endsWith("es") && isFirstGroupVerb(w.slice(0, -1)) && lex.frBig.has(w)) return this.set(k, w.slice(0, -1));
        } else if (subj === "il" || subj === "elle" || subj === "on") {
            const form = IL_FORM.get(w);
            if (form) return this.set(k, form);
            if (NOT_VERBS.has(w) || w.length < 5) return;
            if (w.endsWith("es") && isFirstGroupVerb(w.slice(0, -1)) && lex.frBig.has(w)) return this.set(k, w.slice(0, -1));
        } else if (subj === "ils" || subj === "elles") {
            if (NOT_VERBS.has(w) || w.length < 4) return;
            if (w.endsWith("e") && isFirstGroupVerb(w) && lex.frBig.has(w + "nt")) return this.set(k, w + "nt");
        }
    }

    private endsWithQuestionMark(): boolean {
        return /\?\s*$/.test(this.toks.map(t => t.t).join(""));
    }

    private removeDuplicates() {
        for (let k = 1; k < this.words.length; k++) {
            const w = this.low(k);
            if (!w || !this.plain[k] || !DUPLICABLE_TYPOS.has(w)) continue;
            if (this.sepBefore(k) !== " " || this.low(k - 1) !== w) continue;
            if (k >= 2 && /['’-]$/.test(this.sepBefore(k - 1))) continue;
            this.toks[this.words[k] - 1].t = "";
            this.toks[this.words[k]].t = "";
        }
    }

    private capitalize() {
        for (let k = 0; k < this.words.length; k++) {
            const tok = this.toks[this.words[k]];
            if (!tok.t || !this.plain[k] || !this.isSentenceStart(k)) continue;
            if (k === 0 && /[@\d]/.test(this.toks[0].t)) continue;
            tok.t = tok.t[0].toUpperCase() + tok.t.slice(1);
        }
    }
}

// ── Punctuation ─────────────────────────────────────────────────────────────

const FR_QUESTION_START = new RegExp("^(?:" + [
    "pourquoi", "comment", "combien", "quel(?:le)?s?", "lequel", "laquelle", "lesquel(?:le)?s", "est[- ]ce",
    "qu'est[- ]ce", "c'est (?:quoi|qui|ou|quand|combien|comment)", "ou (?:est|es|sont|t'es|tu|vous|on|il|elle|ca)",
    "tu (?:peux|pourrais|veux|voudrais|connais|crois que|penses que|sais (?:quoi|pourquoi|comment|si|ou|quand|qui))",
    "vous (?:pouvez|pourriez|voulez|voudriez|connaissez|savez)", "t'as (?:vu|pense|compris|capte|entendu|deja|quel|combien)",
    "ca (?:te|vous) (?:dit|va|tente)", "qui (?:est|a|veut|peut|vient|joue|fait|sait|va|connait|m'|t'|c'est)",
    "(?:il )?y'? ?a (?:qui|quelqu'un|moyen)", "(?:tu|vous|on|il|elle|ils|elles) (?:\\p{L}+ ){1,2}quoi",
    "tu viens(?: (?:ce soir|demain|avec (?:moi|nous)|jouer|ou pas|ou quoi))?$",
    "(?:salut|coucou|bonjour|bonsoir|hello|cc|slt|yo|wesh|hey)(?: \\p{L}+)? ca va$", "ca va(?: bien)?(?: \\p{L}+)? et (?:toi|vous)$",
].join("|") + ")(?![\\p{L}'])", "u");
const FR_QUESTION_ANYWHERE = /\b\p{L}+-(?:t-)?(?:tu|vous|il|elle|on|ils|elles|je)\b|\best[- ]ce qu|\bou (?:quoi|pas|non)$|\bet (?:toi|vous)$/u;
const FR_QUESTION_END = /\b(?:quoi|quand|ou|comment|combien|pourquoi|qui)(?: la)?$/;
const EN_QUESTION_START = /^(?:(?:what|why|how|where|who|whom|whose|which|wanna|anyone|anybody)\b(?! an? )|(?:do|does|did|can|could|would|will|should|shall|is|are|am|was|were|have|has|had|may|might|must|isn't|aren't|don't|doesn't|didn't|can't|won't|wouldn't|couldn't|shouldn't) (?:i|you|u|we|they|he|she|it|this|that|these|those|there|ya|y'all|anyone|anybody|someone|somebody|everyone|ur|your|my|his|her|their|our|the|a|any)\b)/;

const GREETING_PREFIX = /^(?:salut|coucou|bonjour|bonsoir|hello|cc|slt|yo|wesh|hey|re) (?=ca va\b)/;

/**
 * "yes" → add "?", "no" → a statement, "maybe" → an intonation question
 * ("tu viens ce soir") that cannot be told apart from a statement: add nothing.
 */
function questionKind(content: string, lang: Lang): "yes" | "no" | "maybe" {
    const normalized = stripAccents(content.replace(/@@\d+@@/g, " ").toLowerCase()).replace(/[’]/g, "'");
    // only the last clause decides: "tu sais quoi, j'en ai marre" is a statement
    const clauses = normalized.split(/[,;:.!?]/).map(c => c.replace(/[^\p{L}\p{N}'\- ]+/gu, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
    const s = (clauses.length === 2 && GREETING_COMMA.has(clauses[0]) ? clauses.join(" ") : clauses.at(-1) ?? "").replace(GREETING_PREFIX, "");
    if (lang === "en") return EN_QUESTION_START.test(s) ? "yes" : "no";

    if (s === "ca va" && GREETING_PREFIX.test(clauses.join(" "))) return "yes";
    // "quel enfoiré", "quelle honte" are exclamations
    if (/^quel(?:le)?s? /.test(s) && !/\b(?:tu|t'|vous|il|elle|on|je|j'|ils|elles|c'est|est|sont)\b/.test(s)) return "maybe";
    if (FR_QUESTION_START.test(s) || FR_QUESTION_ANYWHERE.test(s)) return "yes";
    if (/\b(?:est|es|sont|etes|suis|sommes|etait) ou\b/.test(s) && !/\bla ou\b/.test(s)) return "yes";
    if (FR_QUESTION_END.test(s) && /\b(?:tu|t'|vous|on|il|elle|ils|elles|c'est|ca)\b/.test(s)
        && !/\b(?:je|j'|moi)\b/.test(s) && !/\b(?:sais|sait|savons|savez|savent) pas\b/.test(s)) return "yes";
    if (/^(?:tu|t'|vous|on)\b/.test(s)) return "maybe";
    return "no";
}

const ENDS_WITHOUT_PUNCT = /[\p{L}\p{N}]$/u;
const EMOTICON_END = /(?:[:;=8][-']?[)(DPpOo3/\\|*]|<3|\^\^|-_-|\bx[dD]|XD)$/;

function punctuateLine(content: string, lang: Lang | null, opts: CorrectOptions, isListItem: boolean): string {
    let s = content;

    // spacing
    s = s.replace(/(\S) {2,}(?=\S)/g, "$1 ");
    s = s.replace(/(\p{L}) +([,.])(?!\.)/gu, "$1$2");
    s = s.replace(/(\p{L}),(?=\p{L})/gu, "$1, ");

    if (lang === "fr") {
        // "Salut ça va" → "Salut, ça va"
        s = s.replace(/^([^\p{L}]*)(\p{L}+) (\p{L}+)/u, (m, lead: string, first: string, second: string) => {
            const f = first.toLowerCase();
            if (!GREETING_COMMA.has(f) || NO_COMMA_AFTER_GREETING.has(second.toLowerCase()) || f === second.toLowerCase()) return m;
            return `${lead}${first}, ${second}`;
        });
        // "je veux mais je peux pas" → "je veux, mais je peux pas"
        s = s.replace(/(\p{L}+ \p{L}+) mais (?=\p{L})/gu, (m, before: string) => {
            const last = before.split(" ").pop()!.toLowerCase();
            return ["non", "et", "ou", "oui", "ah", "oh", "bah", "ben", "bon"].includes(last) ? m : `${before}, mais `;
        });
        if (opts.frenchSpacing) {
            s = s.replace(/(\p{L})([?!]+)/gu, "$1 $2");
            s = s.replace(/(\p{L})([:;])(?=\s|$)/gu, "$1 $2");
        }
    } else if (lang === "en") {
        s = s.replace(/^([^\p{L}]*)(\p{L}+) (\p{L}+)/u, (m, lead: string, first: string, second: string) => {
            const f = first.toLowerCase();
            if (!["yes", "yeah", "hey", "hello", "ok", "okay"].includes(f) || NO_COMMA_AFTER_GREETING.has(second.toLowerCase())) return m;
            return `${lead}${first}, ${second}`;
        });
        s = s.replace(/(\p{L}) +([?!]+)/gu, "$1$2");
    }

    // final punctuation
    const trimmed = s.trimEnd();
    const lastWord = (trimmed.match(/\p{L}+$/u)?.[0] ?? "").toLowerCase();
    if (lang && trimmed && ENDS_WITHOUT_PUNCT.test(trimmed) && !EMOTICON_END.test(trimmed) && !LAUGHS.test(lastWord)) {
        const wordCount = trimmed.split(/\s+/).filter(x => /[\p{L}\p{N}]/u.test(x)).length;
        const kind = questionKind(trimmed, lang);
        if (kind === "yes") s = trimmed + (lang === "fr" && opts.frenchSpacing ? " ?" : "?") + s.slice(trimmed.length);
        else if (kind === "no" && opts.finalPeriod && wordCount >= 3 && !isListItem) s = trimmed + "." + s.slice(trimmed.length);
    }
    return s;
}

// ── Public API ──────────────────────────────────────────────────────────────

const LINE_PREFIX = /^(\s*(?:>>> |> |-# |#{1,3} |[-*+] |\d+[.)] )*)/;

export function correctMessage(text: string, lex: Lexicon | null, opts: CorrectOptions): string {
    const protectedSet = new Set(opts.protectedWords.map(w => w.toLowerCase()));
    return text.split("\n").map(line => {
        const prefix = line.match(LINE_PREFIX)?.[1] ?? "";
        const body = line.slice(prefix.length);
        if (!/\p{L}/u.test(body)) return line;
        const corrector = new LineCorrector(body, lex, opts, protectedSet);
        let out = corrector.run();
        if (opts.punctuation) out = punctuateLine(out, corrector.lineLang, opts, /[-*+#\d]/.test(prefix));
        return prefix + out;
    }).join("\n");
}
