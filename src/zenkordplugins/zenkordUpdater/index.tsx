/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
declare const BUILD_TIMESTAMP: number;

const settings = definePluginSettings({
    installWithoutAsking: {
        type: OptionType.BOOLEAN,
        description: "Install updates at startup without asking. When off, a banner asks you first.",
        default: false,
    },
});

let startupTimer: ReturnType<typeof setTimeout> | null = null;
let updatePromise: Promise<void> | null = null;

function getBuildTimestamp(): number {
    try { return BUILD_TIMESTAMP; } catch { return 0; }
}

function relaunch() {
    const { VencordNative } = window as any;
    try {
        VencordNative.zenkord?.relaunch?.();
    } catch {
        (window as any).DiscordNative?.app?.relaunch?.();
        window.location.reload();
    }
}

async function installUpdateAtStartup() {
    try {
        const { VencordNative } = window as any;
        const ipc = VencordNative?.updater;
        if (!ipc) return;

        // A newer build may already be installed on disk while this renderer is
        // still running the previous one. In that case only a relaunch is needed.
        const localResult = await ipc.getLocalBuild?.();
        const localBuild = localResult?.ok ? localResult.value : localResult;
        if (localBuild?.buildTime > getBuildTimestamp()) {
            console.log("[ZenkordUpdater] New local build found; restarting silently.");
            relaunch();
            return;
        }

        // GET_UPDATES validates the public manifest and prepares the exact asset
        // to install. No banner is shown: startup remains the update boundary.
        const updateResult = await ipc.getUpdates?.();
        if (!updateResult?.ok) throw new Error(updateResult?.error?.message ?? "Update check failed");
        if (!updateResult.value?.length || !settings.store.installWithoutAsking) return;

        console.log("[ZenkordUpdater] Installing verified update silently.");
        const installResult = await ipc.rebuild();
        if (!installResult?.ok || installResult.value !== true)
            throw new Error(installResult?.error?.message ?? "Update installation failed");

        relaunch();
    } catch (error) {
        // Updating must never block Discord startup. Retry on the next restart.
        console.error("[ZenkordUpdater] Silent startup update failed:", error);
    }
}

function runStartupUpdate() {
    if (!updatePromise) updatePromise = installUpdateAtStartup().finally(() => { updatePromise = null; });
    return updatePromise;
}

export default definePlugin({
    name: "ZenkordUpdater",
    enabledByDefault: true,
    description: "Checks for signed Zenkord updates at startup and installs them once you agree.",
    authors: [{ name: "Zenkord", id: 0n }],
    settings,

    start() {
        startupTimer = setTimeout(() => void runStartupUpdate(), 5_000);
    },

    stop() {
        if (startupTimer) clearTimeout(startupTimer);
        startupTimer = null;
    },
});
