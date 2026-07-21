# EMM 테스트 가이드 (IT 초보자용)

* 문서 버전: v1.0
* 최초 작성: 2026-07
* 대상 독자: 프로그래밍 경험이 없어도 따라 할 수 있도록 작성
* 관련: `emm-spec.md`(포맷 스펙), `ai/emm-prompt-templates.md`(프롬프트),
  `../../packages/emm-parser/README.md`(파서 패키지)

이 문서는 EMM(EasyMindMap Markdown) 관련 3가지 결과물이
**각각 무엇을 하는 것인지**, 그리고 **직접 어떻게 테스트(검증)하는지**를
단계별로 설명한다.

| 결과물 | 한 줄 설명 | 난이도 |
|---|---|---|
| ① AI 프롬프트 템플릿 | AI(ChatGPT 등)에게 주면 출력이 그대로 마인드맵이 되는 지시문 | ★ (코딩 불필요) |
| ② 적합성 코퍼스 | 파서가 실문서 11종을 항상 똑같이·무손실로 변환하는지 자동 검사 | ★★ (명령 한 줄) |
| ③ emm-parser 패키지 + CLI | 앱 없이도 MD↔맵 변환이 되는 독립 부품 | ★★ (명령 몇 줄) |

---

## 0. 준비물 (공통 — 처음 한 번만)

### 0.1 Node.js 확인

터미널(Windows: 명령 프롬프트 또는 PowerShell / Mac: 터미널)을 열고:

```bash
node -v
```

- `v18.x.x` 이상의 숫자가 나오면 준비 완료.
- `command not found`가 나오면 https://nodejs.org 에서 **LTS 버전**을
  설치한 뒤 터미널을 새로 열고 다시 확인한다.

### 0.2 최신 코드 받기

저장소 폴더로 이동해 최신 코드를 받는다:

```bash
cd easymindmap        # 저장소를 받아둔 폴더
git pull origin main
```

### 0.3 (앱 테스트용) EasyMindMap 실행

```bash
cd apps/frontend
npm install           # 처음 한 번만
npm run dev
```

터미널에 나오는 `http://localhost:5173/` 주소를 브라우저로 연다.

---

## 1. AI 프롬프트 템플릿 테스트

### 1.1 무엇을 하는 기능인가?

EMM의 본문은 100% 일반 Markdown이다. 그래서 ChatGPT·Claude 같은 AI에게
"이런 규칙으로 써줘"라는 **지시문(프롬프트)**만 주면, AI의 답변이
곧바로 EasyMindMap에서 열리는 마인드맵 파일이 된다.

`docs/04-extensions/ai/emm-prompt-templates.md`에는:

- **공통 코어 프롬프트** — 구조 규칙(헤딩=깊이)과 콘텐츠 규칙(인용문=
  문단 노트, 코드 펜스=코드 노트, 파이프 표=표 노트 등)
- **용도별 추가 지시 4종** — 기술 절차형 / 회의록형 / WBS형 / 문서 요약형

이 담겨 있다. 즉 "AI가 만든 글 → 마인드맵" 통로를 여는 열쇠다.

### 1.2 테스트 절차

1. 저장소에서 `docs/04-extensions/ai/emm-prompt-templates.md`를 연다
   (GitHub 웹에서 열어도 된다).
2. **§2 공통 코어 프롬프트** 코드 블록 전체를 복사한다.
3. ChatGPT(또는 Claude)에 붙여넣고, 이어서 **§3.1 기술 절차형** 블록도
   붙여넣은 뒤, 마지막 줄에 원하는 주제를 쓴다. 예:

   > Docker로 WordPress 설치하는 절차를 위 규칙대로 만들어줘

4. AI가 출력한 Markdown 전체를 복사해 메모장에 붙여넣고
   **`test.md`** 로 저장한다 (인코딩: UTF-8).
5. EasyMindMap(§0.3)에서 **새 맵 → MD 파일 불러오기** → `test.md` 선택.

### 1.3 성공 판정

- 마인드맵이 뜨고, 중심 주제 1개 + 절차가 2레벨 노드들로 배치된다.
- 명령어는 노드 옆 **C 배지**(코드 노트 — 클릭하면 팝업), 설명문은
  **T 배지**(문단 노트), 표는 **⊞ 배지**로 들어가 있다.
- 회의록형(§3.2)·WBS형(§3.3)·요약형(§3.4)도 같은 방법으로 확인한다.

> 참고: 각 템플릿의 "기대 출력 예시" 4종은 적합성 코퍼스
> (`packages/emm-parser/conformance/cases/prompt-*.md`)로 편입되어
> 있어서, §2의 자동 테스트가 항상 함께 검증한다.

---

## 2. 적합성 코퍼스 테스트

### 2.1 무엇을 하는 기능인가?

**코퍼스(corpus)** = 검증용 실제 문서 모음. 전자영수증 보고서(176노드),
ChatGPT 대화 내보내기(299노드), 견출 없는 순번 절 문서(96노드) 같은
**실문서 7종 + AI 프롬프트 기대 출력 4종 = 11케이스**가
`packages/emm-parser/conformance/cases/`에 들어 있다.

자동 테스트(러너)는 케이스마다 3가지를 검사한다:

1. **파싱 스냅숏** — 문서를 맵으로 변환한 결과가 저장된 기대 결과
   (`expected/*.json`)와 완전히 같은가 (파서가 몰래 바뀌면 즉시 탐지)
2. **메타데이터 무손실 왕복** — 맵 → MD로 내보냈다가 메타데이터로
   다시 읽으면 **원본과 100% 동일**한가 (EMM-Full 보장)
