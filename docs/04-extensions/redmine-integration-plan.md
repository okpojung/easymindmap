# easymindmap — Redmine Integration 설계

## 개요

Redmine 프로젝트의 issue를 **Mindmap/WBS 형태로 시각화 및 편집**하는 외부 연동 확장.

MVP에서는 구현하지 않으며, **현재 아키텍처(Command Engine / DocumentStore / Adapter Layer)가 확장을 수용할 수 있도록 설계 반영**하는 것이 목적.

---

## 목표 기능

### 시각화 (1차)

```
Redmine project  →  Mindmap 변환
issue            →  NodeObject 매핑
sub-issue        →  child node (parent-child 계층 유지)
status           →  노드 색상 badge
done_ratio       →  진행률 indicator
```

### 편집 (2차)

| 편집 동작 | Redmine 동작 |
| --- | --- |
| 노드 추가 | issue 생성 |
| 노드 삭제 | issue close / delete |
| 노드 이동 (drag & drop) | parent_id 변경 |
| 텍스트 수정 | subject 변경 |

### 일정 표현 (3차)

* 시작일 / 종료일 표시
* milestone 마커
* Gantt 뷰 연계 (선택)

---

## 시스템 구조

```
Redmine REST API
      ↓
RedmineAdapter  (packages/redmine-adapter)
      ↓  importProject() / sync()
NodeObject[]  →  Command Engine  →  DocumentStore
      ↓
Editor UI (React + SVG)
```

> **원칙:** Adapter는 외부 데이터를 `NodeObject[]` 로 변환하는 역할만 담당.  
> 상태 반영은 반드시 **Command Engine**을 통한다.

---

## NodeObject 확장

기존 `NodeObject` (docs/02-domain/node-model.md) 에 `externalMeta` 필드를 추가한다.  
기존 스키마를 변경하지 않아 하위 호환성을 유지한다.

```
// node-model.md 의 NodeObject에 추가

type ExternalMeta =
  | RedmineMeta
  | MarkdownMeta;   // Obsidian 연동 시 사용

type NodeObject = {
  // ... 기존 필드 유지 (node-model.md 참조)
  externalMeta?: ExternalMeta | null;  // 신규 추가
};
```

### RedmineMeta

```
type RedmineMeta = {
  sourceType: 'redmine';
  projectId: number;
  issueId: number;
  parentIssueId?: number;
  subject: string;
  status?: string;         // "New" | "In Progress" | "Resolved" | "Closed"
  priority?: string;       // "Low" | "Normal" | "High" | "Urgent"
  assigneeId?: number;
  assigneeName?: string;
  startDate?: string;      // ISO 8601
  dueDate?: string;
  doneRatio?: number;      // 0 ~ 100
  trackerName?: string;    // "Bug" | "Feature" | "Task"
  syncedAt?: string;       // 마지막 동기화 시각
};
```

---

## Sync 정책

```
type SyncMode =
  | 'read-only'    // import 후 독립 맵으로 사용
  | 'manual-sync'  // [동기화] 버튼으로만 반영
  | 'two-way';     // 맵 수정 → Redmine 자동 반영
```

| 단계 | SyncMode | 비고 |
| --- | --- | --- |
| 1차 | `read-only` | MVP 이후 1순위 |
| 2차 | `manual-sync` | Command 연동 완성 후 |
| 3차 | `two-way` | 충돌 정책 수립 필요 |

---

## Adapter 인터페이스

