# 20. Export
## EXPORT

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § EXPORT`, `docs/02-domain/db-schema.md § exports`

---

### 1. 기능 목적

* 마인드맵을 **Markdown 또는 Standalone HTML 파일로 내보내는** 기능
* 외부 도구(Obsidian, Notion, VS Code 등)와의 연동 및 공유 용이성 제공
* Background Job 패턴으로 대형 맵도 안정적으로 내보내기 처리

---

### 2. 기능 범위

* 포함:
  * Markdown 내보내기 (EXPORT-01)
  * Standalone HTML 내보내기 (EXPORT-02)
  * 내보내기 진행 상태 표시
  * 완료 후 파일 다운로드

* 제외:
  * PDF 내보내기 (후순위)
  * PNG/SVG 이미지 내보내기 (후순위)
  * 가져오기 (→ `21-import.md`)

---

### 3. 세부 기능 목록

| 기능ID      | 기능명              | 설명                         | 주요 동작           |
| --------- | ---------------- | -------------------------- | --------------- |
| EXPORT-01 | Export Markdown  | 노드 트리를 Markdown 아웃라인으로 변환  | 파일 다운로드         |
| EXPORT-02 | Export HTML      | 맵 구조를 Standalone HTML로 내보내기 | 파일 다운로드         |

---

### 4. 기능 정의 (What)

#### 4.1 exports 테이블

```sql
CREATE TABLE public.exports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id        UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES public.users(id),
  format        VARCHAR(20) NOT NULL,  -- 'markdown' | 'html'
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
                -- 'pending' | 'processing' | 'done' | 'error'
  storage_path  VARCHAR(500),          -- Supabase Storage 경로
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 4.2 Markdown exportMode — Basic vs Extended

| 항목 | Basic (기본) | Extended (확장) |
|---|---|---|
| **대상** | 범용 Markdown 편집기, Notion, VS Code | Obsidian, 팀 보관, 버전 관리 |
| **YAML Front Matter** | ❌ 없음 | ✅ 맵 전체 메타 포함 |
| **포함 메타** | 노드 텍스트·태그·메모·링크 (옵션) | title, map_id, owner, layout_type, theme, node_count, tags, created_at, updated_at |
| **API 파라미터** | `exportMode: "basic"` (기본값) | `exportMode: "extended"` |
| **Import 역호환** | — | Extended 파일 Import 시 Front Matter로 맵 메타 자동 복원 |

---

##### 4.2-A. Basic 포맷 — 노드 트리 변환 규칙

```text
Root 노드 → # 제목
  Depth 1  → ## 제목
    Depth 2  → ### 제목
      Depth 3  → #### 제목 (이하 동일)
  노드 note → 해당 헤딩 아래 paragraph로 포함
  태그      → 헤딩 옆 `[tag]` 형태로 inline 표기
```

예시 출력:

```markdown
# Linux 서버 구축

## 패키지 관리
### APT 업데이트
### Nginx 설치

## 보안 설정
### 방화벽 설정
### SSH 설정
```

---

##### 4.2-B. Extended 포맷 — YAML Front Matter + 노드 트리

YAML Front Matter에 **맵 메타 정보 전체**를 포함한다.

**포함되는 맵 메타 필드**

| 필드 | 출처 | 설명 |
|---|---|---|
| `title` | `maps.title` | 맵 제목 |
| `map_id` | `maps.id` | 맵 UUID |
| `owner` | `users.display_name` | 맵 소유자(creator) 이름 |
| `layout_type` | `maps.default_layout_type` | 맵 기본 레이아웃 종류 (예: `radial-bidirectional`, `tree-right`) |
| `edge_default` | 레이아웃에서 자동 파생 | 연결선 기본 스타일: `curve` (방사형) \| `orthogonal` (그 외 모든 레이아웃) |
| `theme` | `maps.theme` | 적용 테마 이름 |
| `node_count` | 집계 | 전체 노드 수 |
| `tags` | `maps.tags` | 맵 단위 태그 목록 |
| `created_at` | `maps.created_at` | 맵 최초 생성 일시 (ISO 8601) |
| `updated_at` | `maps.updated_at` | 맵 최종 수정 일시 (ISO 8601) |
| `export_mode` | 고정값 | `"extended"` |
| `easymindmap_version` | 서버 버전 | 내보내기 시 앱 버전 |

