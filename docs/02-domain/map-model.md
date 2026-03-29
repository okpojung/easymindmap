# easymindmap — Map & Domain Model

## 전체 도메인 엔티티

```
User
 └── Map (1:N)
      └── Node (1:N, 트리 구조)
      └── Revision (1:N, 변경 이력)
      └── PublishedMap (1:1)
      └── AIRequest (1:N)

Tag (전역, User 소속)
Node ←→ Tag (N:N)
```

### [변경 주석]
- 위 개요는 초기 도메인 이해용 요약으로는 여전히 유효하다.
- 다만 최신 설계 기준에서는 아래 확장이 추가된다.
  - Workspace / WorkspaceMember
  - Export
  - Translation
  - Dashboard field registry
- 따라서 이 문서는 "핵심 개념도"로 보고,
  실제 구현 범위는 schema.sql 및 system-architecture 문서와 함께 보아야 한다.

---

## MapObject

```typescript
type MapObject = {
  id: string;             // UUID
  ownerId: string;        // users.id
  title: string;
  rootNodeId: string;     // 루트 노드 ID

  // 설정
  defaultLayoutType: LayoutType;  // 전체 기본 레이아웃

  // [변경 주석]
  // 최신 schema.sql 기준으로 maps에는 아래 운영 필드도 함께 존재한다.
  // - workspaceId
  // - viewMode
  // - refreshIntervalSeconds
  // - currentVersion
  //
  // 이 문서에서는 핵심 도메인 개념을 우선 보여주기 위해 간단히 두었지만,
  // 실제 구현 타입에서는 아래처럼 확장하는 것을 권장한다.
  //
  // workspaceId?: string | null;
  // viewMode?: 'edit' | 'dashboard';
  // refreshIntervalSeconds?: number;
  // currentVersion?: number;

  // 상태
  deletedAt: string | null;       // soft delete
  createdAt: string;
  updatedAt: string;
};
```

---

## UserObject

```typescript
type UserObject = {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;

  // 설정
  preferredLanguage: 'ko' | 'en';
  defaultLayoutType: LayoutType;

  createdAt: string;
  updatedAt: string;
};
```

### [변경 주석]
- 위의 `passwordHash`는 기존 "직접 인증 구현" 시절의 모델 흔적이다.
- 현재 easymindmap의 최신 아키텍처는 **Supabase Auth**를 사용하므로,
  애플리케이션 도메인 모델에서 passwordHash를 직접 다루지 않는 것이 맞다.
- 따라서 실제 구현용 최종 UserObject는 아래처럼 이해하는 것을 권장한다.

```typescript
type UserObject = {
  id: string;
  email: string;
  displayName: string | null;

  // 설정
  preferredLanguage: 'ko' | 'en';
  defaultLayoutType: LayoutType;

  createdAt: string;
  updatedAt: string;
};
```

- 즉:
  - 비밀번호 해시 저장/검증 책임 → Supabase Auth
  - 앱 도메인 프로필 책임 → public.users

---

## RevisionObject

```typescript
type RevisionObject = {
  id: string;
  mapId: string;
  changeType: 'snapshot' | 'patch';
  data: object;           // snapshot이면 전체 nodes[], patch이면 이벤트
  createdAt: string;
};
```

### [변경 주석]
- 위 구조는 초기 개념 설명용으로는 이해하기 쉽다.
- 하지만 최신 autosave / backend / schema.sql 기준으로는
  `RevisionObject`를 아래처럼 patch 중심 버전 모델로 바꾸는 쪽이 더 정확하다.

```typescript
type RevisionObject = {
  id: string;
  mapId: string;
  version: number;
  patchJson: object;
  clientId?: string;
  patchId?: string;
  createdBy?: string;
  createdAt: string;
};
```

- 이유:
  - snapshot 중심 문서보다 patch/version 충돌 처리 모델이 최신 설계와 맞음
  - map_revisions 테이블 구조와 직접 대응 가능
  - idempotency(patchId) 설명 가능

---

## PublishedMapObject

```typescript
type PublishedMapObject = {
  id: string;
  mapId: string;
  publishId: string;      // URL slug (abcd1234)
  htmlPath: string;       // MinIO 내 저장 경로
  publishedAt: string;
  unpublishedAt: string | null;
};
```

### [변경 주석]
- 위 `htmlPath` / `MinIO` 설명은 기존 스토리지 구조 기준의 흔적이다.
- 현재 최신 설계는 **Supabase Storage**를 사용하므로,
  PublishedMapObject는 아래처럼 수정해서 이해하는 것이 맞다.

```typescript
type PublishedMapObject = {
  id: string;
  mapId: string;
  publishId: string;      // URL slug (abcd1234)
  storagePath: string;    // Supabase Storage 경로
  publishedAt: string;
  unpublishedAt: string | null;
};
```

- 즉:
  - htmlPath → storagePath
  - MinIO 내 저장 경로 → Supabase Storage 경로

---

## AIRequestObject

```typescript
type AIRequestObject = {
  id: string;
  userId: string;
  mapId: string;
  prompt: string;
  resultMarkdown: string;
  model: string;          // 사용한 LLM 모델명
  tokenUsed: number;
  createdAt: string;
};
```

### [변경 주석]
- 초기 도메인 관점에서는 AIRequestObject가 이해하기 쉽다.
- 하지만 최신 schema.sql / worker 구조 기준에서는 "요청"보다 "작업(Job)" 개념이 더 맞다.
- 실제 구현에 가까운 모델은 아래와 같다.

```typescript
type AIJobObject = {
  id: string;
  userId: string;
  mapId: string | null;
  jobType: 'generate' | 'expand' | 'summarize';
  prompt: string;
  resultMarkdown: string | null;
  model: string | null;
  tokensUsed: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
};
```

- 즉, 문서상 AIRequestObject는 유지하되,
  구현 단계에서는 ai_jobs 중심으로 재정렬하는 것이 좋다.

---

## TagObject

```typescript
type TagObject = {
  id: string;
  userId: string;         // 태그 소유자
  name: string;
  color: string;          // hex
  createdAt: string;
};
```

### [변경 주석]
- 최신 schema.sql에서는 tags.owner_id 컬럼명을 사용한다.
- TypeScript/도메인 모델에서는 userId로 표현해도 무방하지만,
  DB 매핑 계층에서는 owner_id ↔ userId 변환이 일관되게 필요하다.
