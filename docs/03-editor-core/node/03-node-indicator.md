## NODE_INDICATOR
- 문서 버전: v1.0
- 작성일: 2026-04-06

---

### 1. 기능 목적

- 사용자가 노드를 선택하거나 조작할 때, 해당 노드의 현재 상태·가능 액션·연결된 콘텐츠를 **시각적으로 즉시 인지**할 수 있도록 돕는 기능이다.
- 마우스·키보드 흐름을 끊지 않고도 노드 추가, 번역 확인, 콘텐츠 존재 여부, AI 실행 상태, WBS 일정 상태, 협업 잠금 상태를 한눈에 파악할 수 있게 한다.
- 복잡한 메뉴 탐색 없이 인라인 인디케이터 클릭만으로 주요 액션을 실행할 수 있어 UX 효율을 높인다.

---

### 2. 기능 범위

**포함:**
- NODE-13 : 노드 추가 인디케이터 (+ 버튼 4방향 — 상/하/좌/우)
- NODE-14 : 번역 상태 인디케이터 (완료 🔤 / 실패 🔴 / 대기 Skeleton / override ⛔🔁)
- NODE-15 : 인디케이터 표시 ON/OFF 설정 (번역 아이콘, override 아이콘, 태그 badge)
- NODE-16 : 콘텐츠 존재 인디케이터 (노트 ≡ / Hyperlink 🔗 / 첨부파일 📎 / 멀티미디어 ▶)
- NODE-17 : WBS 일정 인디케이터 (날짜 배지·진척률 바·마일스톤 마커·Redmine sync 상태)
- WFLOW-03/04 : AI Workflow 실행 상태 인디케이터 (not_started / in_progress / blocked / resolved / done)
- 협업 인디케이터 (V3.3) : scope 밖 노드 dim 처리, 타인 편집 중 잠금 표시

**제외:**
- 노드 스타일(색상·폰트) 변경 — NODE_STYLE 기능 담당
- 태그 badge 데이터 관리 — TAG 기능 담당
- 실제 번역 처리 로직 — NODE_TRANSLATION 기능 담당
- 협업 presence/CRDT 동기화 — MAP COLLABORATION 기능 담당
- 맵별·노드별 인디케이터 개별 설정 (V2 이후 범위)

---

### 3. 세부 기능 목록

| 기능ID | 기능명 | 설명 | 주요 동작 |
|---|---|---|---|
| NODE-13 | 노드 추가 인디케이터 | 선택 노드 4방향에 + 버튼 표시 | 싱글 클릭 → 방향별 부모/자식/형제 노드 생성 |
| NODE-IND-01 | 상 (+) 부모 추가 | 선택 노드와 기존 부모 사이에 새 노드 중간 삽입 | 서브트리를 새 노드의 자식으로 재배치 |
| NODE-IND-02 | 하 (+) 자식 추가 | 선택 노드의 마지막 자식 위치에 새 노드 추가 | Space 단축키 동작과 동일 |
| NODE-IND-03 | 좌 (+) 형제 이전 추가 | 선택 노드 바로 앞(위쪽)에 형제 노드 삽입 | LShift+Ctrl+Space 단축키와 동일 |
| NODE-IND-04 | 우 (+) 형제 다음 추가 | 선택 노드 바로 뒤(아래쪽)에 형제 노드 삽입 | LShift+Space 단축키와 동일 |
| NODE-14 | 번역 상태 인디케이터 | 번역 완료/실패/대기 상태를 노드 텍스트 우측에 표시 | 상태별 아이콘 조건부 렌더링, 🔤 클릭 시 원문 팝오버 |
| NODE-15 | 인디케이터 ON/OFF 설정 | 번역 아이콘·override 아이콘·태그 badge 표시 여부 제어 | users.ui_preferences_json에 토글 값 저장, 전역 적용 |
| NODE-16 | 콘텐츠 존재 인디케이터 | 노트·Hyperlink·첨부파일·멀티미디어 존재 시 노드 우측 아이콘 표시 | 데이터 존재 여부 기반 항상 표시, ON/OFF 설정 없음 |
| NODE-17 | WBS 일정 인디케이터 | WBS 모드 노드에 날짜·진척률·마일스톤·담당자 표시 | 클릭 시 DatePicker/슬라이더 팝오버, Redmine sync 상태 배지 |
| WFLOW-03/04 | AI Workflow 상태 인디케이터 | executable step node의 실행 상태 배지 표시 | stepState별 색상/아이콘 표시, 콘텐츠 인디케이터 좌측 우선 배치 |
| COLLAB-IND | 협업 인디케이터 | scope 밖 노드 반투명 처리, 타인 편집 중 노드 잠금 표시 | opacity/테두리 색/이름 배지, 소프트 잠금 5초 타임아웃 |

---

### 4. 기능 정의 (What)

NODE_INDICATOR는 노드에 부착되는 모든 시각적 보조 아이콘·버튼·배지를 총괄한다.