> **`edge_default` 허용값**  
> - `curve` — 방사형(Radial) 레이아웃: Cubic Bezier 곡선  
> - `orthogonal` — 트리·계층·진행트리·자유배치·Kanban: 직각선 (Orthogonal Connector)  
> ⚠ 구 스펙의 `straight` 표기는 사용하지 않는다. 직각선은 반드시 `orthogonal`로 표기할 것.

예시 출력:

```markdown
---
title: "AI 개념 정리"
map_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
owner: "홍길동"
layout_type: "radial-bidirectional"
edge_default: "curve"
theme: "default"
node_count: 42
tags:
  - AI
  - 연구
created_at: "2026-04-01T09:00:00Z"
updated_at: "2026-04-16T12:30:00Z"
export_mode: "extended"
easymindmap_version: "1.2.0"
---

# AI 개념 정리

## Machine Learning
### Supervised Learning
### Unsupervised Learning

## Deep Learning
### CNN
### RNN
```

> **Obsidian 호환**: YAML Front Matter는 Obsidian Properties 패널에서 자동 인식됨.  
> **Import 역호환**: Extended 포맷 파일을 Import 시 Front Matter를 파싱하여 맵 메타 자동 복원 가능 (IMPORT-01 연동).

#### 4.3 Standalone HTML 구조

* 외부 CDN 의존 없이 단일 HTML 파일로 동작
* 인라인 CSS + 인라인 JS 포함
* 노드 트리를 접을 수 있는 아코디언 형태로 렌더링
* 태그·메모 등 부가 정보 포함

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 상단 메뉴 > `내보내기` > `Markdown` 또는 `HTML` 선택
* 내보내기 옵션 선택 (포함 범위: 전체 맵 / 선택 서브트리)
* `[내보내기]` 버튼 클릭 → 진행 상태 표시 (`Preparing...`)
* 완료 후 `[다운로드]` 버튼 표시 → 클릭하여 파일 저장

#### 5.2 시스템 처리 흐름

```
POST /maps/{mapId}/export {
  format: 'markdown' | 'html',
  exportMode: 'basic' | 'extended',   // Markdown 전용, 기본값: 'basic'
  includeTags: true | false,           // 기본값: true
  includeNotes: true | false,          // 기본값: true
  includeLinks: true | false,          // 기본값: true
  includeCollapsed: true | false,      // 기본값: true
  imageHandling: 'omit' | 'alt-text' | 'link',  // Markdown 기본값: 'omit'
  scope: 'full' | 'subtree',          // 기본값: 'full'
  rootNodeId: UUID | null              // scope='subtree'일 때 기준 노드
}
    │
    ▼
exports INSERT (status: pending)
    │
    ▼
BullMQ Worker
  ├─ 노드 트리 로딩 (map_id 기준 전체 nodes 조회)
  ├─ Markdown/HTML 변환 처리
  └─ Supabase Storage 업로드
    │
    ▼
exports UPDATE (status: done, storage_path)
    │
    ▼
클라이언트 Polling 또는 WebSocket 알림
    │
    ▼
GET /exports/{exportId}/download → Signed URL 반환 → 파일 다운로드
```

#### 5.3 소형 맵 즉시 내보내기 (≤ 200 nodes)

* 노드 수가 200 이하인 경우 Background Job 없이 즉시 변환하여 반환
* Response Body에 파일 내용 직접 포함 (Content-Disposition: attachment)

---

### 6. 규칙 (Rule)

* 내보내기 파일은 Supabase Storage에 24시간 보관 후 자동 삭제
* Kanban 레이아웃 내보내기: 컬럼/카드 구조를 2단계 Markdown으로 변환
* 태그: Markdown에서 `[tagName]` 인라인 표기
* Node Note: 해당 헤딩 아래 들여쓰기 paragraph로 포함
* 빈 노드(text = '')는 `(빈 노드)` 로 표시

---

### 7. 예외 / 경계 (Edge Case)

* **1000+ 노드 대형 맵**: Background Job으로 처리, 완료 시 알림
* **내보내기 실패**: `status = 'error'` + 오류 메시지 표시 + 재시도 버튼
* **Storage 업로드 실패**: 재시도 3회 후 오류 처리
* **서브트리 내보내기**: 선택 노드 기준 하위 전체 포함

---

### 8. 권한 규칙

