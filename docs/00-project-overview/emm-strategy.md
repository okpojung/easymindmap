# mmd(Mindmap Markdown) 표준화 · 오픈소스 · 사업화 전략

* 문서 버전: v1.0
* 최초 작성: 2026-07
* 관련: `docs/04-extensions/emm-spec.md`(포맷 스펙),
  `docs/00-project-overview/vision.md`, `roadmap.md`

---

## 1. 재정의된 포지셔닝 (2026-09-25 개정)

> **emm(EasyMindMap)은 마인드맵 "작성 도구"가 아니라,
> 마인드맵 Markdown 표준(mmd)의 레퍼런스 애플리케이션이며,
> 그 표준 위의 emm 프로파일을 정의하는 제품이다.**

- Markdown에는 CommonMark(핵심 명세)와 GFM(사실상 산업 표준)이 있지만,
  **마인드맵을 표현하는 Markdown 표준은 존재하지 않았다.**
  Mermaid는 레이아웃·콘텐츠 표현이 없고, Markmap은 단순 트리이며,
  FreeMind 계열은 XML이라 웹·AI 생태계와 맞지 않는다.
- 그 공백을 채우는 표준은 **이 저장소 밖에서** 만든다 —
  [`mindmapmarkdown/spec`](https://github.com/mindmapmarkdown/spec). 사양·적합성
  스위트·RFC 절차가 공개되어 있고, 레퍼런스 구현은 `mindmapmarkdown/mindmapmd`
  다. **한 회사의 포맷이 아니라는 것이 채택의 조건**이라, 표준과 제품을
  저장소부터 분리했다.
- 그래서 easymindmap 의 자리는 "파일 포맷을 가진 쪽"이 아니라 **"표준을 가장
  먼저, 가장 잘 구현한 쪽"**이다. 표준이 퍼질수록 이 제품의 시장이 커진다.
- emm 프로파일 — 표준을 따르는 본문 + `emm` 선언 블록 — 는 기존 생태계
  (GitHub·Obsidian·Notion)에서 **그대로 읽히면서** 맵 정책을 함께 싣는다.
  기존 생태계를 적으로 만들지 않고 위에 올라탄다.

---

## 2. 우리가 이미 가진 것 (자산 인벤토리)

표준화 경쟁에서 말(스펙)보다 강한 것은 **작동하는 구현체 + 테스트**다.

| 자산 | 상태 |
|---|---|
| 표준 | `mindmapmarkdown/spec` — 사양·적합성 스위트·RFC 절차 (이 저장소 밖) |
| emm 프로파일 스펙 | `emm-spec.md` v1.0 Draft + `markdown-export.md` 구현 규칙서 + `mindmap-markdown-alignment.md` 정렬 결정 |
| 레퍼런스 구현 | importMarkdown / exportMarkdown / mapMeta (MD ↔ 맵 무손실 왕복) |
| 렌더러 2종 | 에디터(SVG 캔버스) + Standalone HTML 뷰어 (파리티 유지) |
| 적합성 코퍼스 | **전량 합성** 12케이스(보고서형 19노드 · 대화 내보내기 24노드 · 순번 절 19노드 등 문서형 8종 + AI 프롬프트 기대 출력 4종) + 자동 E2E — 실사용·개인 문서는 저장소에 포함하지 않는다(2026-08-04 실문서 3종 합성 교체) |
| AI 친화성 | 본문이 순수 MD → LLM이 별도 학습 없이 유효한 mmd 생성 가능 |
| 콘텐츠 파이프라인 | 웹 기사 붙여넣기(사진 위치 보존·다운로드 내장) 등 "지식 수집 → 구조화" 흐름 |

---

## 3. 표준화 로드맵 (4단계)

"처음부터 국제 표준"이 아니라 **내부 사양 → 공개 구현 → 생태계 →
사실상 표준** 순서로 간다.

### 1단계 — 사양 고정 (현재)

- [x] emm 프로파일 v1.0 Draft 공개 (`emm-spec.md`)
- [ ] 표준 0.1.0 태그 뒤 프로파일을 그 판에 맞추기
- [x] 변환 규칙 단일 명세 운영 (`markdown-export.md` — 구현과 동기)
- [x] 적합성 코퍼스 + 자동 회귀
- [ ] 스펙 영문판 (공개 시점에 병행)

### 2단계 — 레퍼런스 파서 오픈소스 분리

- [x] `packages/emm-parser` 로 파서/직렬화기를 앱에서 분리 — CLI·적합성
  스위트 포함 (완료 2026-07, §7-2 참조)
- [ ] npm 공개 배포 · 공개 리포 분리
  (npm: `@easymindmap/emm-parser` — MD↔JSON, 의존성 최소)
- 적합성 테스트 스위트를 패키지에 동봉 (입력 md → 기대 JSON → 왕복)
- CLI 제공: `emm convert doc.md --to json|html`, `emm validate doc.md`
- 저장소 구성: 스펙 + 파서 + 테스트를 담은 공개 리포
  (예: `easymindmap/emm`) — 제품 리포와 분리해 "벤더 중립" 인상 확보

### 3단계 — 생태계 연동 (성공 사례 1개가 관건)

우선순위 순:

1. **VS Code 확장** — .md를 mmd 뷰로 미리보기 (개발자 접점 최대)
2. **Obsidian 플러그인** — Vault의 md를 마인드맵으로 열기/저장
   (30-obsidian-integration.md 와 합류)
3. **GitHub README 뷰어** — 공개 URL로 `github.com/...md`를 맵 렌더링
4. AI 도구 연동 — "ChatGPT/Claude 출력 → mmd 붙여넣기" 가이드·프롬프트
   템플릿 공개 (LLM이 mmd를 만들게 하는 것이 최고의 보급)

### 4단계 — 사실상 표준화

- 표준의 변경 제안은 **`mindmapmarkdown/spec` 의 RFC 절차**로 한다 — 이
  저장소에서 별도 RFC 를 운영하지 않는다. 제품에서 발견한 문제는 그쪽 이슈로
  올린다(실제 예: spec#35·#42·#45)
- easymindmap 은 표준의 **첫 구현**으로서 적합성 주장을 등급과 판으로 공개한다
- Extension Registry (`emm-core`/`emm-note`/`emm-media`/`emm-project`…)
  — 제3자 도구가 부분 채택 가능하게
- 타 도구의 mmd 읽기/쓰기 지원 획득이 "표준 달성"의 정의

---

## 4. 오픈소스 / 유료 경계 (오픈코어 모델)

> 원칙: **포맷과 파서는 완전 개방, 운영·협업·AI·호스팅으로 수익화.**
> 포맷이 퍼질수록 SaaS의 시장이 커진다 — 상충이 아니라 상승 구조.

### 4.1 오픈소스로 공개 (Apache-2.0 권장)

| 대상 | 이유 |
|---|---|
| emm 프로파일 스펙 + 적합성 코퍼스 | 구현의 신뢰 기반. 표준 사양과 적합성 스위트는 `mindmapmarkdown/spec` 에 따로 공개되어 있다 |
| emm-parser (MD↔JSON) + CLI | 채택 장벽 제거, 제3자 도구의 진입로 |
| Standalone HTML 뷰어 | "받은 파일을 누구나 열 수 있다" = 포맷 신뢰 |
| 문서·예제·프롬프트 템플릿 | AI 생태계 보급 |

라이선스: 코드 **Apache-2.0**(특허 조항 포함, 기업 채택 친화),
스펙 문서 **CC BY 4.0**. 상표 "EasyMindMap"/"emm" 명칭·로고는 별도
상표 정책으로 보호(포맷 이름은 자유 사용, 제품명 사칭 금지).

### 4.2 유료 SaaS (easymindmap 웹서비스)

| 대상 | 비고 |
|---|---|
| 실시간 협업 (동시 편집·커서·Soft Lock·채팅) | 25/26-collaboration |
| AI 마인드맵 생성·확장·요약 | 18/19-ai |
| 클라우드 저장·버전 히스토리·팀/권한·감사 | 서버 자산 |
| 퍼블리시/공유 (공개 URL, 대시보드) | 27-publish |
| 대용량 워크스페이스·엔터프라이즈 연동 (Redmine 등) | 31-integrations |
| 첨부파일 스토리지 (사진 서버 내장 100%) | CORS 제약 해소 |

무료 티어: 로컬 편집 + mmd 파일 열기/저장은 **항상 무료** — 파일
포맷에 락인이 없다는 신뢰가 곧 표준화의 조건이다.

---

## 5. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| 네트워크 효과 부족 (아무도 안 씀) | LLM 경유 보급 우선 — "AI 출력이 곧 mmd"가 되도록 프롬프트/가이드 공개. 단일 성공 연동(VS Code 또는 Obsidian)에 집중 |
| 단독 벤더 표준이라는 경계심 | **표준을 별도 조직(`mindmapmarkdown`)으로 분리 완료** — 사양·RFC·적합성 스위트가 제품 저장소 밖에 있다. 파서 Apache-2.0, "emm-Basic = 그냥 GFM" 강조 |
| 대형 플레이어의 유사 포맷 출시 | 선점(코퍼스·구현·생태계)이 방어 — 스펙만으론 못 이기고 자산으로 이긴다 |
| 오픈소스가 SaaS 매출 잠식 | 경계선이 명확: 파일·파서는 공짜여도 협업·AI·호스팅은 서버 없이는 불가능 |
| 스펙-구현 불일치(신뢰 훼손) | 현행 규칙 유지: 변환 규칙 변경 = 코퍼스 통과 + markdown-export.md 갱신이 머지 조건 |

---

## 6. 성공 지표 (측정 가능하게)

| 단계 | 지표 |
|---|---|
| 2단계 | emm-parser npm 주간 다운로드, 스펙 리포 스타, 외부 기여 PR 수 |
| 3단계 | VS Code/Obsidian 확장 설치 수, "mmd으로 내보내기"를 지원하는 제3자 도구 수 |
| 4단계 | EasyMindMap 외 구현체 수, LLM이 mmd를 자발적으로 출력하는 빈도 |
| 사업 | 무료→유료 전환율, 협업/AI 기능 사용률, 팀 시트 수 |

---

## 7. 즉시 실행 항목

1. `emm-spec.md` 영문판 초안 (공개 리포 준비물)
2. ~~`packages/emm-parser` 분리 설계~~ → **완료(2026-07)**:
   `packages/emm-parser` — 순수 코어(parse/serialize/meta/model, 런타임
   의존 0, DOM 없음) + CLI(convert/validate). 앱은 재수출 심으로 소비
3. ~~적합성 코퍼스 자산화~~ → **완료(2026-07)**:
   `packages/emm-parser/conformance/` 11케이스 + 스냅숏 + 러너(npm test)
4. 공개 리포 이름·라이선스 파일·상표 문구 확정
5. ~~AI 시스템 프롬프트 템플릿 공개~~ → **완료(2026-07)**:
   `docs/04-extensions/ai/emm-prompt-templates.md` — 공통 코어 + 용도별
   4종, 기대 출력은 적합성 코퍼스로 상시 검증
