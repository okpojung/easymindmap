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
> ⚠️ IP·도메인은 문서용 예시(placeholder)다. 실제 값은 저장소 밖에서 관리.

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
  도메인은 `http://api-dev.example.com` (스킴은 §5.3 아래 HTTPS 주의 참조)
- **환경변수** — Buildtime/Runtime 체크에 주의:

  | 변수 | 값 | Buildtime | Runtime |
  |---|---|---|---|
  | `PORT` | `3000` | ✅ | ✅ |
  | `DATABASE_URL` | `<5.1의 내부 접속 URL>` | ✅ | ✅ |
  | `AUTH_MODE` | `dev` (Phase 3 전까지) | ✅ | ✅ |
  | `DEV_USER_ID` | `00000000-0000-0000-0000-000000000001` | ✅ | ✅ |
  | `CORS_ORIGIN` | `https://dev.example.com` | ✅ | ✅ |
  | `NODE_ENV` | `production` | ❌ **해제 필수** | ✅ |
  | `AUTH_MODE` → `supabase` + `SUPABASE_JWT_SECRET` | Phase 3 활성화 시 — **GoTrue 배포 후에만** (현재 dev 서버는 순정 PG16 + `AUTH_MODE=dev`. 활성화 경로: backend-phase1.md Phase 3) | ✅ | ✅ |

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
  | Domains | `http://dev.example.com` (스킴은 아래 HTTPS 주의 참조) |

- Dockerfile은 2단계다: node:22-alpine에서 `npm ci && npm run build` →
  nginx:alpine이 `dist`를 서빙 (`apps/frontend/nginx.conf` — SPA
  라우팅 `try_files` + index.html `no-store`). 포트 80.
- 루트 `.dockerignore`가 `node_modules`·`dist`를 컨텍스트에서 제외한다
  (없으면 COPY가 로컬 node_modules로 npm ci 결과를 덮을 수 있다).
- **빌드 환경변수**:

  | 변수 | 값 | Buildtime | Runtime |
  |---|---|---|---|
  | `VITE_API_URL` | `https://api-dev.example.com` | ✅ **필수** | 불필요 |
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
> | api | `http://api-dev.example.com` | `CORS_ORIGIN=https://dev.example.com` |
> | frontend | `http://dev.example.com` | `VITE_API_URL=https://api-dev.example.com` |
>
> 환경변수만 `https`인 이유: 브라우저가 실제로 접근하는 주소 기준이기
> 때문이다. NPM Proxy Host 구성은 `infra-architecture.md` §7.6~7.8 참조.

### 5.5 GoTrue(로그인) 배포 — Phase 3 활성화, 경로 A ★

> 앱 코드는 준비 완료(backend-phase1.md Phase 3) — 아래만 하면 로그인이
> 켜진다. **전체 Supabase 스택이 아니라 인증 서버(GoTrue) 컨테이너
> 하나**만 기존 PG16 옆에 얹는 가벼운 구성이다.

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
| Domains | `http://auth-dev.example.com` (§5.4 규칙 — http 스킴) |

환경변수 (전부 Runtime):

```
GOTRUE_API_HOST=0.0.0.0
GOTRUE_API_PORT=9999
API_EXTERNAL_URL=https://auth-dev.example.com
GOTRUE_DB_DRIVER=postgres
GOTRUE_DB_DATABASE_URL=postgres://postgres:<PW>@<PG내부호스트>:5432/gotrue?search_path=auth
GOTRUE_SITE_URL=https://dev.example.com
GOTRUE_URI_ALLOW_LIST=https://dev.example.com
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
| frontend (Build) | `VITE_SUPABASE_URL` | `https://auth-dev.example.com` |
| frontend (Build) | `VITE_SUPABASE_AUTH_PREFIX` | `` (빈 값 — **GoTrue 단독은 루트 경로**. 전체 Supabase(Kong)로 갈 때만 기본 `/auth/v1`) |
| frontend (Build) | `VITE_SUPABASE_ANON_KEY` | 아무 값 (Kong 없는 단독 구성에선 미사용) |

**④ NPM Proxy Host** — `auth-dev.example.com` → VM:80 (Traefik 경유),
Cache Assets ❌, IPSec-VPN-Only (infra-architecture.md §7.9).

**⑤ 검증**:

```bash
curl -s https://auth-dev.example.com/health           # GoTrue health
curl -s -X POST https://auth-dev.example.com/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"secret1"}'   # access_token 확인
# 브라우저: dev.example.com → ☁ 클라우드 → 로그인 폼 → 가입 → 저장/열기
```

## 6. 동작 확인 체크리스트

- [ ] `https://api-dev.example.com/v1/health` → `{"status":"ok","db":"up"}`
- [ ] `https://dev.example.com` 접속 → 에디터 표시
- [ ] ☁ 클라우드 → 저장 → 토스트 / 편집 → 자동 저장 배지
- [ ] ☁ → 열기 → 목록·이름변경·삭제
- [ ] `git push origin main` → Coolify가 자동 재배포(Deployments 로그 확인) *

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
| 도메인 | dev.example.com / api-dev.example.com | example.com / api.example.com |
| 자동 배포 | main 푸시 즉시 | 태그/릴리스 또는 수동 Deploy 버튼(권장) |
| AUTH_MODE | dev(Phase 3 전) | supabase (Phase 3 이후) |
| DB | Coolify PostgreSQL 16 | 동일(백업 정책 강화) + Phase 3에서 Supabase 스택 |

> Supabase Self-hosted·Redis 는 해당 Phase(3~) 진행 시 **Coolify의
> Docker Compose 리소스**로 같은 방식으로 얹는다
> (`docker-compose-spec.md`의 서비스 정의 참조).

## 8. 운영 팁

- **로그**: 각 리소스 → Logs (빌드/런타임 분리).
- **재배포**: Deployments → Redeploy (특정 커밋 선택 = 롤백).
- **Coolify 자체 업데이트**: 대시보드에서 안내에 따라 진행.
- **백업**: DB 리소스의 Scheduled Backup 기능 사용(S3 호환 대상 지정 가능).

---

관련: `infra-architecture.md`(네트워크·VM 배치), `docker-compose-spec.md`
(서비스 구성 스펙), `ci-cd-github-actions.md`(CI 품질 게이트 — 배포는
Coolify 담당), `../05-implementation/backend-phase1.md`(백엔드 단계).
