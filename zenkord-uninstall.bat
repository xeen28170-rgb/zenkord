@echo off
:: Wrapper .bat pour lancer zenkord-uninstall.ps1 facilement (double-clic)
title Zenkord — Désinstallation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0zenkord-uninstall.ps1"
if %errorlevel% neq 0 pause
