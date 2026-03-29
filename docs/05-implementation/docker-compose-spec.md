# easymindmap — Docker Compose 설계

문서명: `docs/infra/docker-compose-spec.md`  
기준: **ESXi 7.0.3 환경, Supabase Self-hosted + VM별 분리 배포**  
결정일: 2026-03-27

---

## 아키텍처 결정: Supabase Self-hosted

기존 설계(PostgreSQL + MinIO 직접 설치)에서 **Supabase Self-hosted**로 변경.

| 항목 | 기존 | 변경 후 |
|------|------|---------|
| PostgreSQL | VM-03 직접 설치 | **Supabase VM (내장)** |
| Object Storage | MinIO VM-07 | **Supabase Storage (내장)** |
| Auth / JWT | NestJS 직접 구현 | **Supabase Auth (내장)** |
| Realtime (협업) | WebSocket 서버 별도 | **Supabase Realtime (내장, V1 대비)** |
| VM 수 | 7대 | **5대** (Supabase VM 1대로 통합) |

---

## 1. VM 구성 (최종)

```
VM-01  Edge          Nginx (TLS, Reverse Proxy, Rate Limit)
VM-02  App           Frontend + NestJS API
VM-03  Supabase      Supabase All-in-One (Docker Compose)
VM-04  Redis         Redis 7 (Cache, Queue, Presence)
VM-05  Worker        AI / Export / Translation Workers
```

> **VM-03 Supabase** 권장 사양: 8 vCPU, 16GB RAM, 100GB SSD  
> Supabase는 내부적으로 12개 컨테이너를 Docker Compose로 실행함

---

## 2. 서비스 목록 (easymindmap 전용)

```
frontend          React 빌드 정적 파일 (VM-02)
api               NestJS REST API (VM-02)
ws-gateway        WebSocket 협업 Gateway (VM-02, V1~)
worker-core       Queue consumer / 백그라운드 작업 (VM-05)
worker-ai         AI generation / expand worker (VM-05)
worker-export     Markdown/HTML export worker (VM-05)
worker-translation 다국어 번역 worker (VM-05, V2~)

--- Supabase VM-03 내부 (자동 관리) ---
supabase-db       PostgreSQL 16
supabase-auth     GoTrue (Auth)
supabase-storage  Storage API
supabase-realtime Realtime
supabase-kong     API Gateway
supabase-studio   관리 대시보드
(기타 내부 서비스)

--- VM-04 ---
redis             Redis 7
```

---

## 3. Supabase VM-03 설치 (docker-compose.yml)

```bash
# VM-03 Ubuntu 22.04 에서 실행

# 1. Docker 설치
apt update && apt install -y docker.io docker-compose-plugin

# 2. Supabase 클론
git clone --depth 1 https://github.com/supabase/supabase
mkdir /opt/supabase
cp -rf supabase/docker/* /opt/supabase/
cp supabase/docker/.env.example /opt/supabase/.env
cd /opt/supabase

# 3. 시크릿 자동 생성
sh ./utils/generate-keys.sh

# 4. .env 핵심 설정
# SUPABASE_PUBLIC_URL=https://supabase.mindmap.ai.kr
# API_EXTERNAL_URL=https://supabase.mindmap.ai.kr
# SITE_URL=https://mindmap.ai.kr

# 5. MVP에서 불필요한 서비스 제거 (리소스 절감)
# docker-compose.yml에서 analytics(Logflare), imgproxy 섹션 제거

# 6. 실행
docker compose up -d
```

### MVP에서 제거할 서비스 (docker-compose.yml 수정)

```yaml
# 아래 서비스 섹션을 docker-compose.yml에서 주석 처리 또는 삭제
# - analytics (Logflare) — 운영 모니터링 도입 전까지 불필요
# - imgproxy — 이미지 리사이징 불필요 (MVP)
# 제거 시 RAM 요구량 약 4GB → 운영 가능
```

---

## 4. App VM-02 Compose

파일 경로: `deploy/vm02-app/docker-compose.yml`

