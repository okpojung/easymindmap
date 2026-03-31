# easymindmap — 노드 인디케이터 기능 설계

> 노드 추가 +버튼 · 번역 상태 · 콘텐츠 존재 인디케이터

| 항목 | 내용 |
|------|------|
| **최종 업데이트** | 2026-03-30 |
| **관련 기능ID** | NODE-13 · NODE-14 · NODE-15 · NODE-16 |
| **참고** | iThinkWise 사용자 설명서 Ver 4.0, docs/04-extensions/multilingual-translation.md v3.0 § 10 |

**기능 ID 정의**

| ID | 기능 | 상세 |
|----|------|------|
| NODE-13 | 추가 인디케이터 | + 버튼 4방향 (NODE-IND-01~04) |
| NODE-14 | 번역 상태 인디케이터 | 번역 완료/실패/대기 상태 표시 (V2) |
| NODE-15 | 인디케이터 ON/OFF 설정 | 편집자 표시 제어 설정 (V2) |
| NODE-16 | 콘텐츠 존재 인디케이터 | 노트/Hyperlink/첨부파일/멀티미디어 |


## PART 1. 노드 추가 인디케이터 (NODE-13)

## 1. 기능 개요
노드를 싱글 클릭하면 해당 노드의 상·하·좌·우 4방향에 + 아이콘(인디케이터)이 표시되고,
각 방향을 클릭하면 대응하는 관계의 새 노드가 즉시 생성된다.

```
                    [ + ]  ← 상 : 부모 노드 추가
                      │
        [ + ] ─── [선택노드] ─── [ + ]
         ←좌                       우→
       형제(이전)                형제(다음)
                      │
                    [ + ]  ← 하 : 자식 노드 추가
```


**iThinkWise 참고**

iThinkWise는 "중심가지 클릭 후 상,하,좌,우 + 버튼으로 가지 생성" 방식을 사용하며,
"상/하 [+] 버튼으로 형제가지를, 좌측 [+] 버튼으로 부모가지를 생성"한다.
easymindmap은 이보다 직관적인 방향 매핑으로 재설계한다.


## 2. 방향별 동작 정의

| 방향 | 기능 | 생성되는 노드 위치 | 대응 기존 단축키 |
|:---:|---|---|---|
| ⬆ 상 | 부모 노드 추가 | 선택 노드의 바로 위 상위 노드로 삽입 | — (신규) |
| ⬇ 하 | 자식 노드 추가 | 선택 노드의 마지막 자식으로 추가 | Space |
| ⬅ 좌 | 형제 노드 추가 (이전) | 선택 노드 바로 앞(위쪽)에 형제 삽입 | LShift + Ctrl + Space |
| ➡ 우 | 형제 노드 추가 (다음) | 선택 노드 바로 뒤(아래쪽)에 형제 삽입 | LShift + Space |

2-1. 부모 노드 추가 (⬆ 상) — 상세

```
[Before]                  [After]
루트                       루트
 └─ A                      └─ A
     └─ B (선택)                └─ 새노드 ← 삽입
         └─ C                        └─ B
                                          └─ C
```


선택 노드와 기존 부모 사이에 새 노드를 중간 삽입한다.
선택 노드와 그 하위 전체(서브트리)는 새 노드의 자식이 된다.
Root 노드(부모 없음)에서는 ⬆ 상 버튼을 비활성화(disabled)한다.

2-2. 자식 노드 추가 (⬇ 하) — 상세

```
[Before]          [After]
A (선택)          A (선택)
 ├─ B              ├─ B
 └─ C              ├─ C
                   └─ 새노드 ← 마지막 자식으로 추가
```


선택 노드의 마지막 자식 위치에 새 노드를 추가한다.
기존 Space 단축키 동작과 동일.

2-3. 형제 노드 추가 - 이전 (⬅ 좌) — 상세

```
[Before]          [After]
Parent            Parent
 ├─ A              ├─ A
 ├─ B (선택)       ├─ 새노드 ← 선택 노드 앞에 삽입
 └─ C              ├─ B
                   └─ C
```


선택 노드 바로 앞(이전 순서) 위치에 형제 노드를 삽입한다.
Root 노드에서는 ⬅ 좌 버튼을 비활성화한다.

2-4. 형제 노드 추가 - 다음 (➡ 우) — 상세

```
[Before]          [After]
Parent            Parent
 ├─ A              ├─ A
 ├─ B (선택)       ├─ B
 └─ C              ├─ 새노드 ← 선택 노드 다음에 삽입
                   └─ C
```


선택 노드 바로 뒤(다음 순서) 위치에 형제 노드를 삽입한다.
Root 노드에서는 ➡ 우 버튼을 비활성화한다.


## 3. UI/UX 규칙
3-1. 인디케이터 표시 조건