- **노드 추가 인디케이터(NODE-13)**: 노드 싱글 클릭 시 상·하·좌·우 4방향에 황금색(#F0A500) 원형 + 버튼을 표시하여, 클릭만으로 관계 방향에 맞는 새 노드를 즉시 생성한다.
- **번역 상태 인디케이터(NODE-14)**: 번역된 노드에 🔤·🔴·⛔·🔁 아이콘을, 번역 대기 노드에 Skeleton 바를 표시하여 번역 진행 상태를 실시간으로 알린다.
- **인디케이터 ON/OFF(NODE-15)**: 번역 아이콘·override 아이콘·태그 badge의 표시 여부를 사용자가 전역 설정으로 제어한다. (콘텐츠 존재 인디케이터·접기버튼·Skeleton은 항상 표시)
- **콘텐츠 존재 인디케이터(NODE-16)**: 노드에 노트·하이퍼링크·첨부파일·멀티미디어 데이터가 있을 때 노드 우측에 해당 아이콘을 상시 표시하여 콘텐츠 존재를 직관적으로 알린다.
- **WBS 일정 인디케이터(NODE-17)**: WBS 모드에서 노드 하단에 날짜 배지·진척률 바·마일스톤 마커·담당자 아바타를 표시하고, Redmine 연동 시 동기화 상태 아이콘을 추가한다.
- **AI Workflow 인디케이터**: executable step node에 실행 상태(not_started / in_progress / blocked / resolved / done)를 색상 배지로 표시한다.
- **협업 인디케이터**: 협업맵에서 편집 권한 범위 밖 노드를 반투명(opacity: 0.4)으로 dim하고, 타인이 편집 중인 노드에 presence 색상 테두리와 이름 배지를 표시한다.

---

### 5. 동작 방식 (How)

#### NODE-13 노드 추가 인디케이터

**사용자 동작:**
1. 노드를 싱글 클릭 → 4방향 + 버튼 표시
2. 원하는 방향의 + 버튼 클릭 → 새 노드 생성

**시스템 처리:**
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
  ├─ Enter / blur → 텍스트 확정 → Auto Save 트리거
  └─ Esc → 텍스트 취소 → 빈 노드 삭제 (Undo 미반영)
```

**방향별 처리 규칙:**

| 방향 | 처리 |
|:---:|---|
| ⬆ 상 (부모 추가) | 선택 노드의 현재 부모 위치에 새 노드 삽입, 선택 노드+서브트리를 새 노드의 자식으로 재배치 |
| ⬇ 하 (자식 추가) | 선택 노드의 마지막 자식으로 추가 |
| ⬅ 좌 (형제 이전) | 선택 노드 바로 앞(이전 순서) 형제 삽입 |
| ➡ 우 (형제 다음) | 선택 노드 바로 뒤(다음 순서) 형제 삽입 |

**인디케이터 위치 계산:**
```
상 (+):  (cx, top - offset)
하 (+):  (cx, bottom + offset)
좌 (+):  (left - offset, cy)
우 (+):  (right + offset, cy)
offset 권장: 12px ~ 16px
```

**결과 표시:**
- 새 노드가 맵에 즉시 렌더링되고 커서가 활성화된다.
- Root 노드 선택 시 ⬆상·⬅좌·➡우 버튼은 회색(disabled)으로 표시된다.
- 다중 선택 상태에서는 인디케이터가 표시되지 않는다.

---

#### NODE-14 번역 상태 인디케이터

**사용자 동작:**
- 번역된 노드에서 🔤 클릭 → 원문 팝오버 표시
- 팝오버 외부 클릭 또는 [번역본으로 돌아가기] 클릭 → 팝오버 닫힘
- 편집자 권한: ⛔/🔁 클릭 → 번역 override 설정 패널 오픈

**시스템 처리 (상태 판단 로직):**
```typescript
function getTranslationIconState(node, viewerLang, cachedTranslation, isEditor, uiPrefs):
  if (isEditor && force_off) → 'force-off'  // ⛔
  if (isEditor && force_on)  → 'force-on'   // 🔁
  if (!shouldTranslate)      → 'none'
  if (캐시 유효)              → 'globe'      // 🔤
  if (번역 실패)              → 'warning'    // 🔴
  else                       → 'skeleton'   // Skeleton 바
```

**WebSocket 자동 업데이트:**
```
translation:ready 이벤트
  → translationStore.setTranslation() 호출
  → Skeleton 제거 → 번역본 + 🔤 아이콘 표시 (fadeIn 0.2초)
```

**결과 표시:**
- 원문 팝오버는 non-blocking (맵 조작 가능)
- 1개 팝오버 원칙: 다른 노드 🔤 클릭 시 기존 팝오버 자동 닫힘

---

#### NODE-16 콘텐츠 존재 인디케이터

**사용자 동작:** 없음 (자동 표시)

**시스템 처리:**
```typescript
function getContentIndicatorState(node): {
  hasNote:       node.note != null && node.note.trim().length > 0,
  hasHyperlink:  node.hyperlinkIds.length > 0,
  hasAttachment: node.attachmentIds.length > 0,
  hasMultimedia: node.multimediaId != null,
}
```

**결과 표시:** 데이터 존재 시 노드 우측에 해당 아이콘 자동 렌더링

---

#### NODE-17 WBS 일정 인디케이터

**사용자 동작:**
- 날짜 배지 클릭 → DatePicker 팝오버 (시작일/종료일 + 마일스톤 토글)
- 진척률 바 클릭 → 0~100 슬라이더 팝오버
- 리소스 아바타 클릭 → 리소스 할당 패널
- ⚠ 오류 아이콘 클릭 → 동기화 오류 상세 + 재시도 버튼

**시스템 처리 (WBS 상태 판별):**
```typescript
function getWbsStatus(schedule):
  if (progress === 100)  → 'done'     // 🟢
  if (!startDate)        → 'no-date'
  if (start > today)     → 'upcoming' // 회색
  if (end < today)       → 'delayed'  // 🔴
  else                   → 'on-track' // 🔵
```

---

### 6. 규칙 (Rule)

#### 표시 조건 규칙

| 조건 | 동작 |
|---|---|
| 노드 싱글 클릭 | + 인디케이터 4방향 표시 |
| 빈 캔버스 클릭 / ESC | 인디케이터 숨김 |
| 노드 편집 모드 (Double Click) | + 인디케이터 숨김 |
| 다중 선택 | + 인디케이터 표시 안 함 |
| Root 노드 선택 | ⬆상·⬅좌·➡우 disabled (회색), ⬇하만 활성 |

#### 인디케이터 충돌 방지 규칙

| 인디케이터 종류 | 동시 표시 |
|---|:---:|
| + 버튼 (4방향) | ✅ 가능 |
| 접기/펼치기 버튼 | ✅ 가능 |
| 🔤 번역 아이콘 | ✅ 가능 |
| 🔴 번역 실패 | ✅ 가능 |
| ⛔ / 🔁 override | ✅ 가능 |
| Skeleton 바 | ❌ 번역 텍스트+아이콘과 동시 불가 |
| ≡ / 🔗 / 📎 / ▶ 콘텐츠 아이콘 | ✅ 가능 |
| workflow 상태 배지 | ✅ 가능 |

**콘텐츠 인디케이터 우선순위 (좌→우 순서):**
```
멀티미디어 ▶ > 링크 🔗 > 첨부 📎 > workflow 상태 배지 > note ≡
```

#### ON/OFF 설정 규칙

| 인디케이터 | 설정 여부 | 기본값 | 설정 키 |
|---|:---:|:---:|---|
| 노트 ≡ · Hyperlink 🔗 · 첨부파일 📎 · 멀티미디어 ▶ | 항상 표시 | — | — |
| 접기/펼치기 버튼 | 항상 표시 | — | — |
| Skeleton 바 | 항상 표시 | — | — |
| 번역 아이콘 (🔤 / 🔴) | ON/OFF | ON | `showTranslationIndicator` |
| override 아이콘 (⛔ / 🔁, 편집자만) | ON/OFF | ON | `showTranslationOverrideIcon` |
| 태그 badge | ON/OFF | ON | `showTagBadge` |

#### Undo/Redo 규칙

| 동작 | Undo |
|---|:---:|
| + 버튼으로 노드 생성 후 텍스트 확정 | ✅ 가능 |
| + 버튼 생성 후 Esc 취소 | ❌ 히스토리 미반영 |
| 부모 노드 삽입 (⬆) | ✅ 가능 (중간 노드 제거 + 원복) |

#### 방향 매핑 고정 원칙
모든 레이아웃에서 방향 의미는 고정한다.
- ⬆ 상 = 부모 추가 / ⬇ 하 = 자식 추가 / ⬅ 좌 = 형제 이전 / ➡ 우 = 형제 다음

---

### 7. 예외 / 경계 (Edge Case)

| 케이스 | 처리 방식 |
|---|---|
| Root 노드에서 ⬆상·⬅좌·➡우 클릭 | 버튼 비활성화(disabled), 회색 표시, 클릭 무반응 |
| + 버튼 클릭 후 Esc | 빈 노드 즉시 삭제, Undo 히스토리 미반영 |
| 번역 캐시 없고 번역 진행 중 | Skeleton 바 표시, 완료 시 fadeIn으로 자동 교체 |
| 번역 실패 | 원문 fallback 표시, 🔴 아이콘 표시, 재시도 없음 |
| 번역 아이콘 OFF 설정 시 | 🔤·🔴 아이콘만 숨김, 번역 텍스트 자체는 유지 |
| 콘텐츠 데이터 없음 (null / 빈 배열) | 해당 아이콘 렌더링 안 함 |
| 다중 선택 상태 | + 인디케이터 미표시 |
| 다른 노드 🔤 클릭 시 기존 팝오버 열림 | 기존 팝오버 자동 닫힘, 새 팝오버 오픈 (1개 원칙) |
| WBS 날짜 미설정 | 날짜 배지 미표시, status = 'no-date' |
| 마일스톤 노드 | 단일 날짜 표시, ◆ 마커 오버레이 표시 |
| Redmine 동기화 실패 | ✕ 아이콘 표시, 클릭 시 수동 처리 가이드 패널 |
| 협업 scope 밖 노드 편집 시도 | "이 노드는 편집 권한 범위 밖입니다." 툴팁 표시, 읽기 전용 |
| 협업 타인 편집 중 노드 | 소프트 잠금 5초 타임아웃 후 자동 해제 |
| 네트워크 오류 (ui-preferences 저장 실패) | 로컬 상태 롤백, 오류 토스트 표시 |

---

### 8. 권한 규칙

| 역할 | 노드 추가 인디케이터 | 번역 아이콘 | override 아이콘 | 콘텐츠 인디케이터 | 설정 변경 |
|---|:---:|:---:|:---:|:---:|:---:|
| creator | ✅ | ✅ | ✅ (편집자 전용) | ✅ | ✅ |
| editor | ✅ | ✅ | ✅ (편집자 전용) | ✅ | ✅ (자신 설정만) |
| viewer | ❌ | ✅ (🔤만) | ❌ | ✅ | ❌ |
| collab_creator | ✅ (scope 무제한) | ✅ | ✅ | ✅ | ✅ |
| collab_editor | ✅ (scope 내 노드만) | ✅ | ✅ | ✅ | ✅ (자신 설정만) |

---

### 9. DB 영향

**관련 테이블:**

| 테이블 | 컬럼 | 용도 |
|---|---|---|
| `nodes` | `id`, `parent_id`, `order_index`, `note`, `hyperlink_ids`, `attachment_ids`, `multimedia_id`, `translation_override`, `text`, `text_hash`, `text_lang` | 노드 추가 인디케이터, 콘텐츠 존재 인디케이터, 번역 인디케이터 |
| `users` | `ui_preferences_json` (JSONB) | 인디케이터 ON/OFF 설정 저장 |
| `node_translations` | `node_id`, `target_lang`, `translated_text`, `text_hash`, `model_version`, `updated_at` | 번역 캐시, 원문 팝오버 정보 |
| `node_schedules` | `node_id`, `start_date`, `end_date`, `progress`, `is_milestone` | WBS 일정 인디케이터 |
| `node_resources` | `node_id`, `user_id` | WBS 담당자 아바타 |
| `redmine_sync_status` | `node_id`, `sync_status` | Redmine sync 인디케이터 |
| `maps` | `is_collaborative` | 협업 인디케이터 활성화 여부 |

**생성/수정/삭제:**
- 노드 추가 (+ 버튼): `nodes` 레코드 INSERT + `order_index` UPDATE (형제 재정렬)
- 부모 삽입 (⬆): `nodes` INSERT + 기존 노드 `parent_id` UPDATE + 서브트리 `order_index` 재정렬
- ui-preferences 토글: `users.ui_preferences_json` PATCH

---

### 10. API 영향

**필요 API:**

| 메서드 | 엔드포인트 | 용도 |
|---|---|---|
| `POST` | `/maps/:mapId/nodes` | 노드 추가 인디케이터 — 새 노드 생성 |
| `PATCH` | `/nodes/:id` | 부모 삽입 시 parent_id, order_index 변경 |
| `PATCH` | `/nodes/:id/translation-override` | override 아이콘 설정 변경 저장 |
| `PATCH` | `/users/me/ui-preferences` | 인디케이터 ON/OFF 설정 저장 |
| `GET` | `/users/me` | uiPreferences 포함 사용자 프로필 조회 |
| `WS` | `translation:ready` | 번역 완료 이벤트 수신 → Skeleton → 번역본 자동 갱신 |
| `WS` | `node:editing:started` | 타인 편집 중 잠금 표시 |
| `WS` | `node:editing:ended` | 잠금 해제 |

**주요 요청/응답 개요:**

```json
// PATCH /users/me/ui-preferences
// Request
{
  "showTranslationIndicator": false,
  "showTranslationOverrideIcon": true,
  "showTagBadge": true
}
// Response 200 OK
{
  "showTranslationIndicator": false,
  "showTranslationOverrideIcon": true,
  "showTagBadge": true,
  "showWbsIndicator": true,
  "showResourceAvatars": true,
  "showCollabScopeOverlay": true,
  "showCollabEditingBadge": true
}
```

---

### 11. 연관 기능

- `NODE_EDITING` — 노드 생성 후 편집 모드 자동 진입, Undo/Redo 연동
- `HISTORY_UNDO_REDO` — + 버튼 생성/부모 삽입 동작 Undo 처리
- `SAVE` — 텍스트 확정 시 Auto Save 트리거
- `NODE_TRANSLATION` — 번역 캐시 조회, shouldTranslate 판단, translation:ready 이벤트
- `TAG` — 태그 badge 데이터 관리, showTagBadge 연동
- `NODE_CONTENT` — 노트·하이퍼링크·첨부파일·멀티미디어 데이터 관리
- `KEYBOARD_SHORTCUTS` — Space / LShift+Space / LShift+Ctrl+Space → + 인디케이터와 동일 동작
- `LAYOUT` — 레이아웃 방향 무관하게 인디케이터 방향 의미 고정
- `WBS` — WBS 모드 활성화 시 NODE-17 인디케이터 렌더링
- `RESOURCE` — 담당자 아바타 데이터 연동
- `REDMINE_INTEGRATION` — Redmine sync_status 인디케이터
- `MAP COLLABORATION` — presence 색상, scope 범위, 잠금 이벤트 연동
- `AI_WORKFLOW` — executable step node의 stepState 데이터 연동
- `SETTINGS` — ui_preferences_json 저장, 표시 설정 UI 패널

---

### 12. 예시 시나리오

**시나리오 1: 자식 노드 빠르게 추가하기**

> 사용자가 "마케팅 전략" 노드를 클릭한다.
> 노드 4방향에 황금색 + 버튼이 나타난다.
> 아래쪽(⬇) + 버튼을 클릭하면 "마케팅 전략"의 자식 노드가 빈 상태로 생성되며 커서가 자동으로 활성화된다.
> "SNS 캠페인"이라고 입력하고 Enter를 누르면 노드가 확정되고 Auto Save가 실행된다.
> 만약 입력 중 Esc를 누르면 빈 노드는 즉시 삭제되고 Undo 히스토리에도 남지 않는다.

---

**시나리오 2: 계층 중간에 부모 노드 삽입하기**

> 사용자가 "세부 실행안" 노드를 클릭한다.
> 위쪽(⬆) + 버튼을 클릭하면, "세부 실행안"과 기존 부모 "마케팅 전략" 사이에 새 노드가 삽입된다.
> "실행 계획" 이라고 입력하면 트리 구조가 `마케팅 전략 → 실행 계획 → 세부 실행안`으로 재배치된다.
> 실수로 삽입한 경우 Ctrl+Z로 Undo하면 중간 노드가 제거되고 원래 구조로 돌아간다.

---

**시나리오 3: 번역 노드에서 원문 확인하기**

> 일본어를 사용하는 열람자가 한국어로 작성된 맵을 본다.
> "딸기"라고 번역된 노드에 🔤 아이콘이 표시된다.
> 🔤 클릭 시 `원문 (Korean): 딸기` 팝오버가 비모달로 표시된다.
> 맵을 계속 조작할 수 있으며, 팝오버 외부를 클릭하면 닫힌다.
> 번역 아이콘 표시 설정이 OFF인 경우 🔤 아이콘은 보이지 않지만 번역된 텍스트는 그대로 표시된다.

---

**시나리오 4: WBS 모드에서 일정 확인 및 진척률 수정**

> WBS 모드가 활성화된 맵에서 "기획 완료" 노드를 본다.
> 노드 하단에 `📅 04/01 ~ 04/30 🔵` 날짜 배지와 `▓▓▓▓▓░░░░░ 50%` 진척률 바가 표시된다.
> 진척률 바를 클릭하면 슬라이더 팝오버가 열리고 70%로 변경하면 즉시 반영된다.
> Redmine 연동 중 오류가 발생한 경우 `⚠` 아이콘이 표시되고, 클릭하면 재시도 버튼과 오류 내용을 확인할 수 있다.

---

### 13. 구현 우선순위

#### MVP (V1) — 필수 포함

| 단계 | 내용 | 의존 기능 |
|---|---|---|
| Step 1 | `NodeAddIndicator` 컴포넌트 — 4방향 + 버튼 UI (황금색 스타일) | NODE_EDITING |
| Step 2 | 노드 클릭 → 인디케이터 표시/숨김 상태 관리 (`editorStore.showAddIndicator`) | — |
| Step 3 | ⬇ 자식 추가 (Space 단축키와 동일, 가장 간단) | SAVE, HISTORY_UNDO_REDO |
| Step 4 | ➡ 형제 다음 추가 (LShift+Space 동작과 동일) | — |
| Step 5 | ⬅ 형제 이전 추가 | — |
| Step 6 | ⬆ 부모 노드 중간 삽입 (서브트리 재배치 — 가장 복잡) | — |
| Step 7 | Root 노드 비활성화 처리 (상·좌·우 disabled) | — |
| Step 8 | 새 노드 생성 후 편집 모드 자동 진입 + Esc 취소 처리 | NODE_EDITING |
| Step 9 | `NodeContentIndicators` — 콘텐츠 존재 인디케이터 (≡·🔗·📎·▶) | NODE_CONTENT |
| Step 10 | Undo/Redo 연동 (텍스트 확정 후 Undo, 부모 삽입 Undo) | HISTORY_UNDO_REDO |

#### V2 — 번역·설정 기능 (NODE_TRANSLATION 구현 이후)

| 단계 | 내용 | 의존 기능 |
|---|---|---|
| Step 11 | 번역 캐시 연동 — displayText 로직 | NODE_TRANSLATION |
| Step 12 | 🔤 아이콘 표시 + 원문 팝오버 | — |
| Step 13 | Skeleton UI (pulse 애니메이션) | — |
| Step 14 | 🔴 번역 실패 아이콘 | — |
| Step 15 | ⛔·🔁 편집자 override 아이콘 + 설정 패널 | — |
| Step 16 | WebSocket `translation:ready` 자동 UI 갱신 | — |
| Step 17 | `UiPreferences` 타입 + `users.ui_preferences_json` 스키마 | — |
| Step 18 | `PATCH /users/me/ui-preferences` API + Zustand 연동 | — |
| Step 19 | 인디케이터 ON/OFF 설정 UI 패널 | SETTINGS |

#### V3 — WBS·협업·AI Workflow (해당 기능 구현 이후)

| 단계 | 내용 | 의존 기능 |
|---|---|---|
| Step 20 | `NodeWbsIndicator` — 날짜 배지·진척률 바·마일스톤 마커 | WBS |
| Step 21 | 담당자 아바타 (최대 3개 + +N) | RESOURCE |
| Step 22 | Redmine sync_status 인디케이터 | REDMINE_INTEGRATION |
| Step 23 | AI Workflow 실행 상태 배지 (`stepState` 색상 매핑) | AI_WORKFLOW |
| Step 24 | 협업 scope 밖 노드 dim (opacity: 0.4) + 툴팁 | MAP COLLABORATION |
| Step 25 | 타인 편집 중 잠금 표시 (presence 테두리·이름 배지·5초 타임아웃) | MAP COLLABORATION |

---

## [원본 설계 내용 전체]

> 아래 섹션은 첨부된 원본 설계 문서(`node-indicator.md`)의 전체 내용을 보존합니다.

---

## PART 1. 노드 추가 인디케이터 (NODE-13)

### 1. 기능 개요

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

### 2. 방향별 동작 정의

| 방향 | 기능 | 생성되는 노드 위치 | 대응 기존 단축키 |
|:---:|---|---|---|
| ⬆ 상 | 부모 노드 추가 | 선택 노드의 바로 위 상위 노드로 삽입 | — (신규) |
| ⬇ 하 | 자식 노드 추가 | 선택 노드의 마지막 자식으로 추가 | Space |
| ⬅ 좌 | 형제 노드 추가 (이전) | 선택 노드 바로 앞(위쪽)에 형제 삽입 | LShift + Ctrl + Space |
| ➡ 우 | 형제 노드 추가 (다음) | 선택 노드 바로 뒤(아래쪽)에 형제 삽입 | LShift + Space |

**2-1. 부모 노드 추가 (⬆ 상) — 상세**

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

**2-2. 자식 노드 추가 (⬇ 하) — 상세**

```
[Before]          [After]
A (선택)          A (선택)
 ├─ B              ├─ B
 └─ C              ├─ C
                   └─ 새노드 ← 마지막 자식으로 추가
```

선택 노드의 마지막 자식 위치에 새 노드를 추가한다.
기존 Space 단축키 동작과 동일.

**2-3. 형제 노드 추가 - 이전 (⬅ 좌) — 상세**

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

**2-4. 형제 노드 추가 - 다음 (➡ 우) — 상세**

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

### 3. UI/UX 규칙

**3-1. 인디케이터 표시 조건**

| 조건 | 동작 |
|---|---|
| 노드 싱글 클릭 | 4방향 + 아이콘 표시 |
| 노드 선택 해제 (빈 캔버스 클릭 / ESC) | 인디케이터 숨김 |
| 노드 편집 모드 진입 (Double Click) | 인디케이터 숨김 |
| Root 노드 선택 | ⬆상, ⬅좌, ➡우 비활성화 (⬇하만 활성) |
| 다중 선택 (SEL-02) | 인디케이터 표시 안 함 |

**3-2. 인디케이터 위치 계산**

노드 bounding box 기준:

```
상 (+):  노드 상단 중앙  (cx, top - offset)
하 (+):  노드 하단 중앙  (cx, bottom + offset)
좌 (+):  노드 좌측 중앙  (left - offset, cy)
우 (+):  노드 우측 중앙  (right + offset, cy)
```

offset 권장: 12px ~ 16px (노드 테두리와 약간의 여백)

**3-3. 인디케이터 스타일**

| 상태 | 스타일 |
|---|---|
| 기본(표시) | 원형 버튼, 테두리 색 #F0A500 (황금색), 배경 흰색, + 아이콘 |
| hover | 배경 #F0A500, + 아이콘 흰색으로 전환 |
| disabled (Root) | 회색, 클릭 불가 |
| 클릭(active) | 약한 scale 애니메이션 후 즉시 노드 생성 |

**3-4. 새 노드 생성 후 동작**

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

### 4. 레이아웃별 고려사항

인디케이터의 물리적 표시 방향은 고정(상/하/좌/우)이지만,
의미(동작)는 레이아웃 방향과 무관하게 아래처럼 항상 고정한다.

| 방향 | 어떤 레이아웃에서도 | 이유 |
|:---:|---|---|
| ⬆ 상 | 부모 노드 추가 | 위 = 상위 계층이라는 직관에 일치 |
| ⬇ 하 | 자식 노드 추가 | 아래 = 하위 계층이라는 직관에 일치 |
| ⬅ 좌 | 형제 노드 이전 추가 | 좌 = 앞 순서라는 일반 UX 관례 |
| ➡ 우 | 형제 노드 다음 추가 | 우 = 뒤 순서라는 일반 UX 관례 |

설계 노트: 레이아웃마다 방향 의미를 다르게 하면 학습 비용이 높아진다.
iThinkWise도 레이아웃에 관계없이 고정 방향으로 동작한다.

### 5. 키보드 / 마우스 조작 통합 요약

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

### 6. 비활성화 규칙 (Root 노드)

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

### 7. 프론트엔드 구현 힌트

**7-1. 인디케이터 컴포넌트 구조**

```
NodeRenderer
  └─ NodeAddIndicator       ← 4방향 + 버튼 컨테이너
       ├─ AddIndicatorTop    (⬆ 부모)
       ├─ AddIndicatorBottom (⬇ 자식)
       ├─ AddIndicatorLeft   (⬅ 형제 이전)
       └─ AddIndicatorRight  (➡ 형제 다음)
```

**7-2. 표시 조건 상태 관리**

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

**7-3. 부모 노드 삽입 로직**

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

**7-4. SVG 레이아웃에서의 인디케이터 위치 계산**

```typescript
const INDICATOR_OFFSET = 14; // px

const getIndicatorPositions = (nodeBounds: DOMRect) => ({
  top:    { x: nodeBounds.left + nodeBounds.width / 2,  y: nodeBounds.top - INDICATOR_OFFSET },
  bottom: { x: nodeBounds.left + nodeBounds.width / 2,  y: nodeBounds.bottom + INDICATOR_OFFSET },
  left:   { x: nodeBounds.left - INDICATOR_OFFSET,       y: nodeBounds.top + nodeBounds.height / 2 },
  right:  { x: nodeBounds.right + INDICATOR_OFFSET,      y: nodeBounds.top + nodeBounds.height / 2 },
});
```

### 8. Undo/Redo 처리

| 동작 | Undo 처리 |
|---|---|
| + 버튼으로 노드 생성 후 텍스트 확정 | Undo 가능 (노드 삭제) |
| + 버튼으로 노드 생성 후 Esc 취소 | Undo 히스토리에 미반영 |
| 부모 노드 삽입 (⬆) | Undo 가능 (중간 노드 제거 + 원복) |

### 9. Auto Save 연동

인디케이터로 생성된 노드도 기존 Auto Save 트리거를 그대로 따른다.

| 트리거 | 조건 |
|---|---|
| 텍스트 확정 (Enter / blur) | Auto Save 즉시 실행 |
| Esc 취소 | Auto Save 미실행 |

### 10. 구현 우선순위

- Step 1: NodeAddIndicator 컴포넌트 — 4방향 + 버튼 UI
- Step 2: 노드 클릭 → 인디케이터 표시/숨김 상태 관리
- Step 3: ⬇ 자식 추가 (기존 Space 동작과 동일, 가장 쉬움)
- Step 4: ➡ 형제 다음 추가 (기존 LShift+Space 동작과 동일)
- Step 5: ⬅ 형제 이전 추가
- Step 6: ⬆ 부모 노드 중간 삽입 (가장 복잡 — 서브트리 재배치 필요)
- Step 7: Root 노드 비활성화 처리
- Step 8: 새 노드 생성 후 편집 모드 자동 진입
- Step 9: Undo/Redo 연동

### 11. 와이어프레임 텍스트 표현

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

### 12. 번역 인디케이터 개요

번역된 노드임을 열람자에게 알리고, 원문 확인 및 번역 override 설정 진입점을 제공하는 인디케이터.
노드 텍스트 우측 끝에 작은 아이콘 형태로 표시된다.

```
[딸기 🔤]   ← 번역본 표시 중. 🔤 클릭 시 원문 팝오버
[AI 분석]   ← 번역 불필요 (내 언어). 아이콘 없음
[■■■■■]   ← 번역 대기 중. Skeleton(회색 바) 표시
```

- 적용 단계: V2 (다국어 번역 기능과 함께 구현)
- 설계 기준: `docs/04-extensions/translation/23-node-translation.md` § 10

### 13. 번역 상태별 인디케이터 정의

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

### 14. 🔤 원문 보기 팝오버 (오역 대응)

**14-1. 트리거 및 와이어프레임**

- 번역된 노드에 hover 시 → 🔤 아이콘 강조
- 🔤 아이콘 클릭 시 → 원문 팝오버 표시

클릭 후:
```
┌─────────────────────────────┐
│ 원문 (English)               │
│ strawberry                   │
│                              │
│  [번역본으로 돌아가기]        │
└─────────────────────────────┘
```

**14-2. 동작 원칙**

1. **API 호출 없음** — 클라이언트 state 전환만으로 처리 (원문은 항상 메모리에 보유)
2. 팝오버 표시 중에도 맵 조작 가능 (모달 아님, non-blocking)
3. `[번역본으로 돌아가기]` 클릭 또는 팝오버 외부 클릭 → 팝오버 닫힘
4. **1개 팝오버 원칙** — 다른 노드의 🔤 클릭 시 기존 팝오버 닫히고 새 팝오버 열림

**14-3. 팝오버 표시 정보**

| 항목 | 내용 |
|---|---|
| 원문 언어 레이블 | `text_lang` → 언어명 변환 (예: `'en'` → `English`) |
| 원문 텍스트 | `node.text` (DB 저장 원문) |
| 번역 엔진 | `model_version` (예: `DeepL v3`) — 선택적 표시 |
| 번역 날짜 | `node_translations.updated_at` — 선택적 표시 |

**14-4. 클라이언트 State 구조**

```typescript
// translationStore (Zustand) 추가 필드
type TranslationStore = {
  originalPopover: {
    nodeId: string | null;   // 현재 팝오버가 열린 노드 ID (null = 닫힘)
  };
  openOriginalPopover: (nodeId: string) => void;
  closeOriginalPopover: () => void;
};

// NodeText.tsx
const { originalPopover } = useTranslationStore();
const isShowingOriginal = originalPopover.nodeId === node.id;

const displayText = isShowingOriginal
  ? node.text
  : translationCache[node.id]?.[viewerLang]?.text ?? node.text;
```

### 15. Skeleton 인디케이터 (번역 대기 중)

**15-1. 표시 조건**

`shouldTranslate = true` AND 번역 캐시 없음 (Redis miss + DB miss)
→ 노드 텍스트 영역에 회색 Skeleton 바 표시

**15-2. 와이어프레임**

```
번역 대기 전:          번역 대기 중:           번역 완료 후:
┌─────────────┐       ┌─────────────┐        ┌─────────────┐
│  strawberry │  →→   │  ■■■■■■■   │  →→    │  딸기 🔤    │
└─────────────┘       └─────────────┘        └─────────────┘
                       (회색 바, 펄스 애니)
```

**15-3. Skeleton 스타일**

| 속성 | 값 |
|---|---|
| 배경색 | `#E0E0E0` (연회색) |
| 너비 | 노드 텍스트 영역과 동일 |
| 높이 | 폰트 크기와 동일 (1em) |
| 애니메이션 | pulse (opacity 0.4 ↔ 1.0, 1.2초 주기) |
| transition | 번역 완료 시 fadeIn으로 번역본 텍스트 교체 (0.2초) |

### 16. 편집자 전용 — translation_override 아이콘 (⛔ / 🔁)

**16-1. 표시 조건**

| `translation_override` 값 | 표시 | 설명 |
|---|:---:|---|
| `null` | 없음 | 자동 정책 따름 |
| `'force_off'` | ⛔ | 강제 번역 금지 |
| `'force_on'` | 🔁 | 강제 번역 |

**16-2. 클릭 동작 (편집자만)**

⛔ 또는 🔁 클릭 → 번역 설정 패널 오픈:

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

### 17. 컴포넌트 구조

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

  if (isEditor && node.translation_override === 'force_off') return 'force-off';
  if (isEditor && node.translation_override === 'force_on')  return 'force-on';

  const decision = shouldTranslate(node, viewerSettings, mapPolicy);
  if (!decision.shouldTranslate) return 'none';

  if (cachedTranslation?.hash === node.text_hash) return 'globe';
  if (translationFailed[node.id]) return 'warning';

  return 'skeleton';
}
```

### 18. 인디케이터 간 충돌 방지 규칙

| 인디케이터 종류 | 표시 조건 | 동시 표시 |
|---|---|:---:|
| + 버튼 (4방향) | 싱글 클릭 선택 시 | ✅ 가능 |
| 🔤 번역 아이콘 | 번역본 표시 중 | ✅ 가능 |
| 🔴 번역 실패 | 번역 실패 상태 | ✅ 가능 |
| ⛔ / 🔁 override | 편집자 + override 설정 | ✅ 가능 |
| Skeleton 바 | 번역 대기 중 | ❌ 불가 |

Skeleton과 실제 텍스트 + 번역 아이콘은 동시 표시 불가 (둘 중 하나만).

### 19. WebSocket 연동 — 번역 완료 시 자동 업데이트

```typescript
wsClient.on('translation:ready', ({ nodeId, targetLang, translatedText, textHash }) => {
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

### 20. 구현 우선순위 (번역 인디케이터)

- Step 1: 번역 캐시 연동 — displayText 로직 (shouldTranslate + 캐시 조회)
- Step 2: 🔤 아이콘 표시 (번역본 표시 중)
- Step 3: Skeleton UI (번역 대기 중 — pulse 애니메이션)
- Step 4: 원문 팝오버 (🔤 클릭 → 원문 + 언어명 표시 + 닫기)
- Step 5: 🔴 번역 실패 아이콘
- Step 6: ⛔ / 🔁 편집자 override 아이콘 + 클릭 시 설정 패널
- Step 7: WebSocket translation:ready 이벤트 수신 → 자동 UI 갱신

---

## PART 3. 인디케이터 표시 ON/OFF 설정 (NODE-15)

### 21. 배경 — 인디케이터 혼잡 문제

노드에 번역 인디케이터(🔤/🔴/⛔/🔁), 태그 badge, 노트(≡)·하이퍼링크(🔗)·첨부파일(📎)·멀티미디어(▶) 아이콘이
모두 표시될 경우 노드 텍스트 가독성이 저하된다.

```
[딸기 ≡ 📎 🔤]  ← 노트+첨부파일+번역 아이콘 동시 표시 예시
```

노트·Hyperlink·첨부파일·멀티미디어 인디케이터는 콘텐츠 존재 여부를 나타내므로 항상 표시하며 ON/OFF 설정 대상이 아니다.
→ 번역 아이콘과 태그 badge만 사용자 설정으로 표시 여부를 제어할 수 있다.

### 22. 표시 제어 대상

| 인디케이터 | 표시 방식 | 기본값 | 설정 키 |
|---|---|:---:|---|
| 노트 아이콘 (≡) | 항상 표시 | — | (설정 없음) |
| Hyperlink 아이콘 (🔗) | 항상 표시 | — | (설정 없음) |
| 첨부파일 아이콘 (📎) | 항상 표시 | — | (설정 없음) |
| 멀티미디어 아이콘 (▶) | 항상 표시 | — | (설정 없음) |
| 접기/펼치기 버튼 | 항상 표시 | — | (설정 없음) |
| Skeleton 바 (번역 대기) | 항상 표시 | — | (설정 없음) |
| 번역 아이콘 (🔤 / 🔴) | ON/OFF 설정 | ON | `showTranslationIndicator` |
| 편집자 override 아이콘 (⛔ / 🔁) | ON/OFF 설정 | ON | `showTranslationOverrideIcon` |
| 태그 badge | ON/OFF 설정 | ON | `showTagBadge` |

### 23. 설정 저장 위치

```json
// users.ui_preferences_json (JSONB)
{
  "showTranslationIndicator": true,
  "showTranslationOverrideIcon": true,
  "showTagBadge": true
}
```

### 24. 표시 판단 로직 변경

```typescript
function getTranslationIconState(
  node: NodeObject,
  viewerLang: string,
  cachedTranslation: CachedTranslation | undefined,
  isEditor: boolean,
  uiPrefs: UiPreferences,
): 'none' | 'globe' | 'warning' | 'force-off' | 'force-on' | 'skeleton' {

  if (isEditor && node.translation_override === 'force_off') {
    if (!uiPrefs.showTranslationOverrideIcon) return 'none';
    return 'force-off';
  }
  if (isEditor && node.translation_override === 'force_on') {
    if (!uiPrefs.showTranslationOverrideIcon) return 'none';
    return 'force-on';
  }

  const decision = shouldTranslate(node, viewerSettings, mapPolicy);
  if (!decision.shouldTranslate) return 'none';

  if (cachedTranslation?.hash === node.text_hash) {
    if (!uiPrefs.showTranslationIndicator) return 'none';
    return 'globe';
  }

  if (translationFailed[node.id]) {
    if (!uiPrefs.showTranslationIndicator) return 'none';
    return 'warning';
  }

  return 'skeleton'; // Skeleton은 항상 표시
}
```

### 25. 태그 badge 표시 제어

```typescript
function shouldShowTagBadge(node: NodeObject, uiPrefs: UiPreferences): boolean {
  if (!uiPrefs.showTagBadge) return false;
  return node.tags.length > 0;
}
```

### 26. 설정 UI — 위치 및 와이어프레임

설정 위치: 사이드바 "표시 설정" 패널 또는 메뉴 > 설정 > 인디케이터

```
항상 표시 (설정 불가)
  노트(≡) · Hyperlink(🔗) · 첨부파일(📎) · 멀티미디어(▶) · 접기/펼치기 · Skeleton 바

인디케이터 ON/OFF
  번역 아이콘 표시 (🔤/🔴)          [ON ●]
  번역 override 아이콘 (⛔/🔁)       [ON ●]  ← 편집자 권한일 때만 노출
  태그 badge 표시                    [ON ●]
```

저장 API: `PATCH /users/me/ui-preferences` (토글 OFF 시 즉시 반영)

### 27. 번역 아이콘 OFF 시 동작 정리

| 상태 | `showTranslationIndicator=true` | `showTranslationIndicator=false` |
|---|---|---|
| 번역본 표시 중 | `[딸기 🔤]` | `[딸기]` |
| 번역 실패 | `[딸기 🔴]` | `[딸기]` |
| 번역 대기 중 | `[■■■■■]` (Skeleton) | `[■■■■■]` (Skeleton **유지**) |
| force_off 편집자 | `[딸기 ⛔]` | `[딸기 ⛔]` ← 별도 설정 |
| force_on 편집자 | `[번역본 🔁]` | `[번역본 🔁]` |

**핵심 원칙:**
1. 번역 아이콘 OFF = 아이콘만 숨김. 번역 텍스트 자체는 유지.
2. Skeleton은 설정에 상관없이 항상 표시.
3. override 아이콘은 독립 설정.

### 28. 관련 API 엔드포인트 (신규)

- `PATCH /users/me/ui-preferences` — Body: `Partial<UiPreferences>`, `users.ui_preferences_json` 업데이트, 응답: 200 OK + 갱신된 UiPreferences
- `GET /users/me` — 기존 사용자 프로필 API에 `uiPreferences` 필드 포함 반환

### 29. 구현 우선순위 (인디케이터 ON/OFF)

- Step 1: UiPreferences 타입 정의 및 users.ui_preferences_json 컬럼 추가
- Step 2: PATCH /users/me/ui-preferences API 구현
- Step 3: uiPreferences 전역 상태 (Zustand store) 연동
- Step 4: getTranslationIconState()에 showTranslationIndicator 체크 추가
- Step 5: NodeTagBadge에 showTagBadge 체크 추가
- Step 6: 설정 UI 패널 구현 (토글 컴포넌트)

---

## PART 4. 콘텐츠 존재 인디케이터 (NODE-16)

### 30. 개요

노드에 특정 콘텐츠(노트·하이퍼링크·첨부파일·멀티미디어)가 연결되어 있을 때,
노드 우측에 작은 아이콘을 표시하여 콘텐츠 존재 여부를 한눈에 알 수 있게 한다.

```
[노트  ≡]         ← 노트(긴 설명)가 작성된 노드
[Hyperlink 🔗]  ← 하이퍼링크가 1개 이상 연결된 노드
[첨부파일 📎]      ← 첨부파일이 1개 이상 연결된 노드
[멀티미디어 ▶]    ← 멀티미디어(영상/음성 등)가 연결된 노드
```

- 적용 단계: V1 (기본 기능 — 콘텐츠 부재/존재 시각화)
- 표시 방식: 해당 데이터가 존재하면 항상 표시 (사용자 ON/OFF 설정 없음)

### 31. 콘텐츠 존재 인디케이터 정의

| 인디케이터 | 아이콘 | 색상 | 표시 조건 | 위치 |
|---|:---:|---|---|:---:|
| 노트 | ≡ | 주황/베이지 | `node.note ≠ null` | 노드 우측 |
| Hyperlink | 🔗 | 파란 계열 | `node.hyperlinkIds.length > 0` | 노드 우측 |
| 첨부파일 | 📎 | 주황/베이지 | `node.attachmentIds.length > 0` | 노드 우측 |
| 멀티미디어 | ▶ | 파란 계열 | `node.multimediaId ≠ null` | 노드 우측 |

4가지 모두 동시에 표시될 수 있다.

### 32. 표시 판단 로직

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
- 데이터가 없으면(빈 배열, null) 아이콘을 렌더링하지 않는다.

### 33. 컴포넌트 구조

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

### 34. 인디케이터 충돌 방지 규칙 (§18 확장)

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

### 35. 구현 우선순위 (콘텐츠 존재 인디케이터)

- Step 1: getContentIndicatorState() 함수 구현
- Step 2: NoteIcon — node.note 존재 시 ≡ 아이콘 렌더링
- Step 3: HyperlinkIcon — hyperlinkIds.length > 0 시 아이콘 렌더링
- Step 4: AttachmentIcon — attachmentIds.length > 0 시 아이콘 렌더링
- Step 5: MultimediaIcon — multimediaId 존재 시 ▶ 아이콘 렌더링
- Step 6: NodeContentIndicators 컨테이너 — 4개 아이콘 배치 및 간격

---

## PART 5. WBS 일정 인디케이터 (NODE-17)

> 관련 설계: `docs/04-extensions/integrations/31-redmine-integration.md` §6
> 관련 기능ID: NODE-17 · SCHED-01~04

### 인디케이터 배치 구조

```
┌──────────────────────────────────────┐
│ ◆  [노드 텍스트]             ⟳/⚠/✕  │
├──────────────────────────────────────┤
│ 📅  04/01 ~ 04/30              🟢    │
│ ▓▓▓▓▓░░░░░░  50%                    │
│ 👤 홍길동  👤 김철수                 │
└──────────────────────────────────────┘

마일스톤 노드:
┌──────────────────────────────────────┐
│ ◆  [마일스톤 텍스트]                 │
├──────────────────────────────────────┤
│ 📅  04/30 (단일 날짜)          🟣    │
│ 👤 홍길동                            │
└──────────────────────────────────────┘
```

### WBS 상태 판별 로직

```typescript
type WbsStatus = 'done' | 'on-track' | 'delayed' | 'upcoming' | 'no-date';

function getWbsStatus(schedule: NodeSchedule): WbsStatus {
  if (schedule.progress === 100) return 'done';
  if (!schedule.startDate)       return 'no-date';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseISO(schedule.startDate);
  const end   = schedule.endDate ? parseISO(schedule.endDate) : null;

  if (start > today)  return 'upcoming';
  if (end && end < today) return 'delayed';
  return 'on-track';
}

const WBS_STATUS_COLOR: Record<WbsStatus, string> = {
  'done':     '#22C55E',
  'on-track': '#3B82F6',
  'delayed':  '#EF4444',
  'upcoming': '#9CA3AF',
  'no-date':  'transparent',
};
```

### 날짜 배지 표시 규칙

| 조건 | 표시 형식 | 예시 |
|---|---|---|
| start와 end 모두 있음 | `MM/DD ~ MM/DD` | `04/01 ~ 04/30` |
| start만 있음 | `MM/DD ~` | `04/01 ~` |
| end만 있음 | `~ MM/DD` | `~ 04/30` |
| 마일스톤 (`isMilestone=true`) | `◆ MM/DD` | `◆ 04/30` |
| 모두 null | 배지 미표시 | — |

### Redmine sync_status 인디케이터

| sync_status | 아이콘 | 색상 | 위치 | 의미 |
|---|---|---|---|---|
| `synced` | 없음 | — | — | 정상 동기화 |
| `pending` | ⟳ (회전) | `#3B82F6` | 노드 우상단 | 동기화 진행중 |
| `error` | ⚠ | `#F59E0B` | 노드 우상단 | 동기화 실패, 재시도 대기 |
| `failed` | ✕ | `#EF4444` | 노드 우상단 | 수동 처리 필요 |

### 인터랙션

| 요소 | 클릭 동작 |
|---|---|
| 날짜 배지 | DatePicker 팝오버 (시작일/종료일 + 마일스톤 토글) |
| 진척률 바 | 0~100 슬라이더 팝오버 |
| 리소스 아바타 | 리소스 할당 패널 오픈 |
| ⚠ 오류 아이콘 | 동기화 오류 상세 + 재시도 버튼 |
| ✕ 실패 아이콘 | 수동 처리 가이드 패널 |

---

## PART 6. AI Workflow 상태 인디케이터 (WFLOW-03/04)

> 관련 PRD: `docs/04-extensions/ai/19-ai-workflow.md` §10.7

`workflowType = 'executable'`인 step node는 실행 상태를 인디케이터로 표시한다.

### 상태 표시

| stepState | 색상 | 아이콘/배지 | 의미 |
|---|---|---|---|
| `not_started` | 회색 | ○ | 아직 실행 안 함 |
| `in_progress` | 파랑 | ▶ | 현재 실행 중 |
| `blocked` | 빨강 | ✕ | 오류로 진행 막힘 |
| `resolved` | 노랑 | ✓ | blocking 해결됨, 완료 대기 |
| `done` | 초록 | ✔ | 완료 |

### 표시 위치

- 노드 좌측 상단 또는 노드 테두리 색상으로 표현
- 콘텐츠 인디케이터 행 좌측에 workflow 상태 배지 우선 표시

```typescript
function getWorkflowBadgeColor(stepState: StepState): string {
  const colorMap: Record<StepState, string> = {
    'not_started': '#9CA3AF',
    'in_progress': '#3B82F6',
    'blocked':     '#EF4444',
    'resolved':    '#F59E0B',
    'done':        '#22C55E',
  };
  return colorMap[stepState];
}
```

---

## PART 7. 협업 인디케이터 (Collaboration Indicator, V3.3)

협업맵(`is_collaborative = true`)에서 동시 편집 중 노드의 시각적 상태를 표시한다.

### 6-1. scope 밖 노드 — 편집 불가 표시

| 항목 | 규격 |
|---|---|
| 시각 처리 | `opacity: 0.4` (반투명 처리) |
| 커서 | `cursor: not-allowed` |
| 클릭 동작 | 읽기만 가능. 편집 시도 시 툴팁 표시 |
| 툴팁 메시지 | "이 노드는 편집 권한 범위 밖입니다." |
| 적용 대상 | `collab_editor` 역할의 scope 밖 노드 전체 |
| `collab_creator` | scope 제한 없으므로 dim 처리 없음 |

```typescript
function isOutOfScope(node: NodeObject, permission: CollabPermission): boolean {
  if (permission.role === 'collab_creator') return false;
  if (permission.scopeType === 'level') {
    return node.depth < permission.scopeLevel!;
  }
  if (permission.scopeType === 'node') {
    return !isDescendantOf(node.id, permission.scopeNodeId!);
  }
  return false;
}
```

### 6-2. 타인이 편집 중인 노드 — 잠금 표시

| 항목 | 규격 |
|---|---|
| 테두리 색 | 편집자의 presence 색상 |
| 테두리 두께 | `3px solid` |
| 이름 배지 | 노드 상단 왼쪽, 편집자 displayName 표시 |
| 배지 배경 | 동일 presence 색상, `opacity: 0.85` |
| 잠금 해제 | `node:editing:ended` 이벤트 수신 시 자동 해제 |
| 소프트 잠금 | 5초 타임아웃 후 자동 해제 |

```typescript
type NodeEditingState = {
  nodeId: string;
  userId: string;
  displayName: string;
  color: string;      // presence 색상
  startedAt: number;  // timestamp
};
```

### 6-3. ui_preferences_json 추가 키

```json
{
  "showCollabScopeOverlay": true,
  "showCollabEditingBadge": true
}
```
