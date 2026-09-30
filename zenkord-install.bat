@echo off
:: Wrapper .bat pour lancer zenkord-install.ps1 facilement (double-clic)
title Zenkord — Installation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0zenkord-install.ps1"
if %errorlevel% neq 0 pause
