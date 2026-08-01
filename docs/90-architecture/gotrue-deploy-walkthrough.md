# GoTrue 배포 실행 가이드 — 초보자용 단계별 (dev 서버 로그인 활성화)

> `dev-server-coolify.md` §5.5(경로 A)를 **처음 배포하는 사람 기준**으로
> 풀어 쓴 실행 가이드다. 각 단계마다 "어디서 · 무엇을 · 결과 확인"을
> 명시한다. ⚠️ IP·도메인은 placeholder — 실제 값으로 바꿔 실행.
>
> **실행 순서는 §5.5와 달리 앱 전환(③)을 맨 뒤로 뒀다** — API 를
> supabase 모드로 바꾸는 순간부터 로그인 없이는 클라우드를 못 쓰므로,
> GoTrue 가 완전히 검증된 뒤 전환해야 잠기지 않는다.
>
> 작업 장소는 두 곳뿐이다:
> - **브라우저**: Coolify UI(`https://coolify-dev.example.com`), NPM
>   UI(`http://192.168.0.74:81`), 도메인 등록대행사 콘솔
> - **서버 SSH**: `ssh ubuntu@192.168.0.110` — 디렉토리는 어디든 상관
>   없다(홈 `~` 그대로). 모든 명령이 docker/curl 이라 경로 무관.

## 0단계 — DNS 레코드 (등록대행사 콘솔, 1분)

- **어디서**: 브라우저 → 도메인 등록대행사 DNS 콘솔
- **무엇을**: A 레코드 추가 — 이름 `auth-dev`, 값 `203.0.113.10`
  (기존 dev/api-dev 와 같은 공인 IP)
- **확인**: 개발 PC 명령창에서
  ```bash
  nslookup auth-dev.example.com
  ```
  → `203.0.113.10` 이 나오면 다음 단계 (전파에 수 분 걸릴 수 있다 —
  기다리는 동안 1단계 진행해도 된다)

## 1단계 — GoTrue 전용 DB 만들기 (Coolify UI, 3분)

- **어디서**: 서버 SSH (아무 디렉토리). 먼저 `docker ps` 로 **우리 앱
  DB 컨테이너 이름**을 확인한다 — `postgres:16` 이미지인 것
  (`coolify-db` 는 postgres:15-alpine = **Coolify 자체 DB, 건드리지 말
  것**). 아래 `<DB>` 자리에 그 이름을 넣는다.
- **무엇을**: 아래 3줄을 **한 줄씩** 실행한다.

  ```bash
  docker exec -i <DB> psql -U postgres -c "CREATE DATABASE gotrue;"
  docker exec -i <DB> psql -U postgres -d gotrue -c "CREATE SCHEMA IF NOT EXISTS auth;"
  docker exec -i <DB> psql -U postgres -d gotrue -c "\dn"
  ```

  > ⚠️ **psql 안에서 여러 줄을 한꺼번에 붙여넣지 말 것** (2026-08-01
  > 실제 사고): `\c gotrue` 같은 메타명령은 **그 줄의 나머지 전부를
  > 접속 인자로** 받는다. 다음 줄이 딸려 들어가면
  > `invalid integer value "IF" for connection option "port"` 같은
  > 엉뚱한 오류가 난다. 위처럼 `-d` 로 DB 를 지정하는 **비대화식 한 줄
  > 명령**을 쓰면 이 문제가 아예 없다.

- **확인**: 마지막 명령 출력의 스키마 목록에 **auth** 가 보이고,
  ```bash
  docker exec -i <DB> psql -U postgres -c "\l" | grep gotrue
  ```
  에 **gotrue** 가 나오면 1단계 완료. (`already exists` 오류는 이미
  만들었다는 뜻 — 문제없이 다음 단계로)

## 2단계 — GoTrue 컨테이너 배포 (Coolify UI, 10분)

**2-1. JWT 비밀키 만들기** — 서버 SSH(아무 디렉토리):
```bash
openssl rand -hex 32
```
출력된 64자 문자열을 **메모장에 복사**해 둔다 (이 값이 GoTrue 와 api
가 공유할 `JWT_SECRET`).

