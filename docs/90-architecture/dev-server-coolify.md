# 개발 서버 — Ubuntu 22.04 + Coolify (프로덕션 패리티)

> **결정 (2026-07)**: 개발용 서버는 **프로덕션과 똑같은 방식**으로 구축해
> 테스트한다. 구축 도구는 **Coolify**(셀프호스팅 PaaS)이며, OS는
> **Ubuntu 22.04**. 개발 서버에서 검증된 구성을 그대로 프로덕션에
> 복제하는 것이 원칙이다 (dev/prod parity).
>
> 이 문서가 개발 서버 구축의 **기준 문서**다. `infra-architecture.md`
> §12(VM-DEV)의 이전 방식(수동 Node/pm2/supabase-cli)은 이 문서로
> 대체되었다.
>
> ⚠️ **IP 는 문서용 예시**(사설 `192.168.0.x` · 공인 `203.0.113.x`)이고,
> **도메인은 실제 값**이다(`*.mindmap.ai.kr`). 남아 있는 `*.example.com` 은
> 아직 정하지 않은 주소이거나 일반 예시다 — 자세한 근거는
> [`infra-architecture.md`](infra-architecture.md) 상단.

---

## 1. 왜 이 방식인가

| 항목 | 내용 |
|---|---|
| **dev/prod parity** | 개발 서버와 프로덕션이 같은 OS·같은 배포 도구·같은 컨테이너 구성. "개발에선 됐는데 운영에서 안 된다"를 구조적으로 제거 |
| **Coolify** | 오픈소스 셀프호스팅 PaaS. 서버에 설치하면 **GitHub 연동 자동 배포**(푸시 → 빌드 → 재기동), 앱/DB를 웹 UI로 관리, Traefik 리버스 프록시 + Let's Encrypt 자동 |
| **내 PC는 브라우저만** | 개발 PC에는 아무것도 설치하지 않는다(Node/Docker 불필요). 컨테이너·Docker는 **서버 안에서 Coolify가 자동 설치·관리** |
| **배포 흐름 단순화** | GitHub Actions는 CI(빌드·타입체크·스모크) 품질 게이트만 담당, **배포(CD)는 Coolify**가 담당(웹훅 자동) |

```
[개발 PC]                      [개발 서버 VM-DEV (Ubuntu 22.04)]
 브라우저만 ──────────▶  Coolify (Traefik 80/443, UI :8000)
                          ├─ app: frontend  (apps/frontend, 정적 빌드)
 [GitHub]                 ├─ app: api       (apps/api, NestJS :3000)
  main 푸시 ─웹훅─▶       └─ db : PostgreSQL 16 (+ ltree, 스키마 로드)
  (자동 재빌드·재배포)
                         ※ 프로덕션 서버도 동일 구성(값만 다름)
```

> ★ **위 그림은 공개판을 띄웠을 때의 구성이다. 개발 서버의 지금 실제
> 모습은 다르다** (2026-09-02 확인) — `easymindmap-api` ·
> `easymindmap-frontend` 는 **정지**돼 있고 도메인도 없다. 도는 것은
> **유료판 한 벌**(`easymindmap-api-pro` · `easymindmap-frontend-pro`)과
> `easymindmap-auth` 뿐이다.
>
> 따라서 그림의 `main 푸시 ─웹훅─▶ 자동 재빌드·재배포` 는 **지금 개발
> 서버에서 일어나지 않는다.** 반영 경로는 §8 ② 하나다. 자세한 표와
> 결론은 §6 머리말에 있다.

---

## 2. 서버 준비 (Ubuntu 22.04, 1회)

최소 사양: 2 vCPU / 2GB RAM (권장 4 vCPU / 8GB+, VM-DEV는 8 vCPU/16GB).

```bash
# OS 업데이트
sudo apt update && sudo apt upgrade -y
```

### ufw(호스트 방화벽)에 대하여 — 내부망 서버는 생략 (2026-07 확정)

**FortiGate 뒷단 내부망 전용 서버에서는 ufw 를 켜지 않는다.** 이유:

- 경계 방어(인터넷→내부)는 FortiGate 가 담당한다.
- **Docker 는 ufw 를 우회한다** — Docker(=Coolify 기반)가 컨테이너
  공개 포트의 iptables 규칙을 ufw 보다 앞 단계에 삽입하므로, Coolify 가
  여는 80/443/8000 은 ufw 로 막아도 열린다. Coolify 서버에서 ufw 는
  "보호 중"이라는 착각을 주기 쉽다.
- 내부 세그먼트 격리가 필요하면 ufw 가 아니라 **FortiGate 정책/VLAN**
  으로 하는 것이 올바른 계층이다.

