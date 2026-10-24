# 1. 找系统自带的默认壁纸（优先 4K 版）
$cands = @(
    "$env:SystemRoot\Web\4K\Wallpaper\Windows\img0_3840x2160.jpg",
    "$env:SystemRoot\Web\Wallpaper\Windows\img0.jpg"
)
$wp = $cands | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $wp) { Write-Output "Default wallpaper not found"; exit 1 }

# 2. 清除"最近使用的图像"记录
$k = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Wallpapers"
0..4 | ForEach-Object { Remove-ItemProperty -Path $k -Name "BackgroundHistoryPath$_" -ErrorAction SilentlyContinue }

# 3. 清除壁纸转码缓存
$themes = "$env:APPDATA\Microsoft\Windows\Themes"
Remove-Item "$themes\TranscodedWallpaper" -Force -ErrorAction SilentlyContinue
Remove-Item "$themes\CachedFiles\*" -Force -ErrorAction SilentlyContinue

# 4. 填充方式设为"填充"
Set-ItemProperty "HKCU:\Control Panel\Desktop" -Name WallpaperStyle -Value "10"
Set-ItemProperty "HKCU:\Control Panel\Desktop" -Name TileWallpaper -Value "0"

# 5. 立即应用壁纸（不用重启资源管理器）
Add-Type @"
using System.Runtime.InteropServices;
public class Wall { [DllImport("user32.dll", CharSet=CharSet.Unicode)]
public static extern int SystemParametersInfo(int a, int b, string c, int d); }
"@
[Wall]::SystemParametersInfo(20, 0, $wp, 3) | Out-Null
Write-Output "Wallpaper reset: $wp"