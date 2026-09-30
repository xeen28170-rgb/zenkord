/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { randomBytes } from "crypto";
import { app, net } from "electron";

import { RendererSettings } from "./settings";

const COUNTER_URL = "https://zenkord-counter.zenkord.workers.dev";
const INTERVAL = 5 * 60 * 1000;

// Identifiant aléatoire recréé à chaque lancement : il ne permet pas de
// reconnaître un utilisateur d'une session à l'autre.
const sessionId = randomBytes(16).toString("hex");

function send(path: "/ping" | "/bye") {
    if (RendererSettings.store.anonymousUsageStats === false) return;
    net.fetch(COUNTER_URL + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId })
    }).catch(() => { });
}

export function initPresence() {
    send("/ping");
    setInterval(() => send("/ping"), INTERVAL);
    app.on("before-quit", () => send("/bye"));
}
