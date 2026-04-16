# 32. Settings
## SETTINGS

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/02-domain/db-schema.md § users`, `docs/01-product/functional-spec.md`

---

### 1. 기능 목적

* 사용자 개인 환경설정 및 맵별 기본값을 **관리하는 설정 기능**
* 테마·언어·레이아웃·번역 등 개인화 설정으로 UX 최적화
* `ui_preferences_json` JSONB 컬럼으로 유연한 설정 확장

---

### 2. 기능 범위

* 포함:
  * 사용자 프로필 설정 (SETT-01)
  * 테마 설정 (SETT-02)
  * 언어/번역 설정 (SETT-03)
  * 기본 레이아웃 설정 (SETT-04)
  * UI 표시 환경설정 (SETT-05)
  * 맵별 설정 오버라이드 (SETT-06)
  * API Key 관리 (SETT-07, Dashboard용)

* 제외:
  * 결제/구독 관리 (별도 모듈)
  * 팀/워크스페이스 관리 (별도 모듈)
  * 알림 설정 (후순위)

---

### 3. 세부 기능 목록

| 기능ID     | 기능명            | 설명                                | 주요 동작       |
| -------- | -------------- | ---------------------------------- | ----------- |
| SETT-01  | 프로필 설정         | 표시 이름, 아바타 이미지 변경                  | 프로필 편집      |
| SETT-02  | 테마 설정          | 라이트/다크/시스템 테마 선택                   | 테마 토글       |
| SETT-03  | 언어/번역 설정       | UI 언어, 번역 대상 언어 설정                 | 드롭다운 선택     |
| SETT-04  | 기본 레이아웃        | 새 맵 생성 시 기본 레이아웃 타입 설정             | 레이아웃 선택     |
| SETT-05  | UI 표시 설정       | 번역 인디케이터, 태그 배지, 단축키 표시 등         | 토글 스위치      |
| SETT-06  | 맵별 설정          | 맵별 번역 정책, 뷰 모드 등 오버라이드             | 맵 Settings  |
| SETT-07  | API Key 관리     | Dashboard 외부 업데이트용 API Key 발급/재생성  | Key 관리 UI   |

---

### 4. 기능 정의 (What)

#### 4.1 users 테이블 설정 컬럼

```sql
CREATE TABLE public.users (
  id                      UUID PRIMARY KEY,
  display_name            VARCHAR(100),
  preferred_language      VARCHAR(10)  DEFAULT 'ko',       -- UI 언어
  default_layout_type     VARCHAR(50)  DEFAULT 'radial-bidirectional',

  -- 번역 설정 (V2)
  secondary_languages     TEXT[]       NOT NULL DEFAULT '{}',
  -- 최대 3개 번역 대상 언어: ['ko', 'ja', 'zh']
  skip_english_translation BOOLEAN     NOT NULL DEFAULT TRUE,
  -- TRUE: 영어 원문 노드는 번역 건너뜀

  -- UI 환경설정 (JSONB)
  ui_preferences_json     JSONB        NOT NULL DEFAULT '{
    "showTranslationIndicator": true,
    "showTranslationOverrideIcon": true,
    "showTagBadge": true,
    "theme": "system",
    "showKeyboardShortcuts": true,
    "showNodeIndicator": true
  }',

  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW()
);
```

#### 4.2 ui_preferences_json 구조

```typescript
interface UiPreferences {
  // 번역 관련
  showTranslationIndicator: boolean;     // 번역 상태 인디케이터 표시
  showTranslationOverrideIcon: boolean;  // 번역 강제 on/off 아이콘 표시

  // 태그
  showTagBadge: boolean;                 // 노드 태그 배지 표시

  // 테마
  theme: 'light' | 'dark' | 'system';   // UI 테마

  // 편의 기능
  showKeyboardShortcuts: boolean;        // 단축키 도움말 표시 여부
  showNodeIndicator: boolean;            // 노드 + 버튼 인디케이터 표시

  // 확장 가능 (추후 추가)
  // showMinimap?: boolean;
  // showStatusBar?: boolean;
}
```

#### 4.3 맵별 번역 정책 오버라이드

```typescript
// maps.translation_policy_json
type TranslationPolicy =
  | { mode: 'off' }                                      // 이 맵에서 번역 비활성
  | { allowedTargetLanguages: string[] }                  // 허용 번역 언어 제한
  | null;                                                 // 사용자 기본 설정 따름
