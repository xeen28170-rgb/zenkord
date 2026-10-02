/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { ApplicationAssetUtils, FluxDispatcher } from "@webpack/common";
const APP_ID = "1529869867640029386";
const SOCKET_ID = "ZenkordRPC";

// Logo ZC affiché dans le statut, de saison comme le site : octobre = Halloween, décembre = Noël
function logoUrl() {
    const month = new Date().getMonth();
    const suffix = month === 9 ? "-halloween" : month === 11 ? "-noel" : "";
    return `https://raw.githubusercontent.com/xeen28170-rgb/zenkord-site/main/logo${suffix}.png`;
}

async function setActivity() {
    const largeImage = await ApplicationAssetUtils.fetchAssetIds(APP_ID, [logoUrl()])
        .then(ids => ids[0])
        .catch(() => undefined);

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        socketId: SOCKET_ID,
        activity: {
            application_id: APP_ID,
            name: "Zenkord",
            state: "Joue à Zenkord",
            details: "Injected ✓",
            assets: largeImage ? { large_image: largeImage, large_text: "Zenkord" } : undefined,
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