| 조건 | 동작 |
|---|---|
| 노드 싱글 클릭 | 4방향 + 아이콘 표시 |
| 노드 선택 해제 (빈 캔버스 클릭 / ESC) | 인디케이터 숨김 |
| 노드 편집 모드 진입 (Double Click) | 인디케이터 숨김 |
| Root 노드 선택 | ⬆상, ⬅좌, ➡우 비활성화 (⬇하만 활성) |
| 다중 선택 (SEL-02) | 인디케이터 표시 안 함 |

3-2. 인디케이터 위치 계산
노드 bounding box 기준:

```
상 (+):  노드 상단 중앙  (cx, top - offset)
하 (+):  노드 하단 중앙  (cx, bottom + offset)
좌 (+):  노드 좌측 중앙  (left - offset, cy)
우 (+):  노드 우측 중앙  (right + offset, cy)
```

offset 권장: 12px ~ 16px (노드 테두리와 약간의 여백)

3-3. 인디케이터 스타일

| 상태 | 스타일 |
|---|---|
| 기본(표시) | 원형 버튼, 테두리 색 #F0A500 (황금색), 배경 흰색, + 아이콘 |
| hover | 배경 #F0A500, + 아이콘 흰색으로 전환 |
| disabled (Root) | 회색, 클릭 불가 |
| 클릭(active) | 약한 scale 애니메이션 후 즉시 노드 생성 |

첨부 이미지 참고: 황금색(오렌지) 원형 + 아이콘이 노드 4방향에 배치됨

3-4. 새 노드 생성 후 동작

```
+ 버튼 클릭
  │
  ▼
새 노드 생성 (빈 텍스트)
  │
  ▼
새 노드 즉시 선택
  │
  ▼
텍스트 편집 모드 자동 진입 (커서 활성)
  │
  ▼
Enter 또는 blur → 텍스트 확정 → Auto Save 트리거
  │
Esc → 텍스트 취소 → 빈 노드 삭제 (Undo 히스토리에도 미반영)
```


## 4. 레이아웃별 고려사항
인디케이터의 물리적 표시 방향은 고정(상/하/좌/우)이지만,
의미(동작) 는 레이아웃 방향과 무관하게 아래처럼 항상 고정한다.

| 방향 | 어떤 레이아웃에서도 | 이유 |
|:---:|---|---|
| ⬆ 상 | 부모 노드 추가 | 위 = 상위 계층이라는 직관에 일치 |
| ⬇ 하 | 자식 노드 추가 | 아래 = 하위 계층이라는 직관에 일치 |
| ⬅ 좌 | 형제 노드 이전 추가 | 좌 = 앞 순서라는 일반 UX 관례 |
| ➡ 우 | 형제 노드 다음 추가 | 우 = 뒤 순서라는 일반 UX 관례 |

설계 노트: 레이아웃마다 방향 의미를 다르게 하면 학습 비용이 높아진다.
iThinkWise도 레이아웃에 관계없이 고정 방향으로 동작한다.


## 5. 키보드 / 마우스 조작 통합 요약

| 조작 방식 | 동작 |
|---|---|
| 노드 클릭 후 ⬆ + 클릭 | 부모 노드 추가 |
| 노드 클릭 후 ⬇ + 클릭 | 자식 노드 추가 |
| 노드 클릭 후 ⬅ + 클릭 | 형제 노드 이전 추가 |
| 노드 클릭 후 ➡ + 클릭 | 형제 노드 다음 추가 |
| Space | 자식 노드 추가 (⬇와 동일) |
| LShift + Space | 형제 노드 다음 추가 (➡와 동일) |
| LShift + Ctrl + Space | 형제 노드 이전 추가 (⬅와 동일) |
| Ctrl + Space | 자식 노드 다중 생성 (인디케이터 없음, 별도 팝업) |

## 6. 비활성화 규칙 (Root 노드)
Root 노드 선택 시:

```
        [ + ]  ← 비활성 (상위 없음)
          │
[비활성] ─── [Root] ─── [비활성]
                │
              [ + ]  ← 활성 (자식 추가 가능)
```


비활성 버튼은 회색으로 표시하거나 아예 숨길 수 있다.
권장: 회색으로 표시 (UI가 더 안정적으로 보임)


## 7. 프론트엔드 구현 힌트
7-1. 인디케이터 컴포넌트 구조

```
NodeRenderer
  └─ NodeAddIndicator       ← 4방향 + 버튼 컨테이너
       ├─ AddIndicatorTop    (⬆ 부모)
       ├─ AddIndicatorBottom (⬇ 자식)
       ├─ AddIndicatorLeft   (⬅ 형제 이전)
       └─ AddIndicatorRight  (➡ 형제 다음)
```

7-2. 표시 조건 상태 관리

