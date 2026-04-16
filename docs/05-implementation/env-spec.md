# easymindmap — 환경변수 명세

문서명: `docs/05-implementation/env-spec.md`  
변경: **Supabase Self-hosted 기준으로 DB / Storage / Auth 환경변수 전면 교체**

---

## 1. 원칙

- 민감정보는 `.env` (소스 저장소에 커밋 금지)
- 기능 토글도 `.env` (`FEATURE_*`)
- 환경별 차이는 `.env.*` 분리
- 코드에는 하드코딩 금지

## 2. 파일 구성

```
.env.example      (GitHub에 커밋 — 템플릿)
.env.local        (로컬 개발용, .gitignore)
.env.dev          (개발 서버용, .gitignore)
.env.staging      (스테이징, .gitignore)
.env.prod         (운영, .gitignore)
```

---

## 3. .env.example 전체

```bash
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
VITE_APP_NAME=easymindmap

########################################
# API
########################################
API_PORT=3000
API_PREFIX=/api
API_CORS_ORIGINS=http://localhost:8080
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=300

########################################
# AUTH — Supabase Auth 사용
# NestJS JWT 직접 구현 제거
########################################
# Supabase Auth가 JWT를 자동 처리
# NestJS에서는 Supabase Service Key로 토큰 검증만 수행
# 별도 AUTH_JWT_* 변수 불필요

########################################
# SUPABASE (Self-hosted on ESXi VM-03)
########################################
SUPABASE_URL=https://supabase.mindmap.ai.kr
SUPABASE_ANON_KEY=eyJ...                    # 공개 가능 (RLS로 보호)
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # 서버 전용, 절대 클라이언트 노출 금지

# 프론트엔드용 (VITE_ 접두사로 클라이언트에 노출)
VITE_SUPABASE_URL=https://supabase.mindmap.ai.kr
VITE_SUPABASE_ANON_KEY=eyJ...              # Anon Key만 클라이언트 노출 허용

# Supabase 직접 PostgreSQL 연결 (NestJS → DB 직접 쿼리 필요 시)
DATABASE_URL=postgresql://postgres:[PASSWORD]@VM-03-IP:5432/postgres

########################################
# REDIS (VM-04)
########################################
REDIS_HOST=VM-04-IP
REDIS_PORT=6379
REDIS_PASSWORD=change_me_redis_password
REDIS_DB=0
REDIS_TLS=false

########################################
# WEBSOCKET
########################################
WS_PORT=3100
WS_PATH=/ws
WS_PUBLIC_URL=wss://mindmap.ai.kr/ws
WS_ALLOWED_ORIGINS=https://mindmap.ai.kr

########################################
# STORAGE — Supabase Storage 사용
# MinIO 직접 설치 제거
########################################
# Supabase Storage가 S3 호환 API 제공
# 버킷은 Supabase 대시보드 또는 마이그레이션으로 생성
SUPABASE_STORAGE_BUCKET_UPLOADS=uploads
SUPABASE_STORAGE_BUCKET_ATTACHMENTS=attachments
SUPABASE_STORAGE_BUCKET_EXPORTS=exports
SUPABASE_STORAGE_BUCKET_PUBLISHED=published
SUPABASE_STORAGE_BUCKET_MEDIA=media

########################################
# AI
########################################
AI_PROVIDER=openai                    # openai | anthropic
AI_API_KEY=change_me_ai_api_key
AI_MODEL_GENERATE=gpt-4o
AI_MODEL_EXPAND=gpt-4o-mini
AI_MODEL_SUMMARIZE=gpt-4o-mini
AI_TIMEOUT_MS=60000
AI_MAX_RETRIES=2

########################################
# TRANSLATION (V2) — multilingual-translation.md v3.0
########################################

# 번역 엔진
TRANSLATION_PROVIDER=deepl
# deepl: DeepL API 사용 (권장)
# openai: OpenAI GPT 사용
# hybrid: DeepL 1차, LLM 2차 fallback (권장)

TRANSLATION_DEEPL_API_KEY=change_me_deepl_key
# DeepL API 키 (Free 또는 Pro)

TRANSLATION_DEFAULT_TARGETS=ko,en,ja
# 기본 번역 대상 언어 (쉼표 구분)

TRANSLATION_SKIP_SAME_LANGUAGE=true
# true: 노드 언어 = 열람자 언어이면 번역 생략

TRANSLATION_QUEUE_CONCURRENCY=5
# 번역 Worker 동시 처리 수

TRANSLATION_ENABLE_CACHE=true
# Redis 캐시 활성화 여부

# ── Redis 캐시 TTL (Sliding TTL + Jitter 전략) ─────────────
TRANSLATION_CACHE_TTL_INITIAL=7200
# 초기 저장 TTL (초). 기본: 2시간
# 처음 번역 결과를 Redis에 저장할 때 적용

TRANSLATION_CACHE_TTL_SLIDING=1800
# Sliding TTL (초). 기본: 30분
# 캐시 조회 시마다 TTL 리셋 (expire-after-access)
# 활성 세션 중 캐시 유지, 미접근 시 30분 후 자동 만료

TRANSLATION_CACHE_TTL_MAX=21600
# Max TTL 절대 상한 (초). 기본: 6시간
# 자주 접근해도 이 시간 후 강제 만료 (정기 캐시 갱신)

TRANSLATION_CACHE_TTL_JITTER=600
# Jitter 범위 (초). 기본: 10분
# TTL에 0~JITTER 랜덤값 추가 → Thundering Herd 방지

TRANSLATION_CACHE_MAX_MEMORY=512mb
# 번역 캐시 전용 Redis maxmemory 상한

TRANSLATION_CACHE_EVICTION_POLICY=allkeys-lru
# maxmemory 초과 시 eviction 정책
# allkeys-lru: 가장 오래 안 쓴 캐시부터 삭제 (권장)

########################################
# EXPORT
########################################
EXPORT_HTML_ENABLE=true
EXPORT_MARKDOWN_ENABLE=true
EXPORT_QUEUE_CONCURRENCY=3

########################################
# MAIL
########################################
# Supabase Auth 이메일은 Supabase .env에서 별도 설정
# (SMTP_HOST, SMTP_PORT 등 — Supabase docker/.env에 설정)
MAIL_ENABLED=false
MAIL_HOST=
MAIL_PORT=587
MAIL_FROM=no-reply@mindmap.ai.kr

########################################
# LOGGING / MONITORING
########################################
LOG_FORMAT=json
LOG_SQL=false
METRICS_ENABLED=true
METRICS_PORT=9090

########################################
# SECURITY
########################################
SECURITY_ENABLE_RATE_LIMIT=true
SECURITY_ENABLE_HELMET=true
SECURITY_MAX_UPLOAD_MB=20
SECURITY_ALLOWED_UPLOAD_MIME=image/png,image/jpeg,image/webp,application/pdf,text/markdown

########################################
# REDMINE INTEGRATION (V1 WBS)
# 참조: docs/04-extensions/integrations/31-redmine-integration.md
########################################
REDMINE_ENCRYPTION_KEY=change_me_redmine_aes256_key_32bytes
# AES-256-GCM 암호화 키 (redmine_project_maps.api_key_encrypted 복호화용)
# 반드시 32바이트(256비트) 이상의 랜덤값 사용
# 저장 형식: base64(iv).base64(authTag).base64(ciphertext)

REDMINE_SYNC_QUEUE_CONCURRENCY=3
# Redmine 동기화 Worker 동시 처리 수

REDMINE_SYNC_RETRY_TIMES=3
# BullMQ Job 최대 재시도 횟수 (Exponential Backoff: 1s → 2s → 4s)

########################################
# DASHBOARD (V3)
# 참조: docs/04-extensions/dashboard/22-dashboard.md
########################################
DASHBOARD_DEFAULT_REFRESH_INTERVAL=0
# 기본 리프레시 간격 (초). 0 = off
# 허용값: 0(off) | 10 | 30 | 60 | 300 | 600

DASHBOARD_REFRESH_CHANNEL_PREFIX=dashboard:
# Redis Pub/Sub 채널 접두사 (dashboard:{mapId} 형식)

########################################
# FEATURE FLAGS
########################################
FEATURE_REALTIME_COLLAB=false         # V1
FEATURE_AI_GENERATE=true
FEATURE_AI_TRANSLATION=false          # V2
FEATURE_EXPORT_HTML=true
FEATURE_EXPORT_MARKDOWN=true
FEATURE_PUBLISH=true
FEATURE_DASHBOARD_MAP=false           # V3
FEATURE_REDMINE_INTEGRATION=false     # V1 WBS
FEATURE_WBS=false                     # V1 WBS
FEATURE_BILLING=false
```

