@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Apply-Update.ps1" %*
if errorlevel 1 (echo Update failed. Your models and configuration were not removed.)
pause