```typescript
// editorStore에 추가
type EditorStore = {
  ...
  selectedNodeId: string | null;
  showAddIndicator: boolean;   // 선택된 노드에 인디케이터 표시 여부
};

// 노드 클릭 시
const handleNodeClick = (nodeId: string) => {
  setSelectedNodeId(nodeId);
  setShowAddIndicator(true);
};

// 캔버스 클릭 시
const handleCanvasClick = () => {
  setSelectedNodeId(null);
  setShowAddIndicator(false);
};
```

7-3. 부모 노드 삽입 로직

```typescript
// 부모 노드 추가 (⬆)
const addParentNode = (selectedNodeId: string) => {
  const selectedNode = getNode(selectedNodeId);
  if (!selectedNode.parentId) return; // Root → 비활성

  // 1. 새 노드 생성 (선택 노드의 현재 부모 위치)
  const newNode = createNode({
    parentId: selectedNode.parentId,
    orderIndex: selectedNode.orderIndex,
  });

  // 2. 선택 노드와 하위 서브트리를 새 노드의 자식으로 재배치
  reparentNode(selectedNodeId, newNode.id);

  // 3. 기존 형제 노드들의 orderIndex 재정렬
  reorderSiblings(selectedNode.parentId);

  // 4. 새 노드 선택 + 편집 모드 진입
  selectNodeAndEdit(newNode.id);
};
```

7-4. SVG 레이아웃에서의 인디케이터 위치 계산

```typescript
const INDICATOR_OFFSET = 14; // px

const getIndicatorPositions = (nodeBounds: DOMRect) => ({
  top:    { x: nodeBounds.left + nodeBounds.width / 2,  y: nodeBounds.top - INDICATOR_OFFSET },
  bottom: { x: nodeBounds.left + nodeBounds.width / 2,  y: nodeBounds.bottom + INDICATOR_OFFSET },
  left:   { x: nodeBounds.left - INDICATOR_OFFSET,       y: nodeBounds.top + nodeBounds.height / 2 },
  right:  { x: nodeBounds.right + INDICATOR_OFFSET,      y: nodeBounds.top + nodeBounds.height / 2 },
});
```


## 8. Undo/Redo 처리

| 동작 | Undo 처리 |
|---|---|
| + 버튼으로 노드 생성 후 텍스트 확정 | Undo 가능 (노드 삭제) |
| + 버튼으로 노드 생성 후 Esc 취소 | Undo 히스토리에 미반영 |
| 부모 노드 삽입 (⬆) | Undo 가능 (중간 노드 제거 + 원복) |

## 9. Auto Save 연동
인디케이터로 생성된 노드도 기존 Auto Save 트리거를 그대로 따른다.

| 트리거 | 조건 |
|---|---|
| 텍스트 확정 (Enter / blur) | Auto Save 즉시 실행 |
| Esc 취소 | Auto Save 미실행 |

## 10. 구현 우선순위
Step 1: NodeAddIndicator 컴포넌트 — 4방향 + 버튼 UI
Step 2: 노드 클릭 → 인디케이터 표시/숨김 상태 관리
Step 3: ⬇ 자식 추가 (기존 Space 동작과 동일, 가장 쉬움)
Step 4: ➡ 형제 다음 추가 (기존 LShift+Space 동작과 동일)
Step 5: ⬅ 형제 이전 추가
Step 6: ⬆ 부모 노드 중간 삽입 (가장 복잡 — 서브트리 재배치 필요)
Step 7: Root 노드 비활성화 처리
Step 8: 새 노드 생성 후 편집 모드 자동 진입
Step 9: Undo/Redo 연동


## 11. 와이어프레임 텍스트 표현

```
             ┌───────────┐
             │    [+]    │  ← ⬆ 부모 노드 추가
             └─────┬─────┘
                   │
┌──────┐    ┌──────┴───────┐    ┌──────┐
│ [+]  │────│  topic1      │────│ [+]  │
└──────┘    └──────┬───────┘    └──────┘
⬅ 형제이전         │                ➡ 형제다음
             ┌─────┴─────┐
             │    [+]    │  ← ⬇ 자식 노드 추가
             └───────────┘
```


---

## PART 2. 번역 상태 인디케이터 (NODE-14, V2)

---

## 12. 번역 인디케이터 개요

번역된 노드임을 열람자에게 알리고, 원문 확인 및 번역 override 설정 진입점을 제공하는 인디케이터.
노드 텍스트 우측 끝에 작은 아이콘 형태로 표시된다.

```
[딸기 🔤]   ← 번역본 표시 중. 🔤 클릭 시 원문 팝오버
[AI 분석]   ← 번역 불필요 (내 언어). 아이콘 없음
[■■■■■]   ← 번역 대기 중. Skeleton(회색 바) 표시
```

- 적용 단계: V2 (다국어 번역 기능과 함께 구현)
- 설계 기준: `docs/04-extensions/multilingual-translation.md` § 10


## 13. 번역 상태별 인디케이터 정의

