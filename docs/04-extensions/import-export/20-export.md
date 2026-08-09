# 20. Export
## EXPORT

* 문서 버전: v1.1
* 작성일: 2026-04-16 (2026-07 EMM 스펙 체계로 개정)
* 최종 업데이트: 2026-08-04 — 현행(100% 클라이언트, 옵션 없는 단일 규칙, ZIP 첨부 패키징) 기준으로 서버 설계 절에 배지 정리
* 참조: `docs/01-product/functional-spec.md § EXPORT`, `docs/02-domain/db-schema.md § exports`

> **📐 포맷 정의는 이 문서가 아니라 EMM 스펙이 규범이다.**
> Markdown 내보내기가 만드는 파일은 **EasyMindMap Markdown(EMM)** 문서다.
> - 포맷 명세(설계 원칙·문법·적합성): `docs/04-extensions/emm-spec.md`
> - 변환 규칙 상세(구현 규칙서): `docs/04-extensions/markdown-export.md`
> - 메타데이터 계층: `22-map-file-meta.md`
>
> 이 문서는 내보내기 **제품 기능**(UI·패키징·Job 처리)을 정의한다.

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

> **[서버 연결 예정]** — 현행 내보내기는 100% 클라이언트에서 처리된다(노드 제한 없음). 아래는 SaaS 이관 설계.

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

#### 4.2 Markdown 내보내기 모드 — 단일 모드 (EMM 2계층)

> **[개정 — 2026-07] 초기 설계의 Basic/Extended(simple/full) 이원화는
> 폐기되었다.** EMM의 2계층 구조(본문 = 순수 GFM, 파일 끝 1줄 메타데이터
> 주석 `easymindmap:v1:BASE64`)가 두 목적을 동시에 달성하기 때문이다:
>
> - 본문만 보면 = 사람 읽기용(구 Basic) — 어떤 MD 뷰어에서도 정상 문서
> - 메타데이터까지 읽으면 = 무손실 복원용(구 Extended)
>
> 따라서 export는 **단일 모드**이며 항상 메타데이터를 포함한다.
> 근거·상세: `emm-spec.md` §2.1, 메타 스키마: `22-map-file-meta.md`.
> 아래 4.2-A/4.2-B는 초기 개념의 기록으로만 보존한다 (구현 기준 아님).

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
* SVG 마인드맵 뷰어로 렌더링 (접기·줌·팬·아웃라인 분할·다크)
* 태그·메모 등 부가 정보 포함

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 툴바 `내보내기 ▼` → **HTML / MD** 두 항목 — 옵션 없이 **즉시 저장**된다 (첨부가 있으면 ZIP 패키징).
* **[서버 연결 예정]** 서브트리 범위 선택·진행 상태 표시는 서버 이관 시 설계.

#### 5.2 시스템 처리 흐름

> **[서버 연결 예정]** — 현행은 100% 클라이언트 처리(노드 제한 없음). 아래(POST /maps/:id/export · exports · BullMQ · Supabase Storage)는 SaaS 이관 설계이며, 옵션 파라미터는 **[미구현 — 초기 설계]** (현행은 옵션 없는 단일 규칙).

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

> **[서버 연결 예정]** — 현행은 100% 클라이언트라 노드 수 제한이 없다.

* 노드 수가 200 이하인 경우 Background Job 없이 즉시 변환하여 반환
* Response Body에 파일 내용 직접 포함 (Content-Disposition: attachment)

---

### 6. 규칙 (Rule)

* **[서버 연결 예정]** 내보내기 파일은 Supabase Storage에 24시간 보관 후 자동 삭제 (현행은 클라이언트에서 즉시 다운로드)
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

> **[서버 연결 예정]** — 현행은 100% 클라이언트 처리. 아래는 SaaS 이관 설계.

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

