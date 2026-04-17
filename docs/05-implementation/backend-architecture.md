# easymindmap — Backend 개발 아키텍처

문서 위치: `docs/05-implementation/backend-architecture.md`  
스택: **NestJS + TypeScript + Supabase Self-hosted + Redis + BullMQ**  
변경: 2026-03-27 — PostgreSQL/MinIO/JWT 직접 구현 → Supabase Self-hosted 전환  
변경: 2026-04-16 — Collaboration 모듈 상세화, Dashboard/Redmine 모듈 추가, BullMQ 워커 모듈 목록 확장

---

## 1. 프로젝트 구조

```
apps/api/
 ├── src/
 │   ├── main.ts
 │   ├── app.module.ts
 │   │
 │   ├── auth/                   # 인증 모듈 (Supabase Auth 래핑)
 │   │   ├── auth.module.ts
 │   │   ├── auth.controller.ts
 │   │   ├── auth.service.ts     # Supabase Auth API 호출
 │   │   └── guards/
 │   │       └── supabase-auth.guard.ts  # JWT 검증 (Supabase 방식)
 │   │   # ⛔ 제거: jwt.strategy.ts, refresh.strategy.ts
 │   │   # ✅ 대체: Supabase Auth가 JWT 발급/갱신 처리
 │   │
 │   ├── users/                  # 사용자 모듈
 │   ├── workspaces/             # 워크스페이스 모듈
 │   │
 │   ├── maps/                   # 맵 모듈
 │   │   ├── maps.module.ts
 │   │   ├── maps.controller.ts
 │   │   ├── maps.service.ts
 │   │   ├── maps.repository.ts  # Supabase JS Client 사용
 │   │   └── dto/
 │   │
 │   ├── nodes/                  # 노드 모듈
 │   │   ├── nodes.module.ts
 │   │   ├── nodes.controller.ts
 │   │   ├── nodes.service.ts
 │   │   ├── nodes.repository.ts # Supabase JS Client 사용
 │   │   └── dto/
 │   │
 │   ├── autosave/               # Autosave patch ingest
 │   │   ├── autosave.module.ts
 │   │   ├── autosave.controller.ts
 │   │   ├── autosave.service.ts
 │   │   └── patch-validator.ts  # clientId/patchId 중복 검사
 │   │
 │   ├── snapshot/               # Dashboard 스냅샷 API
 │   │   ├── snapshot.module.ts
 │   │   ├── snapshot.controller.ts
 │   │   └── snapshot.service.ts # Redis 캐시 적용
 │   │
 │   ├── media/                  # 미디어/첨부파일 (Supabase Storage)
 │   │   ├── media.module.ts
 │   │   ├── media.controller.ts
 │   │   └── media.service.ts    # Supabase Storage API 호출
 │   │   # ⛔ 제거: MinIO 클라이언트
 │   │   # ✅ 대체: Supabase Storage (S3 호환)
 │   │
 │   ├── publish/                # Publish 모듈
 │   │   └── publish.service.ts  # Supabase Storage에 HTML 업로드
 │   │
 │   ├── ai/                     # AI 모듈
 │   │   ├── ai.module.ts
 │   │   ├── ai.controller.ts
 │   │   ├── ai.service.ts
 │   │   └── gateway/
 │   │       ├── ai-gateway.service.ts
 │   │       ├── model-router.ts
 │   │       ├── token-manager.ts
 │   │       └── rate-limiter.ts
 │   │
 │   ├── translation/            # 번역 모듈 (V2)
 │   │   ├── translation.module.ts
 │   │   ├── translation.service.ts       # shouldTranslate() 번역 여부 결정 통합
 │   │   ├── translation-cache.service.ts # Redis Sliding TTL 캐시 관리
 │   │   │                                # (TTL_INITIAL, TTL_SLIDING, TTL_MAX, Jitter)
 │   │   ├── language-detect.service.ts   # franc 언어 자동 감지 (ISO 639-1)
 │   │   ├── translation-mode.service.ts  # translation_mode 결정 로직
 │   │   │                                # (노드 저장 시 'auto'|'skip' 자동 계산)
 │   │   ├── translation.controller.ts    # REST API 엔드포인트
 │   │   └── providers/
 │   │       ├── deepl.provider.ts        # DeepL API 1차 번역 엔진
 │   │       └── llm-fallback.provider.ts # OpenAI GPT fallback (DeepL 실패/미지원 언어)
 │   │
 │   ├── export/                 # Export 모듈 (BullMQ 'export' 큐)
 │   ├── tags/                   # 태그 모듈
 │   ├── search/                 # 검색 모듈
 │   ├── revisions/              # 버전 히스토리
 │   ├── audit/                  # 감사 로그
 │   │
 │   ├── dashboard/              # Dashboard 모듈 (V3)
 │   │   ├── dashboard.module.ts
 │   │   ├── dashboard.controller.ts  # PATCH /maps/:id/view-mode, /refresh-interval, /data
 │   │   ├── dashboard.service.ts     # 외부 노드 업데이트, API Key 검증
 │   │   └── schema.controller.ts     # GET /api/dashboard/schema/node-fields (field_registry)
 │   │
 │   ├── redmine/                # Redmine 연동 모듈 (V1 WBS)
 │   │   ├── redmine.module.ts
 │   │   ├── redmine.controller.ts    # POST /maps/:id/redmine/connect, sync, status, logs
 │   │   ├── redmine.service.ts       # Redmine API 호출, Pull/Push 동기화
 │   │   ├── redmine-crypto.service.ts # AES-256-GCM 암호화/복호화
 │   │   └── workers/
 │   │       └── redmine-sync.worker.ts  # BullMQ Worker (Exponential Backoff: 1s→2s→4s, 최대 3회)
 │   │
 │   ├── common/
 │   │   ├── filters/
 │   │   ├── interceptors/
 │   │   ├── decorators/
 │   │   └── pipes/
 │   │
 │   ├── supabase/               # Supabase Client 싱글톤 ← NEW
 │   │   ├── supabase.module.ts
 │   │   └── supabase.service.ts
 │   │   # ⛔ 제거: database/ (TypeORM 직접 연결)
 │   │   # ✅ 대체: Supabase JS Client (Service Role Key)
 │   │
 │   └── redis/                  # Redis 연결 설정
 │
 ├── test/
 └── package.json
```

