@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PY=python
where py >nul 2>nul && set PY=py
echo 正在启动 CET4 学习工作台（首次运行请先 pip install -r requirements.txt）
%PY% app.py --open
pause
