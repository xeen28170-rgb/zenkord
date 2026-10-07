/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const manifestPath = process.argv[2] ?? "update-manifest.json";
const privateKey = process.env.ZENKORD_UPDATE_PRIVATE_KEY;

if (!privateKey) {
    console.error("ZENKORD_UPDATE_PRIVATE_KEY is not set, refusing to publish an unsigned update.");
    process.exit(1);
}

const signature = sign(null, readFileSync(manifestPath), createPrivateKey(privateKey));
writeFileSync(`${manifestPath}.sig`, signature.toString("base64"));
console.log(`Signed ${manifestPath}`);