---

## 2. Supabase 연동 핵심 패턴

### 2.1 SupabaseService (싱글톤)

```typescript
// supabase/supabase.service.ts
import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor() {
    this.client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,  // 서버 전용 — 절대 클라이언트 노출 금지
    );
  }

  get db() { return this.client; }
  get storage() { return this.client.storage; }
  get auth() { return this.client.auth; }
  get from() { return this.client.from.bind(this.client); }
}
```

### 2.2 Auth Guard (Supabase JWT 검증)

```typescript
// auth/guards/supabase-auth.guard.ts
// ⛔ 기존: PassportStrategy(jwt.strategy.ts) 제거
// ✅ 대체: Supabase getUser()로 토큰 검증

import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing token');
    }

    const token = authHeader.slice(7);
    const { data: { user }, error } = await this.supabase.auth.getUser(token);

    if (error || !user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.user = user;  // { id, email, ... }
    return true;
  }
}
```

### 2.3 Auth Service (회원가입 / 로그인)

```typescript
// auth/auth.service.ts
@Injectable()
export class AuthService {
  constructor(private readonly supabase: SupabaseService) {}

  async signup(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signUp({ email, password });
    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async login(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new UnauthorizedException(error.message);
    return {
      accessToken: data.session!.access_token,
      refreshToken: data.session!.refresh_token,
      user: data.user,
    };
  }

  async refresh(refreshToken: string) {
    const { data, error } = await this.supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error) throw new UnauthorizedException(error.message);
    return {
      accessToken: data.session!.access_token,
      refreshToken: data.session!.refresh_token,
    };
  }

  async logout(accessToken: string) {
    await this.supabase.auth.signOut();
  }
}
```

### 2.4 Repository 패턴 (Supabase JS Client)

```typescript
// maps/maps.repository.ts
// ⛔ 기존: TypeORM Repository
// ✅ 대체: Supabase JS Client

@Injectable()
export class MapsRepository {
  constructor(private readonly supabase: SupabaseService) {}

  async findByOwner(ownerId: string) {
    const { data, error } = await this.supabase
      .from('maps')
      .select('*')
      .eq('owner_id', ownerId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async findWithNodes(mapId: string) {
    const { data: map, error: mapErr } = await this.supabase
      .from('maps')
      .select('*')
      .eq('id', mapId)
      .single();

    const { data: nodes, error: nodeErr } = await this.supabase
      .from('nodes')
      .select('*')
      .eq('map_id', mapId)
      .order('depth', { ascending: true })
      .order('order_index', { ascending: true });

    if (mapErr || nodeErr) throw new InternalServerErrorException();
    return { ...map, nodes };
  }

  async create(ownerId: string, title: string) {
    const { data, error } = await this.supabase
      .from('maps')
      .insert({ owner_id: ownerId, title })
      .select()
      .single();

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }
}
```

