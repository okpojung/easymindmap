# MCP 커넥터 — AI 대화에서 바로 맵으로 (방법 C)

> **이 문서가 정하는 것**: EasyMindMap 을 **원격 MCP 서버**로 노출해,
> Claude·ChatGPT 대화 안에서 *"이 내용을 맵으로 저장해줘"* 한 마디로
> 문서함에 맵이 생기게 하는 설계. 노출할 도구 목록 · 인증 방식 ·
> 오픈코어 경계 · 단계.
>
> **정하지 않는 것**: 각 사(Anthropic·OpenAI) 커넥터 등록 절차의 세부.
> 그쪽 규격은 자주 바뀌므로 **구현 착수 시점에 각 사 최신 문서를 보고**
> 맞춘다(§8). 이 문서는 **우리 쪽에서 정할 수 있는 것**만 정한다.
>
> 작성: 2026-09-04 · 출처: `web-ai-clipboard.md` §9 백로그(task #100)

---

## 1. 왜 하는가 — 방법 A 로는 닿지 않는 자리

지금 웹 AI 통로는 **방법 A(클립보드 왕복)** 다. 잘 돌고 있고 어떤 AI 든
쓸 수 있지만, 사용자 손이 세 번 간다.

```
[EasyMindMap] ①프롬프트 복사 → [AI 웹] 붙여넣기·실행
[EasyMindMap] ③맵 생성       ← [AI 웹] ②답변 복사
```

**대화가 길어질수록 이 왕복이 거슬린다.** 특히 답변을 받은 뒤 "여기에
이것도 추가해줘" 를 반복하면, 그때마다 복사·붙여넣기를 다시 해야 한다.

### 먼저 접은 길 두 가지 — 왜 안 되는지 적어 둔다

이 자리를 자동화하려는 시도는 반복해서 나온다. 매번 다시 따지지 않도록
**되는 것과 안 되는 것**을 근거와 함께 남긴다.

| 방안 | 판정 | 이유 |
|---|---|---|
| 앱 안에 AI 사이트를 **iframe** 으로 띄우고 조작 | **원리적으로 불가** | ① 대상이 임베드를 거부한다 — `claude.ai` 실측: `x-frame-options: SAMEORIGIN` ② 설령 떠도 **동일 출처 정책**으로 iframe 내부 DOM 을 읽거나 쓸 수 없다. 헤더 문제가 아니라 브라우저 보안의 근간이라 우회로가 없다 |
| **브라우저 확장**(크롬 확장 · Tampermonkey) 으로 AI 화면 자동화 | **기술은 되나 택하지 않는다** | 기술 장벽은 없다(content script 는 동일 출처 정책 밖). 그러나 ⑴ 소비자 웹 UI 자동화는 **각 사 약관에 저촉될 소지**가 있고 그 피해(계정 정지)가 **사용자에게 간다** ⑵ AI 사이트가 화면을 바꾸면 **그날로 깨진다** — 세 곳을 지원하면 세 배 ⑶ 사용자가 "내 AI 계정을 조작하는 확장"을 따로 깔아야 한다 |

> Tampermonkey 는 확장의 열등판이다. 위 ⑴⑵ 를 그대로 안으면서 설치
> 단계만 하나 더 는다. 개인 도구로는 합리적이지만 제품 기능은 아니다.

### 방법 C 는 방향이 반대다

**AI 를 우리 안으로 끌어오는 대신, 우리를 AI 쪽에 도구로 등록한다.**

```
[Claude / ChatGPT 대화]
   "지금까지 정리한 걸 EasyMindMap 맵으로 저장해줘"
        │
        │  MCP (각 사가 공식 지원하는 통로)
        ▼
[EasyMindMap MCP 서버]  →  기존 /v1 API  →  문서함에 맵 생성
```

| | 확장 방식 | **방법 C (MCP)** |
|---|---|---|
| 약관 | 저촉 소지 | **각 사가 공식 지원** |
| 화면 변경 | 깨진다 | 무관 — API 계약 |
| 설치 | 확장 설치 | 계정에서 커넥터 연결 |
| 대화 맥락 | 질문만 전달 | **대화 전체를 맵으로** |
| 부수 효과 | 없음 | 스토어 노출 = **신규 유입 채널** |

---

## 2. 무엇을 노출하는가 — 도구 목록

MCP 서버가 AI 에게 주는 것은 **도구(tool) 목록**이다. 각 도구는 기존
`/v1` 엔드포인트를 얇게 감싼다. **새 비즈니스 로직을 만들지 않는다** —
쿼터·권한·잠금 같은 규칙이 두 벌이 되면 반드시 어긋난다.

### 2-1. 1·2단계에 넣은 것 (셋 다 있다, 2026-09-05)

| 도구 | 감싸는 API | 하는 일 |
|---|---|---|
| `create_map` | `POST /v1/maps` + `PUT /v1/maps/:id/document` | **EMM 마크다운을 받아 새 맵으로 저장.** 이것 하나가 이 기능의 목적 전부다 |
| `list_maps` | `GET /v1/maps` + `GET /v1/maps/shared` + `GET /v1/folders` | 내 맵 목록 (제목·**맵 id**·폴더 이름·수정일·노드 수) + 공유받은 맵. `query`(이름·본문 검색) · `folder`(폴더 이름, `home`) · `limit`. AI 가 "어느 맵을 읽을까" 를 정할 수 있게 — **2단계, §9.5** |
| `get_map` | `GET /v1/maps/:id/document` | 맵 한 개를 **EMM 마크다운(본문만, 메타 주석 없음)** 으로 돌려준다. 읽기만 — 편집 잠금을 만들지 않는다. 대화에서 기존 맵을 읽고 이어 쓰기 — **2단계, §9.5** |

**`create_map` 이 받는 것은 EMM 마크다운**이다. `packages/emm-parser` 가
이미 그 포맷의 단일 원본이고, 프롬프트 템플릿(`emm-prompt-templates.md`)
이 AI 에게 그 포맷을 가르치고 있다. **같은 규격을 그대로 쓴다.**

### 2-2. 2단계 이후 (검토)

| 도구 | 왜 미루나 |
|---|---|
| `append_to_map` | 기존 맵에 가지를 덧붙인다. **편집 잠금**(`map_edit_locks`)과 부딪힐 수 있어 규칙을 먼저 정해야 한다 — 사람이 편집 중인 맵을 AI 가 고치면 안 된다 |
| `search_maps` | 본문 검색. 유용하지만 1단계 목적이 아니다 |
| 첨부 관련 | 파일을 AI 가 올리는 경로는 쿼터·용량 판정이 얽힌다. 별건 |

### 2-3. 넣지 않을 것

- **삭제·계정 조작** (`DELETE /v1/maps/:id`, `DELETE /v1/account` …) —
  대화 한 마디로 지워지면 안 된다. **되돌릴 수 없는 것은 노출하지 않는다.**
- **관리자 API** (`/v1/admin/*`) — 논의할 여지가 없다.

---

## 3. 인증 — 누가 요청하는지 어떻게 아는가

MCP 서버도 결국 `/v1` API 를 부른다. **지금 인증 구조를 그대로 쓴다.**

```
현행:  Authorization: Bearer <GoTrue JWT>
       → AuthGuard 가 SUPABASE_JWT_SECRET 으로 검증(HS256)
       → sub 클레임 = 사용자 id, 없으면 JIT 프로비저닝
```

문제는 **AI 쪽에서 그 JWT 를 어떻게 얻느냐**다. 두 길이 있다.

### 안 A — OAuth 2.1 (원격 MCP 의 표준 방식) ★ 권장

사용자가 커넥터를 연결할 때 EasyMindMap 로그인 화면으로 넘어가 승인하고,
AI 클라이언트가 액세스 토큰을 받아 보관한다.

- **장점**: 사용자가 토큰을 손으로 다룰 일이 없다. 각 사가 기대하는 방식
  이라 스토어 등재에도 유리하다. 권한 범위(scope)를 걸 수 있다
- **비용**: **OAuth 서버(인가 엔드포인트 + 토큰 발급)를 우리가 세워야
  한다.** GoTrue 는 사용자 로그인을 처리하지 그 자체가 OAuth 제공자는
  아니다 — 이 부분이 이번 작업에서 **가장 큰 덩어리**다

### 안 B — 개인 액세스 토큰 (PAT)

사용자가 EasyMindMap 계정 화면에서 토큰을 발급받아 커넥터 설정에
붙여넣는다.

- **장점**: 훨씬 작다. 토큰 표 하나 + 발급/폐기 화면이면 된다
- **단점**: 사용자가 토큰을 복사·보관해야 한다(방법 A 의 복사 왕복을
  줄이려다 다른 복사를 만드는 셈). 스토어 등재 요건에 맞지 않을 수 있다

> **권고: 안 B 로 시작해 안 A 로 간다.** 안 B 는 며칠이면 붙고 **동작을
> 실제로 확인**할 수 있다. 도구 정의와 EMM 왕복이 쓸 만한지 먼저 재고,
> 그것이 증명된 뒤에 OAuth 를 세우는 편이 안전하다. 안 A 를 먼저 하면
> 큰 인증 작업을 끝내고 나서야 "도구가 쓸 만한가"를 알게 된다.

### 어느 쪽이든 지켜야 할 것

- **요금제 쿼터가 그대로 걸린다.** MCP 로 만든 맵도 `users.quota_bytes`
  를 소비한다. 우회로가 되면 안 된다
- **`AUTH_MODE=dev` 에서는 MCP 를 열지 않는다.** dev 는 헤더 하나로
  아무 사용자나 되는 모드다(`auth.guard.ts`). 외부에 노출하면 안 된다
- **토큰 폐기 수단**이 발급과 같은 화면에 있어야 한다

---

## 4. 전송 방식과 배치

원격 MCP 는 HTTP 로 말한다. **기존 NestJS API 안에 붙일지, 별도
프로세스로 뺄지**가 갈림길이다.

| | API 안에 (`/mcp` 라우트) | 별도 프로세스 |
|---|---|---|
| 배포 | Coolify 앱 하나 그대로 | 앱 하나 더 (도메인·인증서·감시) |
| 인증 | `AuthGuard` 재사용 | 토큰 검증을 다시 구현 |
| 장애 | **API 가 죽으면 같이 죽는다** | 따로 산다 |
| 부하 | 같은 프로세스 | 격리 |

**권고: 기존 API 안에 붙인다.** 지금 규모에서 프로세스를 늘리는 값이
격리 이득보다 크다. 트래픽이 문제가 되면 그때 떼어낸다 — 라우트가
분리돼 있으면 떼는 것은 어렵지 않다.

---

## 5. 오픈코어 경계 — **공개로 정했다** (2026-09-04)

`open-core-boundary.md` §3 표에서 "각종 플러그인 · 외부 연동"은 유료다.
그런데 §3.1 의 가르는 질문을 대면 답이 갈린다.

> **"이걸 빼면 팔 것이 없어지나, 돌릴 수가 없어지나?"**

MCP 를 빼도 공개판은 돌아간다(맵 저장·문서함 다 된다). 그렇다고 **파는
물건**도 아니다 — 파는 것은 협업·WBS 지 맵 저장이 아니다. 둘 중 어느
쪽도 딱 맞지 않는다.

| 안 | 근거 |
|---|---|
| **공개** ★ 권고 | 노출하는 기능이 **전부 MVP**(맵 생성·조회·문서 저장)다. 새 제품 기능이 아니라 **기존 MVP 로 가는 다른 문**이다. 게다가 §9 가 기대한 이득 중 하나가 **스토어를 통한 신규 유입**인데, 유입 장치를 유료로 막으면 목적과 어긋난다. 셀프호스트 사용자가 자기 서버에 세운 EasyMindMap 을 자기 AI 에 연결하지 못하면 §3.1 ① 이 말한 "반쪽"이 된다 |
| 유료 | §3 표의 "외부 연동"을 글자 그대로 적용 |

> ★ **결정: 공개** (사용자, 2026-09-04). 코드는 `okpojung/easymindmap`
> 에 둔다 — `apps/api/src/mcp/` 와 `apps/frontend/.../McpTokensView.tsx`.
> 위 표의 권고와 같은 이유다: 노출하는 것이 전부 MVP 기능이고, 셀프호스트
> 사용자가 자기 서버를 자기 AI 에 연결하지 못하면 반쪽이 된다.
>
> 되돌리기 어려운 결정이라 여기 남긴다 — 한 번 공개한 것은 되돌릴 수
> 없다(이미 받아 간 사람의 사본은 사라지지 않는다). 나중에 이 판단이
> 바뀌더라도 **이미 나간 1단계는 공개판에 남는다**; 그때는 그 위에
> 얹는 것(팀 공유 도구 등)을 유료로 가른다.

---

## 6. 무엇이 이미 있고, 무엇을 새로 만드나

**이미 있는 것 — 다시 만들지 않는다**

| | 어디 |
|---|---|
| 맵 생성·문서 저장 API | `POST /v1/maps` · `PUT /v1/maps/:id/document` |
| JWT 검증 + JIT 사용자 생성 | `common/auth/auth.guard.ts` |
| EMM 마크다운 ↔ 맵 변환 | `packages/emm-parser` (`parseEmm`/`serializeEmm`) |
| AI 에게 EMM 을 가르치는 프롬프트 | `emmSystemPrompt.ts` · `emm-prompt-templates.md` |
| 쿼터·요금제 판정 | `users.quota_bytes` + `plan_quota_bytes()` |

**새로 만드는 것**

1. MCP 프로토콜 계층 (도구 목록 응답 · 도구 호출 라우팅)
2. 도구 3개의 얇은 어댑터 (§2-1)
3. 인증 — 안 B 면 토큰 표 + 발급/폐기 화면, 안 A 면 OAuth 서버
4. 커넥터 등록 (각 사 콘솔) + 사용자 안내 문서

---

## 7. 단계

각 단계가 **끝나면 확인할 수 있는 것**을 함께 적는다.

| 단계 | 무엇 | 끝나면 확인되는 것 | 상태 |
|---|---|---|---|
| **0** | 오픈코어 경계 결정 (§5) | 코드를 어느 저장소에 둘지 | ✅ **공개**(2026-09-04) |
| **1** | PAT 발급/폐기 + `create_map` 하나 | **Claude 대화에서 맵이 하나 생긴다.** 이것으로 방향이 옳은지 판정한다 | ✅ **판정 끝** — 사용자 PC 의 Claude Code(데스크톱 앱 Code 탭)에서 api-dev 에 붙여 맵 생성 확인 (2026-09-05, §7 판정) |
| **2** | `list_maps` · `get_map` | 기존 맵을 대화에서 이어 쓴다 | ✅ 구현·검증 (2026-09-05, §9.5 · e2e209 — Claude Code 대화에서 목록 → 읽기 2회 호출 확인) |
| **3** | OAuth 2.1 (안 A) | 토큰 복사 없이 연결된다 | — |
| **4** | 각 사 스토어 등재 | 신규 유입 채널 | — |

**1단계에서 멈출 수 있어야 한다.** 1이 쓸 만하지 않으면 2~4 를 하지
않는 것이 맞다. 그래서 코드가 **한 폴더에 모여 있다**(`apps/api/src/mcp/`
+ 프런트 화면 하나 + 표 하나) — 아니라고 판정되면 그 폴더와 메뉴 한 줄을
지우는 것으로 끝난다. 다른 모듈이 이쪽을 부르지 않는다.

> **판정 (2026-09-05)**: 1단계의 성공 기준 *"Claude 대화에서 맵이 하나
> 생긴다"* 를 **진짜 MCP 클라이언트로 확인했다** — Claude Code(2.1.261)에
> `claude mcp add` 로 붙이고 헤드리스 대화(`claude -p`)에서 `create_map` 이
> 불려 문서함에 맵이 생겼다(e2e208 · §9.2 ②-A). `curl` 재현(e2e194)이
> 못 보던 것 — 클라이언트 쪽 `initialize`·`notifications/initialized`
> 순서, `Accept: application/json, text/event-stream`, GET SSE 시도에
> 405 로 답해도 끊지 않는지 — 가 실제로 통과됐다.
>
> **아직 남은 것은 claude.ai(웹·데스크톱) 커스텀 커넥터**다. 그 화면은
> 토큰을 붙여넣는 칸이 없고 **OAuth 로만** 붙는다(§9.2 ②-C) — 3단계(안 A)
> 몫이다. 1단계 판정에는 필요하지 않다: 방향이 옳은지는 Claude Code 로
> 이미 알 수 있다.
>
> **사용자 확인 (2026-09-05)**: 사용자 PC(Windows · PowerShell)에서
> `claude mcp add … --header … -s user` 로 api-dev 에 등록 → 데스크톱 앱
> Code 탭 로컬 세션에서 대화로 맵 생성 → 문서함에서 열림. 1단계 성공
> 기준 충족. 등록 중 겪은 것 둘을 §9.3 에 남겼다(PowerShell 줄이음 · 자리표시
> 문자를 그대로 붙여넣음).

---

## 8. 확인이 필요한 것 — 지금 답할 수 없는 것

정직하게 남긴다. 아래는 **각 사 문서를 봐야** 답이 나온다. 구현 착수
시점에 확인한다.

1. **원격 MCP 의 인증 규격** — OAuth 2.1 의 어느 프로파일까지 요구하는지
   (동적 클라이언트 등록 필요 여부 등). 규격이 자주 바뀌었다
2. **Claude 커스텀 커넥터 등록 요건** — 어떤 요금제에서 쓸 수 있는지,
   심사가 있는지
3. **ChatGPT 쪽 통로** — 앱(구 플러그인)과 GPT Actions 중 어디에
   올릴지. 같은 MCP 서버를 두 곳에 쓸 수 있는지
4. **응답 크기 한계** — 큰 맵을 `get_map` 으로 돌려줄 때 잘리는 한계가
   있는지. 있으면 페이지네이션이 필요하다
   → **우리 쪽에서 먼저 잘랐다** (2026-09-05, §9.5): 본문 12만 자에서 자르고
   잘랐다는 문장을 붙인다. 각 사의 도구 응답 상한은 3단계 때 다시 본다

> 위 넷 중 **1과 2 는 안 A(OAuth) 착수 전에 반드시 확인**해야 한다.
> 잘못 만들면 통째로 다시 만든다. 안 B(PAT)로 시작하자는 권고(§3)의
> 이유이기도 하다.

---

## 9. 1단계 — 실제로 만든 것 (2026-09-04)

### 9.1 어디에 무엇이 있나

| | 자리 |
|---|---|
| MCP 본선 (JSON-RPC) | `apps/api/src/mcp/mcp.controller.ts` → `POST /v1/mcp` |
| JSON-RPC 계층 | `apps/api/src/mcp/jsonrpc.ts` (HTTP 와 무관한 순수 함수) |
| 도구 정의·실행 | `apps/api/src/mcp/mcp-tools.ts` (`create_map` · `list_maps` · `get_map`) |
| EMM → 문서 스냅샷 | `apps/api/src/mcp/emm-to-doc.ts` |
| PAT 발급·검증·폐기 | `apps/api/src/mcp/api-token.service.ts` · `public.api_tokens` |
| PAT 인증 가드 | `apps/api/src/mcp/mcp-auth.guard.ts` |
| 토큰 화면 API | `apps/api/src/mcp/mcp-tokens.controller.ts` → `/v1/mcp-tokens` |
| 토큰 화면 | `apps/frontend/src/components/auth/McpTokensView.tsx` (아바타 ▸ 🔌 AI 커넥터(MCP)) |
| 문서 스냅샷 → EMM (2단계 `get_map`) | `apps/api/src/mcp/doc-to-emm.ts` — `src/emm/serialize.ts`(직렬화기 복사본, `sync:emm` 이 함께 관리) |

**공식 SDK(`@modelcontextprotocol/sdk`)를 쓰지 않는다.** 이 앱은
`module=commonjs` 로 빌드되고, ESM 전용 패키지를 `require` 하면 런타임에
`ERR_REQUIRE_ESM` 으로 죽는다(2026-08-01 배포 실패 · `@nestjs/config@12`
되돌린 이유). 우리가 쓰는 메서드는 넷뿐이라 직접 적는 편이 싸다 —
3단계(OAuth) 때 다시 따진다.

> ★ **EMM 파서가 `apps/api/src/emm/` 에 복사돼 있다.** 원본은 그대로
> `packages/emm-parser` 다. 복사한 이유는 배포 구조다 — API 는
> **Nixpacks + Base Directory `apps/api`** 로 빌드돼 `packages/` 가
> 컨텍스트 밖이고(`dev-server-coolify.md` §5.2), 그 패키지는 아직
> npm 에 없다(`vault-mirror.md` §8 — `npm publish` 가 남아 있다).
> 프런트가 Dockerfile + 루트 컨텍스트로 옮겨 간 것이 같은 문제였다(§5.3).
>
> 두 벌은 갈라지므로 **CI 가 한 글자라도 다르면 실패시킨다**
> (`ci.yml` 의 `EMM 파서 복사본 검사`). 원본을 고쳤으면
> `cd apps/api && npm run sync:emm` 뒤 결과를 커밋한다.
> 나중에 API 도 루트 컨텍스트 Dockerfile 로 옮기거나 패키지를 배포하면,
> `src/emm/` 과 그 스크립트를 지우고 별칭 하나로 되돌린다.

### 9.2 붙이는 법

**① 토큰 발급** — 앱 우상단 아바타 ▸ **🔌 AI 커넥터(MCP)** ▸ 이름을 적고
[발급]. 원문은 **그 자리에서 한 번만** 보인다(서버에도 해시만 남는다).
같은 화면 아래에 발급한 토큰 목록과 **[폐기]** 가 있다.

**② 어디에 붙이나 — 클라이언트마다 다르다**

| | 값 |
|---|---|
| 주소 | `https://<API 주소>/v1/mcp` (앱 주소가 아니라 **API 주소**다) |
| 인증 | `Authorization: Bearer emm_…` (①에서 받은 원문) |

위 두 값을 받아 주는 클라이언트와 못 받는 클라이언트가 갈린다. **PAT 는
"헤더를 직접 적을 수 있는 클라이언트" 에서만 쓸 수 있다.**

| 클라이언트 | PAT(Bearer) | 상태 |
|---|---|---|
| **A. Claude Code** (터미널 · VS Code · 데스크톱 앱의 Claude Code) | ✅ `--header` | **검증됨** (e2e208, 2026-09-05) |
| **B. Claude Desktop** 의 로컬 MCP 설정(`claude_desktop_config.json`) | ✅ `mcp-remote` 다리 + `--header` | 규격상 된다 — 직접 확인은 안 했다 |
| **C. claude.ai 웹·데스크톱 [커스텀 커넥터 추가]** | ❌ 칸이 없다 — **OAuth 만** | **3단계**(안 A) 뒤에 |

**②-A Claude Code** — 토큰 원문을 헤더로 넘긴다. 한 번 등록하면 그 뒤로는
`claude` 를 열 때마다 붙는다.

```bash
# 등록 (--scope user 를 붙이면 어느 폴더에서 열어도 보인다)
claude mcp add --transport http easymindmap https://api-dev.mindmap.ai.kr/v1/mcp \
  --header "Authorization: Bearer emm_…" --scope user

# 붙었나 — "✓ Connected" 가 나와야 한다 (401 이면 토큰, 403 이면 dev 배포다: §9.3)
claude mcp list

# 대화 안에서는 /mcp 로 같은 것을 본다. 지우려면:
claude mcp remove easymindmap --scope user
```

> 토큰이 `~/.claude.json` 에 평문으로 남는다. 공용 PC 라면 쓰고 나서
> `claude mcp remove` 하고 앱에서 [폐기] 한다. 파일에 안 남기려면
> `--header "Authorization: Bearer ${EMM_TOKEN}"` 처럼 환경변수로 적어도
> 된다(Claude Code 가 `${VAR}` 를 헤더에서 펼친다).

**②-B Claude Desktop** — 데스크톱 앱의 로컬 MCP 설정은 stdio 명령만
받으므로 `mcp-remote` 를 다리로 둔다(`설정 ▸ 개발자 ▸ 설정 편집`).

```json
{
  "mcpServers": {
    "easymindmap": {
      "command": "npx",
      "args": ["mcp-remote", "https://api-dev.mindmap.ai.kr/v1/mcp",
               "--header", "Authorization:${EMM_AUTH}", "--transport", "http-only"],
      "env": { "EMM_AUTH": "Bearer emm_…" }
    }
  }
}
```

(`Authorization:${EMM_AUTH}` 에 **띄어쓰기를 넣지 않는다** — Windows 의
Claude Desktop 이 `args` 안의 공백을 깨뜨리는 버그가 있어 값은 `env` 로
넘긴다. `mcp-remote` README 의 안내다.)

**②-C claude.ai 커스텀 커넥터** — [설정 ▸ 커넥터 ▸ 커스텀 커넥터 추가]
는 이름·주소와 (고급) OAuth 클라이언트 ID/비밀만 받는다. 헤더 칸이 없어
**PAT 로는 붙을 수 없다.** 우리 서버가 401 을 주면 그 화면은 OAuth 를
찾다가 실패한다. 이것이 §3 이 "안 B 는 스토어 등재 요건에 맞지 않을 수
있다" 고 적어 둔 바로 그 자리이고, 3단계(OAuth 2.1)가 푸는 문제다.
(2026-09-05 기준 — 이 화면의 규격은 바뀔 수 있으니 3단계 착수 때 다시 본다.)

**③ 붙었는지 확인** — 어느 클라이언트든 등록 전에 손으로 먼저 확인할 수 있다.

```bash
# 도구 목록이 오면 붙은 것이다 (create_map 하나가 보여야 한다)
curl -s -X POST https://api-dev.mindmap.ai.kr/v1/mcp \
  -H 'Authorization: Bearer emm_…' -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

**④ 대화에서** — *"지금까지 정리한 걸 EasyMindMap 맵으로 저장해줘"*.
기존 맵은 *"내 EasyMindMap 맵 목록 보여줘"* → *"'주간 회의 정리' 맵 읽어서
…"* 처럼 부른다(AI 가 `list_maps` 로 id 를 찾고 `get_map` 으로 읽는다, §9.5).
Claude Code 는 처음 부를 때 도구 실행을 한 번 묻는다(허용). 답에
*"…맵을 만들었습니다 (가지 N개 · 노드 M개) · 맵 id …"* 가 오면 성공이고,
앱의 [☁ 내 문서] 홈에 그 제목의 맵이 보인다.
맵은 언제나 **최상위('홈')** 에 생긴다 — 폴더를 고르려면 폴더 목록 도구가
있어야 하는데 그것은 2단계다(§2-2).

### 9.3 열리지 않는 경우

| 증상 | 원인 · 할 일 |
|---|---|
| `403` "인증을 켠 배포에서만 동작합니다" | 그 서버가 `AUTH_MODE=dev` 다. **의도한 동작이다**(§3) — dev 는 헤더 하나로 아무 사용자나 되는 모드라 열면 안 된다. 토큰 화면에도 같은 안내가 뜬다 |
| `401` | 토큰이 틀렸거나 **폐기됐다.** 토큰 화면에서 새로 발급 |
| `Dynamic Client Registration rejected (HTTP 404) … Cannot POST /register` | **헤더 없이 등록됐다.** 서버가 401 을 주자 Claude Code 가 OAuth 로 붙으려다 우리에게 `/register` 가 없어 실패한 것 — 서버는 정상이다. PowerShell 에서 `\` 줄이음을 쓰면 첫 줄만 실행돼 이렇게 된다. `claude mcp remove` 뒤 **한 줄로** 다시 등록한다 |
| `Header 'Authorization' has invalid value` | 토큰 자리에 `emm_…` 같은 **자리표시를 그대로** 넣었다. 앱에서 받은 원문 전체(`emm_` + 영문·숫자 43자)를 넣는다 |
| 데스크톱 앱 MCP 화면의 [재인증] 이 "로그인을 시작할 수 없습니다" | 그 버튼은 **OAuth 서버용**이다. 토큰 헤더로 붙은 우리 서버에는 해당 없고 연결에도 영향 없다 — 누르지 않는다 |
| `405` | `GET` 으로 불렀다. JSON-RPC 는 **POST** 다(우리는 SSE 스트림을 열지 않는다) |
| 맵은 생겼는데 비어 있다 | 마크다운에 견출(`#`)이 없으면 애초에 거절된다 — 그 문장이 대화에 그대로 돌아온다 |
| 토큰 화면이 "서버 준비가 아직 끝나지 않았습니다" | 델타 SQL 을 아직 적용하지 않았다(아래). **다른 기능에는 영향이 없다** — 이 화면만 막힌다 |

### 9.4 델타 SQL — 표 하나가 는다

`public.api_tokens` 하나가 늘 뿐이다. **지우거나 바꾸는 것이 없다.**
두 번 실행해도 안전하다(`IF NOT EXISTS`).

```sql
CREATE TABLE IF NOT EXISTS public.api_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name         VARCHAR(60) NOT NULL,
    token_hash   CHAR(64) NOT NULL UNIQUE,
    prefix       VARCHAR(20) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS api_tokens_user_idx
    ON public.api_tokens (user_id, created_at DESC);

-- 적용됐는지 확인 (1 이 나오면 된다)
SELECT COUNT(*) AS ok FROM information_schema.tables
 WHERE table_schema='public' AND table_name='api_tokens';
```

**적용 전에도 앱은 죽지 않는다.** 토큰 화면이 `ready:false` 로 이유를
말하고, 맵·문서함·AI 생성은 그대로 돈다. 다만 `/v1/health` 는
`schema:"outdated"` + `missingTables:["api_tokens"]` 로 **적용이 남았음을
드러낸다** — 조용히 반쪽으로 도는 것보다 낫다.

---

### 9.5 2단계 — `list_maps` · `get_map` (2026-09-05)

**목적**: 대화에서 **기존 맵을 읽는다.** 1단계가 "대화 → 맵" 이었다면
2단계는 "맵 → 대화" 다. 이것으로 *"지난주 회의 맵 읽어서 이번 주 것과
합쳐 새 맵으로"* 같은 이어 쓰기가 된다 — 고친 결과는 여전히
`create_map` 으로 **새 맵**이 된다(제자리 수정은 없다, §2-3).

| 도구 | 감싸는 것 | 돌려주는 것 |
|---|---|---|
| `list_maps` `{query?, folder?, limit?}` | `MapsService.list`(내 맵) + `listShared`(공유받은 맵) + `FoldersService.list`(폴더 **이름**) | 줄 목록. `- 이름 — id: … · 폴더: … · 수정: … · 노드 N개`. 머리줄에 건수, 넘치면 "더 있습니다" |
| `get_map` `{map_id}` | `MapsService.getDocument` — **editSession 없이** | 머리줄(이름·id·수정·노드·사진 수·권한) + 빈 줄 + **EMM 본문** |

**정한 것과 이유**

- **결과는 JSON 이 아니라 글이다.** 읽는 쪽이 AI 라 표·JSON 보다 줄 목록이
  정확히 읽히고, id 가 줄마다 붙어 있어 `get_map` 에 그대로 넣는다.
- **폴더는 이름으로.** `folder: '기획'` 처럼 대화에서 쓰는 말 그대로 받고,
  없으면 **있는 폴더 이름을 나열해 거절**한다(AI 가 고쳐 부를 수 있게).
  같은 이름이 여러 층에 있으면 전부 잡는다. `home`·`홈`·`root` = 최상위.
- **공유받은 맵도 목록에** — "공유받음(주인 이메일)" 으로 표시. 폴더로
  좁힐 때는 뺀다(남의 폴더 배치는 내 트리가 아니다 — `GET /maps/shared`
  가 목록을 따로 둔 이유와 같다).
- **`get_map` 은 편집 잠금을 만들지 않는다.** `getDocument` 에 editSession
  을 주지 않는다 — 읽기가 사람이 편집 중인 맵의 잠금을 가로채면 안 된다
  (e2e209 ⑦b 가 `map_edit_locks` 0행을 확인한다).
- **메타 주석을 싣지 않는다.** `<!-- easymindmap:v1:BASE64 -->` 는 앱이
  되읽을 때 스타일·좌표를 살리는 용도라 AI 에게는 **읽을 수 없는 덩어리**
  이고, 큰 맵이면 본문보다 길다. `serializeEmm(map, {includeMeta:false})`.
- **사진 바이트를 주지 않는다.** data URL 은 `files/img-N.png` 경로로
  바뀌고(직렬화기 규칙) 머리줄에 "사진 N장" 만 센다.
- **12만 자에서 자른다** (`GET_MAP_MAX_CHARS`). 잘랐으면 그 사실과 앱의
  [내보내기 ▸ Markdown] 안내를 붙인다. 페이지네이션은 필요해지면 그때.
- **접근 판정은 `MapsService` 가 한다.** 남의 맵은 404 문장이 그대로
  `isError` 결과로 돌아가고 내용은 새지 않는다(e2e209 ㉓).
- **노드 수는 문서함과 같은 셈**(루트 포함 = `map_documents.node_count`).
  `create_map` 의 안내가 루트를 빼고 세고 있어 같이 맞췄다 — 같은 맵을
  세 도구가 다른 수로 말하면 AI 도 사용자도 헷갈린다.

**왕복은 "같은 내용"까지다 — "같은 모양"은 아니다.** `get_map` 본문은
EMM-Basic(메타 없음)이라 직렬화기 규칙대로 모양이 바뀐다: 목록 항목은
하위 견출로, 여러 줄 노드는 한 줄로, 표만 있는 노드는 `#### 표` 견출
아래 표로. 앱의 [내보내기 ▸ Markdown] 본문도 같은 규칙이다. 그래서 읽고
고쳐 `create_map` 으로 되넣으면 **글은 다 남되 표 노드에 `표` 라는 층이
하나 생길 수 있다**(doc-to-emm.test ①). 제자리 수정 도구를 만들 때는
이 왕복이 아니라 **노드 id 기준**으로 가야 한다 — 그것이 `append_to_map`
을 2단계에 넣지 않은 이유이기도 하다.

**검증**: 단위 `test/doc-to-emm.test.mjs`(19항목, `npm run test:mcp`) +
서버 25항목 + 잠금 0행 + **Claude Code 대화에서 `list_maps`→`get_map` 2회
호출로 가지 이름 셋을 정확히 읽음**(e2e209).

## 10. 관련 문서

- [`web-ai-clipboard.md`](web-ai-clipboard.md) — 방법 A(현행) · §9 가 이 문서의 출처
- [`18-ai.md`](18-ai.md) — API 키 방식 AI 생성
- [`emm-prompt-templates.md`](emm-prompt-templates.md) — AI 에게 EMM 을 가르치는 프롬프트
- [`../../05-implementation/api-spec.md`](../../05-implementation/api-spec.md) — 감쌀 API 계약
- [`../open-core-boundary.md`](../open-core-boundary.md) — §5 경계 판단의 기준
