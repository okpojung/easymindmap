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

### 명령을 어디서 실행할지 — 판단 기준

각 코드블록에 `[서버 SSH]` / `[개발 PC]` 를 표기했다. 표기가 없거나
헷갈리면 아래 기준으로 판단한다:

| 명령 형태 | 실행 위치 |
|---|---|
| `docker …`, `psql …` | **서버 SSH** |
| `http://localhost/…` 호출 | **서버 SSH** (localhost = Traefik) |
| `https://…` 호출, `curl.exe …` | **개발 PC** |
| Coolify / NPM 화면 조작 | 개발 PC 브라우저 |

> ⚠️ `http://localhost/...` 을 개발 PC 에서 실행하면 **조용히 아무것도
> 반환하지 않아** 실패를 오인하기 쉽다 (실제 사고). 반대로
> `https://auth-dev.example.com/...` 은 개발 PC 에서 실행해야 하며,
> VPN 에 연결돼 있어야 한다(NPM Access List).
>
> **개발 PC 가 Windows 라면** `cmd` 기준으로:
> - 작은따옴표는 인용부호로 동작하지 않는다 → **큰따옴표**를 쓴다
> - `/dev/null` 대신 **`NUL`**
> - 가장 단순한 확인은 `curl -i <URL>` (상태줄이 그대로 보인다)

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

**2-1. JWT 비밀키 만들기** — `[서버 SSH]`:
```bash
openssl rand -hex 32
```

> ⚠️ **이 값은 딱 한 번만 만들고, 두 곳에 똑같이 넣는다.** ★가장 흔한 실수
>
> | 넣을 곳 | 변수명 | 단계 |
> |---|---|---|
> | GoTrue 리소스 | `GOTRUE_JWT_SECRET` | 2-4 |
> | api 리소스 | `SUPABASE_JWT_SECRET` | 4단계 |
>
> 두 값이 **한 글자라도 다르면** 이런 증상이 나온다 — 진단이 매우 어렵다:
> - GoTrue 로그인은 **성공**한다 (토큰이 정상 발급된다)
> - api 헬스체크도 **정상**이다
> - **그런데 그 토큰으로 API 를 호출하면 전부 401**
> - api 컨테이너 로그에도 단서가 남지 않는다
>
> 토큰 만료·CORS·프록시 문제로 오인해 시간을 크게 쓰게 되니, 401 이
> 나오면 **4단계 말미의 시크릿 길이·일치 비교부터** 실행할 것.
>
> 메모장에 붙여넣을 때 **앞뒤 공백·줄바꿈이 딸려가지 않도록** 주의한다.

**2-2. 이미지 태그 확인** — 브라우저에서
`github.com/supabase/auth/releases` 를 열어 **최신 v2 정식 태그**(예:
`v2.194.0`)를 복사한다.

> `latest` 는 쓰지 않는다(재배포 때 예고 없이 버전이 바뀐다).
> **`-rc` 가 붙은 태그는 pre-release** 이므로 피한다.

**2-3. 리소스 생성** — Coolify → 프로젝트 `easymindmap-dev` →
**+ Add Resource → Docker Image**:

| 입력란 | 값 |
|---|---|
| Image | `supabase/auth:v2.NNN.N` (2-2에서 복사한 태그) |
| **Ports Exposes** | **`9999`** — 기본값 `80` 을 반드시 바꾼다 |
| Domains | `http://auth-dev.example.com` — 반드시 **http://** (§5.4) |

> ⚠️ **`Ports Exposes` 기본값은 `80` 이다. 반드시 `9999` 로 바꾼다.**
> GoTrue 는 컨테이너 내부에서 9999 를 듣는다(`GOTRUE_API_PORT`).
> 80 인 채로 두면 **컨테이너는 정상 기동하는데 Traefik 라우팅에서 502**
> 가 난다 (원인을 프록시에서 찾게 되어 시간을 쓴다).
>
> `Domains` 입력 후 반드시 **Save** 를 눌러야 Container Labels 에
> 반영된다. 저장 후 라벨에 다음 두 줄이 있는지 확인:
> - ``Host(`auth-dev.example.com`)``
> - `loadbalancer.server.port=9999`
>
> 자동 생성된 `...sslip.io` 주소가 그대로 남아 있으면 404 가 난다.
> 안 바뀌면 **`Reset Labels to Defaults`** 를 누른다.

**2-4. 환경변수** — 리소스의 **Environment Variables** 탭에서 아래를
전부 추가 (Bulk/Developer 편집이 있으면 통째로 붙여넣기):

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