> **[미구현 — 초기 설계]** 아래 옵션들(`tagFormat`·`includeCollapsed`·`imageHandling` 등)은 초기 설계다 — 현행은 옵션 없는 단일 규칙(§'MD 내보내기 (exportMarkdown.ts)').

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

* 맵 제목의 `\ / : * ? " < > |` 를 `-` 로 치환하고 60자에서 절단한다 (공백은 유지)
* 예: `"AI 개념 정리"` → `AI 개념 정리.md`

---

## HTML 내보내기 상세 규칙

> **[미구현 — 초기 설계]** 아래 옵션(`imageHandling`·`includeCollapsed`)은 초기 설계다 — 현행은 옵션 없는 단일 규칙.

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

> **[서버 연결 예정]** — 현행은 붙여넣기 시점 내장(≤2.5MB) + ZIP 패키징. 아래 서버 최적화는 이관 설계.

`imageHandling: "embed"` 선택 시 서버에서 다음 과정을 거쳐 이미지를 최적화한다.

```
1. nodes.style_json.backgroundImage.url → 서버에서 이미지 다운로드
2. WebP 변환 (가능한 경우, 원본 대비 약 30% 크기 절감)
3. 최대 1280px 단변 기준 리사이즈
4. Base64 인코딩 → data:image/webp;base64,...
5. 노드 SVG 요소의 배경으로 삽입
```

### 이미지 크기 제한 및 처리 정책

> **[서버 연결 예정]** — 현행은 붙여넣기 시점 내장(≤2.5MB) + ZIP 패키징. 아래 크기 정책은 이관 설계.

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

---

### HTML 단독 뷰어 — 에디터 표시 패리티 추가분 (MVS 구현 — 2026-07)

내보낸 HTML 뷰어는 에디터 화면과 동일하게 다음을 재현한다.

| 항목 | 내보내기 방식 |
|------|--------------|
| 취소선·하이라이트 | `ExportNode.style = { strike?, highlight? }` — 취소선은 `text-decoration`, 하이라이트는 줄 뒤 #FFE066 띠 |
| 텍스트 정렬 | `ExportNode.textAlign` — left(기본)/center/right, `text-anchor`로 재현 |
| 레벨별 폰트 | 크기는 기존 `pos.fs`에 자동 반영(측정 시 맵 설정 주입), 글꼴은 `pos.ff`(font-family 문자열) 추가 |
| 노드 내 Markdown 표 | 뷰어가 노드 텍스트에서 표를 같은 규칙으로 감지해 SVG 격자로 그림 (에디터 좌표 모드에서만 — `pos.lines`에는 표 원문이 제외되어 있음) |
| 노트 리치 문단 | `notes[].html`(sanitize 통과분) — 상세 패널에서 `.mm-note-rich`로 사진+서식 표시, `img { max-width:100% }` |

주의: 리치 문단의 이미지는 원본 URL을 그대로 참조한다(오프라인 아님).
원본 서버가 핫링크를 막거나 삭제하면 이미지가 표시되지 않을 수 있다 —
`referrerpolicy=no-referrer`로 저장 시점에 완화. [서버 연결 예정] 내보내기
시 이미지를 data URL로 embed 하는 옵션은 위 '이미지 크기 제한' 정책을 따라
후속 단계에서 처리.

---

### MD 파일 불러오기 (MVS 구현 — 2026-07)

'새 맵' 메뉴에 **MD 파일 불러오기** 추가 — 로컬 Markdown 파일을 맵으로
변환한다 (`utils/importMarkdown.ts`): `#`=루트·제목,
`##`~`######`=2~6레벨, 리스트(`-`)는 마지막 견출 하위(들여쓰기 2칸=한 단계).
**MD 불러오기는 문서의 모든 내용을 변환한다** — 문단·코드·표 등 블록
규칙은 `markdown-export.md` §1, 블록 배치(blockPlacement)는 §1.0 참조.
'서버에 저장된 맵 불러오기'는 **구현 완료** — ☁ 서버 맵 불러오기가
문서함을 연다 (비로그인·Guest 에게는 숨김).