**2-2. 이미지 태그 확인** — 브라우저에서
`github.com/supabase/auth/releases` 를 열어 **최신 v2 태그**(예:
`v2.NNN.N`)를 복사한다. `latest` 는 쓰지 않는다(재배포 때 예고 없이
버전이 바뀐다).

**2-3. 리소스 생성** — Coolify → 프로젝트 `easymindmap-dev` →
**+ Add Resource → Docker Image**:

| 입력란 | 값 |
|---|---|
| Image | `supabase/auth:v2.NNN.N` (2-2에서 복사한 태그) |
| Ports Exposes | `9999` |
| Domains | `http://auth-dev.example.com` — 반드시 **http://** (§5.4) |

**2-4. 환경변수** — 리소스의 **Environment Variables** 탭에서 아래를
전부 추가 (Bulk/Developer 편집이 있으면 통째로 붙여넣기). `<PW>` 는
§5.1에서 바꾼 **영숫자 DB 비밀번호**, `<PG내부호스트>` 는 PostgreSQL
리소스 화면의 `Postgres URL (internal)` 에 보이는 호스트 부분(컨테이너
이름), `<JWT_SECRET>` 은 2-1의 64자:

```
GOTRUE_API_HOST=0.0.0.0
GOTRUE_API_PORT=9999
API_EXTERNAL_URL=https://auth-dev.example.com
GOTRUE_DB_DRIVER=postgres
GOTRUE_DB_DATABASE_URL=postgres://postgres:<PW>@<PG내부호스트>:5432/gotrue?search_path=auth
GOTRUE_SITE_URL=https://dev.example.com
GOTRUE_URI_ALLOW_LIST=https://dev.example.com
GOTRUE_JWT_SECRET=<JWT_SECRET>
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_AUD=authenticated
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
GOTRUE_DISABLE_SIGNUP=false
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_MAILER_AUTOCONFIRM=true
GOTRUE_PASSWORD_MIN_LENGTH=6
```

**2-5. Deploy 클릭** 후 확인:

1. **Deployments 로그**: 이미지 pull → 시작까지 오류가 없는지.
2. **Logs 탭**: `running migrations` 류 메시지 후
   `GoTrue API started` / listening 계열 메시지가 보이고, ERROR 가
   없어야 한다. (DB 접속 오류가 보이면 → 2-4의 DATABASE_URL 호스트/
   비밀번호 재확인)
3. **마이그레이션 결과** — 1단계의 psql 터미널에서:
   ```sql
   \c gotrue
   \dt auth.*
   ```
   → `auth.users`, `auth.refresh_tokens` 등 테이블 여러 개가 보이면
   성공.
4. **서버 안에서 응답 확인** — 서버 SSH(아무 디렉토리):
   ```bash
   curl -s -H "Host: auth-dev.example.com" http://localhost/health
   ```
   → `{"version":...,"name":"GoTrue"...}` JSON 이 나오면 Traefik →
   GoTrue 라우팅까지 정상. **이게 나와야 3단계 진행.**

## 3단계 — NPM Proxy Host (NPM UI, 5분)

- **어디서**: 브라우저 → `http://192.168.0.74:81` (NPM 관리 UI)
- **무엇을**: Hosts → Proxy Hosts → **Add Proxy Host**:
  - Details: Domain `auth-dev.example.com` / Scheme `http` /
    Forward `192.168.0.110` / Port `80` / Websockets ✅ /
    **Cache Assets ❌**
  - SSL 탭: Request a new SSL Certificate + Force SSL ✅
  - Access List: `IPSec-VPN-Only`
- **확인** — 개발 PC(VPN 연결 상태) 명령창:
  ```bash
  curl -s https://auth-dev.example.com/health
  ```
  → GoTrue JSON 이 나오면 성공. 다음도 해 본다 (실제 가입 시험):
  ```bash
  curl -s -X POST https://auth-dev.example.com/signup \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"smoke@example.com\",\"password\":\"secret1\"}"
  ```
  → `access_token` 이 든 JSON 이 나오면 **로그인 서버 완성.**
  (`error` 가 나오면 Logs 탭 → 실패 시 확인처는 `dev-server-runbook.md`
  §3 표)

