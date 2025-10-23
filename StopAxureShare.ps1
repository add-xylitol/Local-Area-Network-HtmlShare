$ErrorActionPreference = 'Stop'

$ScriptPath = $MyInvocation.MyCommand.Path
$Dir = Split-Path -Parent $ScriptPath
Set-Location $Dir

$PidFile = Join-Path $Dir 'server.pid'

if (-not (Test-Path $PidFile)) {
  Write-Output '未找到运行中的服务。'
  exit 0
}

$pid = (Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
if (-not $pid) {
  Write-Output 'PID 文件为空，清理后退出。'
  Remove-Item $PidFile -ErrorAction SilentlyContinue
  exit 0
}

$process = Get-Process -Id $pid -ErrorAction SilentlyContinue
if ($process) {
  Write-Output "停止服务 (PID $pid)..."
  try {
    Stop-Process -Id $pid -Force -ErrorAction Stop
    Write-Output '服务已停止。'
  } catch {
    Write-Warning "未能停止进程 $pid: $($_.Exception.Message)"
  }
} else {
  Write-Output "进程 $pid 未在运行。"
}

Remove-Item $PidFile -ErrorAction SilentlyContinue