---

## MVS 구현 — 맵 메타데이터 내장 내보내기 + 불러오기 왕복 (2026-07)

### 파일 형식 구분

| 형식 | 내용 | 메타데이터 위치 |
|---|---|---|
| **HTML** | 오프라인 읽기 전용 뷰어 (기존) | `<script type="application/json" id="easymindmap-map">` + `<!-- EasyMindMap 생성 파일 -->` 주석 |
| **MD (EasyMindMap 내보내기)** | 일반 에디터에서 보고 고칠 수 있는 표준 Markdown 본문 | 파일 끝 `<!-- easymindmap:v1:BASE64(JSON) -->` 주석 |
| **MD (일반)** | 외부에서 작성된 Markdown | 없음 — 구조 파싱만 (importMarkdown.ts) |

메타데이터의 전체 필드·형식·불러오기 규칙은 **`22-map-file-meta.md`**
참조 — `{ format, version, generator, exportedAt(내보낸 시각), title,
nodeCount, editor:{layoutType, spacingX/Y}, map:원본 맵 전체 }`.
스타일·노트·링크·사진·태그·수동 크기·맵 설정(레벨별 폰트·레이아웃)까지
담긴다. MD 주석은 제목/노드 수/내보낸 시각 머리말 + 100자 줄바꿈
base64로 사람이 읽기 좋게 기록된다.

### HTML 뷰어 — 정렬·접기 토글 파리티 (2026-07)

- **실효 텍스트 맞춤 굽기**: 뷰어 데이터의 노드 textAlign에 "노드별
  설정 → 맵 설정 레벨 맞춤" 해석 결과를 구워 내보낸다 — 뷰어는 맵
  설정을 모르므로 굽지 않으면 왼쪽 맞춤 맵이 중앙으로 보였다.
  (메타데이터 쪽 맵은 원본 보존 — 다시 불러오면 설정째 복원)
- **접기(−) 토글은 호버 시에만**: 펼쳐진 노드의 토글(.mm-toggle-open)은
  기본 숨김, 노드에 마우스를 올리면 표시 (에디터와 동일). 접힌 노드의
  +N 배지는 항상 표시.
- **토글 위치 = 자식이 실제로 배치된 방향**: 펼쳐진 노드는 자식 좌표의
  평균 방향(아래/위/왼쪽/오른쪽)으로 계산 — 트리·진행트리의 3레벨
  이하에서 자식이 아래로 자라는데 토글이 오른쪽에 붙던 문제 수정.
  접힌 노드는 내보낸 side로 폴백. (에디터 CollapseControl도 동일 규칙)

### HTML 뷰어 — 에디터 파리티 (2026-07 갱신)

- **노드 색 = 에디터 디자인 토큰**: depth1 = colorKey 패밀리(파스텔
  채움 + 컬러 테두리), depth2+ = L2(흰 채움 + 황갈 테두리), 루트 =
  주황 — 라이트/다크 모두 THEMES와 동일 값. **노드별 지정 색**
  (fillColor/borderColor/textColor)도 내보내 팔레트보다 우선 적용.
- **'도형 없음'(shapeType `none`)** (2026-08-08): 내보내기가 **실효
  도형**을 구워 보낸다 — `node.style.shapeType ?? levelShape(depth)`,
  즉 노드별 지정 → 맵 설정의 레벨 기본 도형 순 (에디터 NodeRenderer와
  같은 우선순위). `buildStandaloneHtml`은 `setLevelFontConfig` 옆에서
  `setLevelShapeConfig(map.settings?.levelShapes)`를 함께 주입해야
  레벨 기본 도형 경로가 살아난다. 뷰어는 `none`이면 사각형을 그리지
  않고 **글자만** 놓으며, 글자색은 두 모드 모두 안전한 본문색
  (`SKIN.fam.l2.text`)을 쓴다 — 흰 테두리 사각형으로 우회하면 다크에서
  흰 박스가 보인다. 검색 강조일 때는 에디터와 동일하게 박스를 그린다.
