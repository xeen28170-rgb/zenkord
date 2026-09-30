const { execSync } = require("child_process");
const { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, cpSync, renameSync, rmSync } = require("fs");
const { createHash } = require("crypto");
const { join } = require("path");

// ─── Configuration de Build Zenkord ─────────────────────────────────────────

function killZenkord() {
    const releaseDir = join(__dirname, "release", "zenkord-dist");
    const releaseExe = join(releaseDir, "Discord.exe");

    try {
        execSync(
            `powershell -NoProfile -Command "Get-Process Discord -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${releaseExe.replace(/'/g, "''")}'} | Stop-Process -Force"`,
            { stdio: "ignore", shell: true }
        );
    } catch (_) { }

    const resDir = join(releaseDir, "resources");
    for (const name of ["app.asar", "_app.asar"]) {
        const p = join(resDir, name);
        if (!existsSync(p)) continue;
        try { rmSync(p, { recursive: true, force: true }); } catch (_) { }
    }
}

function findDiscordApp() {
    const base = join(process.env.LOCALAPPDATA, "Discord");
    let best = null, bestVer = [0, 0, 0];
    try {
        for (const e of readdirSync(base)) {
            const m = e.match(/^app-(\d+)\.(\d+)\.(\d+)$/);
            if (!m) continue;
            const v = [+m[1], +m[2], +m[3]];
            if (v[0] > bestVer[0] || v[1] > bestVer[1] || v[2] > bestVer[2]) { bestVer = v; best = join(base, e); }
        }
    } catch { }
    if (!best && process.env.DISCORD_PATH) {
        best = process.env.DISCORD_PATH;
        console.log("[CI] Utilisation de DISCORD_PATH:", best);
    }
    if (!best) throw new Error("Discord introuvable. Assurez-vous que Discord est installé.");
    return best;
}

function buildEquicord() {
    console.log("[build] Compilation de Zenkord...");
    execSync("node --require=./scripts/suppressExperimentalWarnings.js scripts/build/build.mjs --standalone", { stdio: "inherit" });
}

function buildZenkordFromDiscord(discordApp) {
    const discordRes = join(discordApp, "resources");
    const outDir = join(__dirname, "release", "zenkord-dist");

    if (existsSync(outDir)) {
        try { rmSync(outDir, { recursive: true, force: true }); } catch (e) { }
    }

    console.log("[zenkord] Copie des binaires Discord...");
    mkdirSync(outDir, { recursive: true });

    for (const f of readdirSync(discordApp)) {
        if (f === "resources" || f === "modules") continue;
        const src = join(discordApp, f);
        const dst = join(outDir, f);
        try { cpSync(src, dst, { recursive: true }); } catch (e) { }
    }

    const outModules = join(outDir, "modules");
    mkdirSync(outModules, { recursive: true });

    const discordModules = join(discordApp, "modules");
    if (existsSync(discordModules)) {
        for (const mod of readdirSync(discordModules)) {
            const src = join(discordModules, mod);
            if (!statSync(src).isDirectory()) continue;
            const dst = join(outModules, mod);
            try { cpSync(src, dst, { recursive: true }); } catch (e) { }
        }
    }

    const outRes = join(outDir, "resources");
    mkdirSync(outRes, { recursive: true });

    const buildInfoSrc = join(discordRes, "build_info.json");
    if (existsSync(buildInfoSrc)) {
        const buildInfo = JSON.parse(readFileSync(buildInfoSrc, "utf8"));
        buildInfo.newUpdater = false;
        buildInfo.localModulesRoot = "modules";
        writeFileSync(join(outRes, "build_info.json"), JSON.stringify(buildInfo, null, 2));
    }

    const bootstrapSrc = join(discordRes, "bootstrap");
    const bootstrapDst = join(outRes, "bootstrap");
    if (existsSync(bootstrapSrc)) {
        mkdirSync(bootstrapDst, { recursive: true });
        cpSync(bootstrapSrc, bootstrapDst, { recursive: true });
    }

    console.log("[zenkord] Préparation de _app.asar...");
    let appAsarSrc = join(discordRes, "_app.asar");
    if (!existsSync(appAsarSrc)) appAsarSrc = join(discordRes, "app.asar");
    
    if (existsSync(appAsarSrc)) {
        cpSync(appAsarSrc, join(outRes, "_app.asar"), { recursive: statSync(appAsarSrc).isDirectory() });
    }

    const outAppAsar = join(outRes, "app.asar");
    mkdirSync(outAppAsar, { recursive: true });
    writeFileSync(join(outAppAsar, "package.json"), JSON.stringify({ name: "discord", main: "index.js" }, null, 2));
    writeFileSync(join(outAppAsar, "index.js"), `
"use strict";
const path = require("path");
const fs = require("fs");
const { app } = require("electron");

app.setPath("userData", path.join(app.getPath("appData"), "Zenkord"));
app.setAppUserModelId("com.squirrel.Discord.Discord");

const bundledModulesPath = path.join(path.dirname(process.execPath), "modules");
require(path.join(__dirname, "..", "app", "dist", "desktop", "patcher.js"));
`);

    const outApp = join(outRes, "app");
    mkdirSync(outApp, { recursive: true });
    writeFileSync(join(outApp, "package.json"), JSON.stringify({ name: "zenkord", main: "index.js", version: "1.18.0" }, null, 2));
    writeFileSync(join(outApp, "index.js"), `
"use strict";
const path = require("path");
const { app } = require("electron");

app.setPath("userData", path.join(app.getPath("appData"), "Zenkord"));
app.setAppUserModelId("com.squirrel.Discord.Discord");

require(path.join(__dirname, "dist", "desktop", "patcher.js"));
`);

    const outDist = join(outApp, "dist", "desktop");
    mkdirSync(outDist, { recursive: true });
    const equicordDist = join(__dirname, "dist", "desktop");

    for (const f of ["patcher.js", "renderer.js", "renderer.css", "renderer.js.LEGAL.txt"]) {
        if (existsSync(join(equicordDist, f))) cpSync(join(equicordDist, f), join(outDist, f));
    }

    const zenkordPreload = join(__dirname, "zenkord-preload.js");
    if (existsSync(zenkordPreload)) {
        cpSync(zenkordPreload, join(outDist, "preload.js"));
    }

    // FFmpeg et YT-DLP (cherche dans le dossier local ou PATH)
    const binDir = join(__dirname, "static", "bin");
    for (const bin of ["ffmpeg.exe", "yt-dlp.exe"]) {
        const localBin = join(binDir, bin);
        if (existsSync(localBin)) cpSync(localBin, join(outDir, bin));
    }

    // Curseurs macOS (utilises par le plugin CursorMacOS) -> resourcesPath/mac/mac/...
    // native.ts cherche via process.resourcesPath, qui pointe vers outDir/resources (asar: false)
    const macCursorsSrc = join(__dirname, "mac");
    if (existsSync(macCursorsSrc)) {
        console.log("[zenkord] Copie des curseurs macOS...");
        cpSync(macCursorsSrc, join(outRes, "mac"), { recursive: true });
    } else {
        console.warn("[zenkord] ATTENTION: dossier 'mac' introuvable a la racine, le plugin CursorMacOS ne fonctionnera pas dans le build package.");
    }

    const discordExe = join(outDir, "Discord.exe");
    const injectScript = join(__dirname, "inject-discord.ps1");
    if (existsSync(injectScript)) cpSync(injectScript, join(outDir, "inject-discord.ps1"));

    const iconSrc = join(__dirname, "zenkord.ico");
    if (existsSync(iconSrc)) {
        cpSync(iconSrc, join(outDir, "app.ico"));
        // Rcedit pour le branding
        try {
            const rcedit = join(__dirname, "node_modules", ".bin", "rcedit.cmd");
            if (existsSync(rcedit)) {
                execSync(`"${rcedit}" "${discordExe}" --set-icon "${iconSrc}" --set-version-string "ProductName" "Zenkord" --set-version-string "FileDescription" "Zenkord"`, { stdio: "ignore" });
            }
        } catch (e) { }
    }

    console.log(`[zenkord] Build terminé -> ${outDir}`);
}


