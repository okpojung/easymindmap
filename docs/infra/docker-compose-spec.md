# easymindmap — Docker Compose 설계

> 문서명: `docs/infra/docker-compose-spec.md`  
> 기준: ESXi 환경, VM별 분리 배포

---

## 1. 서비스 목록

```
frontend          React 빌드 정적 파일
api               NestJS REST API
ws-gateway        WebSocket 협업 Gateway
worker-core       Queue consumer / 백그라운드 작업
worker-ai         AI generation / expand worker
worker-export     Markdown/HTML export worker
worker-translation 다국어 번역 worker (V2)
postgres          PostgreSQL 16
redis             Redis 7
minio             Object Storage
```

---

## 2. 개발/스테이징용 통합 Compose

파일 경로: `deploy/docker-compose.yml`

```yaml
version: "3.9"

services:

  frontend:
    image: easymindmap/frontend:latest
    container_name: easymindmap-frontend
    env_file:
      - ../.env
    ports:
      - "${WEB_PORT:-8080}:80"
    depends_on:
      - api
    restart: unless-stopped

  api:
    image: easymindmap/api:latest
    container_name: easymindmap-api
    env_file:
      - ../.env
    ports:
      - "${API_PORT:-3000}:3000"
    depends_on:
      - postgres
      - redis
      - minio
    restart: unless-stopped

  ws-gateway:
    image: easymindmap/ws-gateway:latest
    container_name: easymindmap-ws
    env_file:
      - ../.env
    ports:
      - "${WS_PORT:-3100}:3100"
    depends_on:
      - redis
      - postgres
    restart: unless-stopped

  worker-core:
    image: easymindmap/worker-core:latest
    container_name: easymindmap-worker-core
    env_file:
      - ../.env
    depends_on:
      - redis
      - postgres
      - minio
    restart: unless-stopped

  worker-ai:
    image: easymindmap/worker-ai:latest
    container_name: easymindmap-worker-ai
    env_file:
      - ../.env
    depends_on:
      - redis
      - postgres
    restart: unless-stopped

  worker-export:
    image: easymindmap/worker-export:latest
    container_name: easymindmap-worker-export
    env_file:
      - ../.env
    depends_on:
      - redis
      - postgres
      - minio
    restart: unless-stopped

  worker-translation:
    image: easymindmap/worker-translation:latest
    container_name: easymindmap-worker-translation
    env_file:
      - ../.env
    depends_on:
      - redis
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:16
    container_name: easymindmap-postgres
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./postgres/init:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: easymindmap-redis
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data
    ports:
      - "6379:6379"
    restart: unless-stopped

  minio:
    image: minio/minio:latest
    container_name: easymindmap-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes:
      - miniodata:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
  miniodata:
```

---

## 3. 개발용 Override Compose

파일 경로: `deploy/docker-compose.override.yml`

```yaml
version: "3.9"

services:
  api:
    build:
      context: ../apps/api
      dockerfile: Dockerfile.dev
    volumes:
      - ../apps/api:/app
    command: npm run start:dev

  frontend:
    build:
      context: ../apps/frontend
      dockerfile: Dockerfile.dev
    volumes:
      - ../apps/frontend:/app
    command: npm run dev

  ws-gateway:
    build:
      context: ../apps/ws-gateway
      dockerfile: Dockerfile.dev
    volumes:
      - ../apps/ws-gateway:/app
    command: npm run start:dev
```

---

## 4. 운영용 VM별 Compose 분리

운영에서는 VM별로 Compose를 나눕니다.

### VM-01: Edge (Nginx)

```yaml
services:
  edge-nginx:
    image: nginx:stable-alpine
    container_name: easymindmap-edge
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
      - ./nginx/certs:/etc/nginx/certs
      - ./published:/srv/published
      - ./logs:/var/log/nginx
    restart: unless-stopped
```

Nginx 라우팅:
```
/          → frontend (VM-02)
/api       → api (VM-02)
/ws        → ws-gateway (VM-06)
/published → 정적 HTML 서빙
```

### VM-02: App

```yaml
services:
  api:
    image: easymindmap/api:latest
    env_file: .env
    ports: ["3000:3000"]
    restart: unless-stopped

  frontend:
    image: easymindmap/frontend:latest
    env_file: .env
    ports: ["8080:80"]
    restart: unless-stopped
```

### VM-03: PostgreSQL

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - ./data:/var/lib/postgresql/data
    # ⚠️ 운영에서는 외부 포트 노출 금지
    restart: unless-stopped
```

### VM-04: Redis

```yaml
services:
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - ./data:/data
    restart: unless-stopped
```

### VM-05: Worker

```yaml
services:
  worker-core:
    image: easymindmap/worker-core:latest
    env_file: .env
    restart: unless-stopped

  worker-ai:
    image: easymindmap/worker-ai:latest
    env_file: .env
    restart: unless-stopped

  worker-export:
    image: easymindmap/worker-export:latest
    env_file: .env
    restart: unless-stopped

  worker-translation:
    image: easymindmap/worker-translation:latest
    env_file: .env
    restart: unless-stopped
```

### VM-06: WebSocket (확장 시 추가)

```yaml
services:
  ws-gateway:
    image: easymindmap/ws-gateway:latest
    env_file: .env
    ports: ["3100:3100"]
    restart: unless-stopped
```

### VM-07: MinIO (확장 시 추가)

```yaml
services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
      MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
    volumes:
      - ./data:/data
    ports:
      - "9000:9000"
      - "9001:9001"
    restart: unless-stopped
```

---

## 5. Compose 실행 절차

```bash
# 1. 환경변수 설정
cp .env.example .env
# .env 편집 (비밀번호/API 키 입력)

# 2. 전체 시작
docker compose -f deploy/docker-compose.yml up -d

# 3. 상태 확인
docker compose -f deploy/docker-compose.yml ps

# 4. DB 마이그레이션
docker compose -f deploy/docker-compose.yml exec api npm run migration:run

# 5. 로그 확인
docker compose -f deploy/docker-compose.yml logs -f api
```

---

## 6. MinIO 초기 버킷 생성

앱 시작 시 없으면 자동 생성하거나, init job으로 생성:

```
uploads
attachments
media
exports
published
thumbnails
preset-assets
```
