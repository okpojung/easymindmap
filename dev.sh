#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  EasyMindMap 로컬 개발 원터치 실행 (macOS / Linux)
#   DB(Docker) + 백엔드(:3000) + 프론트(:5173)를 한 번에 띄운다.
#   사용:  ./dev.sh        (종료: Ctrl + C)
#  자세한 설명: docs/user-guide/로컬-실행.md
# ─────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

command -v node >/dev/null 2>&1 || { echo "✗ Node.js 20+ 가 필요합니다 (https://nodejs.org)"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "✗ Docker 가 필요합니다 (DB용, https://www.docker.com)"; exit 1; }

COMPOSE="docker compose -f apps/api/docker-compose.dev.yml"

echo "▶ DB 기동 (Docker · PostgreSQL 16)…"
$COMPOSE up -d || { echo "✗ DB 기동 실패"; exit 1; }

echo "▶ DB 준비 대기…"
for _ in $(seq 1 30); do
  if $COMPOSE exec -T db pg_isready -U emm -d easymindmap >/dev/null 2>&1; then break; fi
  sleep 1
done

# 의존성 설치(최초 1회) + .env 준비
[ -d apps/api/node_modules ]      || { echo "▶ 백엔드 의존성 설치…"; (cd apps/api && npm install); }
[ -f apps/api/.env ]              || cp apps/api/.env.example apps/api/.env
[ -d apps/frontend/node_modules ] || { echo "▶ 프론트 의존성 설치…"; (cd apps/frontend && npm install); }

echo "▶ 백엔드 기동 (http://localhost:3000/v1)…"
(cd apps/api && npm run start:dev) &
API_PID=$!

echo "▶ 프론트 기동 (http://localhost:5173)…"
(cd apps/frontend && npm run dev) &
FE_PID=$!

cleanup() {
  echo
  echo "■ 종료 중…"
  kill "$API_PID" "$FE_PID" >/dev/null 2>&1
  echo "  DB는 계속 실행 중입니다. 끄려면: $COMPOSE down   (데이터까지 지우려면 down -v)"
}
trap cleanup INT TERM

echo
echo "──────────────────────────────────────────────"
echo "  브라우저에서  http://localhost:5173  접속"
echo "  종료:  Ctrl + C"
echo "──────────────────────────────────────────────"
wait
