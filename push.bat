@echo off
cd /d "%~dp0"
git add -A
git commit -m "update"
git push origin test --force
echo.
echo === Push Done ===
pause
