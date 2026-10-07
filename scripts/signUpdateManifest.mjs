/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const manifestPath = process.argv[2] ?? "update-manifest.json";
const secret = process.env.ZENKORD_UPDATE_PRIVATE_KEY;

function fail(message) {
    console.error(message);
    process.exit(1);
}

// Accepts the key pasted with or without its BEGIN/END lines, on one line or several.
const toDer = pem => Buffer.from(pem.replace(/\\n/g, "\n").replace(/-----(BEGIN|END) [A-Z ]+-----/g, "").replace(/[^A-Za-z0-9+/=]/g, ""), "base64");

function isPublicKey(der) {
    try {
        createPublicKey({ key: der, format: "der", type: "spki" });
        return true;
    } catch {
        return false;
    }
}

if (!secret) fail("ZENKORD_UPDATE_PRIVATE_KEY is not set, refusing to publish an unsigned update.");

const der = toDer(secret);
let privateKey;
try {
    privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
} catch {
    fail(isPublicKey(der)
        ? "ZENKORD_UPDATE_PRIVATE_KEY contains the public key. Paste the content of zenkord-update-private-key.pem instead."
        : "ZENKORD_UPDATE_PRIVATE_KEY is not a valid private key. Paste the whole content of zenkord-update-private-key.pem.");
}

const embeddedPublicKey = readFileSync(new URL("../src/main/updater/updatePublicKey.ts", import.meta.url), "utf8");
const expected = toDer(embeddedPublicKey.match(/-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----/)?.[0] ?? "");
const actual = createPublicKey(privateKey).export({ type: "spki", format: "der" });
if (!actual.equals(expected)) fail("ZENKORD_UPDATE_PRIVATE_KEY does not match the public key in src/main/updater/updatePublicKey.ts.");

const signature = sign(null, readFileSync(manifestPath), privateKey);
writeFileSync(`${manifestPath}.sig`, signature.toString("base64"));
console.log(`Signed ${manifestPath}`);
