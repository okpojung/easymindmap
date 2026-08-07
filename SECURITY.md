# 보안 정책 — easymindmap

## 1. 자격증명 원칙

> 🔒 **실제 자격증명은 저장소에 기록하지 않는다.
> 비밀번호 관리자 또는 Coolify UI 에서만 관리한다.**

| 무엇 | 어디에 |
|---|---|
| 운영/개발 서버가 쓰는 값 | **Coolify UI → 해당 리소스의 Environment Variables** |
| 사람이 봐야 하는 값(백업·인수인계) | **비밀번호 관리자** |

저장소 안(문서·`.env.example`·README·주석·테스트)에서는 **언제나
플레이스홀더**다. 서버의 `.env` 파일은 서버 위에만 존재한다 — 값을
확인해야 하면 서버에서 직접 읽고, 저장소로 옮겨 적지 않는다.

### 1.1 플레이스홀더 표기법

모양이 하나여야 사람도 스캐너도 "이건 실제 값이 아니다"를 한눈에 안다.

| 표기 | 들어갈 값 |
|---|---|
| `<PASSWORD>` | 비밀번호 (DB·Redis·SMTP·대시보드 공통) |
| `<JWT_SECRET>` | JWT 서명 시크릿 (32자 이상) |
| `<ANON_KEY>` / `<SERVICE_ROLE_KEY>` | Supabase 발급 키 |
| `<HOST>` | 호스트명 또는 IP |
| `<OPENAI_API_KEY>` 등 | 각 서비스 API 키 |

```bash
# 이렇게
DATABASE_URL=postgresql://postgres:<PASSWORD>@<HOST>:5432/postgres
JWT_SECRET=<JWT_SECRET>
DASHBOARD_PASSWORD=<PASSWORD>

# ✗ 이렇게 쓰지 않는다 — "실제 값처럼" 보이는 순간 사람도 스캐너도 구분 못 한다
#   (아래는 나쁜 예의 *모양*만 보인 것이다. 산문형 안내문·실제 IP 를
#    값 자리에 넣으면 그 줄은 곧바로 자격증명 유출로 보고된다.)
#     DATABASE_URL=postgresql://postgres:<한국어 산문 안내문>@<실제 사설 IP>:5432/postgres
#     JWT_SECRET=<한국어 산문 안내문>
```

**예외 — 바꾸지 않는 것.** 아래는 실제 시크릿이 아니라 *고정된 로컬/CI
더미*다. 플레이스홀더로 바꾸면 명령을 복붙해 쓸 수 없게 되므로 그대로 둔다.

| 값 | 어디 | 왜 |
|---|---|---|
| `postgres:postgres@localhost:54322` | Supabase CLI 로컬 | CLI 가 고정으로 쓰는 기본값 |
| `emm:emm@localhost:5432` | `docker-compose.dev.yml` | 로컬 개발 컨테이너 계정 |
| `ci-only-dummy-secret-…` | `.github/workflows/ci.yml` | CI 전용 더미, 외부 접근 불가 |

자세한 환경변수 목록은
[`docs/05-implementation/env-spec.md`](docs/05-implementation/env-spec.md) 참고.

---

## 2. 재발 방지 — GitHub Secret scanning + Push protection

원칙만으로는 손이 미끄러진 커밋을 못 막는다. **저장소 설정에서 커밋
단계에 걸리게** 해 둔다.

**GitHub → 저장소 → Settings → Code security**

| 항목 | 설정 | 효과 |
|---|---|---|
| **Secret scanning** | Enable | 이미 들어간 시크릿을 찾아 알림 |
| **Push protection** | Enable | 시크릿이 든 커밋의 **push 자체를 거부** |

Push protection 이 켜져 있으면 실수로 키를 적고 push 할 때 GitHub 이 막아
세운다 — 되돌리는 것보다 애초에 안 들어가는 쪽이 훨씬 싸다.

> ⚠️ **`.github/secret_scanning.yml` 로 docs 경로를 제외하지 말 것.**
> 오탐이 줄어드는 대신 **진짜 시크릿이 문서에 들어가도 안 잡힌다.**
> 오탐은 위 §1.1 표기법으로 없애는 것이 맞다.

---

## 3. 시크릿이 이미 커밋됐다면

순서가 중요하다. **삭제 커밋만으로는 히스토리에서 사라지지 않는다.**

1. **해당 키를 즉시 회전(rotate)** — 이것이 유일하게 확실한 조치다.
   유출된 값은 이미 복제됐다고 가정한다.
2. 문서·코드에서 플레이스홀더로 치환하고 커밋.
3. 필요하면 히스토리 정리 (`git filter-repo` 등). 협업자 전원이 다시
   clone 해야 하므로 **①·②를 먼저 하고, 이건 마지막에 판단**한다.

---

## 4. 감사 이력

### 2026-08-07 — 문서 자격증명 전수 감사

**계기**: `env-spec.md:79`, `infra-architecture.md:633/639/809/811` 에
실제 자격증명이 있다는 보고.

**결론: 실제 자격증명은 없었다.** 현재 HEAD 전체와 **전체 git
히스토리**(`git log --all -p`, 모든 브랜치·모든 커밋)를 JWT(`eyJ…`)·
`sk-`·`ghp_`·`AKIA`·실제 DB URL 패턴으로 훑어 **0건**.

**보고서가 본 것**: 지목된 줄 번호는 `fd4596e` (2026-04-17, "아키텍처
문서 6개 → docs/90-architecture/ 폴더로 이동") 시점의 스냅숏과 일치한다.
그 시점의 해당 줄들은 —

| 줄 | 그 시점의 값 자리 (여기서는 가려 적는다) |
|---|---|
| 633 | `JWT_SECRET=` + *"반드시 32자 이상 …" 한국어 안내문* |
| 639 | `DASHBOARD_PASSWORD=` + *"강력한 …" 한국어 안내문* |
| 809 | `DATABASE_URL=postgresql://postgres:` + *한국어 안내문* + `@` + *당시 사설 IP* |
| 811 | 633 과 동일 |

> 위 표에서 값을 **그대로 옮겨 적지 않은 이유**: 원문을 재현하면 이 파일이
> 새로운 오탐 대상이 된다. 원문을 확인해야 하면
> `git show fd4596e:docs/90-architecture/infra-architecture.md | sed -n '633p;639p;809p;811p'`.

— 전부 **한국어 산문형 플레이스홀더**다. 실제 값이 아니다. 다만 이 표기가
실제 값과 구별되지 않아 오탐을 불렀고, 그래서 §1.1 표기법으로 통일했다.

**조치**
- PR #101 (2026-07-25) — 실제 내부 IP·도메인·호스트명·이메일을 예시 값
  (`192.168.0.0/24`, `example.com`, RFC 5737 `203.0.113.10`)으로 치환.
- PR #223 (2026-08-07) — 산문형·`[PASSWORD]`·`VM-03-IP`·`eyJ...`·`sk-...`·
  `change_me_*` 를 `<PASSWORD>` 계열로 통일. 두 문서 상단에 원칙 명시.

**남은 것 — 히스토리**: PR #101 이전 커밋에는 당시 내부 IP
`192.168.94.113` 등이 남아 있다. 사설 대역(RFC 1918)이라 외부에서 도달할
수 없고 자격증명도 아니므로, **히스토리 재작성은 하지 않는 것을 권장**한다
(협업자 전원 재-clone 비용이 이득보다 크다). 다만 **스캐너를 과거 리비전에
걸면 위 줄들이 계속 재보고된다** — 스캔 대상을 `main` 최신 커밋으로
고정하는 편이 맞다.