> ⚠️ **붙여넣은 뒤 반드시 3곳을 실제 값으로 치환한다.** ★
>
> | 자리표시자 | 실제 값 | 얻는 곳 |
> |---|---|---|
> | `<PW>` | DB 비밀번호(영숫자 — §5.1) | PostgreSQL 리소스 → Password 👁 |
> | `<PG내부호스트>` | 컨테이너 이름 | PostgreSQL 리소스 → `Postgres URL (internal)` 의 `@` 뒤 |
> | `<JWT_SECRET>` | 2-1의 64자 | 메모장 |
>
> **가장 쉬운 방법**: `Postgres URL (internal)` 을 통째로 복사한 뒤 끝의
> `/postgres` 만 `/gotrue?search_path=auth` 로 바꾼다.
>
> ```
> 복사한 값 : postgres://postgres:abc123...@roxca4...:5432/postgres
> 수정 후   : postgres://postgres:abc123...@roxca4...:5432/gotrue?search_path=auth
> ```
>
> 저장 전에 Developer view 전체를 훑어 **`<` 또는 `>` 가 하나도 없는지**
> 눈으로 확인한다. 남아 있으면 GoTrue 가 URL 파싱 단계에서 즉사한다:
> ```
> {"level":"fatal","msg":"parse \"postgres://postgres:<PW>@...\":
>  net/url: invalid userinfo\nparsing db connection url..."}
> ```
> 이 경우 **10회 재시작 후 Coolify 가 컨테이너를 정리해버려
> `docker ps -a` 로도 찾을 수 없고** 로그 확보조차 어려워진다
> (→ 아래 2-5의 "컨테이너가 즉시 죽어 로그를 못 볼 때").

**2-5. Deploy 클릭** 후 확인:

1. **Deployments 로그**: 이미지 pull → 시작까지 오류가 없는지.
2. **Logs 탭**: `running migrations` 류 메시지 후
   `GoTrue API started` / listening 계열 메시지가 보이고, ERROR 가
   없어야 한다. (DB 접속 오류가 보이면 → 2-4의 DATABASE_URL 호스트/
   비밀번호 재확인)
3. **마이그레이션 결과** — `[서버 SSH]`:
   ```bash
   docker exec -i <DB> psql -U postgres -d gotrue -c "\dt auth.*"
   ```
   → `auth.users`, `auth.refresh_tokens` 등 **테이블 20여 개**(v2.194
   기준 23개)가 보이면 성공.
4. **서버 안에서 응답 확인** — `[서버 SSH]` (개발 PC 에서 실행하면
   아무것도 반환하지 않는다 — localhost 가 Traefik 이어야 의미가 있다):
   ```bash
   curl -s -H "Host: auth-dev.example.com" http://localhost/health
   ```
   → `{"version":...,"name":"GoTrue"...}` JSON 이 나오면 Traefik →
   GoTrue 라우팅까지 정상. **이게 나와야 3단계 진행.**
   (502 가 나오면 → 2-3의 `Ports Exposes 9999` 확인)
5. **헬스체크 설정** — 리소스 → **Healthcheck** 탭. 설정하지 않으면
   리소스가 계속 `Running (unknown)` ⚠ 로 남는다:

   | 항목 | 값 |
   |---|---|
   | Type / Method / Scheme | HTTP / GET / http |
   | Host | `localhost` |
   | **Port** | **`9999`** (기본값 80 → 반드시 변경) |
   | **Path** | **`/health`** (api 와 달리 `/v1` 접두어 없음) |
   | Return Code | `200` |

   `Save` → `Enable Healthcheck` → **`Redeploy`** 순서로 적용한다
   (Save 만으로는 활성화되지 않고, 컨테이너를 새로 만들어야 반영된다).

   > 로그에 `/bin/sh: curl: not found | Return code: 0` 이 보여도
   > 정상이다 — GoTrue 이미지에 curl 이 없을 뿐, Return code 0 이면
   > healthy 로 판정된다.

> **컨테이너가 즉시 죽어 로그를 못 볼 때** — `[서버 SSH]` 에서 감시
> 루프를 먼저 띄운 뒤, Coolify 에서 Deploy 를 누른다. 재시작 한계
> 도달로 컨테이너가 정리되기 전에 로그를 잡을 수 있다:
>
> ```bash
> while true; do
>   C=$(sudo docker ps -a --filter ancestor=supabase/auth:v2.NNN.N \
>       --format '{{.Names}}' | head -1)
>   if [ -n "$C" ]; then
>     echo "=== $C ==="; sudo docker logs -f "$C" 2>&1
>   fi
>   sleep 1
> done
> ```
> `Ctrl+C` 로 중단.

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
**확인 1 — 인증이 켜졌는가** `[개발 PC]`:

