@echo off
chcp 65001 >nul

REM 用途: 便携版 GridCraft 注册表格格式到「打开方式」
REM 用法: 把本脚本放到 gridcraft.exe 同目录，右键「以管理员身份运行」
REM 注意: 只添加备选打开方式，不会改默认程序；需要管理员权限写注册表

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

set "AppPath=%~dp0gridcraft.exe"

echo 正在自动识别路径并注册 GridCraft...
echo 当前检测到程序路径为: %AppPath%

reg add "HKCR\Applications\gridcraft.exe" /v "FriendlyAppName" /t REG_SZ /d "GridCraft Spreadsheet" /f >nul
reg add "HKCR\Applications\gridcraft.exe\shell\open" /v "FriendlyAppName" /t REG_SZ /d "用 GridCraft 打开" /f >nul
reg add "HKCR\Applications\gridcraft.exe\shell\open\command" /ve /t REG_SZ /d "\"%AppPath%\" \"%%1\"" /f >nul

for %%i in (.xlsx .xls .xlsm .xlsb .csv .tsv .ods .xltx .xltm) do (
    reg add "HKCR\%%i\OpenWithList\gridcraft.exe" /f >nul
    reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\%%i\OpenWithList" /v "g" /t REG_SZ /d "gridcraft.exe" /f >nul
)

echo.
echo ==========================================
echo  🎉 GridCraft 批量注册成功！
echo  现在右键任意表格文件，都能在打开方式中看到它。
echo ==========================================
pause
