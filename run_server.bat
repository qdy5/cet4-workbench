@echo off
rem ASCII only. %dp0 is this folder (Chinese path must never be typed in a .bat)
cd /d "%~dp0"
"C:\Users\twe19\.workbuddy\binaries\python\envs\default\Scripts\python.exe" app.py >> "%~dp0server.log" 2>&1