```bash
curl -i https://api-dev.example.com/v1/health
# → 200 {"status":"ok","db":"up"}   (health 는 인증 불필요)

curl -i https://api-dev.example.com/v1/maps
# → 401 {"message":"로그인이 필요합니다..."}   ← 인증이 켜졌다는 증거
# → 200 이면 AUTH_MODE 가 아직 dev (재배포 여부 확인)
```

> **401 은 두 가지 상반된 의미를 가진다** — 반드시 구분할 것:
>
> | 상황 | 401 의 의미 |
> |---|---|
> | 토큰 **없이** 호출 | ✅ 정상 — 인증이 켜졌다 |
> | **유효한 토큰으로** 호출 | ❌ 실패 — 시크릿 불일치 |
>
> 확인 1은 앞의 것만 증명한다. **확인 2 없이 5단계로 넘어가면**
> 시크릿 불일치를 프런트 단계까지 끌고 가, 브라우저에서 로그인이 안
> 될 때 프런트 문제인지 백엔드 문제인지 분간할 수 없게 된다.

**확인 2 — 토큰이 실제로 통하는가** `[개발 PC]` ★ **반드시 하고 넘어갈 것**

PowerShell:
```powershell
$r = curl.exe -s -X POST "https://auth-dev.example.com/token?grant_type=password" `
     -H "Content-Type: application/json" `
     -d '{\"email\":\"본인계정\",\"password\":\"비밀번호\"}' | ConvertFrom-Json
$t = $r.access_token
curl.exe -i -s https://api-dev.example.com/v1/maps -H "Authorization: Bearer $t"
```

- **200** (`{"maps":[],"total":0}`) → ✅ 5단계 진행
  (새 계정이라 맵이 비어 있는 것이 정상 — 기존 맵은 `DEV_USER_ID` 소유)
- **401** → 시크릿 불일치. 아래 진단 실행

**401 진단 — 시크릿 비교** `[서버 SSH]`:

```bash
API=$(sudo docker ps --format '{{.Names}}' | grep <api 컨테이너 일부>)
AUTH=$(sudo docker ps --format '{{.Names}}' | grep <gotrue 컨테이너 일부>)
echo -n "api    길이: "; sudo docker exec -i $API printenv SUPABASE_JWT_SECRET | wc -c
echo -n "gotrue 길이: "; sudo docker exec -i $AUTH printenv GOTRUE_JWT_SECRET | wc -c
echo -n "AUTH_MODE  : "; sudo docker exec -i $API printenv AUTH_MODE
[ "$(sudo docker exec -i $API printenv SUPABASE_JWT_SECRET)" \
= "$(sudo docker exec -i $AUTH printenv GOTRUE_JWT_SECRET)" ] \
  && echo "==> 동일" || echo "==> ★ 다름"
```

- 시크릿 **값 자체는 출력하지 않고** 길이와 일치 여부만 본다.
  `openssl rand -hex 32` 기준 **양쪽 다 65**(64자 + 개행)여야 한다.
- `★ 다름` 이면 한쪽 값을 다른 쪽에 복사하고 **해당 리소스만 Redeploy**.
  시크릿을 바꾼 뒤에는 **반드시 새로 로그인**한다(옛 토큰은 옛 키로
  서명되어 있어 무효).

## 5단계 — frontend 빌드 변수 + 재배포 (Coolify UI, 5분)