| 상태 | 표시 텍스트 | 아이콘 | 설명 |
|---|---|:---:|---|
| 내 언어로 작성 | 원문 그대로 | 없음 | 번역 불필요 |
| 유효 번역 캐시 있음 | 번역본 표시 | 🔤 | 클릭 → 원문 팝오버 |
| 번역 대기 중 | Skeleton (회색 바) | 없음 | 번역 완료 시 자동 교체 |
| 번역 실패 | 원문 표시 | 🔴 | 재시도 없이 원문 fallback |
| force_off 노드 | 원문 표시 | ⛔ | 편집자가 번역 강제 OFF |
| force_on 노드 | 번역본 표시 | 🔁 | 편집자가 번역 강제 ON |

**아이콘 색상 가이드**

| 아이콘 | 색상 | 의미 |
|:---:|---|---|
| 🔤 | 파란색 계열 (`#2B8EF0`) | 번역 완료, 클릭 가능 |
| 🔴 | 주황색/노란색 | 번역 실패 경고 |
| ⛔ | 회색 | 강제 OFF (원문 고정) |
| 🔁 | 초록색 계열 | 강제 ON (항상 번역) |


## 14. 🔤 원문 보기 팝오버 (오역 대응)

14-1. 트리거 및 와이어프레임

- 번역된 노드에 hover 시 → 🔤 아이콘 강조
- 🔤 아이콘 클릭 시 → 원문 팝오버 표시

`[딸기 🔤]` ← hover 상태

클릭 후:

  ```
  ┌─────────────────────────────┐
  │ 원문 (English)               │
  │ strawberry                   │
  │                              │
  │  [번역본으로 돌아가기]        │
  └─────────────────────────────┘
  ```

14-2. 동작 원칙

1. **API 호출 없음** — 클라이언트 state 전환만으로 처리  
   원문(`node.text`)은 항상 메모리에 있으므로 별도 요청 불필요
2. 팝오버 표시 중에도 맵 조작 가능 (모달 아님, non-blocking)
3. `[번역본으로 돌아가기]` 클릭 또는 팝오버 외부 클릭 → 팝오버 닫힘
4. **1개 팝오버 원칙** — 다른 노드의 🔤 클릭 시 기존 팝오버는 닫히고 새 팝오버 열림

14-3. 팝오버 표시 정보

| 항목 | 내용 |
|---|---|
| 원문 언어 레이블 | `text_lang` → 언어명 변환 (예: `'en'` → `English`) |
| 원문 텍스트 | `node.text` (DB 저장 원문) |
| 번역 엔진 | `model_version` (예: `DeepL v3`) — 선택적 표시 |
| 번역 날짜 | `node_translations.updated_at` — 선택적 표시 |

14-4. 클라이언트 State 구조

```typescript
// translationStore (Zustand) 추가 필드
type TranslationStore = {
  // ... 기존 번역 캐시 필드 ...

  // 원문 팝오버 상태
  originalPopover: {
    nodeId: string | null;   // 현재 팝오버가 열린 노드 ID (null = 닫힘)
  };

  // 액션
  openOriginalPopover: (nodeId: string) => void;
  closeOriginalPopover: () => void;
};

// 노드 텍스트 표시 로직 (NodeText.tsx)
const { originalPopover } = useTranslationStore();
const isShowingOriginal = originalPopover.nodeId === node.id;

const displayText = isShowingOriginal
  ? node.text                                      // 원문 표시
  : translationCache[node.id]?.[viewerLang]?.text  // 번역본 표시
    ?? node.text;                                  // fallback: 원문
```


## 15. Skeleton 인디케이터 (번역 대기 중)

15-1. 표시 조건

`shouldTranslate = true` **AND** 번역 캐시 없음 (Redis miss + DB miss)  
→ 노드 텍스트 영역에 회색 Skeleton 바 표시

15-2. 와이어프레임

```
번역 대기 전:          번역 대기 중:           번역 완료 후:
┌─────────────┐       ┌─────────────┐        ┌─────────────┐
│  strawberry │  →→   │  ■■■■■■■   │  →→    │  딸기 🔤    │
└─────────────┘       └─────────────┘        └─────────────┘
                       (회색 바, 펄스 애니)
```

15-3. Skeleton 스타일

| 속성 | 값 |
|---|---|
| 배경색 | `#E0E0E0` (연회색) |
| 너비 | 노드 텍스트 영역과 동일 |
| 높이 | 폰트 크기와 동일 (1em) |
| 애니메이션 | pulse (opacity 0.4 ↔ 1.0, 1.2초 주기) |
| transition | 번역 완료 시 fadeIn으로 번역본 텍스트 교체 (0.2초) |


## 16. 편집자 전용 — translation_override 아이콘 (⛔ / 🔁)

16-1. 표시 조건

| 권한 | 동작 |
|---|---|
| 열람자 권한 | 아이콘 표시 안 함 (열람 전용) |
| 편집자 권한 | `translation_override` 설정 여부에 따라 표시 |

