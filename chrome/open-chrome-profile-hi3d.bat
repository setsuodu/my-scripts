@echo off
REM ============================================================
REM 用途: 用 Chrome「Profile 1」打开指定网址（常用于每日签到）
REM 用法: 双击运行；可改下方 URL 或 Profile 名称
REM 注意: 需本机已安装 Google Chrome，且存在名为 Profile 1 的用户配置
REM ============================================================
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --profile-directory="Profile 1" https://www.hi3d.ai
