# easymindmap — Standalone HTML Export (EXPORT-02)

문서 버전: v2.0
결정일: 2026-03-29

> **[v2.0 주요 추가]**
> - 이미지 처리 정책 상세화 (배경 이미지 embed/link/omit 전략)
> - 태그 렌더링 방식 정의
> - 접힌 노드(collapsed) 처리 정책 확정 (뷰어에서 접힌 채로 렌더링)
> - Export API Request Body 옵션 정의
> - 파일 크기 경고 기준 명확화

---

## 목적

NodeTree를 단일 HTML 파일로 변환.  
JavaScript / CSS를 모두 인라인으로 포함해 **외부 의존성 없이 단독 실행 가능**.  
웹서버에 업로드하면 즉시 퍼블리싱 가능.

---

## Export API

```
POST /maps/{mapId}/export/html
```

**Request Body**
```json
{
  "includeCollapsed": false,
  "includeTags": true,
  "includeNotes": true,
  "includeLinks": true,
  "imageHandling": "embed",
  "embedFontFallback": true
}
```

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `includeCollapsed` | boolean | `false` | 접힌 노드 포함 여부 |
| `includeTags` | boolean | `true` | 태그 배지 렌더링 여부 |
| `includeNotes` | boolean | `true` | 노드 메모 tooltip/패널 여부 |
| `includeLinks` | boolean | `true` | 하이퍼링크 아이콘 및 클릭 여부 |
| `imageHandling` | string | `"embed"` | `"embed"` \| `"link"` \| `"omit"` |
| `embedFontFallback` | boolean | `true` | 시스템 폰트 fallback 인라인 CSS 포함 |

---

## 요구사항

| 항목 | 요구사항 |
|------|----------|
| 단독 실행 | 인터넷 연결 없이 브라우저에서 바로 열림 |
| 외부 CDN | 없음 (모든 JS/CSS 인라인) |
| 파일 수 | 단일 `.html` 파일 1개 |
| 인터랙션 | Zoom / Pan / 노드 접기/펼치기 가능 |
| 편집 | 불가 (읽기 전용 뷰어) |
| 크기 목표 | 500KB 이하 (이미지 없는 일반 맵 기준) |

---

## HTML 파일 구조

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{맵 제목}</title>
  <style>
    /* 뷰어 전체 CSS 인라인 */
    /* 태그 배지 스타일 포함 */
    /* 접힌 노드 표시 스타일 포함 */
  </style>
</head>
<body>
  <header>
    <h1>{맵 제목}</h1>
    <span>easymindmap · mindmap.ai.kr</span>
  </header>

  <div id="viewer-root">
    <svg id="mindmap-canvas"></svg>
  </div>

  <div class="toolbar">
    <button id="btn-zoom-in">+</button>
    <button id="btn-fit">맞춤</button>
    <button id="btn-zoom-out">-</button>
  </div>

  <!-- 노드 메모 패널 (includeNotes: true) -->
  <div id="note-panel" class="hidden"></div>

  <script>
    // 맵 데이터 (JSON 직렬화)
    const MAP_DATA = { /* ExportData JSON */ };

    // 뷰어 엔진 전체 JS 인라인 (minified)
    // - SVG 렌더링 (노드/엣지)
    // - Layout 계산 (layoutType별)
    // - Zoom / Pan
    // - 노드 접기/펼치기
    // - 태그 배지 렌더링
    // - 메모 패널 토글
    // - 링크 클릭 처리
  </script>
</body>
</html>
```

---

## 1. 접힌 노드 (Collapsed) 처리 정책

> **확정 정책**: HTML Export의 collapsed 처리는 Markdown Export와 다르다.  
> HTML은 인터랙티브 뷰어이므로 **export 시 collapsed 상태를 그대로 보존**한다.

| 옵션 `includeCollapsed` | 동작 |
|-------------------------|------|
| `false` **(기본값)** | collapsed 노드는 **접힌 채로 렌더링** (뷰어에서 펼치기 가능) |
| `true` | 모든 노드를 **펼친 상태**로 export (collapsed 상태 무시) |

**`includeCollapsed: false` (기본값) 동작**:
- collapsed 노드는 HTML에 데이터는 포함됨
- 뷰어 초기 렌더링 시 하위 노드를 숨긴 채 시작
- 사용자가 collapse 아이콘을 클릭해 펼칠 수 있음
- 노드 옆에 `▶` 아이콘으로 "하위 노드 있음" 표시

**`includeCollapsed: true` 동작**:
- 모든 노드를 펼친 상태로 렌더링 시작
- collapsed 플래그 완전 무시

**근거**: HTML 뷰어는 인터랙션이 가능하므로 "처음부터 펼쳐서 보여줄지" vs "접힌 상태 그대로 보여줄지"를 사용자가 선택할 수 있도록 옵션을 제공한다.

---

## 2. 태그 처리 정책

`includeTags: true`일 때, 노드 카드 하단에 태그 배지를 렌더링한다.

**렌더링 방식**:
```html
<div class="node-tags">
  <span class="tag-badge" style="background-color: #FF5733; color: #fff">#중요</span>
  <span class="tag-badge" style="background-color: #33A1FF; color: #fff">#AI</span>
