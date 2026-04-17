# 19. AI Workflow
## AI_WORKFLOW

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § AI_WORKFLOW`, `docs/04-extensions/ai/18-ai.md`

---

### 1. 기능 목적

* 사용자가 자연어로 요청한 절차를 **AI가 step 기반 node tree로 구조화**하는 기능
* 각 step를 실제 실행하며 오류를 해결하고, 최종적으로 정제된 절차 문서를 완성
* 코드 블록·체크리스트·경고 등 구조화된 Note로 실행 가능한 SOP 문서 생성

---

### 2. 기능 범위

* 포함:
  * Workflow 자동 생성 (WFLOW-01~02)
  * Step 실행 상태 관리 (WFLOW-03~04)
  * 오류 해결 지원 (WFLOW-05~06)
  * Workflow 정리/정제 (WFLOW-07)
  * Note 코드 블록 지원 (WFLOW-08~10)
  * Solo-only AI 정책 (WFLOW-11~12)

* 제외:
  * 단순 AI 노드 생성/확장 (→ `18-ai.md`)
  * 번역 기능 (→ `23-node-translation.md`)

---

### 3. 세부 기능 목록

| 기능ID     | 기능명               | 설명                                           | 주요 동작              |
| -------- | ----------------- | -------------------------------------------- | ------------------ |
| WFLOW-01 | Workflow Generate | 자연어 요청을 step 기반 node tree로 생성                | 프롬프트 입력 → 트리 생성    |
| WFLOW-02 | Step Node 구조      | 각 step = 독립 node (title: 요약, note: 상세)       | 노드 구조 정의           |
| WFLOW-03 | Step Status       | step 상태 관리 (not_started/in_progress/blocked/resolved/done) | 상태 변경 |
| WFLOW-04 | Step Progress     | 현재 실행 중인 step 추적 및 시각화                       | 진행 표시줄             |
| WFLOW-05 | Error Input       | 특정 step에서 오류 내용 입력                           | 오류 텍스트 입력          |
| WFLOW-06 | AI Resolution     | AI가 해당 step 문맥에서 해결 방법 제시 (반복 가능)           | AI 해결책 표시          |
| WFLOW-07 | Cleanup           | 중간 시도 제거, 최종 성공 방법만 node에 반영                 | 정리 실행              |
| WFLOW-08 | Structured Note   | note의 block 기반 구조 (paragraph/code_block/warning/checklist) | Note 편집 |
| WFLOW-09 | Code Block        | 언어 지정 code block 지원 (bash, sql, json 등)     | 코드 블록 렌더링          |
| WFLOW-10 | Copy Button       | code block별 Copy 버튼 제공                       | 클립보드 복사            |
| WFLOW-11 | Solo-only AI      | 단독 편집 모드(접속자 1명)에서만 AI 기능 허용                | 접속자 수 확인           |
| WFLOW-12 | Collab Restriction | 협업 중(2명 이상) AI 기능 비활성화 + 안내 메시지             | UI 비활성화            |

---

### 4. 기능 정의 (What)

#### 4.1 Workflow 노드 구조

```text
[Workflow Root] "Linux 서버 구축"
  ├── [Step 1] "패키지 업데이트"          ← node title (요약)
  │     note: "sudo apt-get update ..."   ← note (상세 + 코드 블록)
  ├── [Step 2] "Nginx 설치"
  │     note: "sudo apt-get install nginx"
  └── [Step 3] "방화벽 설정"
        note: "ufw allow 80/tcp ..."
```

#### 4.2 Step 상태 (stepState)

```typescript
type StepState =
  | 'not_started'   // 미시작 (기본값)
  | 'in_progress'   // 실행 중
  | 'blocked'       // 오류/차단
  | 'resolved'      // 오류 해결됨
  | 'done';         // 완료
```

#### 4.3 StepState 색상 매핑

| 상태          | 색상          | 아이콘 |
| ----------- | ----------- | --- |
| not_started | 회색 (#9CA3AF) | ○   |
| in_progress | 파란색 (#3B82F6) | ▶  |
| blocked     | 빨간색 (#EF4444) | ✕   |
| resolved    | 주황색 (#F59E0B) | ⚡  |
| done        | 초록색 (#10B981) | ✓   |

#### 4.4 Note 블록 구조

```typescript
type NoteBlock =
  | { type: 'paragraph'; content: string }
  | { type: 'code_block'; language: string; content: string }
  | { type: 'warning'; content: string }
  | { type: 'checklist'; items: { text: string; checked: boolean }[] };
