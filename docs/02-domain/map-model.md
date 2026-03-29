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