```
interface RedmineAdapter {
  // Redmine project 전체 → NodeObject[]
  importProject(projectId: number): Promise<NodeObject[]>;

  // issue 하나 → NodeObject
  importIssue(issueId: number): Promise<NodeObject>;

  // 노드 추가 → issue 생성
  createIssue(
    parentIssueId: number | null,
    data: CreateIssueInput
  ): Promise<number>;  // 생성된 issueId 반환

  // 텍스트/상태 수정 → issue 업데이트
  updateIssue(issueId: number, patch: UpdateIssueInput): Promise<void>;

  // 노드 이동 → parent_id 변경
  moveIssue(issueId: number, newParentIssueId: number | null): Promise<void>;

  // 노드 삭제 → issue close 또는 delete
  deleteIssue(issueId: number, mode: 'close' | 'delete'): Promise<void>;

  // Redmine 최신 상태를 맵에 반영
  sync(projectId: number): Promise<SyncResult>;
}

type CreateIssueInput = {
  subject: string;
  trackerId?: number;
  priorityId?: number;
  assignedToId?: number;
  startDate?: string;
  dueDate?: string;
};

type UpdateIssueInput = Partial<CreateIssueInput> & {
  doneRatio?: number;
  statusId?: number;
};

type SyncResult = {
  created: number;
  updated: number;
  deleted: number;
  conflicts: Array<{ nodeId: string; issueId: number; reason: string }>;
};
```

---

## Command 연동

Adapter 완료 후 반드시 **Command Engine**을 통해 DocumentStore에 반영.  
`command-history.md` 의 `HistoryOperation` 패턴을 그대로 사용한다.

```
// import 완료 후 DocumentStore 반영 예시
const nodes = await redmineAdapter.importProject(projectId);

commandEngine.dispatch({
  type: 'IMPORT_EXTERNAL_NODES',
  payload: { nodes, sourceType: 'redmine' }
});
```

| Command | Redmine 동작 |
| --- | --- |
| `IMPORT_EXTERNAL_NODES` | project 전체 import |
| `CREATE_CHILD_NODE` | issue 생성 (two-way 시) |
| `DELETE_NODE` | issue close / delete |
| `MOVE_SUBTREE` | parent_id 변경 |
| `UPDATE_TEXT` | subject 변경 |
| `SYNC_EXTERNAL_NODES` | 변경분 동기화 |

---

## 인증

```
type RedmineAuthConfig = {
  baseUrl: string;   // "https://redmine.example.com"
  apiKey: string;    // Redmine REST API 키
};
```

> API 키는 Supabase vault 또는 NestJS ConfigService에 저장.  
> 2차에서 OAuth 연동 고려.

---

## UI 확장

### Node Indicator 추가 badge

기존 `node-indicator.md` 설계의 NodeIndicatorBar에 Redmine badge 추가:

```
redmine-status-badge    status 색상 (New=파랑, Closed=회색)
redmine-priority-badge  우선순위 아이콘
redmine-progress-bar    done_ratio 시각화
```

### 맵 레벨 UI

* Redmine 연결 설정 패널 (baseUrl, apiKey)
* \[Redmine에서 가져오기] 메뉴
* \[동기화] 버튼 (manual-sync 모드)
* 마지막 동기화 시각 표시

---

## 패키지 구조

```
packages/
  core/                    # 기존 NodeObject, Command Engine
  redmine-adapter/
    src/
      RedmineAdapter.ts    # Adapter 구현체
      redmineTransform.ts  # Issue → NodeObject 변환
      redmineTypes.ts      # Redmine API 응답 타입
      syncEngine.ts        # SyncMode 처리
    index.ts
```

---

## DB 확장 (Supabase)

`nodes` 테이블에 `external_meta` 컬럼 추가:

```sql
ALTER TABLE nodes
  ADD COLUMN external_meta JSONB DEFAULT NULL;

COMMENT ON COLUMN nodes.external_meta IS
  'Redmine / Obsidian 등 외부 연동 메타데이터';
```

---

## MVP 제외

* 로그인 / OAuth 인증
* 실시간 자동 동기화 (WebSocket)
* 충돌 자동 해결
* 권한 레벨 관리
* Gantt 수준 일정 UI

---

## 확장 로드맵

| 단계 | 기능 |
| --- | --- |
| 1 | read-only import |
| 2 | manual-sync (양방향) |
| 3 | two-way (자동 반영) |
| 4 | Gantt / timeline 뷰 |
| 5 | 다중 Redmine 서버 연결 |
