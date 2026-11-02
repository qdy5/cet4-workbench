@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动 CET4 学习工作台...
start "" http://127.0.0.1:5173
"C:\Users\twe19\.workbuddy\binaries\python\envs\default\Scripts\python.exe" app.py
pause