| 역할      | 내보내기 |
| ------- | ----- |
| creator | ✅     |
| editor  | ✅     |
| viewer  | ✅     |

---

### 9. DB 영향

* `exports` — 내보내기 작업 이력 관리

---

### 10. API 영향

* `POST /maps/{mapId}/export` — 내보내기 요청 (`exportMode: 'basic' | 'extended'` 파라미터 포함)
* `GET /exports/{exportId}` — 작업 상태 조회
* `GET /exports/{exportId}/download` — Signed URL 발급

---

### 11. 연관 기능

* IMPORT (`21-import.md`)
* OBSIDIAN_INTEGRATION (`30-obsidian-integration.md`)

---

### 12. 구현 우선순위

#### MVP
* EXPORT-01 Markdown Basic 내보내기 (즉시 방식, ≤ 200 nodes)
* EXPORT-02 HTML 내보내기 (즉시 방식)

#### 2단계
* EXPORT-01E Markdown Extended 내보내기 (YAML Front Matter + 맵 메타 포함)
* Background Job 패턴 (대형 맵 지원)
* 서브트리 내보내기
* Supabase Storage 보관 + Signed URL 다운로드

---

## Markdown 내보내기 상세 규칙

### tagFormat 옵션

`includeTags: true`일 때 태그를 어떤 형식으로 출력할지 결정한다. 헤더 바로 아래에 삽입된다.

| `tagFormat` 값 | 출력 예시 | 설명 |
|----------------|-----------|------|
| `"badge"` (기본값) | `` `#AI` `` `` `#연구` `` | 코드 span으로 감싼 해시태그 배지 |
| `"hashtag"` | `#AI #연구` | 일반 텍스트 해시태그 |
| `"list"` | `**태그**: AI, 연구` | 볼드 레이블 + 쉼표 구분 목록 |

```markdown
<!-- badge (기본값) -->
## Machine Learning
`#AI` `#연구`

<!-- hashtag -->
## Machine Learning
#AI #연구

<!-- list -->
## Machine Learning
**태그**: AI, 연구
```

### 접힌 노드 (Collapsed) 처리 — Markdown

Markdown Export에서 `includeCollapsed: false`일 때, **collapsed 노드 자체는 출력에 포함**되고 그 하위 subtree(자식 노드)만 제외된다. HTML Export와 반대되는 동작이다.

| `includeCollapsed` | 동작 |
|--------------------|------|
| `true` (기본값) | collapsed 노드 및 하위 subtree 전체 포함 |
| `false` | collapsed 노드 자체는 포함, **하위 자식 노드만 제외** |

예시 (`includeCollapsed: false`):
```
AI (root)
 └ Machine Learning (collapsed: true)
     └ Supervised      ← 미포함
     └ Unsupervised    ← 미포함
```
출력:
```markdown
# AI

