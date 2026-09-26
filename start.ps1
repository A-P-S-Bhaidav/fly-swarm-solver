# start.ps1 — Launch both the FastAPI backend and Next.js frontend
# Run from d:\fly swarm\
# Usage: .\start.ps1

Write-Host "🪰 FlySwarm — Starting servers..." -ForegroundColor Cyan

# ── FastAPI backend ──────────────────────────────────────────────────────────
$backendJob = Start-Job -ScriptBlock {
    Set-Location "d:\fly swarm"
    & "D:\flyswarm-env\Scripts\python.exe" -m uvicorn server.app:app `
        --host 0.0.0.0 --port 8000 --reload
}

Write-Host "  ✓ FastAPI server starting on http://localhost:8000" -ForegroundColor Green
Start-Sleep -Seconds 2

# ── Next.js frontend ─────────────────────────────────────────────────────────
$frontendJob = Start-Job -ScriptBlock {
    Set-Location "d:\fly swarm\frontend"
    npm run dev
}

Write-Host "  ✓ Next.js dev server starting on http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "  Open: http://localhost:3000" -ForegroundColor Yellow
Write-Host "  API:  http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Press Ctrl+C to stop both servers." -ForegroundColor DarkGray

# Stream output from both jobs
try {
    while ($true) {
        Receive-Job $backendJob  | ForEach-Object { Write-Host "[backend]  $_" -ForegroundColor DarkCyan }
        Receive-Job $frontendJob | ForEach-Object { Write-Host "[frontend] $_" -ForegroundColor DarkMagenta }
        Start-Sleep -Milliseconds 500
    }
} finally {
    Stop-Job $backendJob, $frontendJob
    Remove-Job $backendJob, $frontendJob
    Write-Host "Servers stopped." -ForegroundColor DarkGray
}