- **도형 12종 파리티** (2026-08-08): 예전 뷰어는 무엇을 골라도 사각형만
  그렸다(도형 값이 안 실려 오던 때는 드러나지 않던 문제). 에디터
  `NodeShape`와 **같은 좌표 공식**으로 원/다이아/육각/평행/화살◀▶/
  원통/별을 이식하고, 사각형 계열은 모서리 반경(사각 2 · 캡슐 H/2 ·
  둥근 = 뷰어 기존값 루트 13/그 외 9)까지 맞췄다.
  · 도형 요소에는 `class="mm-box"` — 코드·표 패널 배경도 같은 그룹의
    `rect`라, 표식이 없으면 도형을 셀 때 섞인다.
  · 글자는 도형과 무관하게 노드 상자 기준으로 놓인다(에디터와 동일) —
    다이아·별은 글자가 도형 밖으로 나갈 수 있다.
- **선택 표시 = 노드 밖 점선 오버레이** — 도형 테두리 스타일을 바꾸지
  않는다 (원래 점선 테두리로 오해 방지, 에디터와 동일).
- **⌖ = Focus 토글 (에디터 Alt+F 파리티)**: 켜면 선택 노드(없으면
  중심 주제)의 서브트리만 표시 + 화면 맞춤, 다시 누르면 전체 복귀.
  버튼 하이라이트 + 아이콘 전환(Focus/FocusOff — 에디터와 같은 모양).
- **우하단 줌 바**: −(5%p) / NN%(클릭=배율 직접 입력, Enter 적용·
  Esc 취소, 2~400 클램프) / +(5%p) / 100% 보기(에디터와 같은
  **"100" 확대경 아이콘** — 2026-07: 1:1 텍스트에서 교체) — 에디터
  하단 상태바와 동일 규격. 휠 줌 범위도 2%~400%로 파리티.
- **헤더 로고 + 파비콘** (2026-07): 헤더 제목 앞에 EasyMindMap 로고
  (주황 그라디언트 배지 + 흰 마인드맵 글리프 — 에디터 좌상단
  I.Logo와 같은 도안, exportHtml.ts의 LOGO_SVG)를 표시하고, 같은
  SVG를 data URL 파비콘(`<link rel="icon">`)으로 넣는다. 에디터
  웹앱의 파비콘(apps/frontend/index.html)도 같은 도안이다. 도안을
  바꿀 때는 세 곳(icons/index.tsx · exportHtml.ts · index.html)을
  함께 바꾼다.
- **노트 패널**: 기본 폰트 15px(맵 설정 noteFont가 있으면 그 값),
  내용에 맞춘 자동 크기(최소 220×120 ~ 화면 1/2×1/2). 다크 모드에서
  패널 내부(문단·표·코드 블록·글자)까지 다크.
- 다크 토글 툴팁은 상태별("다크 모드로 전환"/"라이트 모드로 전환").
- **전체화면 모드 버튼** (2026-07): 헤더에 에디터 툴바와 같은
  FullscreenEnter/Exit 아이콘 — 클릭 토글, 상태별 아이콘·title 전환.

### 뷰어 JS 품질 주의 — 템플릿 문자열이라 TS 검사가 닿지 않는다 (2026-07)

`exportHtml.ts`의 뷰어 코드(VIEWER_JS)는 템플릿 문자열이어서
타입체크·번들러가 오류를 잡지 못한다. 실제 사고: measure()에서
layoutBlock()을 추출할 때 `depth` 인자를 빠뜨렸는데, `eff ===
'radial-bidirectional' && depth === 0` 단락 평가 때문에 **방사형·양쪽
맵에서만** ReferenceError로 재배치가 죽어 "모두 접기 = 백지" 증상이
났다 (다른 레이아웃 E2E는 모두 통과했었다). 뷰어 JS를 고치면:

