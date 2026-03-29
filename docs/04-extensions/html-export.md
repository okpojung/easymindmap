# easymindmap — Standalone HTML Export (EXPORT-02)

## 목적

NodeTree를 단일 HTML 파일로 변환.  
JavaScript / CSS를 모두 인라인으로 포함해 **외부 의존성 없이 단독 실행 가능**.  
웹서버에 업로드하면 즉시 퍼블리싱 가능.

---

## 요구사항

| 항목 | 요구사항 |
|------|----------|
| 단독 실행 | 인터넷 연결 없이 브라우저에서 바로 열림 |
| 외부 CDN | 없음 (모든 JS/CSS 인라인) |
| 파일 수 | 단일 `.html` 파일 1개 |
| 인터랙션 | Zoom / Pan / 노드 접기/펼치기 가능 |
| 편집 | 불가 (읽기 전용 뷰어) |
| 크기 목표 | 500KB 이하 (일반 맵 기준) |

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

  <script>
    // 맵 데이터 (JSON)
    const MAP_DATA = {json데이터};

    // 뷰어 엔진 전체 JS 인라인
    // - SVG 렌더링
    // - Layout 계산
    // - Zoom / Pan
    // - 노드 접기/펼치기
  </script>
</body>
</html>
```

---

## 인라인 포함 목록

| 항목 | 처리 방식 |
|------|-----------|
| 뷰어 CSS | `<style>` 태그 내 직접 삽입 |
| 뷰어 JS | `<script>` 태그 내 직접 삽입 (minify) |
| 맵 데이터 (JSON) | JS 변수로 삽입 |
| 노드 배경 이미지 | base64 인코딩 후 data URL로 삽입 |
| 폰트 | 시스템 폰트 사용 (외부 폰트 없음) |

---

## 포함 기능 (읽기 전용 뷰어)

| 기능 | 포함 |
|------|------|
| 전체 맵 렌더링 | ✅ |
| Zoom In / Out (마우스 휠) | ✅ |
| Pan (Space + Drag 또는 Drag) | ✅ |
| Fit Screen | ✅ |
| 노드 접기 / 펼치기 | ✅ |
| 노드 클릭 (하이라이트) | ✅ |
| 노드 편집 | ❌ |
| AI 생성 | ❌ |
| 저장 | ❌ |

---

## 데이터 직렬화

```typescript
type ExportData = {
  version: string;       // "1.0"
  title: string;
  exportedAt: string;    // ISO 8601
  nodes: NodeObject[];
  rootNodeId: string;
};

const exportData: ExportData = {
  version: "1.0",
  title: map.title,
  exportedAt: new Date().toISOString(),
  nodes: nodes,
  rootNodeId: rootNode.id,
};
```

---

## 생성 파이프라인

```
1. Server: GET /maps/{mapId} → NodeTree 로딩

2. Server: ExportData JSON 직렬화

3. Server: HTML 템플릿 + 뷰어 JS/CSS + JSON 데이터 병합

4. Server: HTML minify (선택)

5. Server: HTTP 응답 (Content-Disposition: attachment)

6. 선택: Supabase Storage에 저장 → Publish URL 생성
```

---

## Publish 연동

HTML Export 직후 **Publish** 기능으로 이어지는 플로우:

```
Export HTML 생성
    ↓
Supabase Storage에 업로드
  버킷: published-maps
  경로: /{publishId}/index.html
    ↓
published_maps 테이블에 레코드 생성
    ↓
Public URL 반환:
  https://[supabase-project].supabase.co/storage/v1/object/public/published-maps/{publishId}/index.html
  또는 커스텀 도메인:
  https://mindmap.ai.kr/p/{publishId}
```

---

## API 연동

```
POST /maps/{mapId}/export/html

Response:
  Content-Type: text/html; charset=utf-8
  Content-Disposition: attachment; filename="{mapTitle}.html"
  Body: (완전한 standalone HTML)
```

---

## 파일 크기 최적화

| 항목 | 최적화 방법 |
|------|-------------|
| 뷰어 JS | minify + 불필요한 편집 기능 제외 |
| CSS | 뷰어 전용 CSS만 포함 |
| 노드 데이터 | 렌더링에 필요한 필드만 포함 (note, style 포함 / 내부 캐시 제외) |
| 배경 이미지 | WebP 변환 후 base64 (크기 제한: 노드당 200KB) |

---

## 제한 사항

| 항목 | 제한 |
|------|------|
| 최대 노드 수 | 1,000개 (초과 시 경고) |
| 배경 이미지 | 노드당 200KB |
| 총 파일 크기 | 5MB 초과 시 경고 |
| 브라우저 지원 | Chrome / Firefox / Safari / Edge 최신 버전 |