```

#### 4.5 Note 코드 블록 렌더링 예시

````text
```bash
sudo apt-get update
sudo apt-get install nginx
```
                              [Copy]
````

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

1. 툴바 `AI Workflow` 버튼 → 프롬프트 입력 다이얼로그 표시
2. 자연어 요청 입력 (예: `"Ubuntu 20.04에 LAMP 스택 설치하는 절차"`)
3. AI가 Step node tree 생성 → 맵에 삽입
4. 각 Step 노드 클릭 → 상태를 `in_progress`로 변경 → 코드 실행
5. 오류 발생 시 → 해당 노드에 오류 내용 입력
6. `[AI 해결책]` 버튼 → AI가 문맥 기반 해결 방법 제시
7. 해결 후 → 상태를 `resolved` → `done` 으로 변경
8. 완료 후 `[정리]` 실행 → 중간 실패 시도 제거, 최종 절차만 정제

#### 5.2 오류 해결 흐름

```
Step 노드 상태: in_progress
    │
    ▼ (오류 발생)
오류 텍스트 입력 → stepState: blocked
    │
    ▼
POST /ai/resolve
  { stepNodeId, errorText, stepContext }
    │
    ▼
AI → 해결 방법 Markdown 반환
    │
    ▼
Note에 해결책 블록 추가 (warning → code_block)
    │
    ▼
