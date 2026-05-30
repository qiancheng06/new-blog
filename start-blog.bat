@echo off
cd /d "%~dp0"
echo Starting dev server + auto-sync...
start "blog-sync" cmd /c "npm run watch"
start "" "index.html"
start http://localhost:5173
npm run dev
pause
