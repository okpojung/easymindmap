# ─────────────────────────────────────────────────────────────
#  EasyMindMap 로컬 개발 원터치 실행 (Windows PowerShell)
#   DB(Docker) + 백엔드(:3000) + 프론트(:5173)
#   사용:  ./dev.ps1     (백엔드·프론트는 각각 새 창에서 열림)
#  자세한 설명: docs/user-guide/로컬-실행.md
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $MyInvocation.MyCommand.Path)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host "X Node.js 20+ 가 필요합니다 (https://nodejs.org)"; exit 1 }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Host "X Docker 가 필요합니다 (DB용)"; exit 1 }

Write-Host "> DB 기동 (Docker · PostgreSQL 16)..."
docker compose -f apps/api/docker-compose.dev.yml up -d

if (-not (Test-Path apps/api/node_modules))      { Write-Host "> 백엔드 의존성 설치..."; Push-Location apps/api; npm install; Pop-Location }
if (-not (Test-Path apps/api/.env))              { Copy-Item apps/api/.env.example apps/api/.env }
if (-not (Test-Path apps/frontend/node_modules)) { Write-Host "> 프론트 의존성 설치..."; Push-Location apps/frontend; npm install; Pop-Location }

Write-Host "> 백엔드 기동 (새 창, http://localhost:3000/v1)..."
Start-Process powershell -ArgumentList "-NoExit","-Command","Set-Location '$PWD/apps/api'; npm run start:dev"

Write-Host "> 프론트 기동 (새 창, http://localhost:5173)..."
Start-Process powershell -ArgumentList "-NoExit","-Command","Set-Location '$PWD/apps/frontend'; npm run dev"

Write-Host ""
Write-Host "──────────────────────────────────────────────"
Write-Host "  브라우저에서  http://localhost:5173  접속"
Write-Host "  종료: 열린 두 PowerShell 창을 닫으세요"
Write-Host "  DB 끄기: docker compose -f apps/api/docker-compose.dev.yml down"
Write-Host "──────────────────────────────────────────────"