### 2.5 Storage 연동 (Supabase Storage)

```typescript
// media/media.service.ts
// ⛔ 기존: MinIO Client
// ✅ 대체: Supabase Storage

@Injectable()
export class MediaService {
  constructor(private readonly supabase: SupabaseService) {}

  async uploadFile(
    bucket: string,
    path: string,
    file: Buffer,
    mimeType: string,
  ) {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: mimeType, upsert: true });

    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  getPublicUrl(bucket: string, path: string): string {
    const { data } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    return data.publicUrl;
  }

  async deleteFile(bucket: string, path: string) {
    const { error } = await this.supabase.storage
      .from(bucket)
      .remove([path]);
    if (error) throw new InternalServerErrorException(error.message);
  }
}

// publish/publish.service.ts — HTML Export → Supabase Storage 업로드
async publishMap(mapId: string, html: string): Promise<string> {
  const publishId = generatePublishId();   // 랜덤 8자
  const path = `${publishId}/index.html`;

  await this.media.uploadFile(
    'published',                           // 공개 버킷
    path,
    Buffer.from(html, 'utf-8'),
    'text/html',
  );

  const publicUrl = this.media.getPublicUrl('published', path);

  await this.supabase.from('published_maps').insert({
    map_id: mapId,
    publish_id: publishId,
    storage_path: path,
  });

  return publicUrl;
}
```

---

## 3. 핵심 API 명세

```
Auth (Supabase Auth 래핑)
POST /auth/signup          회원가입
POST /auth/login           로그인 → access/refresh token
POST /auth/refresh         토큰 갱신
POST /auth/logout          로그아웃

Maps
GET    /maps               맵 목록
POST   /maps               맵 생성
GET    /maps/:id           맵 상세 (노드 트리 포함)
DELETE /maps/:id           맵 삭제 (soft delete)
PATCH  /maps/:id           맵 메타 수정 (title, view_mode 등)
PATCH  /maps/:id/document  Autosave patch 저장
GET    /maps/:id/snapshot  대시보드 리프레시용 경량 API

Nodes
POST   /nodes              노드 생성
PATCH  /nodes/:id          노드 수정
DELETE /nodes/:id          노드 삭제
PATCH  /nodes/:id/move     노드 이동 (부모 변경)

AI
POST /ai/generate          프롬프트 → 맵 자동 생성
POST /ai/expand/:nodeId    선택 노드 하위 자동 확장
POST /ai/summarize/:nodeId 노드 내용 요약

Export / Publish
POST /maps/:id/export/markdown   Markdown export 요청
POST /maps/:id/export/html       HTML export 요청
GET  /exports/:jobId/status      export 진행 상태 확인
POST /maps/:id/publish           Supabase Storage에 HTML 업로드 → 공개 URL 반환

Translation (V2)
GET    /users/me/language-settings              사용자 언어 설정 조회
PATCH  /users/me/language-settings              사용자 언어 설정 수정
                                                body: { preferredLanguage, secondaryLanguages, skipEnglishTranslation }

GET    /maps/:id/translation-policy             맵 번역 정책 조회
PATCH  /maps/:id/translation-policy             맵 번역 정책 수정
                                                body: { skipLanguages: string[], skipEnglish: boolean|null } | null

PATCH  /nodes/:id/translation-override          노드 번역 override 설정
                                                body: { override: 'force_on'|'force_off'|null }

GET    /maps/:id/translations?lang=en           맵 내 특정 언어 번역 일괄 조회 (초기 로딩 최적화)
POST   /maps/:id/translations/batch             미번역 노드 배치 번역 요청 (TRANS-06)
POST   /maps/:id/retranslate                    맵 전체 재번역 요청 (관리용, 번역 엔진 업그레이드 시)

POST   /translate/chat                          채팅 메시지 번역 (내부 서버 간 호출, TRANS-08)
GET    /translate/chat/:messageId/:targetLang   채팅 번역 캐시 조회 (Redis 24h TTL)

Collaboration (V1~)
POST   /maps/:id/collaborators                  협업자 초대 (creator 전용)
GET    /maps/:id/collaborators                  협업자 목록 조회
PATCH  /maps/:id/collaborators/:collaboratorId  편집 범위(scope) 변경 (creator 전용)
DELETE /maps/:id/collaborators/:collaboratorId  협업자 강제 탈퇴 (creator 전용)
POST   /invite/accept                           초대 수락 (토큰 기반)
PATCH  /maps/:id/transfer-ownership             소유권 이양 (creator 전용)
GET    /maps/:id/ownership-history              소유권 이양 이력 조회
GET    /maps/:id/my-permissions                 내 편집 권한 조회

Dashboard (V3)
PATCH  /maps/:id/view-mode                      대시보드 모드 전환 (view_mode 변경)
PATCH  /maps/:id/refresh-interval               갱신 주기 설정
PATCH  /maps/:id/data                           외부 시스템 노드 값 일괄 업데이트 (API Key 인증)
GET    /maps/:id/api-key                        대시보드 API Key 조회
GET    /api/dashboard/schema/node-fields        편집 가능 필드 목록 (field_registry, 인증 불필요)
GET    /api/dashboard/maps/:id/nodes            대시보드 웹앱용 노드 목록 (_meta 포함)

Redmine (V1 WBS)
POST   /maps/:id/redmine/connect                Redmine 연동 설정 (URL/API Key/프로젝트 ID)
POST   /maps/:id/redmine/sync                   수동 Push/Pull 동기화 { direction: 'push'|'pull' }
GET    /maps/:id/redmine/status                 연동 상태 조회
GET    /maps/:id/redmine/logs                   동기화 이력 조회 (redmine_sync_log)
```