```

#### 4.4 설정 화면 구조

```text
┌─────────────────────────────────────────────────────────┐
│  설정                                                    │
├──────────────┬──────────────────────────────────────────┤
│  프로필       │  표시 이름: [Alice Kim          ]         │
│  테마        │  아바타:   [이미지 변경]                   │
│  언어/번역   ├──────────────────────────────────────────┤
│  에디터      │  테마:  ○ 라이트  ○ 다크  ● 시스템         │
│  API Key    ├──────────────────────────────────────────┤
│              │  UI 언어:  [ 한국어    ▼ ]                │
│              │  번역 언어: [ + 언어 추가 ] (최대 3개)      │
│              │  □ 영어 원문 번역 건너뜀                    │
│              ├──────────────────────────────────────────┤
│              │  기본 레이아웃: [ 방사형-양쪽  ▼ ]          │
│              ├──────────────────────────────────────────┤
│              │  □ 번역 인디케이터 표시                     │
│              │  □ 태그 배지 표시                           │
│              │  □ 노드 + 버튼 표시                         │
└──────────────┴──────────────────────────────────────────┘
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 상단 아바타 클릭 > `설정` 메뉴
* 각 섹션별 설정 변경
* 변경 즉시 반영 (저장 버튼 없이 Auto Save)
* 맵별 설정: 맵 상단 메뉴 > `맵 설정`

#### 5.2 설정 저장 흐름

```
설정 변경 (토글/드롭다운/입력)
    │
    ▼
PATCH /users/me/preferences
  { ui_preferences_json: {...} }
  또는
PATCH /users/me
  { display_name, preferred_language, secondary_languages, ... }
    │
    ▼
users 테이블 UPDATE
    │
    ▼
클라이언트 상태 즉시 반영 (Zustand store)
```

#### 5.3 테마 적용

```typescript
// 테마 우선순위
const resolvedTheme = (() => {
  if (prefs.theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }
  return prefs.theme;
})();

// document.documentElement에 class 적용
document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
```

---

### 6. 규칙 (Rule)

* `secondary_languages` 최대 3개
* `default_layout_type`: 15개 LayoutType 중 하나
* `ui_preferences_json` 변경 시 즉시 저장 (debounce 없음)
* API Key는 Dashboard 외부 업데이트 API 인증용, AES-256 암호화 저장
* 설정 화면에서 API Key는 처음 생성 시만 전체 표시, 이후 `****...` 마스킹

---

### 7. 예외 / 경계 (Edge Case)

* **unknown preference key**: 무시하고 기존 값 유지
* **API Key 분실**: 재생성으로만 복구 (기존 키 무효화)
* **secondary_languages 4개 이상 입력 시도**: UI에서 추가 버튼 비활성화

---

### 8. 권한 규칙

| 역할          | 개인 설정 변경 | 맵별 설정 변경 | API Key 관리 |
| ----------- | --------- | --------- | ---------- |
| creator     | ✅         | ✅         | ✅          |
| editor      | ✅         | ❌         | ❌          |
| viewer      | ✅ (개인만)  | ❌         | ❌          |

---

### 9. DB 영향

* `users.display_name` — 표시 이름
* `users.preferred_language` — UI 언어
* `users.default_layout_type` — 기본 레이아웃
* `users.secondary_languages` — 번역 대상 언어
* `users.skip_english_translation` — 영어 번역 건너뜀
* `users.ui_preferences_json` — UI 환경설정 전반
* `maps.translation_policy_json` — 맵별 번역 정책

---

### 10. API 영향

* `GET /users/me` — 현재 사용자 설정 조회
* `PATCH /users/me` — 기본 설정 변경
* `PATCH /users/me/preferences` — UI 환경설정 변경
* `POST /users/me/api-key` — Dashboard API Key 발급
* `DELETE /users/me/api-key` — API Key 삭제

---

### 11. 연관 기능

* NODE_TRANSLATION (`23-node-translation.md`)
* TAG (`docs/03-editor-core/search/15-tag.md`)
* DASHBOARD (`22-dashboard.md`)
* LAYOUT (`docs/03-editor-core/layout/08-layout.md`)

---

### 12. 구현 우선순위

#### MVP
* SETT-01 프로필 설정 (표시 이름)
* SETT-02 테마 설정 (라이트/다크/시스템)
* SETT-04 기본 레이아웃 설정
* SETT-05 UI 표시 설정 (태그 배지, 노드 인디케이터)

#### 2단계 (V2)
* SETT-03 언어/번역 설정 (secondary_languages, skip_english)
* SETT-06 맵별 번역 정책 설정

#### 3단계
* SETT-07 Dashboard API Key 관리
