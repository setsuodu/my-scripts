<# : batch
REM ============================================================
REM 用途: 清理「名字 (1).ext」这类重复下载文件，保留体积最大的，其余移入 _delete
REM 用法: 把本脚本放到目标文件夹后双击，或在目标目录打开 cmd 后运行本脚本
REM 注意: 不会真正删除文件，只是移动到 _delete；名称含括号的文件夹也会被移走
REM 依赖: Windows PowerShell（系统自带）
REM ============================================================
@echo off
cd /d "%~dp0"
set "SELF=%~nx0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex (${%~f0} | Out-String)"
pause
goto :EOF
#>

# ---- 以下为 PowerShell 部分 ----
$self = $env:SELF
$del  = '_delete'
New-Item -ItemType Directory -Force -Path $del | Out-Null

# 移入 _delete；若目标已存在则自动加 _dupN 后缀，避免覆盖
function Move-ToDelete($item) {
    $dest = Join-Path $del $item.Name
    $i = 1
    while (Test-Path -LiteralPath $dest) {
        $dest = Join-Path $del ('{0}_dup{1}{2}' -f $item.BaseName, $i, $item.Extension)
        $i++
    }
    Move-Item -LiteralPath $item.FullName -Destination $dest
}

# 匹配「名字 (数字).扩展名」格式
$rx = '^(?<base>.+?) \((?<n>\d+)\)(?<ext>\.[^.]*)?$'

$files = Get-ChildItem -File | Where-Object { $_.Name -ne $self }

# 分组：去掉 (n) 后文件名相同的归为一组（包含没有编号的原名文件）
$groups = $files | Group-Object {
    if ($_.Name -match $rx) { ($Matches.base + $Matches.ext).ToLower() }
    else { $_.Name.ToLower() }
}

foreach ($g in $groups) {
    # 本组没有任何带 (n) 的文件，跳过
    $hasSuffix = @($g.Group | Where-Object { $_.Name -match $rx })
    if ($hasSuffix.Count -eq 0) { continue }

    # 按大小降序；大小相同时优先保留不带编号的原名
    $sorted = @($g.Group | Sort-Object `
        @{ Expression = { $_.Length }; Descending = $true }, `
        @{ Expression = { if ($_.Name -match $rx) { 1 } else { 0 } } }, `
        Name)

    $keep = $sorted[0]
    $sorted | Select-Object -Skip 1 | ForEach-Object { Move-ToDelete $_ }

    # 若保留的文件仍带 (n)，去掉编号改回原名
    if ($keep.Name -match $rx) {
        Rename-Item -LiteralPath $keep.FullName -NewName ($Matches.base + $Matches.ext)
    }
}

# 名称含括号的文件夹按原逻辑移入 _delete
Get-ChildItem -Directory |
    Where-Object { $_.Name -like '*(*)*' -and $_.Name -ne $del } |
    ForEach-Object { Move-ToDelete $_ }
