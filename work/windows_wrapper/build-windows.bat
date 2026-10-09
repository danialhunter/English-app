@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
call npm ci
if errorlevel 1 exit /b 1
call npm test
if errorlevel 1 exit /b 1
call npm run dist:win

endlocal
