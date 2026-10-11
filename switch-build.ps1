<#
    Zenkord - Changeur de build
    ===========================
    Bascule l'installation Zenkord active d'un build a un autre.

    Un "build" = le contenu du dossier %LOCALAPPDATA%\Zenkord\dist
    (patcher.js, renderer.js, preload.js, renderer.css, build.json, package.json).

    Usage :
        .\switch-build.ps1                       # liste les builds disponibles
        .\switch-build.ps1 -List                 # idem
        .\switch-build.ps1 -Build latest         # dernier build compile du depot (dist\desktop)
        .\switch-build.ps1 -Build dist.backup-20261009-2
        .\switch-build.ps1 -Build 71d8da19b      # par debut de hash de commit
        .\switch-build.ps1 -Build C:\chemin\vers\un\build

    A chaque bascule, le build actif est sauvegarde dans
    dist.backup-AAAAMMJJ-HHmmss avant d'etre remplace.

    Options :
        -NoRestart   ne relance pas Discord automatiquement

    SPDX-License-Identifier: GPL-3.0-or-later
#>
[CmdletBinding()]
param(
    [string]$Build,
    [switch]$List,
    [switch]$NoRestart
)

$ErrorActionPreference = "Stop"

$RepoRoot = $PSScriptRoot
$DataDir = Join-Path $env:LOCALAPPDATA "Zenkord"
$DistDir = Join-Path $DataDir "dist"
$RepoBuild = Join-Path $RepoRoot "dist\desktop"

# --- Helpers ---------------------------------------------------------------

function Get-BuildInfo {
    param([string]$Dir)
    $file = Join-Path $Dir "build.json"
    if (-not (Test-Path $file)) { return $null }
    try { return Get-Content $file -Raw | ConvertFrom-Json } catch { return $null }
}

function Format-Time {
    param($Ms)
    if (-not $Ms) { return "?" }
    return [DateTimeOffset]::FromUnixTimeMilliseconds([long]$Ms).ToLocalTime().ToString("dd/MM/yyyy HH:mm")
}

function Get-AvailableBuilds {
    $list = @()

    if (Test-Path $DistDir) {
        $i = Get-BuildInfo $DistDir
        $list += [pscustomobject]@{
            Cle = "current"
            Nom = "dist (ACTIF)"
            Version = $i.version
            Hash = $i.gitHash
            Date = Format-Time $i.buildTime
            Chemin = $DistDir
        }
    }

    if (Test-Path $RepoBuild) {
        $i = Get-BuildInfo $RepoBuild
        $list += [pscustomobject]@{
            Cle = "latest"
            Nom = "latest (depot: dist\desktop)"
            Version = $i.version
            Hash = $i.gitHash
            Date = Format-Time $i.buildTime
            Chemin = $RepoBuild
        }
    }

    Get-ChildItem $DataDir -Directory -Filter "dist.backup-*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object {
            $i = Get-BuildInfo $_.FullName
            if (-not $i) { return }
            $list += [pscustomobject]@{
                Cle = $_.Name
                Nom = $_.Name
                Version = $i.version
                Hash = $i.gitHash
                Date = Format-Time $i.buildTime
                Chemin = $_.FullName
            }
        }

    return $list
}

function Show-Builds {
    $builds = Get-AvailableBuilds
    $i = 0
    foreach ($b in $builds) {
        if ($i++ -eq 0) { continue }   # pas de numero pour le build actif
        Write-Host ("  [{0}] {1}" -f $b.Cle, $b.Nom)
        Write-Host ("      version {0}  commit {1}  compile le {2}" -f $b.Version, $b.Hash.Substring(0, 9), $b.Date) -ForegroundColor DarkGray
    }
    Write-Host ""
    $cur = $builds | Where-Object { $_.Cle -eq "current" }
    if ($cur) {
        Write-Host ("Actif : version {0}  commit {1}  ({2})" -f $cur.Version, $cur.Hash.Substring(0, 9), $cur.Date) -ForegroundColor Green
    }
}

function Resolve-Build {
    param([string]$Key)
    $builds = Get-AvailableBuilds

    # nom exact de dossier / cle
    $match = $builds | Where-Object { $_.Cle -eq $Key } | Select-Object -First 1
    if ($match) { return $match }

    # debut de hash de commit
    $match = $builds | Where-Object { $_.Hash -like "$Key*" } | Select-Object -First 1
    if ($match) { return $match }

    # chemin direct
    if (Test-Path (Join-Path $Key "patcher.js")) {
        $i = Get-BuildInfo $Key
        return [pscustomobject]@{
            Cle = $Key; Nom = $Key
            Version = $(if ($i) { $i.version } else { "?" })
            Hash = $(if ($i) { $i.gitHash } else { "?????????" })
            Date = Format-Time $(if ($i) { $i.buildTime } else { 0 })
            Chemin = (Resolve-Path $Key).Path
        }
    }

    throw "Build introuvable : '$Key'. Lance '. \switch-build.ps1' pour voir la liste."
}

function Stop-Discord {
    $procs = Get-Process | Where-Object {
        $_.ProcessName -like "Discord*" -or ($_.Path -and $_.Path -like "*\Discord\*")
    }
    if (-not $procs) { Write-Host "Discord n'est pas lance." -ForegroundColor DarkGray; return $false }
    $procs | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 3
    return $true
}

function Start-Discord {
    $root = Join-Path $env:LOCALAPPDATA "Discord"
    $app = Get-ChildItem $root -Directory -Filter "app-*" -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    if (-not $app) { Write-Host "Discord.exe introuvable." -ForegroundColor Yellow; return }
    Start-Process -FilePath (Join-Path $app.FullName "Discord.exe")
    Write-Host "Discord relance." -ForegroundColor Green
}

# --- Main ------------------------------------------------------------------

if (-not $Build -or $List) {
    Write-Host "Builds disponibles :" -ForegroundColor Cyan
    Show-Builds
    Write-Host ""
    Write-Host "Pour basculer :  .\switch-build.ps1 -Build <cle>" -ForegroundColor DarkGray
    return
}

$target = Resolve-Build $Build

if ($target.Chemin -eq $DistDir) {
    Write-Host "Ce build est deja actif." -ForegroundColor Yellow
    return
}

Write-Host ("Bascule vers : {0}  (version {1}, commit {2})" -f $target.Nom, $target.Version, $target.Hash.Substring(0, 9)) -ForegroundColor Cyan

# 1. sauvegarde du build actif
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $DataDir "dist.backup-$stamp"
Copy-Item -Path $DistDir -Destination $backup -Recurse -Force
Write-Host "Build actif sauvegarde -> $(Split-Path $backup -Leaf)" -ForegroundColor DarkGray

# 2. arret de Discord
$wasRunning = Stop-Discord

# 3. remplacement des fichiers
Get-ChildItem $DistDir -Force | Remove-Item -Recurse -Force
Copy-Item -Path (Join-Path $target.Chemin "*") -Destination $DistDir -Recurse -Force
Write-Host "Fichiers remplaces." -ForegroundColor DarkGray

$info = Get-BuildInfo $DistDir
Write-Host ("Actif maintenant : version {0}  commit {1}" -f $info.version, $info.gitHash.Substring(0, 9)) -ForegroundColor Green

# 4. relance
if ($wasRunning -and -not $NoRestart) { Start-Discord }
elseif ($NoRestart) { Write-Host "Discord non relance (-NoRestart)." -ForegroundColor DarkGray }
