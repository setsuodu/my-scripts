<# : batch
@echo off
cd /d "%~dp0"
set "SELF=%~nx0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex (${%~f0} | Out-String)"
pause
goto :EOF
#>

$self = $env:SELF
$del  = '_delete'
New-Item -ItemType Directory -Force -Path $del | Out-Null

# 移入 _delete，重名时自动加 _dupN，避免覆盖
function Move-ToDelete($item) {
    $dest = Join-Path $del $item.Name
    $i = 1
    while (Test-Path -LiteralPath $dest) {
        $dest = Join-Path $del ('{0}_dup{1}{2}' -f $item.BaseName, $i, $item.Extension)
        $i++
    }
    Move-Item -LiteralPath $item.FullName -Destination $dest
}

# 匹配 "名字 (数字).扩展名"
$rx = '^(?<base>.+?) \((?<n>\d+)\)(?<ext>\.[^.]*)?$'

$files = Get-ChildItem -File | Where-Object { $_.Name -ne $self }

# 分组：去掉 (n) 后名字相同的归为一组（包含没带后缀的原名文件）
$groups = $files | Group-Object {
    if ($_.Name -match $rx) { ($Matches.base + $Matches.ext).ToLower() }
    else { $_.Name.ToLower() }
}

foreach ($g in $groups) {
    # 这一组里没有任何带 (n) 的文件，就不动
    $hasSuffix = @($g.Group | Where-Object { $_.Name -match $rx })
    if ($hasSuffix.Count -eq 0) { continue }

    # 按大小降序；大小相同时优先保留不带后缀的
    $sorted = @($g.Group | Sort-Object `
        @{ Expression = { $_.Length }; Descending = $true }, `
        @{ Expression = { if ($_.Name -match $rx) { 1 } else { 0 } } }, `
        Name)

    $keep = $sorted[0]
    $sorted | Select-Object -Skip 1 | ForEach-Object { Move-ToDelete $_ }

    # 留下的如果带 (n)，去掉后缀改回原名
    if ($keep.Name -match $rx) {
        Rename-Item -LiteralPath $keep.FullName -NewName ($Matches.base + $Matches.ext)
    }
}

# 带括号的文件夹仍按原逻辑移走
Get-ChildItem -Directory |
    Where-Object { $_.Name -like '*(*)*' -and $_.Name -ne $del } |
    ForEach-Object { Move-ToDelete $_ }