3. **본문 왕복** — 메타데이터를 지우고 본문만 다시 읽어도 노드 수가
   기록된 값과 같은가 (EMM-Basic 보장)

CommonMark가 표준이 된 비결이 "명세 + 테스트 세트"였듯이, 이 코퍼스가
**"이걸 통과하면 EMM 호환"이라는 판정 기준** 역할을 한다.

### 2.2 테스트 절차 (명령 한 줄)

```bash
cd packages/emm-parser
npm install     # 처음 한 번만 — 테스트 도구 설치 (몇 초)
npm test
```

### 2.3 성공 판정

다음과 같은 출력이 나오면 성공:

```
PASS chatgpt-export.md — nodes=299 bodyRT=324
PASS numbered-sections.md — nodes=96 bodyRT=96
...(11줄)...

11/11 cases passed
```

- `nodes` = 그 문서가 만든 노드 수, `bodyRT` = 본문만 다시 읽었을 때의
  노드 수 (링크·노트가 본문에서 일반 문단으로 다시 읽히는 케이스는
  숫자가 다를 수 있으며, 그 값 자체가 스냅숏으로 고정되어 있다).
- 하나라도 `FAIL`이면 파서가 회귀(regression)했다는 뜻이다.

### 2.4 (선택) 탐지 능력 직접 실험

테스트가 진짜로 감시하고 있는지 확인해 보고 싶다면:

1. `conformance/cases/prompt-tech.md`를 메모장으로 열어 견출 하나를
   아무렇게나 고친다.
2. `npm test` → 그 케이스가 **FAIL**로 바뀐다 (탐지 성공).
3. 실험을 되돌린다:

```bash
git checkout -- conformance/cases/prompt-tech.md
npm test        # 다시 11/11
```

---

## 3. emm-parser 패키지 + CLI 테스트

### 3.1 무엇을 하는 기능인가?

지금까지 MD↔맵 변환기는 EasyMindMap 앱 **안에만** 있었다.
`packages/emm-parser`는 그 변환기를 **독립 부품(라이브러리)**으로
분리한 것이다:

- 브라우저 없이 **Node.js만으로** 동작한다 (서버·CLI·다른 도구에서 사용 가능)
- 앱은 이 패키지를 다시 가져다 쓰므로 **앱과 부품이 항상 같은 규칙**을 쓴다
- 나중에 npm 공개(`@easymindmap/emm-parser`), VS Code 확장, Obsidian
  플러그인이 전부 이 부품 위에서 만들어진다

**CLI**(Command Line Interface)는 이 부품을 터미널에서 바로 써보는
미니 도구다: `convert`(변환) / `validate`(검사).

### 3.2 테스트 절차

`packages/emm-parser` 폴더에서 (§2.2의 `npm install`이 되어 있어야 함):

**(a) MD → 맵 JSON 변환**

```bash
npx tsx cli.ts convert conformance/cases/prompt-tech.md -o test.json
```

→ `test.json — 14 nodes` 라고 나오고, `test.json`을 열면 맵 구조(JSON)가
보인다. **브라우저·앱 없이 변환된 것**이 핵심이다.

**(b) 맵 JSON → MD 역변환**

```bash
npx tsx cli.ts convert test.json -o test.md
```

→ `test.md`를 열면 Markdown 본문 + 파일 끝에 `easymindmap:v1:...`
메타데이터 주석이 보인다.

**(c) 유효성 검사**

```bash
npx tsx cli.ts validate test.md
```

성공 판정:

```
VALID (EMM-Basic) — 구조 파싱 성공
  중심 주제: Ubuntu Apache + SSL 구축
  노드 수(본문): 14
VALID (EMM-Full) — 메타데이터로 무손실 복원 가능
```

**(d) 앱↔부품 순환 테스트 (종합)**

1. EasyMindMap 앱에서 아무 맵이나 **내보내기(MD)** 로 저장
2. 그 파일을 `validate` → `VALID (EMM-Full)` 확인
   (앱과 CLI가 같은 파서를 쓴다는 증거)
3. `convert`로 JSON까지 만들었다가 다시 MD로 되돌리고
4. 그 파일을 앱의 **새 맵 → MD 파일 불러오기**로 열기
5. 어느 단계에서도 내용이 달라지지 않으면 전체 시스템이 맞물려 도는 것

---

## 4. 마지막 확인 — 앱이 안 바뀌었는지

파서 분리 작업은 부품을 "밖으로 꺼낸" 것이라 **앱의 동작은 이전과
100% 동일해야 정상**이다. 평소처럼 MD 불러오기/내보내기, 기사
붙여넣기, HTML 내보내기를 해 보고 이전과 다른 점이 보이면 그것은
버그이므로 이슈로 알린다.

## 5. 문제가 생겼을 때

| 증상 | 원인·해결 |
|---|---|
| `node: command not found` | Node.js 미설치 — §0.1 |
| `npm install`이 느리거나 실패 | 네트워크 확인 후 재시도 |
| `npm test`에서 FAIL | 파서/코퍼스가 수정됨 — `git status`로 바뀐 파일 확인, 실험이었다면 `git checkout -- <파일>`로 복원 |
| CLI에서 `인식할 마인드맵 구조가 없습니다` | 입력 파일에 견출(`#`)이 하나도 없는 경우 — 첫 줄에 `# 제목`을 추가 |
| 앱에서 MD 불러오기 결과가 이상함 | 그 `.md` 파일을 첨부해 이슈로 제보 (코퍼스에 케이스로 추가해 재발 방지) |
