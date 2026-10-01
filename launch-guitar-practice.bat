@echo off
setlocal
title Guitar Practice
cd /d "%~dp0"

rem ============================================================
rem  Guitar Practice one-click launcher
rem  Usage:
rem    launch-guitar-practice.bat            start (auto build if needed)
rem    launch-guitar-practice.bat rebuild    force rebuild, then start
rem
rem  MAINTENANCE RULE (see README "One-click launcher"):
rem    If scripts in package.json, the port, or the build output
rem    directory or Node requirement change, update this file.
rem    Re-test fresh build, existing build and rebuild paths.
rem ============================================================

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH. Install Node 22+ first.
  pause
  exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if errorlevel 1 (
  echo [ERROR] Node.js 22+ is required. Please upgrade Node.js.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [setup] Installing dependencies, please wait...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if "%~1"=="rebuild" (
  echo [setup] Rebuilding production bundle...
  call npm run build
  if errorlevel 1 (
    echo [ERROR] Build failed. Fix the errors and retry.
    pause
    exit /b 1
  )
)

if not exist ".next\BUILD_ID" (
  echo [setup] No production build found, building once...
  call npm run build
  if errorlevel 1 (
    echo [ERROR] Build failed. Fix the errors and retry.
    pause
    exit /b 1
  )
)

netstat -ano | findstr /r /c:":3000 .*LISTENING" >nul
if not errorlevel 1 (
  echo [info] Server already running on port 3000, opening browser...
  start "" http://localhost:3000
  exit /b 0
)

echo [start] Guitar Practice starting at http://localhost:3000
echo         Keep this window open while practicing. Close = stop server.
start "" /min cmd /c "timeout /t 6 /nobreak >nul & start "" http://localhost:3000"
call npm run start
pause
