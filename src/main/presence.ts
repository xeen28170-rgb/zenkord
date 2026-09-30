/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomBytes } from "crypto";
import { app, net } from "electron";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";

import { RendererSettings } from "./settings";
import { SETTINGS_DIR } from "./utils/constants";

const COUNTER_URL = "https://zenkord-counter.zenkord.workers.dev";
const INTERVAL = 5 * 60 * 1000;
const INSTALL_FLAG = join(SETTINGS_DIR, "install-counted");

// Identifiant aléatoire recréé à chaque lancement : il ne permet pas de
// reconnaître un utilisateur d'une session à l'autre.
const sessionId = randomBytes(16).toString("hex");

const enabled = () => RendererSettings.store.anonymousUsageStats !== false;

function send(path: "/ping" | "/bye") {
    if (!enabled()) return;
    net.fetch(COUNTER_URL + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId })
    }).catch(() => { });
}

// Signale l'installation une seule fois par PC, sans aucun identifiant :
// seul un fichier local retient que c'est déjà fait.
async function countInstall() {
    if (!enabled() || existsSync(INSTALL_FLAG)) return;
    try {
        const res = await net.fetch(COUNTER_URL + "/install", { method: "POST" });
        if (res.ok) writeFileSync(INSTALL_FLAG, new Date().toISOString());
    } catch { }
}

export function initPresence() {
    countInstall();
    send("/ping");
    setInterval(() => send("/ping"), INTERVAL);
    app.on("before-quit", () => send("/bye"));
}
