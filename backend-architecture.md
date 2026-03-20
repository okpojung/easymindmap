# easymindmap — Backend 개발 아키텍처

> 문서 위치: `docs/dev/backend-architecture.md`  
> 스택: NestJS + TypeScript + PostgreSQL + Redis + BullMQ

---

## 1. 프로젝트 구조

```
apps/api/
 ├── src/
 │   ├── main.ts
 │   ├── app.module.ts
 │   │
 │   ├── auth/                   # 인증 모듈
 │   │   ├── auth.module.ts
 │   │   ├── auth.controller.ts
 │   │   ├── auth.service.ts
 │   │   ├── strategies/
 │   │   │   ├── jwt.strategy.ts
 │   │   │   └── refresh.strategy.ts
 │   │   └── guards/
 │   │       └── jwt-auth.guard.ts
 │   │
 │   ├── users/                  # 사용자 모듈
 │   ├── workspaces/             # 워크스페이스 모듈
 │   │
 │   ├── maps/                   # 맵 모듈
 │   │   ├── maps.module.ts
 │   │   ├── maps.controller.ts
 │   │   ├── maps.service.ts
 │   │   ├── maps.repository.ts
 │   │   └── dto/
 │   │
 │   ├── nodes/                  # 노드 모듈
 │   │   ├── nodes.module.ts
 │   │   ├── nodes.controller.ts
 │   │   ├── nodes.service.ts
 │   │   ├── nodes.repository.ts
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
 │   ├── ai/                     # AI 모듈
 │   │   ├── ai.module.ts
 │   │   ├── ai.controller.ts
 │   │   ├── ai.service.ts
 │   │   └── gateway/            # AI Gateway
 │   │       ├── ai-gateway.service.ts
 │   │       ├── model-router.ts
 │   │       ├── token-manager.ts
 │   │       └── rate-limiter.ts
 │   │
 │   ├── translation/            # 번역 모듈 (V2)
 │   │   ├── translation.module.ts
 │   │   ├── translation.service.ts
 │   │   └── providers/
 │   │       ├── deepl.provider.ts
 │   │       └── llm-fallback.provider.ts
 │   │
 │   ├── export/                 # Export 모듈
 │   ├── publish/                # Publish 모듈
 │   ├── tags/                   # 태그 모듈
 │   ├── media/                  # 미디어/첨부파일 모듈
 │   ├── search/                 # 검색 모듈
 │   ├── revisions/              # 버전 히스토리
 │   ├── audit/                  # 감사 로그
 │   │
 │   ├── common/                 # 공통 유틸
 │   │   ├── filters/            # Exception filters
 │   │   ├── interceptors/       # Logging, Transform
 │   │   ├── decorators/
 │   │   └── pipes/
 │   │
 │   ├── database/               # DB 연결 설정
 │   └── redis/                  # Redis 연결 설정
 │
 ├── test/
 └── package.json
```

---

## 2. 핵심 API 명세

### Auth

```
POST /auth/signup          회원가입
POST /auth/login           로그인 → access/refresh token
POST /auth/refresh         토큰 갱신
POST /auth/logout          로그아웃
```

### Maps

```
GET    /maps               맵 목록 (워크스페이스 기준)
POST   /maps               맵 생성
GET    /maps/:id           맵 상세 (노드 트리 포함)
DELETE /maps/:id           맵 삭제
PATCH  /maps/:id           맵 메타 수정 (title, view_mode 등)
PATCH  /maps/:id/document  Autosave patch 저장
GET    /maps/:id/snapshot  대시보드 리프레시용 경량 API
```

### Nodes

```
POST   /nodes              노드 생성
PATCH  /nodes/:id          노드 수정
DELETE /nodes/:id          노드 삭제
PATCH  /nodes/:id/move     노드 이동 (부모 변경)
```

### AI

```
POST /ai/generate          프롬프트 → 맵 자동 생성
POST /ai/expand/:nodeId    선택 노드 하위 자동 확장
POST /ai/summarize/:nodeId 노드 내용 요약
```

### Export / Publish

```
POST /maps/:id/export/markdown   Markdown export 요청
POST /maps/:id/export/html       HTML export 요청
GET  /exports/:jobId/status      export 진행 상태 확인
POST /maps/:id/publish           퍼블리시
```

---

## 3. Autosave Service — patch 처리 로직