ufw 대신 지킬 것:
1. **Coolify 에서 DB 포트를 Publish 하지 않기** — PostgreSQL 은 내부
   네트워크 전용, api 컨테이너만 내부 URL 로 접속(§5.1 방식).
2. SSH 는 키 인증 유지.
3. 프로덕션 공개 시 FortiGate 에서 **80/443 만** 서버로 포워딩.

> 예외: 서버가 공인망에 직접 노출되는 환경(클라우드 VPS 등)이라면
> 제공자 방화벽/보안그룹으로 22·80·443·(관리IP 한정)8000 만 연다.

## 3. Coolify 설치 (1회)

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

- 스크립트가 **Docker를 포함해 필요한 것을 자동 설치**한다(수동 Docker 설치 불필요).
- 완료 후 브라우저에서 `http://<서버IP>:8000` 접속 → **첫 가입 계정이 관리자**가 된다(즉시 가입해 둘 것).
- Onboarding에서 서버는 `localhost`(자기 자신)를 선택.

## 4. GitHub 연동 (1회)

1. Coolify → **Sources → Add → GitHub App** → 안내에 따라 GitHub App 생성 →
   `okpojung/easymindmap` 저장소에 설치.
2. 이후 앱 리소스 생성 시 이 Source를 선택하면 **main 푸시 때마다 자동
   재빌드·재배포**된다(웹훅).

> ⚠️ **[2026-08-01 실구축 확인]** GitHub App 등록 시 `Selected endpoint`
> 기본값은 Coolify가 아웃바운드로 조회한 **공인 IP**(예:
> `203.0.113.10:8000`)다. 이 값은 redirect_url로도 쓰이므로, 개발 PC가
> 접근 가능한 주소가 아니면 App은 생성되지만 브라우저가 Coolify로
> 돌아오지 못해 **자격증명(client secret, private key)을 받지 못한
> 반쪽 상태**가 된다 — 복구하려면 GitHub에서 App 삭제 후 재시도해야
> 한다. **`Use custom webhook endpoint`를 켜고
> `http://192.168.0.110:8000` (끝 슬래시 없이)을 직접 입력할 것.**
>
> - Organization 란은 **비워둔다.** 개인 계정에 값을 넣으면 조직용 생성
>   URL로 이동해 404가 난다.
> - Preview Deployments는 **끈다.** 켜두면 열려 있는 PR마다 미리보기
>   컨테이너가 자동 생성되어 자원을 소모한다.
> - Install 시 `Only select repositories` → 해당 저장소만 선택한다.

## 5. 리소스 구성 — 프로젝트 `easymindmap-dev`

Coolify에서 **Project**를 만들고 아래 3개 리소스를 추가한다.

### 5.1 PostgreSQL 16 (DB)

- **Add Resource → Database → PostgreSQL** (이미지 `postgres:16` — ltree 포함).
- 생성 후 접속정보(내부 URL) 확인. 예:
  `postgres://postgres:<자동생성PW>@<내부호스트>:5432/postgres`
- **스키마 로드**(1회): Coolify의 DB 터미널(또는 개발 PC에서 psql)로
  아래 순서대로 실행 — **순정 PG라 shim 먼저**:
  ```
  apps/api/database/dev/00-supabase-shim.sql
  apps/api/database/schema.sql
  apps/api/database/functions/move_node_subtree.sql
  apps/api/database/dev/01-seed-dev-user.sql
  ```

> ⚠️ **DB 비밀번호에 특수문자가 있으면 DATABASE_URL 파싱이 깨진다**
> (2026-08-01 실구축 확인 — 원인 파악에 가장 오래 걸린 문제).
> Coolify 자동 생성 비밀번호에 `@` `:` `/` `?` `#` `%` 가 포함되면
> `Postgres URL (internal)`을 그대로 복사해도
> `new Pool({ connectionString })`이 마지막 `@`를 호스트 구분자로
> 파싱해 비밀번호가 잘리고 `password authentication failed`로 실패한다
> (증상: api 기동은 되나 `/v1/health` = `"db":"down"`). Coolify가 URL
> 조립 시 퍼센트 인코딩을 하지 않는다.
> **리소스 생성 직후 영숫자 비밀번호로 교체할 것.**
>
> ```bash
> openssl rand -hex 24                       # 새 비밀번호 생성
> docker exec -i <db> psql -U postgres -d postgres \
>   -c "ALTER USER postgres WITH PASSWORD '<새값>';"
> ```
>
> **반드시 Coolify General → Password 필드에도 동일 값을 입력하고 Save
> 한다.** 실제 비밀번호와 Coolify가 아는 값이 어긋나면
> `Postgres URL (internal)`이 옛 값을 노출하고 백업 자동화가 깨진다.
> 이후 갱신된 URL을 api의 `DATABASE_URL`에 반영하고 **재배포**한다
> (환경변수만 바꾸면 기동 시 생성된 커넥션 풀이 갱신되지 않는다).

