# ─────────────────────────────────────────────────────────────
#  EasyMindMap 로컬 개발 원터치 실행 (Windows PowerShell)
#   DB(Docker) + 백엔드(:3000) + 프론트(:5173)
#   실행:  명령 프롬프트에서  dev      (dev.cmd 래퍼가 호출)
#          또는  powershell -ExecutionPolicy Bypass -File dev.ps1
#  자세한 설명: docs/user-guide/로컬-실행.md
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $MyInvocation.MyCommand.Path)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "X Node.js 20+ 가 필요합니다 (https://nodejs.org)"; exit 1
}

function Ensure-Docker {
  # 1) Docker 설치 확인
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "X Docker 가 설치되어 있지 않습니다 (클라우드 저장용 DB에 필요)."
    if (Get-Command winget -ErrorAction SilentlyContinue) {
      $ans = Read-Host "  Docker Desktop 을 지금 설치할까요? (winget) [y/N]"
      if ($ans -match '^[yY]') {
        winget install -e --id Docker.DockerDesktop --accept-source-agreements --accept-package-agreements
        Write-Host ""
        Write-Host "  설치 완료. Docker Desktop 을 실행해(작업표시줄 고래 아이콘)"
        Write-Host "  WSL2 설정을 마친 뒤 이 스크립트를 다시 실행하세요."
      } else {
        Write-Host "  https://www.docker.com/products/docker-desktop 에서 설치할 수 있습니다."
      }
    } else {
      Write-Host "  winget 이 없어 자동 설치할 수 없습니다."
      Write-Host "  https://www.docker.com/products/docker-desktop 에서 설치하세요."
    }
    exit 1
  }
  # 2) Docker 엔진(데몬) 실행 확인
  & docker info 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "X Docker 는 설치돼 있지만 실행 중이 아닙니다."
    Write-Host "  작업표시줄에서 Docker Desktop 을 실행하고, '고래' 아이콘이"
    Write-Host "  안정(초록)될 때까지 기다린 뒤 다시 실행하세요."
    exit 1
  }
  Write-Host "> Docker 확인됨."
}

Ensure-Docker

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