1. **정적 검사**: 내보낸 HTML에서 마지막 `<script>`를 추출해
   `eslint no-undef`(browser 전역 화이트리스트)로 미정의 식별자 0건
   확인 — 이 방식이 위 `depth` 버그를 정확히 잡는 것을 구버전
   파일로 교차 검증했다.
2. **런타임 전수 스윕**(e2e49b): 8개 레이아웃 각각 내보내기 →
   모두 접기/펴기·개별 토글·fit·검색 이동·다크 전환을 실행하며
   `pageerror` 0건 + 노드 표시 유지 확인.

### HTML 뷰어 — 인터랙션·다크 모드 (2026-07)

- **Pan은 에디터와 동일 규칙**: 기본은 꺼짐 — ✋ Pan 모드 토글의 왼쪽
  드래그, 또는 마우스 오른쪽/미들 버튼 드래그(임시 Pan, 떼면 해제)만
  화면을 이동한다. 캔버스 컨텍스트 메뉴 억제.
- **노드 클릭 = 선택** (주황 점선 강조) → 헤더 **⌖ 선택 노드 화면 중앙
  보기** (현재 줌 유지).
- **헤더 아이콘 버튼**: ⌖(선택 중앙) · ✋(Pan 토글) · ⛶(전체 맞춤) ·
  **+(모두 펼치기) · −(모두 접기)** · **◫(아웃라인 분할)** ·
  **모드 토글(목록↔마인드맵 SVG — 전체 아웃라인/맵)** · 🌙(다크) —
  텍스트 버튼을 아이콘화, 설명은 호버 툴팁으로.
- **아웃라인 분할·아웃라인 모드/맵 모드 (2026-07)** — 에디터와 파리티:
  - **◫ 아웃라인 분할**: 헤더 좌측에 읽기 전용 아웃라인 페인(좌) + 맵(우)
    을 함께 표시(`mm-outline-split`). 들여쓴 트리 + 캐럿 접기/펴기 + 노트
    배지, **행 클릭 = 그 노드를 맵에서 중앙+노란 강조**(검색 이동과 동일).
  - **모드 토글**: 화면 **전체**를 아웃라인 전용(맵 숨김, `mm-outline-full`)
    ↔ 맵 전용으로 전환. 버튼은 갈 곳을 표시 — 맵 모드=목록 아이콘,
    아웃라인 모드=마인드맵 아이콘. **분할 보기 중에는 비활성**(분할이 이미
    아웃라인+맵이므로). 아이콘은 이모지가 아닌 인라인 SVG
    (`OUTLINE_ICON`/`MINDMAP_ICON`) — 구 🗺가 우산처럼 보이던 시인성 문제
    해결. (exportHtml.ts — `#mm-outline`, `buildOutline`,
    `syncViewToggle`, `mm-outline-split`/`mm-outline-full` 바디 클래스)