### 5.2 api (백엔드)

- **Add Resource → Application → GitHub(위 Source)** → 저장소 선택.
- **Base Directory**: `apps/api` / Build Pack: **Nixpacks**(Node 자동 감지)
  - Build: `npm ci && npm run build` / Start: `node dist/main.js`
  - (추후 `apps/api/Dockerfile` 추가 시 Dockerfile 빌드로 전환 — Phase 5 예정)
- **Ports Exposes**: `3000` — **누락 시 Traefik이 대상 포트를 몰라 502**.
  도메인은 `http://api-dev.mindmap.ai.kr` (스킴은 §5.3 아래 HTTPS 주의 참조)
- **환경변수** — Buildtime/Runtime 체크에 주의:

  | 변수 | 값 | Buildtime | Runtime |
  |---|---|---|---|
  | `PORT` | `3000` | ✅ | ✅ |
  | `DATABASE_URL` | `<5.1의 내부 접속 URL>` | ✅ | ✅ |
  | `AUTH_MODE` | `dev` (Phase 3 전까지) | ✅ | ✅ |
  | `DEV_USER_ID` | `00000000-0000-0000-0000-000000000001` | ✅ | ✅ |
  | `CORS_ORIGIN` | `https://pro-dev.mindmap.ai.kr` | ✅ | ✅ |
  | `NODE_ENV` | `production` | ❌ **해제 필수** | ✅ |
  | `AUTH_MODE` → `supabase` + `SUPABASE_JWT_SECRET` | Phase 3 활성화 시 — **GoTrue 배포 후에만** (현재 dev 서버는 순정 PG16 + `AUTH_MODE=dev`. 활성화 경로: backend-phase1.md Phase 3) | ✅ | ✅ |

  > `CORS_ORIGIN` 은 **콤마로 여러 출처**를 받을 수 있다
  > (예: `https://pro-dev.mindmap.ai.kr,http://localhost:5173` —
  > 2026-08-02 지원. 그 전에는 단일 출처만 받아 두 번째가 차단됐다).

  > `NODE_ENV=production`이 **Buildtime**에 노출되면 `npm ci`가
  > devDependencies를 생략해 `tsc`/`nest`를 찾지 못하고 빌드가 실패한다
  > (Coolify UI도 동일 경고를 표시). Runtime만 체크할 것.

### 5.3 frontend (프론트) — Dockerfile 방식

> **[2026-08-01 정정]** 이전 서술(Base Directory `apps/frontend` +
> Nixpacks 정적 빌드)은 **실제로 동작하지 않는다**: vite의 `@emm` 별칭과
> tsconfig paths가 `../../packages/emm-parser/src`를 참조하는데 Base
> Directory를 `apps/frontend`로 잡으면 `packages/`가 빌드 컨텍스트
> 밖이라 `Cannot find module '@emm/model'` 등 TS2307이 쏟아지고, Base
> Directory를 `/`로 올리면 루트에 package.json이 없어 Nixpacks가 앱
> 타입을 감지하지 못한다. → **저장소 루트를 컨텍스트로 쓰는
> Dockerfile**(`apps/frontend/Dockerfile`)로 빌드한다.

- **Add Resource → Application → GitHub** — 설정값 (2026-08-01 실구축):

  | 항목 | 값 |
  |---|---|
  | Build Pack | `Dockerfile` |
  | Base Directory | `/` (저장소 루트 — `packages/`를 COPY해야 하므로) |
  | Dockerfile Location | `/apps/frontend/Dockerfile` |
  | Ports Exposes | `80` — **누락 시 Traefik이 대상 포트를 몰라 502** |
  | Is it a static site? | **끄기** (Dockerfile이 nginx를 포함) |
  | Publish Directory | 비움 |
  | Install/Build/Start Command | 비움 |
  | Domains | `http://pro-dev.mindmap.ai.kr` (스킴은 아래 HTTPS 주의 참조) |

- Dockerfile은 2단계다: node:22-alpine에서 `npm ci && npm run build` →
  nginx:alpine이 `dist`를 서빙 (`apps/frontend/nginx.conf` — SPA
  라우팅 `try_files` + index.html `no-store`). 포트 80.
- 루트 `.dockerignore`가 `node_modules`·`dist`를 컨텍스트에서 제외한다
  (없으면 COPY가 로컬 node_modules로 npm ci 결과를 덮을 수 있다).