</div>
```

**태그 배지 스타일**:
- 태그 color 값을 배지 배경색으로 사용
- 배경색이 어두우면 텍스트 흰색, 밝으면 텍스트 검정색 (명도 계산)
- 배지는 노드 카드 하단 또는 노드 텍스트 아래 inline 표시

`includeTags: false`이면 태그 배지 렌더링 제외 (데이터 자체도 MAP_DATA에서 제외하여 파일 크기 최소화).

---

## 3. 배경 이미지 처리 정책

배경 이미지는 파일 크기에 가장 큰 영향을 주므로 3가지 처리 방식을 제공한다.

| 옵션 `imageHandling` | 동작 | 파일 크기 영향 | 오프라인 지원 |
|----------------------|------|---------------|--------------|
| `"embed"` **(기본값)** | Base64로 인코딩 후 `data:` URL로 HTML에 직접 삽입 | 크게 증가 | ✅ 완전 오프라인 |
| `"link"` | 원본 URL을 그대로 사용 (`src="https://..."`) | 변화 없음 | ❌ 인터넷 필요 |
| `"omit"` | 배경 이미지 완전 제외 | 감소 | ✅ |

**`embed` 처리 상세**:
```
1. nodes.style_json.backgroundImage.url → 서버에서 이미지 다운로드
2. WebP 변환 (가능한 경우, 원본 대비 ~30% 크기 절감)
3. Base64 인코딩 → data:image/webp;base64,...
4. 노드 SVG 요소의 배경으로 삽입
```

**파일 크기 제한 및 경고**:

| 조건 | 처리 |
|------|------|
| 단일 이미지 200KB 초과 | 리사이즈 후 embed (최대 1280px 단변) |
| 전체 HTML 5MB 초과 | `imageHandling: "link"` 으로 자동 전환 + 사용자에게 경고 |
| 전체 HTML 10MB 초과 | Export 거부 + 오류 메시지 |

**`link` 처리 시 주의사항**:
- 이미지 URL이 Supabase Storage Private 버킷이면 signed URL 발급 필요
- signed URL은 유효 기간(기본 1시간)이 있으므로 `link` 방식은 장기 보관에 부적합
- 공개 CDN 이미지(preset)에는 `link` 방식이 적합

---

## 4. 노드 메모 처리

`includeNotes: true`일 때:
- 메모가 있는 노드에 📝 아이콘 표시
- 아이콘 클릭 시 우측 패널에 메모 내용 표시
- 메모 텍스트는 MAP_DATA에 포함됨

`includeNotes: false`이면:
- 메모 아이콘 미표시
- MAP_DATA에서 note 필드 제외 (파일 크기 최소화)

---

## 5. 하이퍼링크 처리

`includeLinks: true`일 때:
- 링크가 있는 노드에 🔗 아이콘 표시
- 아이콘 클릭 시 링크 목록 팝업 표시 또는 단일 링크면 바로 새 탭 열기

`includeLinks: false`이면:
- 링크 아이콘 미표시, 링크 데이터 MAP_DATA에서 제외

---

## 인라인 포함 목록

| 항목 | 처리 방식 |
|------|-----------|
| 뷰어 CSS | `<style>` 태그 내 직접 삽입 (minified) |
| 뷰어 JS | `<script>` 태그 내 직접 삽입 (minified) |
| 맵 데이터 (JSON) | JS `const MAP_DATA = {...}` 변수로 삽입 |
| 배경 이미지 | `imageHandling` 옵션에 따라 결정 |
| 태그 색상 | 태그 배지 style 속성으로 인라인 삽입 |
| 폰트 | 시스템 폰트 fallback CSS만 포함 (외부 폰트 없음) |

---

## 포함 기능 (읽기 전용 뷰어)

| 기능 | 포함 |
|------|------|
| 전체 맵 렌더링 | ✅ |
| Zoom In / Out (마우스 휠) | ✅ |
| Pan (Space + Drag 또는 Drag) | ✅ |
| Fit Screen | ✅ |
| 노드 접기 / 펼치기 | ✅ |
| 태그 배지 표시 | ✅ (includeTags: true) |
| 메모 패널 | ✅ (includeNotes: true) |
| 하이퍼링크 클릭 | ✅ (includeLinks: true) |
| 배경 이미지 렌더링 | ✅ (imageHandling: embed/link) |
| 노드 편집 | ❌ |
| AI 생성 | ❌ |
| 저장 | ❌ |

---

## 데이터 직렬화

```typescript
type ExportNodeData = {
  id: string;
  parentId: string | null;
  text: string;
  depth: number;
  orderIndex: number;
  layoutType: string;
  collapsed: boolean;      // includeCollapsed 옵션에 따라 조작
  shapeType: string;
  style: NodeStyle;
  backgroundImage?: NodeBackgroundImage | null;  // imageHandling에 따라 url 조작
  note?: string;           // includeNotes: false이면 제외
  links?: NodeLink[];      // includeLinks: false이면 제외
  tags?: Tag[];            // includeTags: false이면 제외
  manualPosition?: { x: number; y: number } | null;
};