---

## 4. Autosave Service — patch 처리 로직

```typescript
@Injectable()
export class AutosaveService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly redis: RedisService,
    private readonly wsGateway: WsGateway,
  ) {}

  async applyPatch(mapId: string, userId: string, dto: PatchDto): Promise<void> {
    const { clientId, patchId, baseVersion, patches } = dto;

    // 1. 중복 patch 검사 (idempotency — Redis SET NX)
    const isDuplicate = await this.checkDuplicate(mapId, patchId);
    if (isDuplicate) return;

    // 2. 버전 충돌 검사
    const { data: map } = await this.supabase
      .from('maps')
      .select('current_version')
      .eq('id', mapId)
      .single();

    if (map.current_version !== baseVersion) {
      throw new ConflictException({
        currentVersion: map.current_version,
        message: 'Version mismatch',
      });
    }

    // 3. patch 적용 (Supabase JS Client 배치 처리)
    for (const patch of patches) {
      await this.applyNodePatch(patch, userId);
    }

    // 4. 버전 증가 + revision 기록
    const newVersion = baseVersion + 1;
    await this.supabase
      .from('maps')
      .update({ current_version: newVersion, updated_at: new Date() })
      .eq('id', mapId);

    await this.supabase.from('map_revisions').insert({
      map_id: mapId,
      version: newVersion,
      patch_json: patches,
      client_id: clientId,
      patch_id: patchId,
      created_by: userId,
    });

    // 5. Redis snapshot 캐시 무효화
    await this.redis.del(`snapshot:${mapId}`);

    // 6. WebSocket broadcast (협업 참가자)
    await this.wsGateway.broadcastPatch(mapId, patches, userId);
  }
}
```

---

## 5. Snapshot Service — Redis 캐시

```typescript
@Injectable()
export class SnapshotService {
  async getSnapshot(mapId: string): Promise<SnapshotDto> {
    const cacheKey = `snapshot:${mapId}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Supabase에서 경량 필드만 조회
    const { data: nodes } = await this.supabase
      .from('nodes')
      .select('id, text, text_lang, text_hash, updated_at')
      .eq('map_id', mapId);

    const { data: map } = await this.supabase
      .from('maps')
      .select('current_version, refresh_interval_seconds')
      .eq('id', mapId)
      .single();

    const snapshot = { mapVersion: map.current_version, nodes };

    const ttl = map.refresh_interval_seconds > 0
      ? Math.floor(map.refresh_interval_seconds * 0.8)
      : 30;
    await this.redis.set(cacheKey, JSON.stringify(snapshot), 'EX', ttl);

    return snapshot;
  }
}
```

---

## 6. AI Gateway

```typescript
@Injectable()
export class AiGatewayService {
  async complete(request: AiRequest): Promise<AiResponse> {
    await this.rateLimiter.check(request.workspaceId, request.model);

    const model = this.modelRouter.select({
      jobType: request.jobType,
      priority: request.priority,
      workspacePlan: request.plan,
    });

    const response = await model.complete(request.prompt);
    await this.tokenManager.record(request.workspaceId, response.usage);
    return response;
  }
}