- **다크 모드**: 🌙 토글 — 에디터(THEMES.dark)와 파리티: 헤더/캔버스/
  노트 패널은 물론 **노드 카드(#1C1F26)·글자(#E8E6E3)·연결선(#4A4E5A)·
  하이라이트 띠까지 스킨(SKIN_DARK) 교체 후 다시 그린다** (루트는 주황
  유지).
- **처음 열리는 모드 = 내보낼 때의 에디터 모드** (2026-08-08): 툴바에서
  HTML로 내보내면 그 순간의 에디터 테마(`editorUiStore.themeName`)를
  `dark` 플래그로 구워 보내고, 뷰어는 그 모드로 열린다 — "내가 본 화면
  그대로 보내진다". 파일 안에는 라이트·다크 팔레트가 모두 들어 있어
  받는 사람이 🌙/☀ 로 언제든 바꿀 수 있다.
  · 경로: `TopToolbar` → `downloadMapAsHtml(map, layout, spacing, dark)`
    → `buildExportPackage` → `buildStandaloneHtml(…, dark)` →
    `window.__MINDMAP__.dark`.
  · **뷰어에서 직접 바꾼 값이 우선**하며 localStorage에 저장돼 다음에
    열 때 유지된다. 저장 키는 **파일별**
    (`easymindmap.viewer.dark:<location.pathname>`) — 예전 전역 키
    (`easymindmap.viewer.dark`)는 한 맵에서 다크로 바꾸면 그 뒤 내보낸
    파일이 전부 다크로 열려, 구운 모드를 덮어써 버렸다.
  · OS/브라우저의 `prefers-color-scheme`은 보지 않는다.
  · 이미 내보낸 파일은 정적이므로 소급 적용되지 않는다 — **다시 내보내야**
    바뀐 모드가 반영된다.
- **⌖ 중앙 보기 폴백**: 선택한 노드가 없거나 접힌 서브트리 안이면
  **중심 주제(루트)를 화면 중앙**으로 — 선택 없이 눌러도 항상 동작.
- **툴팁 아래 폴백**: 최상단 헤더 아이콘처럼 위 공간이 없으면 마우스
  커서 그림보다 아래(cursorY+24)에 표시해 커서가 설명을 가리지 않는다
  (에디터 globalTooltip 동일).
- **커스텀 툴팁**: 네이티브 title 툴팁은 커서 아래에 떠서 커서가 설명을
  가린다 — 요소 "위쪽 중앙"(위 공간이 없으면 아래)에 즉시 표시하는
  커스텀 툴팁으로 전수 대체 (에디터의 globalTooltip.ts와 동일 로직).
- **링크/첨부/미디어 마커 — 에디터 인디케이터 파리티 (2026-08-02)**:
  - **호버 툴팁**: 에디터(nodeContent.ts)와 같은 문구 — 복수면
    `링크 N개`/`첨부파일 N개`/`멀티미디어 N개`, 단수면 표시 이름/URL/
    파일명. (구버전은 전체 항목 목록을 통째로 툴팁에 담아 에디터와
    달랐다.)
  - **클릭**: 단수 = 바로 열기. **복수 = 클릭한 마커 옆 선택 팝업**
    (`#mm-chooser`) — 에디터 ChooserPopover 와 같은 규격: 260px 목록,
    호버 항목 강조(배경+왼쪽 바+굵게+↗), 링크 = 새 탭, 첨부 = 새 탭
    (패키지 내장 파일은 download), Esc/바깥 클릭/줌 휠에 닫힘, 다크
    스킨. 우상단 상세 패널(showDetail)은 이제 **노트 마커 전용**이다 —
    에디터의 노트 뷰어 팝업도 우상단이라 그쪽만 파리티가 맞는다.
  - **루트 노드도 일반 노드와 동일**: 뷰어 DATA 를 만들 때 루트의
    링크·노트·첨부·태그·아이콘을 전부 넘기고(구버전은 text·style 만
    넘겨 루트 마커가 사라졌다), 루트의 첨부도 ZIP `files/` 패키징
    대상에 포함한다 (HTML·MD 내보내기 공통).
- **첨부 원본 생존성 (2026-08-02 dev 보고 수정)**:
  - **≤2MB 첨부는 첨부하는 순간 data URL 로 문서에 내장**한다
    (`utils/attachmentFile.ts`) — 서버 저장·새로고침·재로그인 후에도
    원본이 살아 있어 내보내기 ZIP 패키징이 항상 동작한다. 예전에는
    모든 첨부가 `blob:` URL(만든 브라우저 문서에서만 유효)이라,
    **저장했다 다시 연 맵을 내보내면 fetch 가 전부 실패해 첨부 없는
    html 만 소리 없이 만들어졌다** (dev 실사용 보고). 한도 2MB 는
    메타데이터 인라인 한도(INLINE_ATTACHMENT_LIMIT)와 같은 값.
    **맵당 내장 합계 상한 10MB**(2026-08-03 결정): 개당 2MB 이하라도
    맵의 내장 첨부 합계가 10MB 를 넘게 되면 로그인 상태에서는 그
    파일부터 서버 저장소로 우회한다 — 작은 파일 다수로 문서가 비대해져
    자동저장·히스토리 버전이 무거워지는 것을 막는다 (비로그인은 내장
    유지 — 서버 왕복이 없어 로컬 부담뿐).
  - **2MB 초과 첨부는 로그인 상태면 서버 첨부 저장소(B9)에 업로드** —
    문서에는 서버 URL 만 남고, 열기/내보내기는 `?access_token=` 을 붙여
    받아온다 (apiClient.attachmentFetchUrl). 로그인하지 않은 상태만
    세션 한정(blob URL)으로 남는다. 그 경우 저장 후 다시 연 맵에서는:
    ① 내보내기 후 툴바 토스트로 "첨부 N개의 원본을 찾을 수 없어 …"
    안내(HTML·MD 공통, `ExportPackage.external` 카운트),
    ② 내보낸 뷰어에서 죽은 `blob:` 링크 대신 **href 를 비워
    "(파일 없음)" 비활성 행**으로 표시, MD 는 "(원본 없음 — 에디터에서
    다시 첨부해 주세요)" 로 표기.
  - 링크·첨부 탭에도 같은 내용의 짧은 안내문을 상시 표시한다.

