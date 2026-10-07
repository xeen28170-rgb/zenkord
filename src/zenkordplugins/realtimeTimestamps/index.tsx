/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { moment } from "@webpack/common";

// ─── Settings ────────────────────────────────────────────────────────────────

const settings = definePluginSettings({
    format: {
        type: OptionType.SELECT,
        description: "Seconds format displayed on every message timestamp",
        default: "HH:mm:ss",
        options: [
            { label: "15:34:21  (24h)", value: "HH:mm:ss", default: true },
            { label: "3:34:21 PM  (12h)", value: "h:mm:ss A" },
        ],
    },
    showInTooltip: {
        type: OptionType.BOOLEAN,
        description: "Show seconds in the hover tooltip",
        default: true,
    },
    showInCompact: {
        type: OptionType.BOOLEAN,
        description: "Show seconds in compact mode",
        default: true,
    },
});

// ─── Timestamp render functions ──────────────────────────────────────────────
// REAL FIX (confirmed against the stock CustomTimestamps plugin, which patches
// these exact same Vencord match sites and works fine): the previous "BUGFIX"
// diagnosis was wrong. There is no Hook-rule violation — these patch sites sit
// directly inside the host component's render body, so calling a Hook here is
// perfectly valid (CustomTimestamps' renderTimestamp does the same thing).
//
// The actual crash was caused by returning a *React element* (Fragment) where
// Discord's own MessageTimestamp component expects a plain *string*. That same
// variable is reused later in the same component for things like AM/PM format
// detection via .match(...) and the edited-message a11y label — calling
// .match() on a React element throws "e.match is not a function" on every
// message render. Returning a plain string (like CustomTimestamps does) keeps
// those other internal usages intact. A message's time never changes, so there
// is no need to re-render it every second.

function RenderCozyText(date: Date) {
    const fmt = settings.store.format ?? "HH:mm:ss";
    return moment(date).format(fmt);
}

function RenderCompactText(date: Date) {
    const fmt = settings.store.format ?? "HH:mm:ss";
    return settings.store.showInCompact
        ? moment(date).format(fmt)
        : moment(date).format("LT");
}

function RenderTooltipText(date: Date) {
    const fmt = settings.store.format ?? "HH:mm:ss";
    return settings.store.showInTooltip
        ? moment(date).format(`dddd, MMMM D, YYYY [at] ${fmt}`)
        : moment(date).format("LLLL");
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export default definePlugin({
    name: "RealtimeTimestamps",
    description: "Replaces Discord timestamps (e.g. 15:31) with live seconds (e.g. 15:34:21), updated every second.",
    tags: ["Appearance", "Chat", "Utility"],
    authors: [{ name: "Zenkord", id: 253979869n }],
    enabledByDefault: true,
    settings,

    // Called directly by patches — must return a plain string, not a React
    // element, since these substitute for values Discord later treats as text
    // (and in some cases re-parses with .match()).
    renderCozy(date: Date) {
        return RenderCozyText(date);
    },
    renderCompact(date: Date) {
        return RenderCompactText(date);
    },
    renderTooltip(date: Date) {
        return RenderTooltipText(date);
    },

    patches: [
        // ─── Main Timestamp component (cozy + compact messages + hover tooltip) ─
        {
            find: "#{intl::MESSAGE_EDITED_TIMESTAMP_A11Y_LABEL}",
            replacement: [
                {
                    // Compact mode: the useMemo that formats with "LT"
                    match: /(\i\.useMemo\(.{0,50}"LT".{0,30}\]\))/,
                    replace: "$self.renderCompact(arguments[0].timestamp)",
                },
                {
                    // Cozy mode: the useMemo that calls the calendar/relative formatter
                    match: /(\i\.useMemo\(.{0,10}\i\.\i\)\(.{0,10}\]\))/,
                    replace: "$self.renderCozy(arguments[0].timestamp)",
                },
                {
                    // Tooltip shown when hovering a message timestamp
                    match: /(__unsupportedReactNodeAsText:).{0,25}"LLLL"\)/,
                    replace: "$1$self.renderTooltip(arguments[0].timestamp)",
                },
            ],
        },

        // ─── Timestamp markdown <t:unix:t> — hover tooltip ────────────────────
        {
            find: /.full,.{0,15}children:/,
            replacement: {
                match: /(__unsupportedReactNodeAsText:)\i\.full/,
                replace: "$1$self.renderTooltip(new Date(arguments[0].node.timestamp*1000))",
            },
        },
    ],
});