@Injectable()
export class ModelRouter {
  select(opts: RouterOptions): LlmProvider {
    if (opts.jobType === 'generate' && opts.priority === 'quality') {
      return this.providers.openai_gpt4o;
    }
    if (opts.jobType === 'translate' || opts.jobType === 'summarize') {
      return this.providers.openai_mini;
    }
    return this.providers.openai_gpt4o;
  }
}
```

---

## 7. Translation Worker

```typescript
@Processor('translation')
export class TranslationWorker {
  @Process()
  async process(job: Job<TranslationJobData>) {
    const { nodeId, sourceLang, targetLang } = job.data;

    const { data: node } = await this.supabase
      .from('nodes')
      .select('text, text_hash, map_id')
      .eq('id', nodeId)
      .single();

    const { data: existing } = await this.supabase
      .from('node_translations')
      .select('source_text_hash')
      .eq('node_id', nodeId)
      .eq('target_lang', targetLang)
      .single();

    if (existing?.source_text_hash === node.text_hash) return;

    let translated: string;
    try {
      translated = await this.deepl.translate(node.text, sourceLang, targetLang);
    } catch {
      translated = await this.llmFallback.translate(node.text, sourceLang, targetLang);
    }

    await this.supabase.from('node_translations').upsert({
      node_id: nodeId,
      target_lang: targetLang,
      translated_text: translated,
      source_text_hash: node.text_hash,
    });

    await this.wsGateway.broadcastTranslation(node.map_id, {
      nodeId,
      targetLang,
      translatedText: translated,
      textHash: node.text_hash,
    });
  }
}
```

---

## 8. 개발 환경 설정

```bash
# 의존성 설치
npm install

# Supabase CLI로 로컬 Supabase 실행 (개발용)
npx supabase start
# → http://localhost:54321 (API)
# → http://localhost:54323 (Studio)

# 개발 서버 (hot reload)
npm run start:dev

# DB 마이그레이션 (Supabase CLI)
npx supabase db push          # schema.sql 적용
npx supabase db diff          # 변경사항 확인

# 테스트
npm run test
npm run test:e2e
```

---

## 9. 환경변수 (Backend 핵심)

> 전체 명세: `docs/05-implementation/env-spec.md` 참고

```bash
# Supabase (기존 DB_* / MINIO_* / AUTH_JWT_* 전부 제거)
SUPABASE_URL=https://supabase.mindmap.ai.kr
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # 서버 전용

# Redis (유지)
REDIS_HOST=VM-04-IP
REDIS_PORT=6379
REDIS_PASSWORD=...

# AI
AI_PROVIDER=openai
AI_API_KEY=...
AI_MODEL_GENERATE=gpt-4o

# 번역 (V2)
TRANSLATION_PROVIDER=deepl
TRANSLATION_DEEPL_API_KEY=...
```

### 제거된 환경변수 (Supabase가 대체)

```bash
# ⛔ 아래는 더 이상 사용하지 않음
DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY
AUTH_JWT_ACCESS_SECRET / AUTH_JWT_REFRESH_SECRET
```

---

## [v3.3 추가] Collaboration Module

```
apps/api/src/
  collaboration/
    collaboration.module.ts
    collaboration.service.ts      ← 초대/탈퇴/scope 관리
    collaboration.controller.ts   ← REST 엔드포인트
    guards/
      collab-member.guard.ts      ← 맵 참여자 확인
      collab-scope.guard.ts       ← scope 범위 검사
      node-owner.guard.ts         ← 노드 소유권 검사
    services/
      permission.service.ts       ← canEdit() / canModifyOrDelete()
      invite.service.ts           ← 초대 토큰 생성, 이메일 발송
      ownership-transfer.service.ts
    entities/
      map-collaborator.entity.ts
      map-ownership-history.entity.ts
```

> 상세 권한 정책 및 Scope 알고리즘: `docs/04-extensions/collaboration/25-map-collaboration.md` §13, §15
> WebSocket 이벤트 페이로드: `docs/04-extensions/collaboration/25-map-collaboration.md` §14
