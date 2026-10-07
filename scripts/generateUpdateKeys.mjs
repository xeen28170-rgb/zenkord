/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const privateKeyPath = process.argv[2] ?? join(homedir(), "zenkord-update-private-key.pem");

if (existsSync(privateKeyPath)) {
    console.error(`${privateKeyPath} already exists. Delete it first if you really want a new key.`);
    process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
writeFileSync(privateKeyPath, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });

console.log(`Private key saved to ${privateKeyPath}`);
console.log("Never commit it or share it. Put its content in the ZENKORD_UPDATE_PRIVATE_KEY GitHub secret.\n");
console.log("Public key, to paste in src/main/updater/updatePublicKey.ts:\n");
console.log(publicKey.export({ type: "spki", format: "pem" }));