- **빌드 환경변수**:

  | 변수 | 값 | Buildtime | Runtime |
  |---|---|---|---|
  | `VITE_API_URL` | `https://api-dev.mindmap.ai.kr` | ✅ **필수** | 불필요 |
  | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Phase 3(로그인) 활성화 시 — GoTrue 주소/anon key. 미설정 시 로그인 UI 없이 개발 모드로 동작 | ✅ | 불필요 |

  > Vite 환경변수는 빌드 시 번들에 인라인된다. **Buildtime 체크가
  > 없으면 빈 문자열로 박히며, 화면은 뜨지만 API 호출이 실패한다.**
  > Dockerfile의 `ARG VITE_API_URL`이 이 값을 받는다.
  > `VITE_API_URL`에 `/v1`을 덧붙이지 말 것 (API가
  > `setGlobalPrefix('v1')` 사용).

### 5.4 도메인·HTTPS — NPM 앞단 구성에서는 `https://` 금지 ★

> **[2026-08-01 정정]** "DNS(또는 내부 NPM)를 서버로 향하게 하면
> Traefik이 Let's Encrypt를 자동 발급한다"는 이전 안내는 **NPM이 앞단에
> 있는 구성에서는 틀린 안내**다. VM-DEV는 사설 IP라 Traefik의 HTTP-01
> 챌린지가 성공할 수 없고, `https://`로 도메인을 등록하면 발급 재시도
> 루프에 빠져 LE rate limit만 소모한다.
>
> **NPM이 앞단에 있는 구성에서는 SSL 종단이 NPM 한 곳이다.**
> Coolify Domains 입력란에는 반드시 `http://` 스킴을 쓴다.
> 인증서는 NPM이 발급·갱신하고, Traefik은 평문 80만 담당한다.
>
> | 리소스 | Coolify Domains | 앱 환경변수 |
> |---|---|---|
> | api | `http://api-dev.mindmap.ai.kr` | `CORS_ORIGIN=https://pro-dev.mindmap.ai.kr` |
> | frontend | `http://pro-dev.mindmap.ai.kr` | `VITE_API_URL=https://api-dev.mindmap.ai.kr` |
>
> 환경변수만 `https`인 이유: 브라우저가 실제로 접근하는 주소 기준이기
> 때문이다. NPM Proxy Host 구성은 `infra-architecture.md` §7.6~7.8 참조.

### 5.5 GoTrue(로그인) 배포 — Phase 3 활성화, 경로 A ★

> 앱 코드는 준비 완료(backend-phase1.md Phase 3) — 아래만 하면 로그인이
> 켜진다. **전체 Supabase 스택이 아니라 인증 서버(GoTrue) 컨테이너
> 하나**만 기존 PG16 옆에 얹는 가벼운 구성이다.
>
> **처음 배포한다면 단계별 실행 가이드
> [`gotrue-deploy-walkthrough.md`](gotrue-deploy-walkthrough.md)를
> 따라 하라** — 어디서 실행하고 각 단계를 무엇으로 확인하는지까지
> 적혀 있고, 앱 전환을 맨 뒤로 미루는 안전한 순서(0→①→②→NPM→검증→
> ③)로 재배열되어 있다. 아래는 요약판(설정값 원본)이다.

**① DB 준비 (1회)** — GoTrue 는 **자기 전용 데이터베이스**를 쓴다.
같은 데이터베이스에 넣으면 schema.sql 의 shim `auth.users` 와 GoTrue
마이그레이션이 충돌하므로 반드시 분리한다 (API 의 JIT 프로비저닝이
앱 DB 쪽 사용자 행을 만들어 주므로 분리해도 동작):

```sql
CREATE DATABASE gotrue;
\c gotrue
CREATE SCHEMA IF NOT EXISTS auth;   -- GoTrue 마이그레이션이 이 안에 테이블 생성
```

**② Coolify 리소스** — Add Resource → **Docker Image**:

