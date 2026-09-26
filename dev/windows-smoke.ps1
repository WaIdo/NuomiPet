# Windows 安装包冒烟测试（在 CI 的 Windows 机器上跑）：
#   1. 静默安装 dist 里的安装版，启动，确认进程还活着、数据文件写出来了，截一张整个桌面
#   2. 静默卸载，确认程序文件删掉了
#   3. 便携版同样启动、确认、截图
# 截图放在 -Out 目录。用法：pwsh dev/windows-smoke.ps1 -Out win-smoke
param([string]$Out = 'win-smoke')

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Out | Out-Null
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

function Save-Screen([string]$Name) {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save((Join-Path $Out $Name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
}

function Stop-Pet {
  Get-Process -Name 'NuomiPet*' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 3
}

$os = Get-CimInstance Win32_OperatingSystem
Write-Host "系统：$($os.Caption) $($os.Version)"
$dataFile = Join-Path $env:APPDATA '糯米桌宠\mochi-data.json'

# ---------- 安装版 ----------
$setup = Get-ChildItem dist -Filter '*-win-setup.exe' | Select-Object -First 1
if (-not $setup) { throw '没找到安装版' }
Write-Host "安装：$($setup.Name)"
Start-Process $setup.FullName -ArgumentList '/S' -Wait
$exe = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Programs') -Recurse -Filter 'NuomiPet.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $exe) { throw '安装后没找到 NuomiPet.exe' }
Write-Host "装到了：$($exe.DirectoryName)"
$shortcuts = @(
  (Join-Path ([Environment]::GetFolderPath('Desktop')) '糯米桌宠.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Programs')) '糯米桌宠.lnk')
)
foreach ($s in $shortcuts) { Write-Host "快捷方式 $s ：$(Test-Path $s)" }

$p = Start-Process $exe.FullName -PassThru
Start-Sleep -Seconds 25
Save-Screen 'installed-app.png'
if ($p.HasExited) { throw "安装版启动后退出了，退出码 $($p.ExitCode)" }
if (-not (Test-Path $dataFile)) { throw "没有写出数据文件：$dataFile" }
Write-Host "数据文件：$dataFile（$((Get-Item $dataFile).Length) 字节）"
Stop-Pet

$uninstaller = Get-ChildItem $exe.DirectoryName -Filter 'Uninstall*.exe' | Select-Object -First 1
if (-not $uninstaller) { throw '没找到卸载程序' }
Copy-Item $dataFile (Join-Path $Out 'mochi-data.json')
# NSIS 卸载程序会把自己复制到临时目录再运行，原进程马上就退出了，所以轮询等文件消失
Start-Process $uninstaller.FullName -ArgumentList '/S' -Wait
for ($i = 0; $i -lt 30 -and (Test-Path $exe.FullName); $i++) { Start-Sleep -Seconds 1 }
if (Test-Path $exe.FullName) { throw '卸载后程序文件还在' }
Write-Host '卸载干净了；数据文件保留：' (Test-Path $dataFile)

# ---------- 便携版 ----------
$portable = Get-ChildItem dist -Filter '*-win-portable.exe' | Select-Object -First 1
if (-not $portable) { throw '没找到便携版' }
Write-Host "便携版：$($portable.Name)"
Start-Process $portable.FullName | Out-Null
Start-Sleep -Seconds 35
Save-Screen 'portable-app.png'
$running = Get-Process -Name 'NuomiPet' -ErrorAction SilentlyContinue
if (-not $running) { throw '便携版没有跑起来' }
Write-Host "便携版进程数：$(@($running).Count)"
Stop-Pet
Write-Host '全部通过'