| `translation_override` 값 | 표시 | 설명 |
|---|:---:|---|
| `null` | 없음 | 자동 정책 따름 |
| `'force_off'` | ⛔ | 강제 번역 금지 |
| `'force_on'` | 🔁 | 강제 번역 |

16-2. 클릭 동작 (편집자만)

⛔ 또는 🔁 클릭 → 우클릭 메뉴(번역 설정)과 동일한 설정 패널 오픈

```
┌──────────────────────────┐
│ 번역 설정                 │
│                          │
│ ● 자동 (기본)             │  ← translation_override = null
│ ○ 번역 강제 ON   🔁       │  ← translation_override = 'force_on'
│ ○ 번역 강제 OFF  ⛔       │  ← translation_override = 'force_off'
└──────────────────────────┘
```

설정 변경 시 → `PATCH /nodes/:id/translation-override` → Autosave 즉시 저장


## 17. 컴포넌트 구조

```
NodeRenderer
  ├── NodeText (텍스트 + 번역 인디케이터)
  │    ├── displayText      ← 번역본 or 원문 (state 기반)
  │    ├── SkeletonBar       ← 번역 대기 중일 때만 렌더링
  │    ├── TranslationIcon   ← 🔤 / 🔴 / ⛔ / 🔁 (상태별 조건부)
  │    └── OriginalPopover   ← 🔤 클릭 시 원문 팝오버
  │
  └── NodeAddIndicator (Part 1 — + 버튼, 싱글 클릭 시 표시)
```

**TranslationIcon 상태 판단 로직**

```typescript
function getTranslationIconState(
  node: NodeObject,
  viewerLang: string,
  cachedTranslation: CachedTranslation | undefined,
  isEditor: boolean,
): 'none' | 'globe' | 'warning' | 'force-off' | 'force-on' | 'skeleton' {

  // 편집자 override 아이콘 (편집자 권한만)
  if (isEditor && node.translation_override === 'force_off') return 'force-off';
  if (isEditor && node.translation_override === 'force_on')  return 'force-on';

  // 번역 불필요 (같은 언어, skip 등)
  const decision = shouldTranslate(node, viewerSettings, mapPolicy);
  if (!decision.shouldTranslate) return 'none';

  // 번역 캐시 있고 유효 → 🔤
  if (cachedTranslation?.hash === node.text_hash) return 'globe';

  // 번역 실패 상태 → 🔴
  if (translationFailed[node.id]) return 'warning';

  // 번역 대기 중 → Skeleton
  return 'skeleton';
}
```


## 18. 인디케이터 간 충돌 방지 규칙

| 인디케이터 종류 | 표시 조건 | 동시 표시 |
|---|---|:---:|
| + 버튼 (4방향) | 싱글 클릭 선택 시 | ✅ 가능 |
| 🔤 번역 아이콘 | 번역본 표시 중 | ✅ 가능 |
| 🔴 번역 실패 | 번역 실패 상태 | ✅ 가능 |
| ⛔ / 🔁 override | 편집자 + override 설정 | ✅ 가능 |
| Skeleton 바 | 번역 대기 중 | ❌ 불가 |

Skeleton과 실제 텍스트 + 번역 아이콘은 동시 표시 불가 (둘 중 하나만).
+ 버튼과 번역 아이콘은 독립적이므로 동시 표시 가능.


## 19. WebSocket 연동 — 번역 완료 시 자동 업데이트

```typescript
// WsGateway에서 브로드캐스트 수신
wsClient.on('translation:ready', ({ nodeId, targetLang, translatedText, textHash }) => {
  // 번역 캐시 업데이트
  translationStore.setTranslation(nodeId, targetLang, translatedText, textHash);
  // → NodeText 리렌더링 → Skeleton → 번역본 + 🔤 아이콘으로 자동 전환
});
```

번역 완료 이벤트 수신 흐름:

```
translation:ready 이벤트
      │
      ▼
translationStore.setTranslation() 호출
      │
      ▼
NodeText 리렌더링
      │
      ├── Skeleton 제거
      ├── 번역본 텍스트 표시 (fadeIn 0.2초)
      └── 🔤 아이콘 표시
```


## 20. 구현 우선순위 (번역 인디케이터)

Step 1: 번역 캐시 연동 — displayText 로직 (shouldTranslate + 캐시 조회)
Step 2: 🔤 아이콘 표시 (번역본 표시 중)
Step 3: Skeleton UI (번역 대기 중 — pulse 애니메이션)
Step 4: 원문 팝오버 (🔤 클릭 → 원문 + 언어명 표시 + 닫기)
Step 5: 🔴 번역 실패 아이콘
Step 6: ⛔ / 🔁 편집자 override 아이콘 + 클릭 시 설정 패널
Step 7: WebSocket translation:ready 이벤트 수신 → 자동 UI 갱신


---

