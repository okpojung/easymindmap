# easymindmap — Node Data Model

## NodeObject 전체 스키마

```typescript
type NodeObject = {
  // === 식별자 ===
  id: string;                    // UUID, 노드 고유 ID
  mapId: string;                 // 소속 맵 ID

  // === 트리 구조 ===
  parentId: string | null;       // 루트 노드는 null
  childIds: string[];            // 빠른 탐색용 자식 ID 목록
  depth: number;                 // 루트 = 0, 1레벨 = 1, ...
  orderIndex: number;            // 형제 내 순서

  // === 콘텐츠 ===
  text: string;                  // 노드 표시 텍스트
  note: string | null;           // 긴 설명 (노트)

  // === 레이아웃 ===
  layoutType: LayoutType;        // 이 노드 이하 subtree 전개 방식
  collapsed: boolean;            // true = 자식 숨김

  // === 스타일 ===
  shapeType: ShapeType;
  style: NodeStyle;

  // === 부가 요소 ===
  tags: string[];                // Tag ID 목록
  hyperlinkIds: string[];        // 하이퍼링크 ID 목록
  attachmentIds: string[];       // 첨부파일 ID 목록
  multimediaId: string | null;   // 멀티미디어 ID

  // === 자유배치 ===
  manualPosition: { x: number; y: number } | null;  // freeform 전용

  // === 캐시 ===
  size: { width: number; height: number } | null;   // 렌더링 캐시

  // === 메타 ===
  createdAt: string;             // ISO 8601
  updatedAt: string;
};
```

---

## LayoutType

```typescript
type LayoutType =
  // 방사형
  | 'radial-bidirectional'   // BL-RD-BI  방사형 양쪽 (기본값)
  | 'radial-right'           // BL-RD-R   방사형 오른쪽
  | 'radial-left'            // BL-RD-L   방사형 왼쪽
  // 트리형
  | 'tree-up'                // BL-TR-U   트리형 위
  | 'tree-down'              // BL-TR-D   트리형 아래
  | 'tree-right'             // BL-TR-R   트리형 오른쪽
  | 'tree-left'              // BL-TR-L   트리형 왼쪽
  // 계층형
  | 'hierarchy-right'        // BL-HR-R   계층형 오른쪽
  | 'hierarchy-left'         // BL-HR-L   계층형 왼쪽
  // 진행트리
  | 'process-tree-right'     // BL-PR-R   진행트리 오른쪽
  | 'process-tree-left'      // BL-PR-L   진행트리 왼쪽
  | 'process-tree-right-a'   // BL-PR-RA  진행트리 오른쪽A (버블형)
  | 'process-tree-right-b'   // BL-PR-RB  진행트리 오른쪽B (타임라인형)
  // 자유배치
  | 'freeform';              // BL-FR     수동 좌표 배치
```

---

## ShapeType

```typescript
type ShapeType =
  | 'rounded-rectangle'   // 기본
  | 'rectangle'
  | 'ellipse'
  | 'pill'
  | 'diamond'
  | 'parallelogram'
  | 'none';               // 텍스트만
```

---

## NodeStyle

```typescript
type NodeStyle = {
  fillColor?: string;       // 배경색 (hex)
  borderColor?: string;     // 테두리색
  textColor?: string;       // 글자색
  fontSize?: number;        // 기본: depth별 자동 결정
  fontWeight?: 400 | 500 | 600 | 700;
  fontStyle?: 'normal' | 'italic';
  borderWidth?: number;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  backgroundImage?: string; // URL 또는 base64
  backgroundImageOpacity?: number;
};
```

---

## 주요 필드 설명

### layoutType
가장 중요한 필드. **이 노드 이하 subtree 전체**의 전개 방식을 결정한다.
- 루트 노드의 layoutType이 전체 기본 레이아웃을 결정
- 하위 노드에서 다른 layoutType을 지정하면 그 subtree만 독립 전환

### manualPosition
`freeform` layoutType일 때만 사용.
- auto layout에서는 엔진이 계산한 좌표 사용
- freeform에서는 drag 결과를 이 필드에 저장

### collapsed
`true`이면 자식 노드가 존재하지만 화면에 렌더링하지 않음.
노드 indicator로 자식 존재 여부를 표시.

### childIds
성능 최적화용 캐시. DB에서 parentId로 조회하는 것보다 빠른 접근 필요 시 사용.
항상 DB의 parentId 관계와 동기화 유지 필요.

---

## 루트 노드 특이사항

```typescript
const rootNode: NodeObject = {
  id: "node_root",
  parentId: null,        // 루트는 반드시 null
  depth: 0,
  layoutType: "radial-bidirectional",  // 전체 기본 레이아웃
  // ...
};
```

---

## 스타일 상속 규칙

1. 노드 생성 시 부모 노드의 style을 기본으로 복사
2. depth에 따른 기본 fontSize 자동 적용
   - depth 0 (루트): 20px
   - depth 1: 16px
   - depth 2: 14px
   - depth 3+: 12px
3. 명시적으로 지정한 style 필드는 상속값을 override