### HTML 뷰어 — 체크박스 누르기 (2026-08-09)

뷰어의 체크박스는 **읽기 전용이었다**. 받은 사람이 할 일 목록을 눌러
표시할 수 없어 "뷰어에서 체크가 안 된다"는 보고로 이어졌다. 이제 누를 수
있다 — 두 자리 모두:

| 자리 | 열쇠 |
|---|---|
| 맵 노드 글자 안의 `- [ ]` 줄 | `<노드id>:<항목순번(seq)>` |
| 우상단 상세 패널의 노트 체크리스트 블록 | `note:<블록id>` |

- 항목 순번(`seq`)은 내보낼 때 `_checks[].s` 로 구워 보낸다. **줄 번호는
  접기·줄바꿈에 따라 흔들려** 열쇠가 될 수 없다.
- 노트 블록은 `notes[].id` 를 함께 내보내 열쇠로 쓴다.
- 클릭 판정은 글리프보다 넓다 (SVG는 투명 `<rect>` 6px, 상세 패널은
  `padding/margin` 상쇄 — coding-conventions.md §5-1-5).

**저장되는 곳 — 원본 맵 파일은 바뀌지 않는다.**

- 내보낸 HTML 은 **정적 파일**이라 스스로를 고쳐 저장할 수 없다. 누른
  체크는 **연 브라우저의 localStorage** 에 담긴다.
  · 키 = `easymindmap.viewer.checks:<location.pathname>` (다크 모드와
    같은 **파일별** 키 규칙 — 다른 파일에 번지지 않는다)
  · 값 = `{ "<열쇠>": 1 | 0 }` — **구운 원본과 다른 것만** 담는다.
    저장된 값이 없는 항목은 내보낼 때의 상태를 그대로 쓴다.
- 그래서: **같은 브라우저에서 같은 파일을 다시 열면 체크가 남아 있다.**
  다른 사람에게 그 HTML 을 다시 보내면 **구운 원본 상태로** 열린다.
- 맵 자체에 남기려면 **에디터에서 체크한 뒤 다시 내보내야** 한다.

검증: E2E e2e133

### HTML 뷰어 — 마커 개수 배지 (2026-08-09 2차)

에디터는 인디케이터가 **2개 이상**이면 글리프 오른쪽 위에 작은 숫자를
붙인다(`NodeRenderer` — `ic.count > 1`). **뷰어에는 그 숫자가 없었다** —
체크 5개짜리 노드가 뷰어에서는 그냥 ✓ 하나로 보여, 열어 보기 전에는 몇
개인지 알 수 없었다.