## PART 3. 인디케이터 표시 ON/OFF 설정 (NODE-15)

---

## 21. 배경 — 인디케이터 혼잡 문제

노드에 번역 인디케이터(🔤/🔴/⛔/🔁), 태그 badge, 노트(≡)·하이퍼링크(🔗)·첨부파일(📎)·멀티미디어(▶) 아이콘이
모두 표시될 경우 노드 텍스트 가독성이 저하된다. 특히 번역 기능을 활발히 사용하는 맵에서 🔤 아이콘이
모든 번역 노드에 상시 표시되면 시각적 피로가 증가한다.

```
[딸기 ≡ 📎 🔤]  ← 노트+첨부파일+번역 아이콘 동시 표시 예시
[딸기 #ML #AI]  ← 태그 badge 과다 표시 예시
```

노트·Hyperlink·첨부파일·멀티미디어 인디케이터는 콘텐츠 존재 여부를 나타내는 것으로
데이터가 있으면 항상 표시하며 ON/OFF 설정 대상이 아니다.
→ 번역 아이콘과 태그 badge만 사용자 설정으로 표시 여부를 제어할 수 있다.


## 22. 표시 제어 대상

| 인디케이터 | 표시 방식 | 기본값 | 설정 키 |
|---|---|:---:|---|
| 노트 아이콘 (≡) | **항상 표시** | — | (설정 없음) |
| Hyperlink 아이콘 (🔗) | **항상 표시** | — | (설정 없음) |
| 첨부파일 아이콘 (📎) | **항상 표시** | — | (설정 없음) |
| 멀티미디어 아이콘 (▶) | **항상 표시** | — | (설정 없음) |
| 접기/펼치기 버튼 | **항상 표시** | — | (설정 없음) |
| Skeleton 바 (번역 대기) | **항상 표시** | — | (설정 없음) |
| 번역 아이콘 (🔤 / 🔴) | ON/OFF 설정 | ON | `showTranslationIndicator` |
| 편집자 override 아이콘 (⛔ / 🔁, 편집자만) | ON/OFF 설정 | ON | `showTranslationOverrideIcon` |
| 태그 badge | ON/OFF 설정 | ON | `showTagBadge` |

**[항상 표시]**
- 노트·Hyperlink·첨부파일·멀티미디어: 해당 데이터가 존재하면 무조건 표시.
  (사용자가 설정한 콘텐츠를 숨기면 존재 자체를 잊어버릴 수 있어 UX 상 부적절)
- 접기/펼치기 버튼: 자식 구조 탐색에 필수. 숨기면 맵 내비게이션 불가.
- Skeleton 바: 번역 진행 중임을 알려야 사용자가 콘텐츠 로딩 중임을 인지 가능.

**[ON/OFF 설정]**
- 번역 아이콘 OFF 시: 🔤·🔴 아이콘을 숨기지만 번역 텍스트 자체는 유지된다.
- 편집자 override 아이콘은 편집자 권한인 경우에만 설정 항목이 노출된다.
- 설정 범위: 전역 사용자 설정 (모든 맵에 공통 적용).
  맵별/노드별 개별 설정은 지원하지 않는다 (V2 범위 외).


## 23. 설정 저장 위치

사용자별 UI 표시 환경설정은 DB의 `users.ui_preferences_json` (JSONB)에 저장한다.

```json
{
  "showTranslationIndicator": true,
  "showTranslationOverrideIcon": true,
  "showTagBadge": true
}
```

- `users.ui_preferences_json` 컬럼 정의 → `docs/02-domain/schema.sql`
- `UiPreferences` 타입 정의 → `docs/02-domain/map-model.md`


## 24. 표시 판단 로직 변경

번역 아이콘 표시 판단 로직에 uiPreferences 체크를 추가한다.

```typescript
// NodeText.tsx
function getTranslationIconState(
  node: NodeObject,
  viewerLang: string,
  cachedTranslation: CachedTranslation | undefined,
  isEditor: boolean,
  uiPrefs: UiPreferences,          // [NODE-15 추가]
): 'none' | 'globe' | 'warning' | 'force-off' | 'force-on' | 'skeleton' {

  // [NODE-15] 번역 아이콘 OFF 설정 시: 🔤·🔴 를 숨기고 'none' 반환
  //   단, 편집자 override 아이콘(⛔/🔁)은 별도 설정(showTranslationOverrideIcon)으로 제어
  //   Skeleton은 항상 표시 (설정 무관, 항상 표시)

  // 편집자 override 아이콘 (편집자 권한만)
  if (isEditor && node.translation_override === 'force_off') {
    if (!uiPrefs.showTranslationOverrideIcon) return 'none';  // [NODE-15]
    return 'force-off';
  }
  if (isEditor && node.translation_override === 'force_on') {
    if (!uiPrefs.showTranslationOverrideIcon) return 'none';  // [NODE-15]
    return 'force-on';
  }

  // 번역 불필요 (같은 언어, skip 등)
  const decision = shouldTranslate(node, viewerSettings, mapPolicy);
  if (!decision.shouldTranslate) return 'none';

  // 번역 캐시 있고 유효 → 🔤
  if (cachedTranslation?.hash === node.text_hash) {
    if (!uiPrefs.showTranslationIndicator) return 'none';  // [NODE-15] 아이콘만 숨김
    return 'globe';
  }

  // 번역 실패 상태 → 🔴
  if (translationFailed[node.id]) {
    if (!uiPrefs.showTranslationIndicator) return 'none';  // [NODE-15]
    return 'warning';
  }

  // 번역 대기 중 → Skeleton (설정 무관, 항상 표시)
  return 'skeleton';
}
```