type ExportData = {
  version: '2.0';
  title: string;
  exportedAt: string;       // ISO 8601
  nodes: ExportNodeData[];
  rootNodeId: string;
  exportOptions: MarkdownExportOptions;
};
```

---

## 생성 파이프라인

```
1. Server: GET /maps/{mapId} → NodeTree 로딩

2. Server: Export 옵션에 따라 노드 필터링/가공
   - imageHandling: "embed" → 이미지 다운로드 → WebP 변환 → Base64
   - imageHandling: "link"  → URL signed (private 버킷)
   - imageHandling: "omit"  → backgroundImage 필드 제거
   - includeCollapsed: false → collapsed 플래그 유지 (데이터는 포함)
   - includeTags: false → tags 필드 제거
   - includeNotes: false → note 필드 제거

3. Server: ExportData JSON 직렬화

4. Server: HTML 템플릿 + 뷰어 JS/CSS + JSON 데이터 병합

5. Server: HTML minify

6. Server: 파일 크기 체크
   - 5MB < size ≤ 10MB → 경고 헤더 포함
   - size > 10MB → 400 Bad Request

7. Server: exports 테이블에 job 기록 + Supabase Storage 저장

8. Client: 다운로드 URL 반환 또는 Publish 연동
```

---

## Publish 연동

```
Export HTML 생성
    ↓
Supabase Storage에 업로드
  버킷: published
  경로: /{publishId}/index.html
    ↓
published_maps 테이블에 레코드 생성
    ↓
Public URL 반환:
  https://app.mindmap.ai.kr/published/{publishId}
```

---

## 파일 크기 최적화

| 항목 | 최적화 방법 |
|------|-------------|
| 뷰어 JS | minify + 편집 기능 제외 |
| CSS | 뷰어 전용 CSS만 포함 |
| 노드 데이터 | 렌더링 필수 필드만 (size_cache, text_hash 등 내부 캐시 제외) |
| 배경 이미지 | WebP 변환 후 Base64 (노드당 최대 200KB) |
| 태그 | includeTags: false 선택 시 완전 제외 |
| 메모/링크 | 각 옵션으로 제외 가능 |

---

## 제한 사항

| 항목 | 제한 |
|------|------|
| 최대 노드 수 | 1,000개 (초과 시 경고, 계속 진행 선택 가능) |
| 배경 이미지 (embed) | 노드당 원본 최대 5MB → 리사이즈 후 200KB 이내 |
| 총 HTML 파일 크기 | 5MB 초과 시 경고 / 10MB 초과 시 Export 거부 |
| 브라우저 지원 | Chrome / Firefox / Safari / Edge 최신 버전 |
| signed URL 유효 기간 | imageHandling: "link" + private 이미지 → 1시간 |
