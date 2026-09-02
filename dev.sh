#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  EasyMindMap 로컬 개발 원터치 실행 (macOS / Linux)
#   DB(Docker) + 백엔드(:3000) + 프론트(:5173)를 한 번에 띄운다.
#   사용:  ./dev.sh        (종료: Ctrl + C)
#  자세한 설명: docs/user-guide/로컬-실행.md
# ─────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Node 는 **있는지**만 보면 모자란다. 예전엔 존재만 확인해서, Node 20.10
# 같은 낮은 버전이면 이 스크립트는 통과하고 **vite 가 기동하다 죽었다.**
# 기준은 이 저장소에서 가장 엄격한 vite 8 의 요구(^20.19.0 || >=22.12.0)다
# — 21.x 는 caret 범위 밖이라 지원하지 않는다.
command -v node >/dev/null 2>&1 || {
  echo "✗ Node.js 가 없습니다 — 20.19 이상 또는 22.12 이상이 필요합니다."
  echo "  https://nodejs.org 에서 LTS 를 받으세요."
  exit 1
}

NODE_OK="$(node -p 'const v = process.versions.node.split(".").map(Number);
((v[0] === 20 && v[1] >= 19) || (v[0] === 22 && v[1] >= 12) || v[0] > 22) ? "ok" : "old"' 2>/dev/null)"
if [ "$NODE_OK" != "ok" ]; then
  echo "✗ Node.js $(node -v) 로는 실행할 수 없습니다."
  echo "  필요: 20.19 이상 또는 22.12 이상 (vite 8 요구 — 21.x 는 제외)"
  echo "  https://nodejs.org 에서 LTS 를 받으세요."
  exit 1
fi

ensure_docker() {
  # 1) Docker 설치 확인 (없으면 OS에 맞춰 설치 안내/자동설치 제안)
  if ! command -v docker >/dev/null 2>&1; then
    echo "✗ Docker 가 설치되어 있지 않습니다 (클라우드 저장용 DB에 필요)."
    if [ "$(uname -s)" = "Linux" ]; then
      printf "  Docker 를 지금 설치할까요? (Docker 공식 스크립트, sudo 필요) [y/N] "
      read -r ans
      if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
        curl -fsSL https://get.docker.com | sudo sh
        sudo usermod -aG docker "$USER" 2>/dev/null || true
        echo "  설치 완료. docker 그룹 적용을 위해 로그아웃/재로그인 후 다시 실행하세요."
      else
        echo "  https://docs.docker.com/engine/install/ 를 참고하세요."
      fi
    else  # macOS 등
      if command -v brew >/dev/null 2>&1; then
        printf "  Docker Desktop 을 지금 설치할까요? (Homebrew) [y/N] "
        read -r ans
        if [ "$ans" = "y" ] || [ "$ans" = "Y" ]; then
          brew install --cask docker
          echo "  설치 완료. Docker Desktop 을 실행한 뒤 다시 실행하세요."
        fi
      else
        echo "  Homebrew 가 없습니다. https://www.docker.com/products/docker-desktop 에서 설치하세요."
      fi
    fi
    exit 1
  fi
  # 2) Docker 엔진(데몬) 실행 확인
  if ! docker info >/dev/null 2>&1; then
    echo "✗ Docker 는 설치돼 있지만 실행 중이 아닙니다."
    if [ "$(uname -s)" = "Linux" ]; then
      echo "  sudo systemctl start docker   로 시작한 뒤 다시 실행하세요."
    else
      echo "  Docker Desktop 을 실행해 준비될 때까지 기다린 뒤 다시 실행하세요."
    fi
    exit 1
  fi
  echo "▶ Docker 확인됨."
}

ensure_docker

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
