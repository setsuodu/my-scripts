@echo off
REM ============================================================
REM 用途: 清除「运行」对话框（Win+R）的历史记录
REM 用法: 双击运行即可
REM 注意: 会强制结束并重启 explorer.exe，桌面会短暂闪一下
REM ============================================================
chcp 65001 >nul
echo 正在清除「文件名指定并执行」的历史记录...

:: 1. 删除保存历史的注册表键
reg delete "HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\RunMRU" /f

:: 2. 重启资源管理器使更改立即生效
echo 正在重启资源管理器...
taskkill /f /im explorer.exe
start explorer.exe

echo 清除完成！
pause
