# easymindmap — 환경변수 명세

> 문서명: `docs/infra/env-spec.md`

---

## 1. 원칙

- 민감정보는 `.env` (소스 저장소에 커밋 금지)
- 기능 토글도 `.env` (FEATURE_*)
- 환경별 차이는 `.env.*` 분리
- 코드에는 하드코딩 금지

---

## 2. 파일 구성

```
.env.example      (GitHub에 커밋 — 템플릿)
.env.local        (로컬 개발용, .gitignore)
.env.dev          (개발 서버용, .gitignore)
.env.staging      (스테이징, .gitignore)
.env.prod         (운영, .gitignore)
```

---

## 3. `.env.example` 전체

```dotenv
########################################
# APP
########################################
APP_NAME=easymindmap
APP_ENV=development
APP_PORT=3000
APP_BASE_URL=http://localhost:3000
APP_PUBLIC_URL=http://localhost:8080
APP_TIMEZONE=Asia/Seoul
APP_DEFAULT_LOCALE=ko
APP_LOG_LEVEL=info

########################################
# WEB / FRONTEND
########################################
WEB_PORT=8080
WEB_BASE_URL=http://localhost:8080
WEB_PUBLIC_DOMAIN=localhost
WEB_ASSET_PREFIX=
WEB_ENABLE_SOURCEMAP=true

########################################
# API
########################################
API_PORT=3000
API_PREFIX=/api
API_CORS_ORIGINS=http://localhost:8080
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=300

########################################
# AUTH
########################################
AUTH_JWT_ACCESS_SECRET=change_me_access_secret
AUTH_JWT_REFRESH_SECRET=change_me_refresh_secret
AUTH_ACCESS_TOKEN_EXPIRES_IN=15m
AUTH_REFRESH_TOKEN_EXPIRES_IN=30d
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_DOMAIN=localhost
AUTH_SESSION_SAME_SITE=lax

########################################
# DATABASE
########################################
DB_HOST=postgres
DB_PORT=5432
DB_NAME=easymindmap
DB_USER=easymindmap
DB_PASSWORD=change_me_db_password
DB_SCHEMA=public
DB_SSL=false

########################################
# REDIS
########################################
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_TLS=false

########################################
# WEBSOCKET
########################################
WS_PORT=3100
WS_PATH=/ws
WS_PUBLIC_URL=ws://localhost:3100/ws
WS_ALLOWED_ORIGINS=http://localhost:8080

########################################
# STORAGE / MINIO
########################################
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=change_me_minio_secret
MINIO_BUCKET_UPLOADS=uploads
MINIO_BUCKET_ATTACHMENTS=attachments
MINIO_BUCKET_MEDIA=media
MINIO_BUCKET_EXPORTS=exports
MINIO_BUCKET_PUBLISHED=published
MINIO_BUCKET_THUMBNAILS=thumbnails
MINIO_BUCKET_PRESETS=preset-assets

########################################
# AI
########################################
AI_PROVIDER=openai
AI_API_KEY=change_me_ai_api_key
AI_MODEL_GENERATE=gpt-4o
AI_MODEL_SUMMARIZE=gpt-4o-mini
AI_MODEL_TRANSLATE=gpt-4o-mini
AI_TIMEOUT_MS=60000
AI_MAX_RETRIES=2

########################################
# TRANSLATION
########################################
TRANSLATION_PROVIDER=deepl           # deepl / openai / hybrid
TRANSLATION_DEEPL_API_KEY=change_me_deepl_key
TRANSLATION_ENABLE_CACHE=true
TRANSLATION_QUEUE_CONCURRENCY=5
TRANSLATION_DEFAULT_TARGETS=ko,en,ja
TRANSLATION_SKIP_SAME_LANGUAGE=true

########################################
# EXPORT
########################################
EXPORT_HTML_ENABLE=true
EXPORT_MARKDOWN_ENABLE=true
EXPORT_SNAPSHOT_ENABLE=true
EXPORT_QUEUE_CONCURRENCY=3
EXPORT_HEADLESS_BROWSER_URL=http://browser:9222

########################################
# MAIL
########################################
MAIL_ENABLED=false
MAIL_HOST=
MAIL_PORT=587
MAIL_USER=
MAIL_PASSWORD=
MAIL_FROM=no-reply@mindmap.ai.kr

########################################
# LOGGING / MONITORING
########################################
LOG_FORMAT=json
LOG_REQUEST_BODY=false
LOG_SQL=false
METRICS_ENABLED=true
METRICS_PORT=9090

########################################
# SECURITY
########################################
SECURITY_ENABLE_RATE_LIMIT=true
SECURITY_ENABLE_HELMET=true
SECURITY_ENABLE_CSP=true
SECURITY_MAX_UPLOAD_MB=20
SECURITY_ALLOWED_UPLOAD_MIME=image/png,image/jpeg,image/webp,application/pdf,text/markdown

########################################
# FEATURE FLAGS
########################################
FEATURE_REALTIME_COLLAB=true
FEATURE_AI_GENERATE=true
FEATURE_AI_TRANSLATION=true         # V2
FEATURE_EXPORT_HTML=true
FEATURE_EXPORT_MARKDOWN=true
FEATURE_PUBLISH=true
FEATURE_DASHBOARD_MAP=false         # V3
FEATURE_DATA_BINDING=false          # V3
FEATURE_BILLING=false
```

---

## 4. 환경별 주요 차이

### `.env.dev`

```dotenv
APP_ENV=development
AUTH_COOKIE_SECURE=false
DB_SSL=false
MINIO_USE_SSL=false
WEB_ENABLE_SOURCEMAP=true
LOG_SQL=true
```

### `.env.prod`

```dotenv
APP_ENV=production
APP_BASE_URL=https://mindmap.ai.kr
WEB_BASE_URL=https://mindmap.ai.kr
AUTH_COOKIE_SECURE=true
DB_SSL=true
MINIO_USE_SSL=true
WEB_ENABLE_SOURCEMAP=false
LOG_SQL=false
SECURITY_ENABLE_CSP=true
```

---

## 5. 운영 필수 주의 변수

아래 값은 절대 소스코드 저장소에 넣지 않습니다.

```
AUTH_JWT_ACCESS_SECRET
AUTH_JWT_REFRESH_SECRET
DB_PASSWORD
MINIO_SECRET_KEY
AI_API_KEY
TRANSLATION_DEEPL_API_KEY
```

운영 환경에서는 Vault 또는 별도 비밀 저장소 권장.