- **어디서**: Coolify → **frontend 리소스** → Environment Variables
- **무엇을** (전부 **Buildtime 체크** — Vite 는 빌드 시점 값):
  - `VITE_SUPABASE_URL` = `https://auth-dev.example.com`
  - `VITE_SUPABASE_AUTH_PREFIX` = **빈 값** (변수는 만들되 값을 비움 —
    GoTrue 단독은 루트 경로. 나중에 전체 Supabase(Kong)로 바꿀 때만
    `/auth/v1` 을 넣는다)
  - `VITE_SUPABASE_ANON_KEY` = `not-used` (단독 구성에선 미사용이지만
    아무 값이나 넣어 둔다)
  - `VITE_API_URL` 은 이미 있어야 한다 — `https://api-dev.example.com`
    (**`/v1` 을 붙이면 안 된다** — API 가 자체적으로 `v1` 접두사를
    붙이므로 `.../v1/v1/maps` 가 된다)
  - 저장 후 **Redeploy** (빌드 변수라 재빌드 필수)

  > **`VITE_SUPABASE_AUTH_PREFIX` 빈 값에 대하여** (2026-08-01 빌드
  > 실측): Coolify 가 빈 값을 저장하지 못하거나 변수를 아예 만들지
  > 않아도 **Docker 빌드에서는 결과가 같다** — frontend Dockerfile 의
  > `ENV VITE_SUPABASE_AUTH_PREFIX=$VITE_SUPABASE_AUTH_PREFIX` 가
  > 빈 문자열로 설정하기 때문이다(→ 루트 경로 = GoTrue 단독에 맞음).
  > 다만 **Docker 밖에서 `npm run build` 를 직접 하면** 변수가 없을 때
  > `/auth/v1` 로 폴백하므로, 그 경우엔 명시적으로 빈 값을 지정한다.
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
| GoTrue 컨테이너가 10회 재시작 후 정지, `docker ps -a` 에도 없음 | 2-4 **플레이스홀더 미치환**(`<PW>` 등) → `invalid userinfo`. 감시 루프로 로그 확보(2-5) |
| 2단계 Logs 에 DB 오류 | DATABASE_URL 의 호스트(내부 컨테이너명)·비밀번호(영숫자) — coolify §5.1 |
| 2·3단계 /health **502** | GoTrue 리소스의 **Ports Exposes 가 80** (→ `9999`) / Domains Save 누락 → Container Labels 확인 |
| 3단계 **404** (sslip.io 주소 응답) | Coolify Domains 미반영 — Save 후 `Reset Labels to Defaults` |
| 리소스가 계속 `Running (unknown)` ⚠ | 헬스체크 미설정 — 2-5의 5번(Port 9999 / Path `/health`) |
| 3단계 SSL 발급 실패 | 0단계 DNS 전파 대기 후 재시도 (NPM SSL 탭에서 재발급) |
| **유효 토큰인데 401** (GoTrue 로그인·api health 는 정상) | ★ **시크릿 불일치** — 4단계 "401 진단" 실행 |
| 배포는 "성공"인데 환경변수가 반영 안 됨 | 새 컨테이너 기동 실패 후 **롤백** — Deployment 로그의 `New container is unhealthy` / `rolling back` 과 `Container logs:` 구간 확인 |
| 5단계에서 로그인 폼이 안 보임 | Redeploy 를 안 했거나(빌드 변수), 브라우저 캐시 — Ctrl+Shift+R |
| 가입 클릭 시 **404** | 경로 접두사 문제 — 개발자도구 Network 에서 요청이 `/signup`(정상) 인지 `/auth/v1/signup`(문제) 인지 확인 → `VITE_SUPABASE_AUTH_PREFIX` |
| 브라우저에서만 **CORS 오류**(서버 SSH `curl` 로는 정상) | ★ **NPM Access List 가 preflight(OPTIONS)를 차단** — 브라우저는 본 요청 전에 인증 헤더 없는 OPTIONS 를 보내는데, Access List 의 인증/IP 제한에 걸려 401·403 이 되고 브라우저는 이를 CORS 오류로 표시한다. auth-dev Proxy Host 의 Advanced 에 **OPTIONS 예외**를 추가한다 (아래) |
| 가입 클릭 시 "인증 서버에 연결할 수 없습니다" | VITE_SUPABASE_URL 오타 / VPN 미연결 / 3단계 curl 재확인 |
| 가입은 되는데 저장이 401 | api 의 SUPABASE_JWT_SECRET ≠ GOTRUE_JWT_SECRET (값 불일치) |
| 그 외 | `dev-server-runbook.md` §3 증상별 표 |

## 확정된 실제 구성 (2026-08-02 배포 완료 기준)

| 항목 | 값 |
|---|---|
| GoTrue 이미지 | `supabase/auth:v2.194.0` (`-rc` 태그는 pre-release — 피할 것) |
| Ports Exposes | `9999` |
| 헬스체크 | Port `9999`, Path `/health`, 200 |
| NPM Forward | `80` (Traefik 경유 — 9999 아님) |
| Coolify Domains | `http://auth-dev.example.com` (SSL 은 NPM 종단) |
| DB | 별도 `gotrue` DB + `auth` 스키마, 마이그레이션 후 테이블 23개 |

관련: `dev-server-coolify.md` §5.5(요약판·환경변수 원본),
`infra-architecture.md` §7.9, `../05-implementation/backend-phase1.md`
Phase 3.
