@echo off
set "ROOT=%~dp0..\.."
cd /d "%ROOT%"
echo Starting Persona Workspace demo...

:: Background services (minimized)
start /min "workbench-demo" cmd /c "npm run dev:mock"

:: Wait for dev services to be ready
echo Waiting for dev services to start...
:retry
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -TimeoutSec 1 -UseBasicParsing).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto retry
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/status' -TimeoutSec 1 -UseBasicParsing).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto retry
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://127.0.0.1:5175' -TimeoutSec 1 -UseBasicParsing).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto retry

:: Open Workspace and Blog
echo.
echo Dev services are ready!
start "" "http://127.0.0.1:5173"
start "" "http://127.0.0.1:5175"
echo.
echo Workspace Next.js: http://127.0.0.1:5173
echo Blog Next.js: http://127.0.0.1:5175
echo Content site can be started separately: npm.cmd run dev:content
echo Persona API: http://127.0.0.1:3001/api/status
echo Press any key to stop all services.
pause >nul

:: Cleanup
taskkill /f /t /fi "WINDOWTITLE eq workbench-demo" >nul 2>&1