## 25. 태그 badge 표시 제어

```typescript
// NodeTagBadge.tsx
function shouldShowTagBadge(
  node: NodeObject,
  uiPrefs: UiPreferences,
): boolean {
  if (!uiPrefs.showTagBadge) return false;
  return node.tags.length > 0;
}
```

- `showTagBadge = false` 시: 태그 badge UI 자체를 렌더링하지 않는다.
- 태그 데이터(`node.tags`)는 유지되며, 태그 검색/필터 기능도 정상 동작한다.  
  오직 시각적 badge 표시만 OFF된다.


## 26. 설정 UI — 위치 및 와이어프레임

설정 위치: 사이드바 "표시 설정" 패널 또는 메뉴 > 설정 > 인디케이터

**표시 설정 패널 구성**

> **항상 표시 (설정 불가)**
> 노트 (≡) · Hyperlink (🔗) · 첨부파일 (📎) · 멀티미디어 (▶) · 접기/펼치기 · Skeleton 바
> → 데이터가 있으면 항상 표시됩니다.

> **인디케이터 ON/OFF**
>
> | 항목 | 상태 | 비고 |
> |---|:---:|---|
> | 번역 아이콘 표시 (🔤 / 🔴) | `ON ●` | |
> | 번역 override 아이콘 (⛔/🔁) | `ON ●` | 편집자 권한일 때만 노출 |
> | 태그 badge 표시 | `ON ●` | |
>
> \* 번역 아이콘 OFF 시에도 번역 텍스트는 그대로 표시됩니다.

토글 OFF 시 즉시 반영 (API 저장 + 로컬 state 동기화).
저장 API: `PATCH /users/me/ui-preferences`


## 27. 번역 아이콘 OFF 시 동작 정리

| 상태 | `showTranslationIndicator=true` | `showTranslationIndicator=false` |
|---|---|---|
| 번역본 표시 중 | `[딸기 🔤]` | `[딸기]` |
| 번역 실패 | `[딸기 🔴]` | `[딸기]` |
| 번역 대기 중 | `[■■■■■]` (Skeleton) | `[■■■■■]` (Skeleton **유지**) |
| force_off 편집자 | `[딸기 ⛔]` | `[딸기 ⛔]` ← override 아이콘은 별도 설정 |
| force_on 편집자 | `[번역본 🔁]` | `[번역본 🔁]` |

**핵심 원칙:**
1. 번역 아이콘 OFF = 아이콘만 숨김. 번역 텍스트 자체는 유지.
2. Skeleton은 설정에 상관없이 항상 표시. (진행 중 상태 피드백)
3. override 아이콘은 독립 설정. 번역 아이콘 OFF 여도 override 아이콘은 ON 가능.


## 28. 관련 API 엔드포인트 (신규)

**`PATCH /users/me/ui-preferences`**
- Body: `Partial<UiPreferences>`
- `users.ui_preferences_json` 업데이트
- 응답: `200 OK` + 갱신된 `UiPreferences`

**`GET /users/me`**
- 기존 사용자 프로필 API에 `uiPreferences` 필드 포함하여 반환


## 29. 구현 우선순위 (인디케이터 ON/OFF)

Step 1: UiPreferences 타입 정의 및 users.ui_preferences_json 컬럼 추가 (schema)
Step 2: PATCH /users/me/ui-preferences API 구현
Step 3: uiPreferences 전역 상태 (Zustand store) 연동
Step 4: getTranslationIconState()에 showTranslationIndicator 체크 추가
Step 5: NodeTagBadge에 showTagBadge 체크 추가
Step 6: 설정 UI 패널 구현 (토글 컴포넌트)


---

## PART 4. 콘텐츠 존재 인디케이터 (NODE-16)

---

## 30. 개요

노드에 특정 콘텐츠(노트·하이퍼링크·첨부파일·멀티미디어)가 연결되어 있을 때,
노드 우측에 작은 아이콘을 표시하여 콘텐츠 존재 여부를 한눈에 알 수 있게 한다.

참고 이미지: `docs/assets/drJaZFO9.png`