```typescript
@Injectable()
export class AutosaveService {
  async applyPatch(mapId: string, userId: string, dto: PatchDto): Promise<void> {
    const { clientId, patchId, baseVersion, patches } = dto;

    // 1. 중복 patch 검사 (idempotency)
    const isDuplicate = await this.checkDuplicate(mapId, patchId);
    if (isDuplicate) return; // 이미 처리된 patch → 무시

    // 2. 버전 충돌 검사
    const currentVersion = await this.getMapVersion(mapId);
    if (currentVersion !== baseVersion) {
      throw new ConflictException({ currentVersion, message: 'Version mismatch' });
    }

    // 3. patch 적용 (트랜잭션)
    await this.db.transaction(async (trx) => {
      for (const patch of patches) {
        await this.applyNodePatch(patch, userId, trx);
      }

      // 4. 버전 증가 + revision 기록
      const newVersion = currentVersion + 1;
      await this.updateMapVersion(mapId, newVersion, trx);
      await this.saveRevision(mapId, userId, patches, newVersion, patchId, trx);
    });

    // 5. Redis snapshot 캐시 무효화
    await this.redis.del(`snapshot:${mapId}`);

    // 6. WebSocket broadcast (협업 참가자에게 알림)
    await this.wsGateway.broadcastPatch(mapId, patches, userId);
  }
}
```

---

## 4. Snapshot Service — Redis 캐시

```typescript
@Injectable()
export class SnapshotService {
  async getSnapshot(mapId: string): Promise<SnapshotDto> {
    const cacheKey = `snapshot:${mapId}`;

    // Redis 캐시 확인
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // DB 조회
    const nodes = await this.db.query(
      'SELECT id, text, text_lang, text_hash, updated_at FROM nodes WHERE map_id = $1',
      [mapId]
    );
    const mapVersion = await this.getMapVersion(mapId);

    const snapshot: SnapshotDto = { mapVersion, nodes };

    // Redis 캐시 저장 (TTL: 24초 기본)
    const map = await this.getMap(mapId);
    const ttl = map.refresh_interval_seconds > 0
      ? Math.floor(map.refresh_interval_seconds * 0.8)
      : 30;
    await this.redis.set(cacheKey, JSON.stringify(snapshot), 'EX', ttl);

    return snapshot;
  }
}
```

---

## 5. AI Gateway

```typescript
@Injectable()
export class AiGatewayService {
  async complete(request: AiRequest): Promise<AiResponse> {
    // 1. 사용량 제한 확인
    await this.rateLimiter.check(request.workspaceId, request.model);

    // 2. 모델 라우팅
    const model = this.modelRouter.select({
      jobType: request.jobType,    // generate / expand / translate
      priority: request.priority,  // speed / quality / cost
      workspacePlan: request.plan,
    });

    // 3. 토큰 사용량 추적
    const response = await model.complete(request.prompt);
    await this.tokenManager.record(request.workspaceId, response.usage);

    return response;
  }
}

@Injectable()
export class ModelRouter {
  select(opts: RouterOptions): LlmProvider {
    // generate (고품질) → GPT-4o or Claude Opus
    if (opts.jobType === 'generate' && opts.priority === 'quality') {
      return this.providers.openai_gpt4o;
    }
    // translate / summarize (속도/비용 우선) → GPT-4o-mini
    if (opts.jobType === 'translate' || opts.jobType === 'summarize') {
      return this.providers.openai_mini;
    }
    // 기본값
    return this.providers.openai_gpt4o;
  }
}
```

---

## 6. Translation Worker

```typescript
@Processor('translation')
export class TranslationWorker {
  @Process()
  async process(job: Job<TranslationJobData>) {
    const { nodeId, sourceLang, targetLang } = job.data;

    // 1. 최신 노드 텍스트 및 hash 조회
    const node = await this.nodesRepo.findById(nodeId);

    // 2. 기존 캐시 유효성 확인 (hash 비교)
    const existing = await this.translationsRepo.find(nodeId, targetLang);
    if (existing?.source_text_hash === node.text_hash) {
      return; // 이미 유효한 캐시 존재
    }

    // 3. 번역 실행 (DeepL 1차 / LLM 2차 fallback)
    let translated: string;
    try {
      translated = await this.deepl.translate(node.text, sourceLang, targetLang);
    } catch {
      translated = await this.llmFallback.translate(node.text, sourceLang, targetLang);
    }

    // 4. 캐시 저장
    await this.translationsRepo.upsert({
      node_id: nodeId,
      target_lang: targetLang,
      translated_text: translated,
      source_text_hash: node.text_hash,
    });

    // 5. WebSocket broadcast
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

## 7. 개발 환경 설정

```bash
# 의존성 설치
npm install

# 개발 서버 (hot reload)
npm run start:dev

# DB 마이그레이션 생성
npm run migration:generate -- -n MigrationName

# DB 마이그레이션 실행
npm run migration:run

# 테스트
npm run test
npm run test:e2e
```

---

## 8. 환경변수 (Backend)

`docs/infra/env-spec.md` 참고. 핵심 변수:

```dotenv
DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
REDIS_HOST / REDIS_PORT
AI_PROVIDER / AI_API_KEY / AI_MODEL_GENERATE
TRANSLATION_PROVIDER / TRANSLATION_DEEPL_API_KEY
MINIO_ENDPOINT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY
AUTH_JWT_ACCESS_SECRET / AUTH_JWT_REFRESH_SECRET
```
