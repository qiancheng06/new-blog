@echo off
set "ROOT=%~dp0..\.."
set "DASHBOARD=%~dp0index.html"
cd /d "%ROOT%"
echo Starting auto-sync + dev server...

:: Background services (minimized)
start /min "workbench-watch" cmd /c "npm run watch"
start /min "workbench-dev"   cmd /c "npm run dev"

:: Wait for dev server to be ready
echo Waiting for dev server to start...
:retry
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -TimeoutSec 1 -UseBasicParsing).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto retry

:: Open single browser tab
echo.
echo Dev server is ready!
start "" "%DASHBOARD%"
start "" "http://127.0.0.1:5173"
echo.
echo Dashboard: %DASHBOARD%
echo VitePress: http://127.0.0.1:5173
echo Press any key to stop all services.
pause >nul

:: Cleanup
taskkill /f /fi "WINDOWTITLE eq workbench-dev"   >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq workbench-watch" >nul 2>&1