---

## 4. Supabase Self-hosted 전용 설정

Supabase VM-03의 `/opt/supabase/.env`에서 별도 관리:

```bash
# /opt/supabase/.env (VM-03 전용)

# 필수 시크릿 (generate-keys.sh로 자동 생성)
POSTGRES_PASSWORD=change_me_strong_password
JWT_SECRET=change_me_jwt_secret_64chars
ANON_KEY=eyJ...
SERVICE_ROLE_KEY=eyJ...
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=change_me_dashboard_password

# 외부 접근 URL
SUPABASE_PUBLIC_URL=https://supabase.mindmap.ai.kr
API_EXTERNAL_URL=https://supabase.mindmap.ai.kr
SITE_URL=https://mindmap.ai.kr

# SMTP (회원가입 이메일 발송)
SMTP_ADMIN_EMAIL=admin@mindmap.ai.kr
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_app_password
SMTP_SENDER_NAME=easymindmap
```

---

## 5. 환경별 주요 차이

### .env.local (로컬 개발)
```bash
APP_ENV=development
SUPABASE_URL=http://localhost:54321    # supabase start (CLI)
VITE_SUPABASE_URL=http://localhost:54321
REDIS_HOST=localhost
LOG_SQL=true
```

### .env.prod (운영)
```bash
APP_ENV=production
SUPABASE_URL=https://supabase.mindmap.ai.kr
VITE_SUPABASE_URL=https://supabase.mindmap.ai.kr
REDIS_HOST=VM-04-IP
REDIS_TLS=false                        # 내부망이므로 TLS 불필요
LOG_SQL=false
SECURITY_ENABLE_CSP=true
```