## Machine Learning
<!-- 하위 노드는 접힌 상태로 제외됨 -->
```

### 노드별 출력 순서

노드 한 개당 Markdown 출력 순서는 다음과 같이 고정된다.

```
1. 헤더 (#, ##, ...)     ← node.text
2. 태그 행               ← includeTags: true + node.tags
3. 배경 이미지 행        ← imageHandling: "alt-text" 또는 "link"
4. 메모 본문             ← includeNotes: true + node.note
5. 하이퍼링크 목록       ← includeLinks: true + node.links
6. (하위 노드 재귀)
```

### 이미지 처리 옵션 (Markdown)

Markdown은 이미지 overlay/opacity/fit 스타일을 표현할 수 없으므로 기본값은 `"omit"`이다.

| `imageHandling` 값 | 동작 | 출력 예시 |
|--------------------|------|-----------|
| `"omit"` (기본값) | 배경 이미지 정보 완전 제외 | (없음) |
| `"alt-text"` | 이미지 존재 여부만 텍스트로 표시 | `> 🖼 배경 이미지 포함` |
| `"link"` | 이미지 URL을 Markdown 링크 문법으로 삽입 | `![배경 이미지](https://...)` |

### 파일명 규칙

* 맵 제목에서 특수문자 제거
* 공백은 언더스코어(`_`)로 치환
* 예: `"AI 개념 정리"` → `AI_개념_정리.md`

---

## HTML 내보내기 상세 규칙

### imageHandling 3가지 모드

배경 이미지는 HTML 파일 크기에 가장 큰 영향을 준다. 3가지 처리 방식의 트레이드오프는 다음과 같다.

| `imageHandling` 값 | 동작 | 파일 크기 영향 | 오프라인 지원 |
|--------------------|------|---------------|--------------|
| `"embed"` (기본값) | Base64 인코딩 후 `data:` URL로 HTML에 직접 삽입 | 크게 증가 | 완전 오프라인 가능 |
| `"link"` | 원본 URL을 그대로 사용 (`src="https://..."`) | 변화 없음 | 인터넷 연결 필요 |
| `"omit"` | 배경 이미지 완전 제외 | 감소 | 해당 없음 |

### 접힌 노드 (Collapsed) 처리 — HTML

HTML Export에서 `includeCollapsed: false`(기본값)일 때, collapsed 노드는 **데이터는 HTML에 포함**되지만 **뷰어 초기 렌더링 시 접힌 채로 시작**된다. 노드 옆에 `▶` 아이콘이 표시되며 사용자가 클릭해 펼칠 수 있다. Markdown Export에서 노드 자체를 포함하는 것과 달리, HTML은 인터랙티브 뷰어이므로 collapsed 상태 자체를 보존한다.

| `includeCollapsed` | 동작 |
|--------------------|------|
| `false` (기본값) | collapsed 노드를 **접힌 채로 렌더링** — 뷰어에서 `▶` 아이콘 클릭으로 펼치기 가능 |
| `true` | 모든 노드를 **펼친 상태**로 export (collapsed 플래그 완전 무시) |

### Standalone HTML 요건

| 항목 | 요건 |
|------|------|
| 파일 수 | 단일 `.html` 파일 1개 |
| 파일 크기 목표 | 500KB 이하 (이미지 없는 일반 맵 기준) |
| 외부 CDN | 없음 — 모든 JS/CSS 인라인 포함 |
| 실행 환경 | 인터넷 연결 없이 브라우저에서 바로 열림 |

### 뷰어 기능 목록

HTML Export로 생성된 파일은 읽기 전용 뷰어로 동작한다. 편집은 불가능하다.

| 기능 | 지원 여부 |
|------|-----------|
| 전체 맵 렌더링 | 지원 |
| Zoom In / Out (마우스 휠) | 지원 |
| Pan (Space+Drag 또는 Drag) | 지원 |
| Fit Screen | 지원 |
| 노드 접기 / 펼치기 (collapse-expand) | 지원 |
| 태그 배지 표시 | 지원 (`includeTags: true`) |
| 메모 패널 | 지원 (`includeNotes: true`) |
| 하이퍼링크 클릭 | 지원 (`includeLinks: true`) |
| 배경 이미지 렌더링 | 지원 (`imageHandling: embed` 또는 `link`) |
| 노드 편집 | 불가 |
| AI 생성 | 불가 |
| 저장 | 불가 |

### Base64 최적화 (embed 모드)

`imageHandling: "embed"` 선택 시 서버에서 다음 과정을 거쳐 이미지를 최적화한다.

```
1. nodes.style_json.backgroundImage.url → 서버에서 이미지 다운로드
2. WebP 변환 (가능한 경우, 원본 대비 약 30% 크기 절감)
3. 최대 1280px 단변 기준 리사이즈
4. Base64 인코딩 → data:image/webp;base64,...
5. 노드 SVG 요소의 배경으로 삽입
```

### 이미지 크기 제한 및 처리 정책

| 조건 | 처리 |
|------|------|
| 단일 이미지 200KB 초과 | 리사이즈 후 embed (최대 1280px 단변 기준) |
| 전체 HTML 크기 5MB 초과 ~ 10MB 이하 | `imageHandling: "link"`으로 자동 전환 + 경고 헤더 포함 |
| 전체 HTML 크기 10MB 초과 | Export 거부 + 오류 메시지 반환 |

### Signed URL 유효기간 주의사항

`imageHandling: "link"` 방식에서 이미지 URL이 Supabase Storage Private 버킷을 가리키는 경우 Signed URL이 발급된다.

* Signed URL 기본 유효 기간: **1시간**
* 유효 기간 만료 후 이미지가 표시되지 않으므로, `"link"` 방식은 **장기 보관 목적에 부적합**하다.
* 공개 CDN 이미지(preset)에는 `"link"` 방식이 적합하다.
* 장기 보관이 필요한 경우 `"embed"` 방식을 사용한다.