## 4단계 — api 를 supabase 모드로 전환 (Coolify UI, 3분)

> ⚠️ 이 단계부터 로그인 없이는 클라우드 저장이 안 된다 — 3단계
> 검증이 끝난 뒤에만 진행.

- **어디서**: Coolify → **api 리소스** → Environment Variables
- **무엇을**:
  - `AUTH_MODE` 값을 `dev` → `supabase` 로 수정
  - `SUPABASE_JWT_SECRET` 추가 = 2-1의 `<JWT_SECRET>` 과 **똑같은 값**
    (Buildtime·Runtime 둘 다 체크)
  - 저장 후 **Redeploy** (환경변수만 저장하면 반영 안 됨 — §5.1 주의와
    동일)
- **확인** — 개발 PC:
  ```bash
  curl -s https://api-dev.example.com/v1/health
  # → {"status":"ok","db":"up"}  (health 는 인증 불필요)
  curl -s https://api-dev.example.com/v1/maps
  # → 401 {"message":"로그인이 필요합니다..."}  ← 인증이 켜졌다는 증거!
  ```
  `/v1/maps` 가 401 이면 정상. (200 이 나오면 AUTH_MODE 가 아직 dev —
  재배포 여부 확인)

## 5단계 — frontend 빌드 변수 + 재배포 (Coolify UI, 5분)

- **어디서**: Coolify → **frontend 리소스** → Environment Variables
- **무엇을** (전부 **Buildtime 체크** — Vite 는 빌드 시점 값):
  - `VITE_SUPABASE_URL` = `https://auth-dev.example.com`
  - `VITE_SUPABASE_AUTH_PREFIX` = **빈 값** (변수는 만들되 값을 비움 —
    GoTrue 단독은 루트 경로. 나중에 전체 Supabase(Kong)로 바꿀 때만
    `/auth/v1` 을 넣는다)
  - `VITE_SUPABASE_ANON_KEY` = `not-used` (단독 구성에선 미사용이지만
    아무 값이나 넣어 둔다)
  - 저장 후 **Redeploy** (빌드 변수라 재빌드 필수)
- **확인** — 브라우저에서 `https://dev.example.com` 접속 후 **강력
  새로고침(Ctrl+Shift+R)** — 옛 index.html 캐시 방지:
  1. 우상단 **☁ 클라우드** 클릭 → **"클라우드 로그인" 폼**이 보인다
  2. 이메일/비밀번호(6자+) 입력 → **가입** → "가입하고 로그인했습니다"
     토스트 + 메뉴에 👤 이메일 표시
  3. **☁ 클라우드에 저장** → "저장했습니다" 토스트
  4. **F5 새로고침** → ☁ 메뉴에 여전히 👤 이메일 (세션 유지) →
     📂 열기 → 방금 맵이 목록에 보이고 열린다
  5. 로그아웃 → 로그인 폼으로 돌아오면 **전 과정 완료** 🎉

## 문제가 생기면

| 증상 | 확인처 |
|---|---|
| 2단계 Logs 에 DB 오류 | DATABASE_URL 의 호스트(내부 컨테이너명)·비밀번호(영숫자) — coolify §5.1 |
| 3단계 /health 502 | GoTrue 리소스의 Ports Exposes `9999` 누락 / Coolify Domains 미설정 |
| 3단계 SSL 발급 실패 | 0단계 DNS 전파 대기 후 재시도 (NPM SSL 탭에서 재발급) |
| 5단계에서 로그인 폼이 안 보임 | Redeploy 를 안 했거나(빌드 변수), 브라우저 캐시 — Ctrl+Shift+R |
| 가입 클릭 시 "인증 서버에 연결할 수 없습니다" | VITE_SUPABASE_URL 오타 / VPN 미연결 / 3단계 curl 재확인 |
| 가입은 되는데 저장이 401 | api 의 SUPABASE_JWT_SECRET ≠ GOTRUE_JWT_SECRET (값 불일치) |
| 그 외 | `dev-server-runbook.md` §3 증상별 표 |

관련: `dev-server-coolify.md` §5.5(요약판·환경변수 원본),
`infra-architecture.md` §7.9, `../05-implementation/backend-phase1.md`
Phase 3.
