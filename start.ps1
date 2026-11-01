# start.ps1 — Launch both the FastAPI backend and Next.js frontend
# Usage: .\start.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$PythonExe = if (Test-Path "$RepoRoot\.venv\Scripts\python.exe") { "$RepoRoot\.venv\Scripts\python.exe" } else { "python" }

Write-Host "[FLYSWARM] Starting full-stack services..." -ForegroundColor Green

$backendJob = Start-Job -ArgumentList $RepoRoot, $PythonExe -ScriptBlock {
    param($Root, $Py)
    Set-Location $Root
    & $Py -m uvicorn server.app:app --host 0.0.0.0 --port 8000 --reload
}

Write-Host "  [OK] FastAPI backend starting on http://localhost:8000" -ForegroundColor Green
Start-Sleep -Seconds 2

$frontendJob = Start-Job -ArgumentList $RepoRoot -ScriptBlock {
    param($Root)
    Set-Location "$Root\frontend"
    npm run dev
}

Write-Host "  [OK] Next.js frontend starting on http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "  Web UI:   http://localhost:3000" -ForegroundColor White
Write-Host "  API Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host "  Press Ctrl+C to stop both services." -ForegroundColor DarkGray

try {
    while ($true) {
        Receive-Job $backendJob  | ForEach-Object { Write-Host "[backend]  $_" -ForegroundColor DarkGreen }
        Receive-Job $frontendJob | ForEach-Object { Write-Host "[frontend] $_" -ForegroundColor Gray }
        Start-Sleep -Milliseconds 500
    }
} finally {
    Stop-Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Write-Host "[FLYSWARM] Services stopped." -ForegroundColor DarkGray
}
