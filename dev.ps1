# -------------------------------------------------------------
#  EasyMindMap local dev launcher (Windows PowerShell)
#   DB(Docker) + backend(:3000) + frontend(:5173)
#   Run from cmd:  dev        (via dev.cmd wrapper)
#          or:     powershell -ExecutionPolicy Bypass -File dev.ps1
#  Guide (Korean): docs/user-guide/  (local-run guide)
#  NOTE: messages are ASCII on purpose (Windows PowerShell 5.1 mangles
#        non-ASCII script text under some code pages).
# -------------------------------------------------------------
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $MyInvocation.MyCommand.Path)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "X Node.js 20+ is required (https://nodejs.org)"; exit 1
}

function Find-Winget {
  $c = Get-Command winget -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $p = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps\winget.exe"
  if (Test-Path $p) { return $p }
  return $null
}

function Ensure-Docker {
  # 1) Docker installed?
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "X Docker is NOT installed (needed for the cloud-save DB)."
    $wg = Find-Winget
    if ($wg) {
      $ans = Read-Host "  Install Docker Desktop now via winget? [y/N]"
      if ($ans -match '^[yY]') {
        & $wg install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
        Write-Host ""
        Write-Host "  Done. Now START 'Docker Desktop' (whale icon), finish the"
        Write-Host "  WSL2 setup, wait until it is green, then run 'dev' again."
      } else {
        Write-Host "  Get it at https://www.docker.com/products/docker-desktop"
      }
    } else {
      Write-Host "  winget not found. Install Docker Desktop manually:"
      Write-Host "    https://www.docker.com/products/docker-desktop"
    }
    Write-Host ""
    Write-Host "  (No Docker? You can still try the EDITOR only, without cloud save:)"
    Write-Host "    cd apps\frontend  &&  npm install  &&  npm run dev"
    exit 1
  }
  # 2) Docker engine running?
  & docker info 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "X Docker is installed but NOT running."
    Write-Host "  Start 'Docker Desktop', wait until the whale icon is green,"
    Write-Host "  then run 'dev' again."
    exit 1
  }
  Write-Host "> Docker OK."
}

Ensure-Docker

Write-Host "> Starting DB (Docker, PostgreSQL 16)..."
docker compose -f apps/api/docker-compose.dev.yml up -d

if (-not (Test-Path apps/api/node_modules))      { Write-Host "> Installing backend deps..."; Push-Location apps/api; npm install; Pop-Location }
if (-not (Test-Path apps/api/.env))              { Copy-Item apps/api/.env.example apps/api/.env }
if (-not (Test-Path apps/frontend/node_modules)) { Write-Host "> Installing frontend deps..."; Push-Location apps/frontend; npm install; Pop-Location }

$utf8 = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;"

Write-Host "> Starting backend (new window, http://localhost:3000/v1)..."
Start-Process powershell -ArgumentList "-NoExit","-Command","$utf8 Set-Location '$PWD/apps/api'; npm run start:dev"

Write-Host "> Starting frontend (new window, http://localhost:5173)..."
Start-Process powershell -ArgumentList "-NoExit","-Command","$utf8 Set-Location '$PWD/apps/frontend'; npm run dev"

Write-Host ""
Write-Host "----------------------------------------------"
Write-Host "  Open  http://localhost:5173  in your browser"
Write-Host "  Stop: close the two PowerShell windows"
Write-Host "  Stop DB: docker compose -f apps/api/docker-compose.dev.yml down"
Write-Host "----------------------------------------------"
