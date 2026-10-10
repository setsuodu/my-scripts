@echo off
:: 【防乱码补丁】强制让 CMD 窗口使用 UTF-8 编码显示中文
chcp 65001 >nul

:: 强制以管理员权限重新运行脚本（写入注册表需要高权限）
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
    echo 正在请求管理员权限...
    goto UACPrompt
) else ( goto gogogo )
:UACPrompt
    echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
    echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
    "%temp%\getadmin.vbs"
    exit /B
:gogogo
    if exist "%temp%\getadmin.vbs" ( del "%temp%\getadmin.vbs" )

:: ==========================================
:: 核心逻辑：获取当前脚本所在路径，并写入注册表
:: ==========================================
set "AppPath=%~dp0gridcraft.exe"

echo 正在自动识别路径并注册 GridCraft...
echo 当前检测到程序路径为: %AppPath%

:: 1. 注册核心打开命令（自动适配带空格的路径）
reg add "HKCR\Applications\gridcraft.exe" /v "FriendlyAppName" /t REG_SZ /d "GridCraft Spreadsheet" /f >nul
reg add "HKCR\Applications\gridcraft.exe\shell\open" /v "FriendlyAppName" /t REG_SZ /d "用 GridCraft 打开" /f >nul
reg add "HKCR\Applications\gridcraft.exe\shell\open\command" /ve /t REG_SZ /d "\"%AppPath%\" \"%%1\"" /f >nul

:: 2. 批量塞进各大表格格式的“打开方式”备选列表中
for %%i in (.xlsx .xls .csv .xlsm) do (
    reg add "HKCR\%%i\OpenWithList\gridcraft.exe" /f >nul
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\%%i\OpenWithList" /v "g" /t REG_SZ /d "gridcraft.exe" /f >nul
)

echo.
echo ==========================================
echo  🎉 恭喜！批量注册成功！
echo  现在右键任意表格文件，都能在打开方式中看到它。
echo ==========================================
pause
