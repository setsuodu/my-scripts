# 用途: 清理锁屏背景缓存（LockScreen_*）并清除壁纸历史记录
# 用法: 以管理员身份运行 PowerShell，执行本脚本
# 注意: 需要管理员权限（takeown / icacls）；会删除 SystemData 下当前用户的锁屏缓存目录

$sid  = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$root = Join-Path $env:ProgramData "Microsoft\Windows\SystemData"
$dir  = Join-Path $root "$sid\ReadOnly"

takeown /f $root /r /d y | Out-Null
icacls $root /grant "*S-1-5-32-544:(OI)(CI)F" /t /c | Out-Null

try { $items = Get-ChildItem -LiteralPath $dir -Directory -Filter "LockScreen_*" -ErrorAction Stop }
catch { Write-Output "ACCESS ERROR: $($_.Exception.Message)"; exit 2 }

$fail = 0
foreach ($i in $items) {
    cmd /c "rd /s /q `"$($i.FullName)`"" 2>$null
    if (Test-Path -LiteralPath $i.FullName) { $fail++; Write-Output "FAILED: $($i.Name)" }
    else { Write-Output "Deleted: $($i.Name)" }
}

$k = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Wallpapers"
0..4 | ForEach-Object { Remove-ItemProperty -Path $k -Name "BackgroundHistoryPath$_" -ErrorAction SilentlyContinue }
exit $fail