사용자 해결 확인 → stepState: resolved → done
```

#### 5.3 Cleanup 동작

* 실행 중 `blocked` 상태의 중간 시도 기록을 Note에서 제거
* 최종 성공한 방법만 남겨 정제된 SOP 문서 완성
* 정리 후 모든 Step 상태를 `done`으로 일괄 업데이트 가능

---

### 6. 규칙 (Rule)

* Workflow는 solo 편집 모드(접속자 1명)에서만 생성 가능
* 협업 중 AI Workflow 비활성화 — 안내: `"협업 중에는 AI Workflow를 사용할 수 없습니다"`
* Step 노드의 stepState는 `style_json.stepState` 또는 별도 메타 필드로 저장
* 코드 블록은 언어 구문 강조(syntax highlight) 지원 (bash, python, sql, json, yaml 등)
* Copy 버튼: 코드 블록 우측 상단 고정 배치

---

### 7. 예외 / 경계 (Edge Case)

* **AI 생성 실패**: 오류 메시지 + 재시도 버튼
* **협업 중 Workflow 시도**: 비활성 안내 메시지
* **빈 프롬프트**: 입력 유효성 검사로 차단
* **코드 블록 언어 미인식**: 언어 없이 plain text로 렌더링

---

### 8. 권한 규칙

| 역할      | AI Workflow 사용 |
| ------- | ------------- |
| creator | ✅ (solo 한정)  |
| editor  | ✅ (solo 한정)  |
| viewer  | ❌             |

---

### 9. DB 영향

* `ai_jobs` — Workflow 생성 요청 이력
* `nodes` — Step 노드 INSERT
* `node_notes` — Step Note (코드 블록 포함) 저장

---

### 10. API 영향

* `POST /ai/workflow/generate` — Workflow 생성
* `POST /ai/workflow/resolve` — 오류 해결 요청
* `POST /ai/workflow/cleanup` — Workflow 정리

---

### 11. 연관 기능

* AI (`18-ai.md`)
* NODE_EDITING (`docs/03-editor-core/node/02-node-editing.md`)
* COLLABORATION (`25-map-collaboration.md`)

---

### 12. 구현 우선순위

#### MVP
* WFLOW-01~02: Workflow 생성, Step 노드 구조
* WFLOW-03~04: Step 상태 관리 및 진행 표시
* WFLOW-08~10: Note 코드 블록 + Copy 버튼

#### 2단계
* WFLOW-05~06: 오류 입력 + AI 해결책 제시
* WFLOW-07: Workflow 정리

#### 3단계
* WFLOW-11~12: Solo-only 정책 (협업 제한)

---

### 13. 핵심 차별점 — 일반 AI vs AI Workflow

본 기능은 단순히 "AI가 마인드맵을 생성해주는 기능"이 아니다. 다음 비교를 통해 핵심 차별점을 명확히 한다.

| 구분 | 일반 AI Mindmap 생성 | AI 기반 실행형 Workflow |
| ---- | ------------------- | --------------------- |
| 목적 | 주제 요약·구조화 | 작업 절차 단계별 구조화 |
| 결과물 성격 | 정적 보기 중심 | 실제 실행 전제, 실행 중심 |
| 오류 발생 시 | 별도 대화 시작 | 같은 step 문맥에서 해결 |
| 최종 산출물 | AI 응답 시각화 | 정제된 절차서 (SOP) |
| 주 사용 목적 | 아이디어 정리 | 운영·개발·DevOps 절차 진행 |

#### 핵심 정의

> AI 대화 결과를 map으로 보여주는 기능이 아니라, **map을 중심으로 실제 작업을 진행하고 정제해 나가는 실행형 AI 절차 기능**

---

### 14. 기존 AI 대화 방식의 문제 정의

본 기능이 해결하려는 배경 문제.

1. 전체 절차가 긴 채팅 형태로 제공되어 흐름을 잃기 쉽다.
2. 각 step에서 오류가 발생하면 질의응답이 길어져 원래 절차 구조가 무너진다.
3. 오류 해결 과정이 누적되면 전체 작업의 현재 위치를 파악하기 어렵다.
4. 최종적으로는 성공한 방법보다 실패했던 대화 로그가 더 많이 남는다.
5. 반복 가능한 표준 절차서로 재사용하기 어렵다.

즉, 기존 방식은 "답변은 길어지는데 절차 구조는 유지되지 않는 문제"가 있다.

---

### 15. Workflow 생성 요청 타입 (WorkflowGenerateRequest)

AI Workflow 생성 요청 시 전달되는 파라미터 타입 정의.

```typescript
type WorkflowGenerateRequest = {
  prompt: string;                    // 사용자 자연어 요청 (필수)
  mode: 'workflow';                  // 일반 mindmap 생성과 구분하는 식별자
  language?: 'ko' | 'en' | 'auto';  // 응답 언어 — 기본값: auto
};
```

* `mode: 'workflow'` 값은 LLM에 전달되어 step 기반 절차 구조 생성을 지시한다.
* AI-01 `AIGenerateRequest`와 달리 `maxDepth`/`maxChildrenPerNode`는 사용하지 않는다.
  step 구조는 절차의 논리적 흐름에 따라 결정되기 때문이다.

---

### 16. 성공 기준

다음 7가지 항목을 만족하면 본 기능이 유의미하게 구현된 것으로 본다.

1. 사용자가 자연어 요청만으로 절차형 map을 생성할 수 있다.
2. 각 step에 note와 code block을 둘 수 있다.
3. code block은 개별 copy가 가능하다.
4. 사용자는 step별로 실행하고 다음 단계로 진행할 수 있다.
5. 오류 해결이 같은 step 문맥에서 반복 가능하다.
6. 해결 후 map이 최종 절차 중심으로 정리된다.
7. 협업 중에는 AI Workflow 기능이 제한된다.

---

### 17. 제품 포지셔닝

본 기능이 추가됨으로써 easymindmap의 제품 성격이 다음과 같이 확장된다.

#### 기존 포지셔닝

* 아이디어 정리 도구
* 시각적 구조화 도구

#### 확장 포지셔닝

* AI 기반 실행형 절차 관리 도구
* 실행 가능한 기술 문서 생성 도구
* 개발·운영 Runbook Builder
* 대화형 Workflow Mindmap 도구

#### 주요 사용 대상

* 개발자, DevOps 엔지니어, 시스템 엔지니어, TA/DBA, 운영 담당자
* 기술 문서 작성자, IT 초보자 및 온보딩 대상자

#### 적용 가능 업무 영역

* 서버 구축 절차, SSL 발급 절차, DB 설치·설정 절차
* 배포 절차, API 개발 절차, 마이그레이션 절차
* 장애 대응 Runbook, 기술 검증/PoC 절차
* 릴리즈 체크리스트, 신규 입사자 개발환경 세팅 절차

---

### 18. 사용자 가치

#### 개인 사용자 가치

* 긴 기술 절차를 한눈에 볼 수 있다.
* 현재 step만 집중해서 실행할 수 있다.
* 오류 해결 과정이 구조를 무너뜨리지 않는다.
* 최종 절차가 깔끔하게 남는다.

#### 조직 사용자 가치

* 실행 가능한 표준 절차서(SOP) 축적
* 온보딩 문서 품질 향상
* 운영 Runbook 고도화
* 팀 내 절차 재사용성 증가
* 기술 문서의 최신성 유지