| 항목 | 값 |
|---|---|
| Image | `supabase/auth` — **v2 최신 태그**를 [Releases](https://github.com/supabase/auth/releases)에서 확인해 고정 (latest 금지) |
| Ports Exposes | `9999` |
| Domains | `http://auth-dev.mindmap.ai.kr` (§5.4 규칙 — http 스킴) |

환경변수 (전부 Runtime):

```
GOTRUE_API_HOST=0.0.0.0
GOTRUE_API_PORT=9999
API_EXTERNAL_URL=https://auth-dev.mindmap.ai.kr
GOTRUE_DB_DRIVER=postgres
GOTRUE_DB_DATABASE_URL=postgres://postgres:<PW>@<PG내부호스트>:5432/gotrue?search_path=auth
GOTRUE_SITE_URL=https://pro-dev.mindmap.ai.kr
GOTRUE_URI_ALLOW_LIST=https://pro-dev.mindmap.ai.kr
GOTRUE_JWT_SECRET=<openssl rand -hex 32 — 영숫자>
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_AUD=authenticated
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
GOTRUE_DISABLE_SIGNUP=false
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_MAILER_AUTOCONFIRM=true
GOTRUE_PASSWORD_MIN_LENGTH=6
```

> - `GOTRUE_MAILER_AUTOCONFIRM=true` = **이메일 확인 없이 가입 즉시
>   로그인** (SMTP 불필요 — dev 용). 정식 오픈 시 SMTP 설정 후 false 로.
> - DB 비밀번호는 §5.1 규칙(영숫자만) 준수 — GoTrue 도 URL 파싱이다.

**③ 앱 리소스 변수 변경 + 재배포**:

| 리소스 | 변수 | 값 |
|---|---|---|
| api | `AUTH_MODE` | `supabase` |
| api | `SUPABASE_JWT_SECRET` | GOTRUE_JWT_SECRET 과 **동일 값** |
| frontend (Build) | `VITE_SUPABASE_URL` | `https://auth-dev.mindmap.ai.kr` |
| frontend (Build) | `VITE_SUPABASE_AUTH_PREFIX` | **`/`** (= 루트 — **GoTrue 단독은 루트 경로**. 전체 Supabase(Kong)로 갈 때만 기본 `/auth/v1`) |
| frontend (Build) | `VITE_SUPABASE_ANON_KEY` | 아무 값 (Kong 없는 단독 구성에선 미사용) |

> ### ⚠️ `VITE_SUPABASE_AUTH_PREFIX` — **빠뜨리면 로그인만 조용히 안 된다**
>
> 이 변수를 **아예 안 넣으면** 코드가 기본값 `/auth/v1` 을 쓴다
> (`supabaseAuth.ts` — `!== undefined` 로 판정하므로 "없음"과 "빈 값"이
> 다르다). 그러면 호출 주소가 이렇게 된다:
>
> ```
> ${VITE_SUPABASE_URL}${AUTH_PREFIX}${path}
>   → https://auth-dev.mindmap.ai.kr/auth/v1/token   ← 단독 GoTrue 에는 없다
> ```
>
> **실측 (2026-08-19, dev 서버)** — 이 변수가 빠진 채로 돌고 있었다:
>
> | 주소 | 응답 |
> |---|---|
> | `https://auth-dev.mindmap.ai.kr/health` | `{"version":"v2.194.0","name":"GoTrue",…}` |
> | `https://auth-dev.mindmap.ai.kr/auth/v1/health` | **`404 page not found`** |
>
> 화면은 멀쩡히 뜨고 **로그인만 안 된다.** 기동 로그에도 안 남는다 —
> 브라우저에서 404 가 날 뿐이다.
>
> **빈 값 대신 `/` 를 넣는다.** 코드가 끝의 슬래시를 떼므로 결과는 같고
> (`'/'.replace(/\/$/,'') === ''`), Coolify 같은 UI 가 **빈 값을 저장하지
> 않는** 경우를 피할 수 있다. 값이 화면에 보이므로 "넣었는데 비어 있는
> 것"과 "안 넣은 것"을 눈으로 구별할 수 있다는 것도 이유다.
>
> **바꾼 뒤에는 반드시 재배포한다** — `VITE_*` 는 빌드 시점에 번들에
> 박히므로, 변수만 고치고 재배포하지 않으면 아무것도 바뀌지 않는다.

**④ NPM Proxy Host** — `auth-dev.mindmap.ai.kr` → VM:80 (Traefik 경유),
Cache Assets ❌, IPSec-VPN-Only (infra-architecture.md §7.9).

> ### ⚠️ CORS 허용 주소를 **고정값으로 박지 말 것**
>
> preflight(OPTIONS)는 인증 정보 없이 오므로 Access List 앞에서 처리해야
> 하고, 그래서 이 프록시 호스트의 **Advanced** 에 손으로 CORS 응답을
> 적어 둔다. 그 자리에 프런트 주소를 **고정값으로** 적으면,
> **프런트 도메인이 하나 늘어나는 순간 그쪽 로그인이 통째로 막힌다.**
>
> 실측(2026-08-19) — 유료판 프런트를 `pro-dev` 로 올리자마자 걸렸다:
>
> ```
> Access to fetch at 'https://auth-dev…/token?grant_type=password'
> from origin 'https://pro-dev…' has been blocked by CORS policy:
> The 'Access-Control-Allow-Origin' header has a value 'https://dev…'
> that is not equal to the supplied origin.
> ```
>
> **허용 목록을 두고 요청한 주소를 그대로 되돌려 준다:**
>
> ```nginx
> location / {
>     set $cors_origin "";
>     if ($http_origin ~* "^https://(dev|pro-dev)\.example\.com$") {
>         set $cors_origin $http_origin;
>     }
>
>     if ($request_method = OPTIONS) {
>         add_header Access-Control-Allow-Origin $cors_origin always;
>         add_header Access-Control-Allow-Credentials "true" always;
>         add_header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS" always;
>         add_header Access-Control-Allow-Headers "authorization, content-type, apikey, x-client-info, x-supabase-api-version" always;
>         add_header Access-Control-Max-Age 3600 always;
>         add_header Content-Length 0;
>         return 204;
>     }
>
>     proxy_pass http://<VM>:80;
>     proxy_set_header Host $host;
>     proxy_set_header X-Real-IP $remote_addr;
>     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
>     proxy_set_header X-Forwarded-Proto $scheme;
> }
> ```
>
> **실제 응답(POST)에는 헤더를 넣지 않는다.** GoTrue 가 스스로 붙인다 —
> 실측으로 확인했다(위 설정만 고치니 로그인이 됐다). 여기에 또 넣으면
> `Access-Control-Allow-Origin` 이 **두 개**가 되어 브라우저가 다시 막는다.

**⑤ 검증**:

```bash
curl -s https://auth-dev.mindmap.ai.kr/health           # GoTrue health
curl -s -X POST https://auth-dev.mindmap.ai.kr/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"secret1"}'   # access_token 확인
# 브라우저: pro-dev.mindmap.ai.kr → ☁ 클라우드 → 로그인 폼 → 가입 → 저장/열기
```

## 6. 동작 확인 체크리스트

> ★ **개발 서버는 유료판 한 벌만 띄운다** (2026-09-02 확인). 아래 표가
> 지금 실제로 도는 것이다 — **공개판 두 개는 정지 상태이고 도메인조차
> 없다.** 그래서 확인도 배포도 전부 `-pro` 쪽에서 한다.
>
> | Coolify 앱 | 상태 | 주소 |
> |---|---|---|
> | `easymindmap-api-pro` | 🟢 실행 | `api-dev.mindmap.ai.kr` |
> | `easymindmap-frontend-pro` | 🟢 실행 | `pro-dev.mindmap.ai.kr` |
> | `easymindmap-auth` | 🟢 실행 | `auth-dev.mindmap.ai.kr` |
> | `easymindmap-api` (공개판) | 🔴 정지 | 없음 |
> | `easymindmap-frontend` (공개판) | 🔴 정지 | 없음 |
>
> **여기서 나오는 결론이 이 문서에서 가장 중요하다** — 도는 것이
> 유료판뿐이므로 **`okpojung/easymindmap` 에 병합하는 것만으로는 개발
> 서버에 아무 일도 일어나지 않는다.** 공개 저장소 쪽 자동 배포·웹훅은
> 이 구성에서 **해당 사항이 없다**(정지된 앱을 재배포할 뿐이다).
> 반영 경로는 §8 ② 하나뿐이다: **private 저장소의 코어 SHA 를 올리고
> 거기서 재배포한다.**
>
> 아래 항목의 `pro-dev.mindmap.ai.kr` 은 **지금 도는 유료판 앱**의 주소다.
> 공개판을 다시 띄우면 그 앱은 자기 주소를 따로 받는다 — 옛 공개판 주소
> `dev.mindmap.ai.kr` 은 지금 아무 데도 닿지 않는다([`vision.md`](../00-project-overview/vision.md)
> "환경별 도메인").

- [ ] `https://api-dev.mindmap.ai.kr/v1/health` → `{"status":"ok","db":"up"}`
- [ ] `https://pro-dev.mindmap.ai.kr` 접속 → 에디터 표시
- [ ] ☁ 클라우드 → 저장 → 토스트 / 편집 → 자동 저장 배지
- [ ] ☁ → 열기 → 목록·이름변경·삭제
- [ ] `git push origin main` → Coolify가 자동 재배포(Deployments 로그 확인) *
      — **공개판을 띄웠을 때만 해당한다.** 유료판만 도는 지금은 이 항목이
      아니라 아래 「코어 SHA」 항목이 배포의 전부다
- [ ] **재배포 뒤 "붙었는지"를 응답으로 확인** — §8 의 「재배포했는데 옛
      코드가 그대로다」 30초 확인 3줄. **화면이 뜨는 것은 배포됐다는 뜻이
      아니다**(옛 컨테이너로 롤백돼도 화면은 뜬다)
- [ ] **★ private 저장소(`easymindmap-pro`)의 코어 SHA 를 올렸는지** —
      공개 저장소 재배포로는 안 바뀐다 (§8 ②). **유료판만 도는 지금은
      이것이 유일한 반영 경로다.** "까지 반영해야 하면" 이 아니라
      **언제나** 해야 한다

> \* **자동 배포 선행조건**: GitHub 웹훅이 Coolify UI에 도달할 수 있어야
> 한다. 사설 IP 상태에서는 GitHub이 웹훅을 보낼 수 없어 이 항목이 영구히
> 미충족이다 — `infra-architecture.md` §7.8(coolify-dev Proxy Host,
> `/webhooks/` Access List 예외) 구성이 선행되어야 한다.

## 7. 프로덕션 전환 (같은 방식 복제)

프로덕션도 **동일하게 Coolify로** 구축한다 — 개발 서버에서 검증한 구성을
그대로 복제하고 값만 바꾼다:

| 항목 | 개발(dev) | 프로덕션(prod) |
|---|---|---|
| 서버 | VM-DEV (예: 192.168.0.110) | VM-02/03 등 운영 VM |
| 프로젝트 | `easymindmap-dev` | `easymindmap-prod` |
| 도메인 | pro-dev.mindmap.ai.kr / api-dev.mindmap.ai.kr | example.com / api.example.com |
| 자동 배포 | main 푸시 즉시 | 태그/릴리스 또는 수동 Deploy 버튼(권장) |
| AUTH_MODE | dev(Phase 3 전) | supabase (Phase 3 이후) |
| DB | Coolify PostgreSQL 16 | 동일(백업 정책 강화) + Phase 3에서 Supabase 스택 |
| **관리자 콘솔** | 프런트엔드 앱의 `/admin` **경로** | **별도 앱** `admin.easymindmap.org` |

> Supabase Self-hosted·Redis 는 해당 Phase(3~) 진행 시 **Coolify의
> Docker Compose 리소스**로 같은 방식으로 얹는다
> (`docker-compose-spec.md`의 서비스 정의 참조).

> **관리자 콘솔만 앱을 하나 더 만든다** (2026-08-14 사용자 결정).
> 같은 저장소·같은 Dockerfile 이고 도메인과 `VITE_API_URL` 만 다르다.
> 도메인을 하나 더 매다는 대신 앱을 나누는 이유는 **그래야 관리자 쪽에만
> Traefik IP 제한을 걸 수 있어서**다. 순서는
> [`admin-console.md`](../04-extensions/admin-console.md) §7.

## 8. 운영 팁

- **로그**: 각 리소스 → Logs (빌드/런타임 분리).
- **재배포**: Deployments → Redeploy (특정 커밋 선택 = 롤백).
- **Coolify 자체 업데이트**: 대시보드에서 안내에 따라 진행.
- **백업**: DB 리소스의 Scheduled Backup 기능 사용(S3 호환 대상 지정 가능).

### 트러블슈팅 — "배포는 성공인데 환경변수가 반영되지 않는다" ★

> **증상**: Deploy 가 성공으로 끝났는데 바꾼 환경변수가 먹지 않는다.
> 예: `AUTH_MODE=supabase` 로 바꿨는데 `/v1/maps` 가 여전히 200.
>
> **원인**: 새 컨테이너가 기동에 실패해 헬스체크를 통과하지 못하면
> Coolify 가 **이전 컨테이너로 자동 롤백**한다. 서비스는 계속 살아
> 있으므로 "배포는 됐는데 설정이 안 먹는다"로 보이고, 실제로 응답하는
> 것은 **옛 버전**이다. 환경변수를 계속 의심하게 되어 오래 헤맨다.
>
> **확인**: Deployment 로그에서 아래 문구를 찾는다 —
> `New container is unhealthy` / `rolling back to the old container`.
> 있으면 새 컨테이너 기동 실패이며, **같은 로그의 `Container logs:`
> 구간에 실제 원인**이 찍혀 있다.
>
> 실제 사례(2026-08-01): `ERR_REQUIRE_ESM` — api 가 CommonJS 빌드인데
> ESM 전용 패키지를 import 했다. 재발 방지는 `apps/api/README.md`
> "의존성 규칙" 및 CI 의 supabase 모드 부팅 스모크 참조.

### 트러블슈팅 — "재배포했는데 옛 코드가 그대로다" ★★ (2026-08-21)

> **증상**: main 에 병합하고 Coolify 에서 Redeploy 를 눌렀는데, 배포본이
> 여전히 옛 코드다. 화면은 멀쩡히 뜨고 API 도 응답하므로 **배포가 된 줄
> 안다.** 새 기능만 조용히 없다.
>
> 실측(2026-08-21) — #316·#317·#319 를 병합하고 재배포한 뒤:
>
> | 곳 | 상태 |
> |---|---|
> | `api-dev` | `/v1/health` 200 인데 **`POST /v1/attachments/from-url` 만 404** (형제 라우트는 전부 401) → #316 이전 빌드 |
> | `pro-dev` | 번들 `last-modified` 는 **그날 낮**인데 새 문자열이 하나도 없음 |
> | `dev` | **404** — 인증서·라우팅은 살아 있는데 컨테이너가 없음 |
>
> **원인은 곳마다 다르다. 셋을 한 덩어리로 보면 못 찾는다.**

#### ① 공개판(`dev`·`api-dev`) — 롤백이거나 기동 실패

바로 위 트러블슈팅과 같은 함정이다. Deployment 로그에서
`New container is unhealthy` / `rolling back to the old container` 를 먼저
찾는다. `dev` 처럼 **404** 라면 롤백할 옛 컨테이너조차 없는 것이라,
빌드 로그부터 봐야 한다(빌드 실패인지 기동 실패인지).

#### ② ★ 유료판(`pro-dev`) — **공개 저장소를 재배포해도 절대 안 바뀐다**

> **2026-09-02 추가**: 이 절은 원래 "유료판까지 반영해야 하면" 이라는
> 단서를 달고 있었다. 개발 서버가 **유료판만 띄우고 있으므로**(§6 머리말)
> 지금은 단서가 아니라 **유일한 반영 경로**다. 공개 저장소에 병합하고
> "배포됐겠지" 라고 여기면 **개발 서버에는 영원히 반영되지 않는다.**
> 실제로 그렇게 오해한 적이 있다(#355 병합 뒤 "자동 배포로 충분하다"고
> 보고했는데, 도는 앱이 유료판이라 아무 일도 일어나지 않았다).

`pro-dev` 의 Source 는 이 저장소가 아니라 **private 저장소**
(`easymindmap-pro`)이고, 그 Dockerfile 이 **코어를 고정 리비전(커밋 SHA)으로
clone 해서** 그 위에 유료 모듈을 얹어 빌드한다
(`../04-extensions/open-core-boundary.md` §7).

그래서 `okpojung/easymindmap` 쪽에서 Redeploy 를 아무리 눌러도
**`pro-dev` 는 영원히 그대로다.** 유료판에 코어 변경을 반영하려면

1. `easymindmap-pro` 의 Dockerfile 에서 **코어 커밋 SHA 를 올리고**
2. **그 저장소에서** 재배포한다

이 고정이 나쁜 것이 아니다 — 고정하지 않으면 "어제는 되던 게 오늘 안
된다"의 원인을 못 찾는다(§7 이 그래서 고정을 정했다). **함정은 고정 자체가
아니라, 공개 저장소만 재배포하고 "배포했다"고 여기는 것**이다.

> 이때 번들의 `last-modified` 가 **오늘**인 것이 사람을 속인다. 새 이미지는
> 실제로 만들어졌기 때문이다 — **옛 SHA 위에서.** 파일 시각이 새것이라고
> 코드가 새것인 것은 아니다.

#### 30초 확인 — 재배포 뒤에는 항상 이것부터

배포 뒤 "붙었나"를 눈이 아니라 **응답으로** 가른다. 새 기능이 들어간
**라우트 하나**와 번들의 **문자열 하나**를 고르면 된다(아래는 B16 ② 예).

```bash
# ① API — 새 라우트가 있는가 (401 = 있다 / 404 = 옛 빌드)
curl -s -o /dev/null -w "from-url: %{http_code}\n" -X POST \
  https://api-dev.mindmap.ai.kr/v1/attachments/from-url \
  -H 'Content-Type: application/json' -d '{"url":"https://example.com/a.png"}'

# ② 프런트 — 컨테이너가 떠 있는가 (200 이어야 한다)
curl -s -o /dev/null -w "front: %{http_code}\n" https://pro-dev.mindmap.ai.kr/

# ③ 프런트 번들 — 새 코드가 실렸는가 (1 이상이어야 한다)
curl -s https://pro-dev.mindmap.ai.kr/ | grep -o 'assets/index-[^"]*\.js' | head -1 \
  | xargs -I{} curl -s https://pro-dev.mindmap.ai.kr/{} | grep -c "attachments/from-url"
```

**문자열은 그 변경에서 처음 생긴 것으로 고른다.** 예전부터 있던 문자열
(B16 ② 에서는 `files/img-` 가 그랬다 — #292 에서 들어왔다)을 고르면
**옛 번들에서도 통과해** 아무것도 증명하지 못한다.

---

관련: `infra-architecture.md`(네트워크·VM 배치), `docker-compose-spec.md`
(서비스 구성 스펙), `ci-cd-github-actions.md`(CI 품질 게이트 — 배포는
Coolify 담당), `../05-implementation/backend-phase1.md`(백엔드 단계).
