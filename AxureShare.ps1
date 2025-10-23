$ErrorActionPreference = 'Stop'

$ScriptPath = $MyInvocation.MyCommand.Path
$Dir = Split-Path -Parent $ScriptPath
Set-Location $Dir

$LogDir = Join-Path $Dir 'logs'
$LogFile = Join-Path $LogDir 'axure-share.log'
$PidFile = Join-Path $Dir 'server.pid'
$Port = $env:PORT
if (-not $Port) { $Port = 3000 }

$Executable = Join-Path $Dir 'axure-share.exe'
$NodeBin = Join-Path $Dir 'node\node.exe'
$NpmCmd = Join-Path $Dir 'node\npm.cmd'

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

$appName = 'AxureShare'
if ($env:AXURE_SHARE_DATA_DIR) {
  $dataDirOverride = $env:AXURE_SHARE_DATA_DIR
} elseif ($env:LOCALAPPDATA) {
  $dataDirOverride = Join-Path $env:LOCALAPPDATA $appName
} elseif ($env:APPDATA) {
  $dataDirOverride = Join-Path $env:APPDATA $appName
} else {
  $dataDirOverride = Join-Path (Join-Path $env:USERPROFILE 'AppData\Local') $appName
}
New-Item -ItemType Directory -Path $dataDirOverride -Force | Out-Null
$env:AXURE_SHARE_DATA_DIR = $dataDirOverride
Write-Output ("数据目录: " + $env:AXURE_SHARE_DATA_DIR)

function Require-Command {
  param([string]$Command)
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    Write-Error "缺少命令：$Command，请先安装 Node.js（包含 npm）。"
    exit 1
  }
}

$nodeBundleAvailable = Test-Path $NodeBin

if (Test-Path $PidFile) {
  $existingPid = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
    Write-Output "服务已在运行 (PID $existingPid)。"
    Start-Process "http://localhost:$Port/"
    exit 0
  } else {
    Remove-Item $PidFile -ErrorAction SilentlyContinue
  }
}

$envPortBackup = $env:PORT
$envNodeEnvBackup = $env:NODE_ENV
$env:PORT = "$Port"

$processPath = $null
$processArgs = @()

if (Test-Path $Executable) {
  Write-Output '检测到独立可执行文件，直接启动...'
  $processPath = $Executable
} else {
  $env:NODE_ENV = 'production'
  if ($nodeBundleAvailable) {
    $modulesDir = Join-Path $Dir 'node_modules'
    if (Test-Path $modulesDir) {
      # 已存在依赖
      Write-Debug 'node_modules 已存在，跳过安装'
    } elseif (Test-Path $NpmCmd) {
      Write-Output '安装依赖...'
      & $NpmCmd install --production --no-audit --no-fund | Out-Default
    } else {
      Write-Error '未找到 npm，可访问 https://nodejs.org/ 安装或使用系统 Node.js。'
      exit 1
    }
    $processPath = $NodeBin
    $processArgs = @((Join-Path $Dir 'server.js'))
  } else {
    Require-Command 'node'
    Require-Command 'npm'
    $modulesDir = Join-Path $Dir 'node_modules'
    if (Test-Path $modulesDir) {
      Write-Debug 'node_modules 已存在，跳过安装'
    } else {
      Write-Output '安装依赖...'
      npm install --production --no-audit --no-fund | Out-Default
    }
    $processPath = (Get-Command node).Source
    $processArgs = @((Join-Path $Dir 'server.js'))
  }
}

$logStream = New-Item -ItemType File -Path $LogFile -Force
if ($logStream) { $logStream | Out-Null }

$process = Start-Process -FilePath $processPath -ArgumentList $processArgs -WorkingDirectory $Dir -RedirectStandardOutput $LogFile -RedirectStandardError $LogFile -WindowStyle Hidden -PassThru

$env:PORT = $envPortBackup
if ($envNodeEnvBackup) {
  $env:NODE_ENV = $envNodeEnvBackup
} else {
  Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
}

if (-not $process) {
  Write-Error '服务启动失败，请查看日志。'
  exit 1
}

Set-Content -Path $PidFile -Value $process.Id
Write-Output "服务已启动，PID: $($process.Id)"
Write-Output "日志文件：$LogFile"

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$Port/api/health" -TimeoutSec 2 | Out-Null
    $ready = $true
    break
  } catch {
    # retry
  }
}

if ($ready) {
  Write-Output '健康检查通过，打开页面...'
  Start-Process "http://localhost:$Port/"
} else {
  Write-Output '健康检查暂未通过，请稍后手动访问 http://localhost:' + $Port + '/'
}