```
[노트  ≡]         ← 노트(긴 설명)가 작성된 노드
[Hyperlink 🔗]  ← 하이퍼링크가 1개 이상 연결된 노드
[첨부파일 📎]      ← 첨부파일이 1개 이상 연결된 노드
[멀티미디어 ▶]    ← 멀티미디어(영상/음성 등)가 연결된 노드
```

- 적용 단계: V1 (기본 기능 — 콘텐츠 부재/존재 시각화)
- 표시 방식: **해당 데이터가 존재하면 항상 표시** (사용자 ON/OFF 설정 없음)


## 31. 콘텐츠 존재 인디케이터 정의

| 인디케이터 | 아이콘 | 색상 | 표시 조건 | 위치 |
|---|:---:|---|---|:---:|
| 노트 | ≡ | 주황/베이지 | `node.note ≠ null` | 노드 우측 |
| Hyperlink | 🔗 | 파란 계열 | `node.hyperlinkIds.length > 0` | 노드 우측 |
| 첨부파일 | 📎 | 주황/베이지 | `node.attachmentIds.length > 0` | 노드 우측 |
| 멀티미디어 | ▶ | 파란 계열 | `node.multimediaId ≠ null` | 노드 우측 |

- 아이콘 색상은 참고 이미지(`docs/assets/drJaZFO9.png`) 기준으로 구체화한다.
- 4가지 모두 동시에 표시될 수 있다.
- 각 아이콘 클릭 시 해당 콘텐츠 편집/열람 패널로 진입한다 (V2 이후 구현).


## 32. 표시 판단 로직

```typescript
// NodeContentIndicators.tsx
type ContentIndicatorState = {
  hasNote: boolean;
  hasHyperlink: boolean;
  hasAttachment: boolean;
  hasMultimedia: boolean;
};

function getContentIndicatorState(node: NodeObject): ContentIndicatorState {
  return {
    hasNote:       node.note != null && node.note.trim().length > 0,
    hasHyperlink:  node.hyperlinkIds.length > 0,
    hasAttachment: node.attachmentIds.length > 0,
    hasMultimedia: node.multimediaId != null,
  };
}
```

- ON/OFF 설정 없음 — `uiPreferences` 체크를 하지 않는다.
- 데이터가 존재하면 무조건 아이콘을 표시한다.
- 데이터가 없으면(빈 배열, null) 아이콘을 렌더링하지 않는다.


## 33. 컴포넌트 구조

```
NodeRenderer
  ├── NodeText              (텍스트 + 번역 인디케이터 — PART 2)
  ├── NodeTagBadge          (태그 badge — tag-system.md)
  ├── NodeContentIndicators ← [NODE-16 신규]
  │    ├── NoteIcon      (≡)    — hasNote = true 일 때
  │    ├── HyperlinkIcon (🔗) — hasHyperlink = true 일 때
  │    ├── AttachmentIcon(📎)   — hasAttachment = true 일 때
  │    └── MultimediaIcon(▶)   — hasMultimedia = true 일 때
  └── NodeAddIndicator      (+ 버튼 4방향 — PART 1)
```


## 34. 인디케이터 충돌 방지 규칙 (§18 확장)

| 인디케이터 종류 | 표시 조건 | 동시 표시 |
|---|---|:---:|
| + 버튼 (4방향) | 싱글 클릭 선택 시 | ✅ 가능 |
| 접기/펼치기 버튼 | 자식 노드 존재 시 | ✅ 가능 |
| 🔤 번역 아이콘 | 번역본 표시 중 | ✅ 가능 |
| 🔴 번역 실패 | 번역 실패 상태 | ✅ 가능 |
| ⛔ / 🔁 override | 편집자 + override 설정 | ✅ 가능 |
| Skeleton 바 | 번역 대기 중 | ❌ 불가 |
| 노트 ≡ | note 존재 | ✅ 가능 |
| Hyperlink 🔗 | hyperlinkIds 존재 | ✅ 가능 |
| 첨부파일 📎 | attachmentIds 존재 | ✅ 가능 |
| 멀티미디어 ▶ | multimediaId 존재 | ✅ 가능 |

Skeleton과 번역 텍스트+번역 아이콘은 동시 표시 불가.
나머지는 모두 독립적이므로 동시 표시 가능.


## 35. 구현 우선순위 (콘텐츠 존재 인디케이터)

Step 1: getContentIndicatorState() 함수 구현
Step 2: NoteIcon — node.note 존재 시 ≡ 아이콘 렌더링
Step 3: HyperlinkIcon — hyperlinkIds.length > 0 시 아이콘 렌더링
Step 4: AttachmentIcon — attachmentIds.length > 0 시 아이콘 렌더링
Step 5: MultimediaIcon — multimediaId 존재 시 ▶ 아이콘 렌더링
Step 6: NodeContentIndicators 컨테이너 — 4개 아이콘 배치 및 간격
