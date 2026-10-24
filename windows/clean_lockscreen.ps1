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