// ─── Execution du build ───────────────────────────────────────────────────────

if (require.main === module) {
    killZenkord();
    const discord = findDiscordApp();
    buildEquicord();

    buildZenkordFromDiscord(discord);
}

module.exports = {
    appId: "com.zenkord.app",
    productName: "Zenkord",
    copyright: "Copyright 2026 Zenkord",
    extraMetadata: { main: "index.js" },
    asar: true,
    asarUnpack: ["**/*.node", "**/*.exe", "**/*.dll", "**/*.bin/*", "mac/**/*"],
    extraResources: [{ from: "dist/zenkord.asar", to: "zenkord.asar" }],
    files: ["index.js", "dist/js/**/*", "static/**/*", "!**/*.map", "!**/*.ts"],
    directories: { output: "release", buildResources: "static" },
    win: {
        target: [
            { target: "nsis", arch: ["x64"] },
            { target: "dir", arch: ["x64"] }
        ],
        icon: "zenkord.ico",
        requestedExecutionLevel: "asInvoker"
    },
    nsis: {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        deleteAppDataOnUninstall: false,
        installerIcon: "zenkord.ico",
        uninstallerIcon: "zenkord.ico",
        license: "LICENSE"
    },
    mac: {
        target: [
            { target: "dmg", arch: ["x64", "arm64"] },
            { target: "zip", arch: ["x64", "arm64"] },
            { target: "dir", arch: ["x64", "arm64"] }
        ],
        icon: "installer-src/assets/icon.icns",
        category: "public.app-category.social-networking",
        hardenedRuntime: true,
        gatekeeperAssess: false,
        entitlements: "build/entitlements.mac.plist",
        entitlementsInherit: "build/entitlements.mac.plist",
        artifactName: "${name}-${version}-mac-${arch}.${ext}"
    },
    dmg: {
        title: "Zenkord ${version}",
        icon: "installer-src/assets/icon.icns",
        background: null,
        contents: [
            { x: 130, y: 220, type: "file" },
            { x: 410, y: 220, type: "link", path: "/Applications" }
        ],
        window: { width: 540, height: 380 }
    }
};
