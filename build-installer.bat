@echo off
title Zenkord Installer - Build
cd /d "%~dp0"

echo.
echo  ================================
echo   Zenkord Installer - Build
echo  ================================
echo.

:: Verifie que dotnet est disponible
where dotnet >nul 2>&1
if errorlevel 1 (
    echo  [ERREUR] .NET SDK introuvable. Installez-le depuis https://dotnet.microsoft.com/download
    pause
    exit /b 1
)
for /f "delims=" %%v in ('dotnet --version') do echo  .NET SDK : %%v

:: Cree le dossier de sortie si besoin
if not exist "release\installer" mkdir "release\installer"

:: Build avec dotnet publish
echo.
echo  [1/1] dotnet publish -c Release...
cd installer-src
call dotnet publish -c Release
if errorlevel 1 (
    echo  [ERREUR] dotnet publish a echoue.
    cd ..
    pause
    exit /b 1
)
cd ..

:: Copie vers release/installer/
copy /Y "installer-src\bin\Release\net8.0-windows\win-x64\publish\Zenkord-Installer.exe" "release\installer\Zenkord-Installer.exe" >nul

:: Verification
if not exist "release\installer\Zenkord-Installer.exe" (
    echo.
    echo  [ERREUR] Zenkord-Installer.exe introuvable apres build.
    pause
    exit /b 1
)

for %%F in ("release\installer\Zenkord-Installer.exe") do (
    echo.
    echo  [OK] Build reussi ^!
    echo  Fichier : release\installer\Zenkord-Installer.exe  (%%~zF octets^)
    echo.
)

:: Ouvre le dossier de sortie
explorer release\installer

pause