노트 종류별(문단/코드/표/체크)·링크·첨부·멀티미디어 **모든 마커**에
같은 규칙으로 붙인다 — 자리·크기·굵기도 에디터와 같다
(`x = icSize/2 + 2`, `y = -icSize/2 + 3`, 8px/700). 색은 에디터
`t.primary` 와 맞춘 `SKIN.accent` (라이트 `#D97706` / 다크 `#F59E0B`)라
다크 모드에서도 같이 바뀐다. 검사용 표식은 `data-marker-count="<종류>"`.

### 뷰어 상세 패널 — `overflow-x: auto` 안에서는 **세로 padding 금지**

`.mm-note-block` 은 `white-space: pre; overflow-x: auto` 다. CSS 규칙상
`overflow-x` 가 `auto` 면 `overflow-y` 도 `auto` 로 계산되므로, 블록 안의
인라인 요소가 **한 줄보다 조금이라도 높아지면 그 줄마다 세로 스크롤바**가
생긴다. 체크 글리프에 위아래 padding 2px 을 줬다가 "체크 오른쪽에 상하
화살표가 생긴다"는 보고를 받았다(에디터 노트 팝업도 같은 구조라 회색
바가 생겼다).

→ **좌우 padding 만** 준다. `display: inline-block` 의 높이는 이미
줄높이(1.5)라 세로 클릭 판정은 그대로 충분하다.

### MD 내보내기 (exportMarkdown.ts)

- 본문: `#`=중심 주제(1레벨), `##`=2레벨 … `######`=6레벨, 7레벨+는
  리스트 들여쓰기 — importMarkdown 파서와 정확히 왕복되는 형식.
- 노드 텍스트의 줄바꿈은 본문에서 공백으로 합친다 (원본은 메타데이터가
  보존). 사진은 `![](files/…)`.
- 노드 링크는 `🔗 [라벨](url)` — 다시 불러오면 노드 링크로 재추출.
  문단 노트 → `>` 인용문, 코드 노트 → 펜스, **표 노트 → 파이프 표**
  (헤더 다음 `|---|` 구분선 포함), 루트 노트도 제목 아래 동일 형식 —
  importMarkdown과 왕복된다 (2026-07: 표·링크 대칭 추가).
- **사진(data URL)·패키징 가능한 첨부가 있으면 HTML과 동일하게
  `제목.md + files/…` ZIP**으로 내려준다. 없으면 단일 .md.

### 불러오기 (importMapFile.ts — '새 맵 > MD/HTML 파일 불러오기')

- **HTML**: 메타데이터에서 원본 맵 전체 복원 + 내보낼 당시의 레이아웃·
  간격 복원. 메타데이터 없는 일반 HTML은 거부. (HTML 판별은 확장자 +
  내용(<!doctype html/메타데이터 존재) 둘 다)
- **EasyMindMap MD**: 본문을 파싱해 **사용자가 일반 에디터에서 고친
  구조·텍스트를 반영**하고, 텍스트가 그대로인 노드는 메타데이터의
  스타일·노트·링크·사진·태그를 되살린다 (한 줄 텍스트 일치 기준, 같은
  텍스트 다수는 순서대로 매칭). 본문이 파싱 불능이면 메타데이터의
  원본 맵으로 복원. 맵 설정(레벨별 폰트 등)은 항상 메타데이터.
- **일반 MD**: 기존 구조 파싱 그대로 (기본 레이아웃 방사형·오른쪽).
- **ZIP**: 내보낸 ZIP(맵 + files/)을 직접 불러오면 안의 맵 파일 파싱 +
  files/의 첨부를 data URL로 재연결. 작은 첨부(≤2MB)는 내보낼 때
  메타데이터에 인라인되어 단일 파일만으로도 복원된다
  (상세: 22-map-file-meta.md).
