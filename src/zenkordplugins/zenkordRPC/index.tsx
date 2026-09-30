/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { FluxDispatcher } from "@webpack/common";
const APP_ID = "1529869867640029386";
const SOCKET_ID = "ZenkordRPC";

function setActivity() {
    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        socketId: SOCKET_ID,
        activity: {
            application_id: APP_ID,
            name: "Zenkord",
            state: "Joue à Zenkord",
            details: "Injected ✓",
            timestamps: {
                start: Date.now()
            },
            flags: 1 << 0
        }
    });
}

export default definePlugin({
    name: "ZenkordRPC",
    description: "Shows Zenkord in your Discord Rich Presence",
    authors: [{ name: "Zenkord", id: 0n }],
    enabledByDefault: true,

    start() {
        setActivity();
    },

    stop() {
        FluxDispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            socketId: SOCKET_ID,
            activity: null
        });
    }
});