---

## 6. 운영 필수 주의 변수

아래 값은 절대 소스코드 저장소에 커밋하지 않습니다:

```
SUPABASE_SERVICE_ROLE_KEY   ← 가장 중요! 전체 DB 접근 권한
POSTGRES_PASSWORD
REDIS_PASSWORD
AI_API_KEY
TRANSLATION_DEEPL_API_KEY
REDMINE_ENCRYPTION_KEY      ← Redmine API Key AES-256 암호화 마스터 키 (V1 WBS)
INVITE_TOKEN_SECRET         ← 협업 초대 토큰 서명 키
FCM_PRIVATE_KEY             ← Firebase 서비스 계정 키 (V3 알림)
```

운영 환경에서는 **Vault 또는 별도 비밀 저장소** 권장.

---

## 7. NestJS에서 Supabase 연동 방식

```typescript
// supabase.service.ts — Service Key로 서버 사이드 접근
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,   // 서버 전용
);

// 사용자 JWT 검증
const { data: { user } } = await supabaseAdmin.auth.getUser(bearerToken);
```

```typescript
// frontend — Anon Key만 사용 (RLS로 보호)
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,  // Anon Key만
);
```

---

## [v3.3 추가] 협업 관련 환경변수 (V1 구현 전 추가 필요)

```bash
########################################
# COLLABORATION — 협업맵 초대 / 알림
########################################

# 초대 토큰 설정
INVITE_TOKEN_SECRET=change_me_invite_secret   # 초대 토큰 서명 키
INVITE_TOKEN_EXPIRES_DAYS=7                    # 초대 링크 유효 기간 (일)
INVITE_BASE_URL=https://mindmap.ai.kr/invite   # 초대 수락 URL 기반 경로

# 이메일 발송 (초대 이메일)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@mindmap.ai.kr
SMTP_PASSWORD=change_me_smtp_password
SMTP_FROM_NAME=easymindmap
SMTP_FROM_EMAIL=noreply@mindmap.ai.kr

# FCM (Firebase Cloud Messaging) — V3 알림 구현 전 준비
# 협업 초대/탈퇴/소유권이양 등 푸시 알림용
FCM_PROJECT_ID=                   # Firebase 프로젝트 ID (V3 구현 시 활성화)
FCM_CLIENT_EMAIL=                 # Firebase 서비스 계정 이메일
FCM_PRIVATE_KEY=                  # Firebase 서비스 계정 Private Key

# 협업 기능 토글
FEATURE_COLLABORATION=true        # 협업맵 기능 활성화 여부
FEATURE_COLLAB_INVITE_EMAIL=true  # 초대 이메일 발송 여부
FEATURE_FCM_NOTIFY=false          # FCM 푸시 알림 (V3 구현 전까지 false)
```

> **주의**: `INVITE_TOKEN_SECRET`, `SMTP_PASSWORD`, `FCM_PRIVATE_KEY`는 절대 소스코드에 하드코딩 금지.  
> 운영 환경에서는 Vault 또는 비밀 관리 시스템 사용.