```yaml
version: "3.9"

services:
  frontend:
    image: easymindmap/frontend:latest
    container_name: easymindmap-frontend
    env_file: .env
    ports:
      - "${WEB_PORT:-8080}:80"
    restart: unless-stopped

  api:
    image: easymindmap/api:latest
    container_name: easymindmap-api
    env_file: .env
    ports:
      - "${API_PORT:-3000}:3000"
    depends_on:
      - redis  # redis는 VM-04이지만 네트워크로 연결
    restart: unless-stopped

  ws-gateway:
    image: easymindmap/ws-gateway:latest
    container_name: easymindmap-ws
    env_file: .env
    ports:
      - "${WS_PORT:-3100}:3100"
    restart: unless-stopped
```

---

## 5. Worker VM-05 Compose

파일 경로: `deploy/vm05-worker/docker-compose.yml`

```yaml
version: "3.9"

services:
  worker-core:
    image: easymindmap/worker-core:latest
    container_name: easymindmap-worker-core
    env_file: .env
    restart: unless-stopped

  worker-ai:
    image: easymindmap/worker-ai:latest
    container_name: easymindmap-worker-ai
    env_file: .env
    restart: unless-stopped

  worker-export:
    image: easymindmap/worker-export:latest
    container_name: easymindmap-worker-export
    env_file: .env
    restart: unless-stopped

  worker-translation:
    image: easymindmap/worker-translation:latest
    container_name: easymindmap-worker-translation
    env_file: .env
    restart: unless-stopped
```

---

## 6. Redis VM-04 Compose

파일 경로: `deploy/vm04-redis/docker-compose.yml`

```yaml
version: "3.9"

services:
  redis:
    image: redis:7-alpine
    container_name: easymindmap-redis
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - ./data:/data
    ports:
      - "6379:6379"   # 내부망에서만 접근 가능하도록 방화벽 설정 필수
    restart: unless-stopped
```

---

## 7. Edge VM-01 Nginx 라우팅

파일 경로: `deploy/vm01-edge/nginx/conf.d/easymindmap.conf`

```nginx
# Nginx 라우팅 요약
upstream api     { server VM-02-IP:3000; }
upstream frontend { server VM-02-IP:8080; }
upstream ws      { server VM-02-IP:3100; }
upstream supabase { server VM-03-IP:8000; }  # Supabase Kong Gateway

server {
    listen 443 ssl;
    server_name mindmap.ai.kr;

    location /api/     { proxy_pass http://api; }
    location /ws/      { proxy_pass http://ws; upgrade websocket; }
    location /         { proxy_pass http://frontend; }
}

server {
    listen 443 ssl;
    server_name supabase.mindmap.ai.kr;

    location / { proxy_pass http://supabase; }   # Supabase Studio + API
}
```

---

## 8. 개발용 통합 Compose (로컬 개발)

파일 경로: `deploy/docker-compose.dev.yml`

```yaml
version: "3.9"

services:
  api:
    build: { context: ../apps/api, dockerfile: Dockerfile.dev }
    volumes: ["../apps/api:/app"]
    command: npm run start:dev
    env_file: .env.local
    ports: ["3000:3000"]

  frontend:
    build: { context: ../apps/frontend, dockerfile: Dockerfile.dev }
    volumes: ["../apps/frontend:/app"]
    command: npm run dev
    ports: ["8080:8080"]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  # 로컬 개발 시 Supabase는 클라우드 무료 티어 또는 로컬 Supabase CLI 사용
  # supabase start (Supabase CLI)
```

---

## 9. 실행 절차

```bash
# 1. 환경변수 설정
cp .env.example .env
# .env 편집 (Supabase URL, Key, Redis 비밀번호, AI API 키 등)

# 2. Supabase VM-03 먼저 시작
cd /opt/supabase && docker compose up -d

# 3. Redis VM-04 시작
cd /opt/redis && docker compose up -d

# 4. Worker VM-05 시작
cd /opt/worker && docker compose up -d

# 5. App VM-02 시작
cd /opt/app && docker compose up -d

# 6. Edge VM-01 Nginx 시작
systemctl restart nginx
```

---

## 10. 백업 전략

| 대상 | 방법 | 주기 |
|------|------|------|
| Supabase DB | `supabase db dump` or pg_dump | 매일 |
| Redis | AOF 파일 자동 저장 + 정기 복사 | 매일 |
| Supabase Storage | 버킷 sync → 별도 NAS | 매일 |
| ESXi VM 전체 | ESXi 스냅샷 | 주간 |

```bash
# Supabase DB 백업 예시
docker exec supabase-db pg_dump -U postgres postgres \
  > /backup/supabase_$(date +%Y%m%d).sql
```
