# 개발 서버 운영 런북 (VM-DEV · Coolify)

> 구축 절차는 [`dev-server-coolify.md`](dev-server-coolify.md),
> 네트워크·NPM은 [`infra-architecture.md`](infra-architecture.md) 참조.
> 이 문서는 **운영 중 반복 참조**하는 절차·명령 모음이다 (2026-08-01,
> 실구축 세션 결과 기반).
>
> ⚠️ IP·도메인은 문서용 예시(placeholder)다. 실제 값은 저장소 밖에서 관리.

## 0. 스키마 드리프트 방지 — 배포 후 반드시 확인 ★

> 배포는 **코드는 자동(Coolify), 스키마는 수동**이다. 스키마 변경이
> 포함된 배포에서 이 단계를 빠뜨리면 저장이 500 으로 실패한다
> (2026-08-02 B8 배포에서 제기된 위험).

**① 배포 후 헬스체크로 즉시 확인** — 스키마가 낡으면 그렇다고 말해 준다:

```bash
curl -s https://api-dev.example.com/v1/health
# 정상   {"status":"ok","db":"up","schema":"ok",...}
# 낡음   {"status":"degraded","db":"up","schema":"outdated",
#         "missingTables":["map_folders"],...}
# 낡음   {"status":"degraded","db":"up","schema":"outdated",
#         "missingColumns":["maps.folder_id","maps.kind"],...}
#        ↑ 테이블은 있는데 **컬럼만 없는** 경우도 잡는다 (2026-08-02 문서함)
```

**② 낡았으면 스키마 적용** — 아래 세 방법 중 **상황에 맞는 하나**를
고른다. `schema.sql` 이 단일 기준이고 모든 DDL 이 멱등(IF NOT EXISTS)이라
몇 번 적용해도 안전하다.

#### 2-A. 서버 SSH + 델타 SQL 붙여넣기 ★ 권장

**dev 서버는 저장소가 없고 DB 도 내부 네트워크에만 열려 있다.** 그래서
평소에는 이 방법이 가장 빠르고 안전하다 — 파일 전송도, DB 외부 노출도
필요 없다.

```bash
# ① DB 컨테이너 이름 확인 (NAMES 열)
docker ps --format 'table {{.Names}}\t{{.Image}}' | grep -i postgres

# ② 이번 배포에서 늘어난 DDL 만 붙여넣기 (<DB> 만 바꾼다)
docker exec -i <DB> psql -U postgres -d postgres <<'SQL'
CREATE TABLE IF NOT EXISTS public.<새 테이블> ( … );
ALTER TABLE public.<기존 테이블> ADD COLUMN IF NOT EXISTS <새 컬럼> …;
DROP POLICY IF EXISTS "<정책 이름>" ON public.<테이블>;
CREATE POLICY "<정책 이름>" ON public.<테이블> FOR ALL USING (auth.uid() = owner_id);
SQL
```

> ⚠️ 마지막 `SQL` 은 **줄 맨 앞**에 와야 한다(앞 공백 금지). 들여쓰면
> heredoc 이 끝나지 않아 다음 줄이 SQL 로 딸려 들어간다 —
> 2026-08-01 GoTrue 세션의 `\c gotrue` 붙여넣기 사고와 같은 계열이다.
> ⚠️ `CREATE POLICY` 에는 `IF NOT EXISTS` 가 없다. 재실행이 안전하도록
> **`DROP POLICY IF EXISTS` 를 앞에 붙인다**(첫 실행에서 나오는
> `does not exist, skipping` NOTICE 는 정상).

#### 2-B. 저장소가 있는 곳에서 `npm run db:apply`

DB 에 **직접 접속할 수 있을 때만** 쓴다(로컬 개발 DB, 또는 포트를 연
환경). Coolify DB 는 기본이 내부 전용이라 개발 PC 에서는 보통 닿지 않고,
그것 때문에 외부 포트를 여는 것은 권하지 않는다.

```bash
cd apps/api
DATABASE_URL='postgres://postgres:<PW>@<host>:5432/postgres' npm run db:apply
# → "스키마 적용 완료 — 실행 N건 · 이미 있음 M건"
```

#### 2-C. schema.sql 파일을 통째로 밀어 넣기

서버에 파일을 올릴 수 있을 때(scp 등). 전체를 재적용하므로 델타를
따로 뽑을 필요가 없다.

```bash
docker exec -i <DB> psql -U postgres -d postgres < apps/api/database/schema.sql
```

**적용 후에는 반드시 ① 의 헬스체크로 확인한다** — 개발 PC PowerShell
에서도 된다:

```powershell
curl.exe -s https://api-dev.example.com/v1/health
# {"status":"ok","db":"up","schema":"ok",...}  ← 이게 나와야 끝
```

**③ 새 테이블·컬럼을 추가한 개발자가 할 일**: `schema.sql` 에 넣고,
`src/health/health.controller.ts` 의 `REQUIRED_TABLES` (테이블) 또는
`REQUIRED_COLUMNS` (`테이블.컬럼`) 에도 추가한다 — 그래야 배포 때
헬스체크가 누락을 잡는다. 기존 테이블에 컬럼을 더할 때는
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` 로 써서 재적용이 안전하게 한다.
그리고 **PR 본문에 2-A 에 그대로 붙여넣을 수 있는 델타 SQL 을 실어 준다**
— 배포하는 사람이 schema.sql 에서 무엇이 늘었는지 다시 찾지 않아도 되게
(2026-08-02 문서함 배포에서 이 과정을 실제로 손으로 만들었다).

> **마이그레이션 도구는 아직 도입하지 않는다.** 현재는 컬럼 변경 없이
> 테이블 추가만 있어 멱등 재적용으로 충분하다. **기존 컬럼 변경·삭제가
> 필요해지는 시점**(데이터 보존이 걸리는 순간)에 node-pg-migrate 등을
> 도입한다 — backlog B11.

## 1. 스키마 적용 — **첫 설치와 재적용은 절차가 다르다** ★

> ⚠️ **첫 설치용 명령을 재적용에 그대로 쓰면 안 된다** (2026-08-02
> 서버 세션 지적). 첫 설치는 `ON_ERROR_STOP=1` + 실패 시 `break` 로
> 도는데, **재적용에서는 shim 의 publication 이 이미 존재해**
> `relation "nodes" is already member of publication "supabase_realtime"`
> 오류가 나고, 거기서 루프가 끊겨 **뒤의 schema.sql 이 실행되지 않는다**
> — "적용했다"고 생각했는데 새 테이블이 안 들어가는 사고가 난다.

### 1-A. 첫 설치 (빈 DB — 순서 의존성 있음, shim 선행 필수)

```bash
DB=<db 컨테이너 이름>   # docker ps 로 확인 (postgres:16 이미지)
for f in \
  apps/api/database/dev/00-supabase-shim.sql \
  apps/api/database/schema.sql \
  apps/api/database/functions/move_node_subtree.sql \
  apps/api/database/dev/01-seed-dev-user.sql
do
  docker exec -i "$DB" psql -U "$PGUSER" -d "$PGDB" \
    -v ON_ERROR_STOP=1 -f - < "$f" || { echo "FAILED: $f"; break; }
done
```

### 1-B. 재적용 (이미 쓰고 있는 DB에 새 테이블·인덱스 반영)

**권장 — `npm run db:apply`**: 문장 단위로 적용하며 "이미 있음" 계열
오류(중복 테이블·중복 객체·publication 중복)만 건너뛰고 **그 외
오류에서는 멈춘다**. 위 함정이 구조적으로 발생하지 않는다.

```bash
# 저장소가 있는 곳(개발 PC 등)에서
cd apps/api
DATABASE_URL='postgres://postgres:<PW>@<host>:5432/postgres' npm run db:apply
# → "스키마 적용 완료 — 실행 N건 · 이미 있음 M건"
```

**서버에 저장소가 없을 때** — `schema.sql` **하나만**, `ON_ERROR_STOP`
**없이** 실행한다(shim·seed 는 이미 적용돼 있으므로 다시 돌리지 않는다):

```bash
docker exec -i "$DB" psql -U "$PGUSER" -d "$PGDB" < apps/api/database/schema.sql
```

> `ON_ERROR_STOP` 을 빼는 이유는 "이미 있음" 오류를 무시하고 끝까지
> 진행하기 위해서다. 대신 **적용 후 반드시 §0 의 헬스체크로 확인**한다
> (`"schema":"ok"`). 이것이 "오류를 무시해도 안전한" 근거다.

- 완전 초기화가 필요하면 DB 리소스를 지우고 재생성 후 **1-A** —
  단, **비밀번호 규칙(영숫자만)** 을 다시 지킬 것
  (dev-server-coolify.md §5.1 경고).

## 1.5 첨부 저장소 (B9 — 방식 A: 로컬 디스크 + NFS 마운트)

첨부 파일 원본은 API 컨테이너의 **로컬 디스크 드라이버**가
`STORAGE_LOCAL_DIR` 디렉터리에 저장한다. dev 서버는 이 디렉터리를 NAS 의
NFS 마운트로 두어 데이터가 NAS 에 쌓이게 한다 (드라이버는 디렉터리가
SSD 인지 NFS 인지 구분하지 않는다 — S3 호환 드라이버는 향후 같은
인터페이스로 추가).

### 1.5-0. 델타 SQL 자동 적용 스크립트 (붙여넣기 한 번)

`<DB컨테이너>` 이름을 몰라도 된다 — 아래 블록 **전체를 서버 SSH 터미널에
그대로 붙여넣으면**, DB 컨테이너를 자동으로 찾아 델타 SQL 을 적용하고
결과까지 검증해 준다. (두 번 실행해도 안전 — 전부 IF NOT EXISTS)

```bash
bash <<'SCRIPT'
set -e

# ── 1) DB 컨테이너 자동 탐색 ─────────────────────────────────────
#    supabase/postgres 이미지를 우선, 없으면 아무 postgres 이미지.
DB=$(docker ps --format '{{.Names}}\t{{.Image}}' \
  | awk -F'\t' 'tolower($2) ~ /supabase\/postgres/ {print $1; exit}')
[ -z "$DB" ] && DB=$(docker ps --format '{{.Names}}\t{{.Image}}' \
  | awk -F'\t' 'tolower($2) ~ /postgres/ {print $1; exit}')
if [ -z "$DB" ]; then
  echo "❌ 실행 중인 postgres 컨테이너를 찾지 못했습니다."
  echo "   docker ps 로 확인해 주세요. (docker 권한이 없으면 sudo 로 실행)"
  exit 1
fi
echo "✅ DB 컨테이너: $DB"

# ── 2) 첨부 저장소 + 쿼터 델타 SQL (B9) ─────────────────────────
docker exec -i "$DB" psql -U "$PGUSER" -d "$PGDB" <<'SQL'
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS quota_bytes BIGINT NOT NULL DEFAULT 1073741824;

CREATE TABLE IF NOT EXISTS public.attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    map_id       UUID REFERENCES public.maps(id) ON DELETE SET NULL,
    name         VARCHAR(255) NOT NULL,
    mime         VARCHAR(127) NOT NULL DEFAULT 'application/octet-stream',
    size_bytes   BIGINT NOT NULL,
    storage_key  TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attachments_owner
    ON public.attachments(owner_id);
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users can manage own attachments" ON public.attachments;
CREATE POLICY "users can manage own attachments"
    ON public.attachments FOR ALL
    USING (auth.uid() = owner_id);
SQL

# ── 3) 적용 결과 검증 ────────────────────────────────────────────
echo "── 검증 ──"
docker exec -i "$DB" psql -U "$PGUSER" -d "$PGDB" -tA <<'SQL'
SELECT 'attachments 테이블: ' ||
       CASE WHEN to_regclass('public.attachments') IS NOT NULL
            THEN 'OK' ELSE 'MISSING' END;
SELECT 'users.quota_bytes: ' ||
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema='public' AND table_name='users'
                           AND column_name='quota_bytes')
            THEN 'OK' ELSE 'MISSING' END;
SQL
echo "끝 — 두 줄 모두 OK 면 성공입니다."
echo "다음 단계: NFS 마운트(§1.5-A) → Coolify 볼륨·환경변수(§1.5-B) → 재배포"
echo "재배포 후 https://<API주소>/v1/health 의 schema 가 ok 인지 확인하세요."
SCRIPT
```

### 1.5-0-A. ★ DB 컨테이너·계정을 찾는 법 — **이 방법만 쓴다** (2026-08-14)

아래 스크립트들이 전부 이 방식을 쓴다. **이미지 이름으로 postgres
컨테이너를 찾지 않는다.**

```bash
# ★ 이름·포트로 고르지 않는다 — **우리 표가 있는 DB 를 찾는다** (2026-08-18)
find_emm_db() {
  for C in $(docker ps --format '{{.Names}}'); do
    U=$(docker exec "$C" printenv DATABASE_URL 2>/dev/null) || continue
    H=$(printf '%s' "$U"  | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
    US=$(printf '%s' "$U" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
    N=$(printf '%s' "$U"  | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
    OK=$(docker exec "$H" psql -U "$US" -d "$N" -tAc \
          "SELECT to_regclass('public.map_documents') IS NOT NULL" 2>/dev/null)
    if [ "$OK" = "t" ]; then
      API="$C"; DB="$H"; PGUSER="$US"; PGDB="$N"
      echo "✅ easymindmap → 앱=$API DB=$DB 계정=$PGUSER DB이름=$PGDB"
      return 0
    fi
  done
  echo "❌ easymindmap DB 를 찾지 못했습니다."; docker ps --format '{{.Names}}'; return 1
}
find_emm_db || exit 1
```

**왜 바꿨나** (2026-08-14 실사용에서 깨졌다):

| 옛 방식 | 이 서버에서 벌어진 일 |
|---|---|
| 이미지에 `postgres` 가 든 컨테이너를 찾는다 | 앱 DB 는 **이미지가 ID(`33f923b05f64`)로만** 보여 걸리지 않았다 |
| 대신 다른 앱의 DB·`coolify-db` 가 잡혔다 | 계정이 달라 `role "postgres" does not exist` 로 끊겼다 |
| `-U postgres` 를 고정으로 썼다 | 계정 이름은 컨테이너마다 다르다 |
| **이름·포트로 API 를 고른다** (2026-08-18 재발) | 이 서버에는 **다른 앱(rbooster)도 있다.** `grep -i api` 가 `rb-api-…` 를 물어 **엉뚱한 DB 에 델타 SQL 을 실행**했다 — `relation "public.plan_quotas" does not exist` 로 끊겨 다행히 아무것도 바뀌지 않았지만, **표 이름이 겹쳤다면 남의 앱 DB 를 고쳤을 것**이다 |

> **2026-08-18 교훈**: `DATABASE_URL` 을 읽는 것만으로는 부족하다 —
> **어느 컨테이너의** `DATABASE_URL` 인지를 이름·포트로 고르는 순간 같은
> 구멍이 다시 열린다. 그래서 위 함수는 **우리 표(`map_documents`)가 있는지
> 직접 확인**한다. 추측이 한 겹도 남지 않는다.

**API 가 실제로 접속하는 곳을 그대로 따라가는 것**이 유일하게 안전하다 —
추측이 없고, 엉뚱한 DB 를 건드릴 위험도 없다.

> `DB` 가 컨테이너 이름이 아니라 IP·외부 호스트로 나오면 **DB 가 이 서버에
> 없다는 뜻**이다. 그 서버에서 직접 접속해야 한다. 위 스크립트들은
> `docker inspect` 로 그것을 확인하고 멈춘다.

### 1.5-0-B. 요금제 컬럼 + 기존 계정 Basic 승격 — 2026-08-06

> ⚠️ **2026-08-14 이후로는 이 스크립트를 다시 돌리지 않는다.** 아래 함수는
> 용량 숫자가 본문에 박힌 **옛 모습**이다. 지금은 `plan_quotas` **표**가
> 기준이고 함수는 그 표를 읽는다 — 이걸 다시 실행하면 함수가 표를 보지
> 않는 옛 모습으로 되돌아가, 관리자 콘솔에서 한도를 바꿔도 아무 일이
> 일어나지 않는다. 복구는 **§1.5-0-E**. (아래는 기록으로 남긴다.)

**정책**: Free 10MB · Basic 10GB · Pro 30GB · Team 20GB/사용자.
신규 가입은 **Free**(컬럼 기본값), **2026-08-06 12:00 UTC 이전에 가입한
계정은 Basic**. 용량은 `users.plan` 이 정하고 트리거가 `quota_bytes` 를
맞춘다 — **결제가 붙으면 `plan` 만 바꾸면 된다.**

`schema.sql` 에 들어 있으므로 스키마를 재적용(§2-B·§2-C)하면 함께
적용되지만, **스키마를 다시 밀 일이 없다면** 아래만 붙여넣으면 된다.

```bash
bash <<'SCRIPT'
set -e
# DB 를 **이미지 이름으로 찾지 않는다** — §1.5-0-A 참조.
# ★ 이름·포트로 고르지 않는다 — **우리 표가 있는 DB** 를 가진 앱을 찾는다 (§1.5-0-A)
API=""; for C in $(docker ps --format '{{.Names}}'); do
  U=$(docker exec "$C" printenv DATABASE_URL 2>/dev/null) || continue
  H=$(printf '%s' "$U" | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
  US=$(printf '%s' "$U" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
  N=$(printf '%s' "$U" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
  [ "$(docker exec "$H" psql -U "$US" -d "$N" -tAc \
      "SELECT to_regclass('public.map_documents') IS NOT NULL" 2>/dev/null)" = "t" ] \
    && { API="$C"; break; }
done
[ -z "$API" ] && { echo "❌ api 컨테이너를 찾지 못했습니다."; docker ps --format '{{.Names}}\t{{.Image}}'; exit 1; }
URL=$(docker exec -i "$API" printenv DATABASE_URL)
DB=$(printf '%s' "$URL"     | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
PGUSER=$(printf '%s' "$URL" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
PGDB=$(printf '%s' "$URL"   | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
docker inspect "$DB" >/dev/null 2>&1 \
  || { echo "❌ DB 호스트($DB)가 이 서버의 컨테이너가 아닙니다 — 그 서버에서 직접 접속해 주세요."; exit 1; }
echo "✅ DB=$DB  계정=$PGUSER  데이터베이스=$PGDB"

docker exec -i "$DB" psql -U "$PGUSER" -d "$PGDB" <<'SQL'
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'free';
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE public.users
    ADD CONSTRAINT users_plan_check CHECK (plan IN ('free','basic','pro','team'));

CREATE OR REPLACE FUNCTION public.plan_quota_bytes(p TEXT)
RETURNS BIGINT AS $fn$
    SELECT CASE lower(COALESCE(p, 'free'))
        WHEN 'basic' THEN 10737418240::BIGINT
        WHEN 'pro'   THEN 32212254720::BIGINT
        WHEN 'team'  THEN 21474836480::BIGINT
        ELSE             10485760::BIGINT
    END;
$fn$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.sync_quota_from_plan()
RETURNS TRIGGER AS $fn$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.plan IS DISTINCT FROM OLD.plan THEN
        NEW.quota_bytes := public.plan_quota_bytes(NEW.plan);
    END IF;
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_sync_quota ON public.users;
CREATE TRIGGER users_sync_quota
    BEFORE INSERT OR UPDATE OF plan ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_quota_from_plan();

ALTER TABLE public.users ALTER COLUMN quota_bytes SET DEFAULT 10485760;

UPDATE public.users
   SET plan = 'basic'
 WHERE created_at < TIMESTAMPTZ '2026-08-06 12:00:00+00'
   AND plan = 'free'
   AND NOT EXISTS (SELECT 1 FROM public.users WHERE plan <> 'free');
SQL

echo "── 검증 (계정별 요금제·한도) ──"
docker exec -i "$DB" psql -U "$PGUSER" -d "$PGDB" -tA <<'SQL'
SELECT a.email || ' → ' || u.plan || ' ' || pg_size_pretty(u.quota_bytes)
       || '  (가입 ' || u.created_at::date || ')'
  FROM public.users u JOIN auth.users a ON a.id = u.id
 ORDER BY u.created_at;
SQL
echo "끝 — 기존 계정이 모두 basic 10GB 로 보이면 성공입니다."
SCRIPT
```

> ⚠️ 함수 본문의 달러 인용을 **`$fn$`** 으로 쓴 것은 일부러다 — 기본
> `$$` 를 쓰면 bash heredoc 안에서도 문제없지만, 나중에 이 블록을 따옴표
> 없는 heredoc(`<<SQL`)으로 바꾸면 `$$` 가 **셸 PID 로 치환**돼 함수가
> 깨진다. `$fn$` 는 어느 쪽이든 안전하다.

> **몇 번을 실행해도 안전하다.** 승격은 **딱 한 번만** 돈다 — 한 명이라도
> 유료 요금제가 되고 나면 `NOT EXISTS` 조건에 걸려 다시 돌지 않으므로,
> 나중에 어떤 계정을 일부러 Free 로 내려도 되살아나지 않는다.

> **요금제를 바꾸려면 `plan` 만 바꾼다** — 용량은 트리거가 따라온다.
> ```sql
> UPDATE public.users u SET plan = 'pro'
>   FROM auth.users a WHERE a.id = u.id AND a.email = '<이메일>';
> ```

> 사용자 화면(아바타 메뉴 📊 저장 용량)은 `/v1/attachments/quota` 를
> 그대로 그리므로 다음 조회부터 반영된다. 다만 **요금제 배지(Basic 등)를
> 보려면 API·프런트 재배포가 필요하다** — 응답에 `plan` 이 추가됐다.

### 1.5-0-C. ★ 특정 계정의 요금제 바꾸기 (2026-08-11)

> **임시 수단이다.** 관리자 홈페이지와 결제가 붙으면 이 절차는 필요
> 없어진다. 그때까지 "그 사람만 Basic 으로 올려 달라"를 처리하는 길이다.

**어디서 실행하나** — 둘 중 아무 데서나. 명령이 같다.

| 실행 자리 | 가는 길 |
|---|---|
| **VM SSH** | `ssh ubuntu@<dev 서버>` 로 붙은 뒤 붙여넣기 |
| **Coolify Terminal** | Coolify → 왼쪽 **Terminal** → 서버(호스트)를 고른 뒤 붙여넣기 |

> ⚠️ **Coolify 의 DB 리소스 안쪽 Terminal 이 아니다.** 그 안은 이미
> 컨테이너 내부라 `docker` 명령이 없다. **호스트** 터미널을 고른다.
> (DB 컨테이너 안에서 직접 할 거라면 `docker exec …` 를 빼고
> `psql -U postgres -d postgres` 부터 쓰면 된다.)

#### 붙여넣을 것 — **맨 위 두 줄만 고친다**

```bash
bash <<'SCRIPT'
set -e

# ── 여기 두 줄만 고친다 ────────────────────────────────────────
EMAIL='id@example.com'
PLAN='basic'          # free | basic | pro | team
# ──────────────────────────────────────────────────────────────

case "$PLAN" in free|basic|pro|team) ;; *)
  echo "❌ PLAN 은 free·basic·pro·team 중 하나여야 합니다 (받은 값: $PLAN)"; exit 1;; esac

# DB 를 **이미지 이름으로 찾지 않는다** — §1.5-0-A 참조.
# ★ 이름·포트로 고르지 않는다 — **우리 표가 있는 DB** 를 가진 앱을 찾는다 (§1.5-0-A)
API=""; for C in $(docker ps --format '{{.Names}}'); do
  U=$(docker exec "$C" printenv DATABASE_URL 2>/dev/null) || continue
  H=$(printf '%s' "$U" | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
  US=$(printf '%s' "$U" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
  N=$(printf '%s' "$U" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
  [ "$(docker exec "$H" psql -U "$US" -d "$N" -tAc \
      "SELECT to_regclass('public.map_documents') IS NOT NULL" 2>/dev/null)" = "t" ] \
    && { API="$C"; break; }
done
[ -z "$API" ] && { echo "❌ api 컨테이너를 찾지 못했습니다."; docker ps --format '{{.Names}}\t{{.Image}}'; exit 1; }
URL=$(docker exec -i "$API" printenv DATABASE_URL)
DB=$(printf '%s' "$URL"     | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
PGUSER=$(printf '%s' "$URL" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
APPDB=$(printf '%s' "$URL"  | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
docker inspect "$DB" >/dev/null 2>&1 \
  || { echo "❌ DB 호스트($DB)가 이 서버의 컨테이너가 아닙니다 — 그 서버에서 직접 접속해 주세요."; exit 1; }
echo "✅ DB=$DB  계정=$PGUSER  앱DB=$APPDB"

psqlx() { docker exec -i "$DB" psql -U "$PGUSER" -d "$APPDB" -v ON_ERROR_STOP=1 "$@"; }

# ① 계정이 있는지 먼저 본다 — **조용히 0행 성공하지 않게**
N=$(psqlx -tA -v email="$EMAIL" <<'SQL'
SELECT count(*) FROM public.users u JOIN auth.users a ON a.id = u.id
 WHERE lower(a.email) = lower(:'email');
SQL
)
if [ "$N" = "0" ]; then
  echo "❌ '$EMAIL' 계정을 찾지 못했습니다."
  echo "   철자를 확인하거나, 아래 목록에서 실제 주소를 고르세요:"
  psqlx -tA <<'SQL'
SELECT '   · ' || a.email || '  (' || u.plan || ')'
  FROM public.users u JOIN auth.users a ON a.id = u.id ORDER BY a.email;
SQL
  exit 1
fi

echo "── 바꾸기 전 ──"
psqlx -v email="$EMAIL" <<'SQL'
SELECT a.email, u.plan AS 요금제, pg_size_pretty(u.quota_bytes) AS 한도
  FROM public.users u JOIN auth.users a ON a.id = u.id
 WHERE lower(a.email) = lower(:'email');
SQL

# ② 변경 — quota_bytes 는 users_sync_quota 트리거가 따라온다
psqlx -v email="$EMAIL" -v plan="$PLAN" <<'SQL'
UPDATE public.users u
   SET plan = :'plan', updated_at = NOW()
  FROM auth.users a
 WHERE a.id = u.id AND lower(a.email) = lower(:'email');
SQL

echo "── 바꾼 뒤 ──"
psqlx -v email="$EMAIL" <<'SQL'
SELECT a.email, u.plan AS 요금제, pg_size_pretty(u.quota_bytes) AS 한도
  FROM public.users u JOIN auth.users a ON a.id = u.id
 WHERE lower(a.email) = lower(:'email');
SQL
echo "끝 — '요금제'와 '한도'가 함께 바뀌었으면 성공입니다 (basic = 10 GB)."
SCRIPT
```

#### 성공은 이렇게 보인다

```
✅ 컨테이너=roxca4xvrujyw8u1jsvxk0ey / 앱DB=postgres
── 바꾸기 전 ──
      email       | 요금제 | 한도
------------------+--------+-------
 yskim@egtron.com | free   | 10 MB
UPDATE 1
── 바꾼 뒤 ──
      email       | 요금제 | 한도
------------------+--------+-------
 yskim@egtron.com | basic  | 10 GB
```

**`한도`가 함께 바뀌는지를 본다.** `quota_bytes` 는 직접 건드리지 않는다 —
`users_sync_quota` 트리거가 `plan` 을 보고 맞춘다. 요금제만 바뀌고 한도가
그대로면 **트리거가 없는 DB** 다(§1.5-0-B 를 먼저 적용한다).

| 요금제 | 한도 |
|---|---|
| free | 10 MB |
| basic | 10 GB |
| pro | 30 GB |
| team | 20 GB |

#### 이렇게 만든 이유

- **조용한 0행을 막는다.** `UPDATE … WHERE email = '오타'` 는 아무것도
  안 바꾸고 성공한다. 바꿨다고 답해 놓고 사용자 화면은 그대로인 상황이
  가장 나쁘다. 그래서 먼저 세고, 없으면 **실제 주소 목록을 보여 준다.**
- **대소문자를 가리지 않는다** — `lower(...) = lower(...)`.
  `Kim@Egtron.com` 으로 가입한 사람을 `kim@egtron.com` 으로 못 찾는 일이
  없게.
- **앱 DB 를 추측하지 않는다.** dev 서버에는 GoTrue 의 `gotrue` DB 가
  따로 있다. `maps` 표가 있는 쪽을 찾아 넣는다.
- **이메일은 `auth.users` 에 있다** — `public.users` 에는 이메일 컬럼이
  없어 조인이 필요하다.

#### 확인 방법 (사용자 화면)

그 사용자가 **`https://dev.mindmap.ai.kr` → 우상단 아바타**를 누르면
저장 용량 막대 위에 **`Basic`** 배지와 `… / 10GB` 가 보인다.
메뉴를 열 때마다 `/v1/attachments/quota` 를 다시 부르므로 **재로그인도
재배포도 필요 없다** — 이미 로그인해 있으면 메뉴만 다시 열면 된다.

#### 확인 — **바뀌었는지 다시 본다**

바꾼 뒤(또는 나중에 아무 때나) 읽기만 하는 조회다. 아무것도 고치지 않는다.

**① 한 계정** — `EMAIL` 만 고쳐 붙여넣는다.

```bash
bash <<'SCRIPT'
EMAIL='id@example.com'

# DB 를 **이미지 이름으로 찾지 않는다** — §1.5-0-A 참조.
# ★ 이름·포트로 고르지 않는다 — **우리 표가 있는 DB** 를 가진 앱을 찾는다 (§1.5-0-A)
API=""; for C in $(docker ps --format '{{.Names}}'); do
  U=$(docker exec "$C" printenv DATABASE_URL 2>/dev/null) || continue
  H=$(printf '%s' "$U" | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
  US=$(printf '%s' "$U" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
  N=$(printf '%s' "$U" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
  [ "$(docker exec "$H" psql -U "$US" -d "$N" -tAc \
      "SELECT to_regclass('public.map_documents') IS NOT NULL" 2>/dev/null)" = "t" ] \
    && { API="$C"; break; }
done
[ -z "$API" ] && { echo "❌ api 컨테이너를 찾지 못했습니다."; docker ps --format '{{.Names}}\t{{.Image}}'; exit 1; }
URL=$(docker exec -i "$API" printenv DATABASE_URL)
DB=$(printf '%s' "$URL"     | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
PGUSER=$(printf '%s' "$URL" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
APPDB=$(printf '%s' "$URL"  | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
docker inspect "$DB" >/dev/null 2>&1 \
  || { echo "❌ DB 호스트($DB)가 이 서버의 컨테이너가 아닙니다 — 그 서버에서 직접 접속해 주세요."; exit 1; }
echo "✅ DB=$DB  계정=$PGUSER  앱DB=$APPDB"

docker exec -i "$DB" psql -U "$PGUSER" -d "$APPDB" -v email="$EMAIL" <<'SQL'
SELECT a.email                       AS 이메일,
       u.plan                        AS 요금제,
       pg_size_pretty(u.quota_bytes) AS 한도,
       pg_size_pretty(
         COALESCE((SELECT SUM(pg_column_size(d.doc)) FROM public.map_documents d
                     JOIN public.maps m ON m.id = d.map_id WHERE m.owner_id = u.id), 0)
       + COALESCE((SELECT SUM(pg_column_size(v.doc)) FROM public.map_document_versions v
                     JOIN public.maps m ON m.id = v.map_id WHERE m.owner_id = u.id), 0)
       + COALESCE((SELECT SUM(t.size_bytes) FROM public.attachments t
                    WHERE t.owner_id = u.id), 0)
       )                             AS 사용량,
       u.updated_at::timestamp(0)    AS 마지막변경
  FROM public.users u JOIN auth.users a ON a.id = u.id
 WHERE lower(a.email) = lower(:'email');
SQL
SCRIPT
```

```
      이메일      | 요금제 | 한도  | 사용량  |     마지막변경
------------------+--------+-------+---------+---------------------
 yskim@egtron.com | basic  | 10 GB | 5120 kB | 2026-08-11 08:11:54
```

**0행이 나오면 그 이메일의 계정이 없는 것이다** — 아래 ②로 실제 주소를
확인한다.

**② 전체 — 요금제별로 누가 있나**

```bash
docker exec -i "$DB" psql -U "$PGUSER" -d "$APPDB" <<'SQL'
SELECT u.plan AS 요금제, pg_size_pretty(u.quota_bytes) AS 한도,
       count(*) AS 계정수, string_agg(a.email, ', ' ORDER BY a.email) AS 계정
  FROM public.users u JOIN auth.users a ON a.id = u.id
 GROUP BY u.plan, u.quota_bytes ORDER BY u.quota_bytes;
SQL
```

**③ 어긋난 계정만** — 요금제와 한도가 맞지 않는 계정을 찾는다.
**0행이 정상이다.**

```bash
docker exec -i "$DB" psql -U "$PGUSER" -d "$APPDB" <<'SQL'
SELECT a.email, u.plan,
       pg_size_pretty(u.quota_bytes)                     AS 실제한도,
       pg_size_pretty(public.plan_quota_bytes(u.plan))   AS 있어야할한도
  FROM public.users u JOIN auth.users a ON a.id = u.id
 WHERE u.quota_bytes <> public.plan_quota_bytes(u.plan);
SQL
```

행이 나온다면 둘 중 하나다 — **트리거가 없는 DB**(§1.5-0-B 를 적용한다)
이거나, 누군가 **`quota_bytes` 를 직접 바꾼 특별 계약**이다. 후자라면
정상이므로 그대로 둔다.

#### ⚠️ 터미널이 여러 줄 붙여넣기를 못 받으면 — **한 줄 명령**으로

위 블록들은 `bash <<'SCRIPT'` 로 **여러 줄을 한 덩어리**로 넘긴다.
터미널(특히 웹 터미널)이 붙여넣기를 줄 단위로 흘려보내면 **섞여서
아무것도 실행되지 않는다** (2026-08-11 실제로 겪었다).

**증상**: 출력이 하나도 없고, 화면의 글자가 서로 겹쳐 찍힌다
(`EMAIL='id@example.com'free | basic | pro | team` 처럼). 이어서 실행한
`docker exec … "$DB"` 가 `invalid container name or ID: value is empty`
로 죽는다 — `$DB` 는 그 블록 **안에서만** 살아 있기 때문이다.

그럴 때는 **heredoc 없이 한 줄씩** 실행한다. 컨테이너 이름과 앱 DB 는
위 블록이 한 번이라도 성공했을 때 찍어 준 값을 그대로 쓴다(dev 서버는
`roxca4xvrujyw8u1jsvxk0ey` · `postgres` — DB 리소스라 재배포로 바뀌지
않는다).

```bash
# ① 지금 상태 — 이메일 철자를 여기서 확인한다
docker exec -i <DB컨테이너> psql -U postgres -d postgres -c "SELECT a.email AS 이메일, u.plan AS 요금제, pg_size_pretty(u.quota_bytes) AS 한도 FROM public.users u JOIN auth.users a ON a.id=u.id ORDER BY a.email;"
```

```bash
# ② 변경 — UPDATE 1 이면 성공, UPDATE 0 이면 그 이메일 계정이 없다
docker exec -i <DB컨테이너> psql -U postgres -d postgres -c "UPDATE public.users u SET plan='basic', updated_at=NOW() FROM auth.users a WHERE a.id=u.id AND lower(a.email)=lower('id@example.com');"
```

```bash
# ③ 확인 — 한도와 사용량까지
docker exec -i <DB컨테이너> psql -U postgres -d postgres -c "SELECT a.email AS 이메일, u.plan AS 요금제, pg_size_pretty(u.quota_bytes) AS 한도, pg_size_pretty(COALESCE((SELECT SUM(pg_column_size(d.doc)) FROM public.map_documents d JOIN public.maps m ON m.id=d.map_id WHERE m.owner_id=u.id),0) + COALESCE((SELECT SUM(pg_column_size(v.doc)) FROM public.map_document_versions v JOIN public.maps m ON m.id=v.map_id WHERE m.owner_id=u.id),0) + COALESCE((SELECT SUM(t.size_bytes) FROM public.attachments t WHERE t.owner_id=u.id),0)) AS 사용량 FROM public.users u JOIN auth.users a ON a.id=u.id WHERE lower(a.email)=lower('id@example.com');"
```

> **한 줄 명령은 안전망이 없다** — 블록판이 해 주던 "계정을 먼저 세고
> 없으면 목록을 보여 주는" 일을 사람이 대신해야 한다. 그래서 **①을
> 먼저 실행해 철자를 확인**하고, ②의 `UPDATE 0` 을 실패 신호로 읽는다.

#### 되돌리기

같은 블록에서 `PLAN='free'` 로 바꿔 다시 실행한다. 한도도 함께 10MB 로
돌아간다.

> **특별 계약처럼 요금제와 다른 한도를 주려면** `plan` 을 먼저 정한 뒤
> `quota_bytes` 를 직접 `UPDATE` 한다(트리거는 `plan` 이 바뀔 때만 돈다).
> 단 그 계정의 `plan` 을 나중에 다시 바꾸면 덮어써진다.

### 1.5-0-D. 비밀번호를 잊었을 때 — GoTrue 로 직접 바꾼다 (2026-08-13)

**보통은 화면에서 한다** — 로그인 화면의 **[비밀번호를 잊으셨나요?]**
(2026-08-13 추가 · `auth-session-ui.md` §11-B). 아래는 그 길이 막혔을
때다: 메일이 나가지 않거나, 그 계정의 메일함에 접근할 수 없을 때.

**관리자 콘솔에 초기 비밀번호는 없다** — 1단계 로그인은 그 사람의 앱
계정(GoTrue)으로 하므로, 관리자 비밀번호 = 그 계정의 앱 비밀번호다.

서버 SSH 에서 **한 줄씩**:

```bash
# ★ 이름·포트로 고르지 않는다 — **우리 표가 있는 DB** 를 가진 앱을 찾는다 (§1.5-0-A)
API=""; for C in $(docker ps --format '{{.Names}}'); do
  U=$(docker exec "$C" printenv DATABASE_URL 2>/dev/null) || continue
  H=$(printf '%s' "$U" | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
  US=$(printf '%s' "$U" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
  N=$(printf '%s' "$U" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
  [ "$(docker exec "$H" psql -U "$US" -d "$N" -tAc \
      "SELECT to_regclass('public.map_documents') IS NOT NULL" 2>/dev/null)" = "t" ] \
    && { API="$C"; break; }
done
echo "$API"
```

```bash
DB=$(docker ps --format '{{.Names}}|{{.Image}}' | grep -iE 'postgres|supabase-db' | head -1 | cut -d'|' -f1)
UID=$(docker exec -i "$DB" psql -U "$PGUSER" -d "$PGDB" -tAc "SELECT id FROM auth.users WHERE lower(email)=lower('ok@baro.pro')"); echo "$UID"
```

> 앱 DB 의 `auth.users.id` 는 **GoTrue 의 사용자 id 와 같은 값**이다
> (AuthGuard 가 토큰의 `sub` 로 만든다). 그래서 여기서 찾으면 된다.

```bash
# 관리자 토큰을 **직접 서명한다** — 서비스 키를 따로 두지 않는다
# (api 가 이미 GoTrue 의 JWT 비밀키를 갖고 있다)
TOKEN=$(docker exec -i "$API" node -e "console.log(require('jsonwebtoken').sign({role:'service_role',aud:'authenticated',exp:Math.floor(Date.now()/1000)+300}, process.env.SUPABASE_JWT_SECRET))")
```

```bash
# 비밀번호 교체 — 새 비밀번호는 6자 이상
docker exec -i "$API" node -e "
fetch(process.env.GOTRUE_URL + '/admin/users/$UID', {
  method: 'PUT',
  headers: { Authorization: 'Bearer $TOKEN', apikey: '$TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: '새비밀번호를여기에' }),
}).then(async r => console.log(r.status, (await r.text()).slice(0, 200)))
  .catch(e => console.log('FAIL', e.message))"
```

**200** 과 함께 사용자 정보가 돌아오면 성공이다. 그 뒤 바꾼 비밀번호로
로그인해 확인한다.

> ⚠️ `GOTRUE_URL` 이 비어 있으면 실패한다 — auth-session-ui.md §12.5 의
> 설정을 먼저 확인한다.
>
> **바꾼 뒤에는 화면에서 스스로 바꾸게 한다** — 앱 우상단 아바타 →
> 🔑 비밀번호 변경, 관리자는 콘솔의 **비밀번호 변경** 탭.

### 1.5-0-E. ★ 요금제 한도를 **표**로 옮긴다 (2026-08-14)

용량 숫자가 `plan_quota_bytes()` **함수 본문에 박혀 있어** 바꾸려면
배포가 필요했다. 표로 빼면 관리자 콘솔 → 설정관리에서 바꿀 수 있다.

**적용 전에도 앱은 그대로 돈다.** 함수가 아직 옛 모습이면 한도는 옛 값
그대로이고, 관리자 콘솔은 요금제 줄을 **조회 전용으로** 보여 준다
(입력칸이 아예 나오지 않는다 — 서버가 표의 유무를 보고 정한다).
`/v1/health` 는 `plan_quotas` 를 못 찾아 `degraded` 로 알린다.

서버 SSH 또는 Coolify Terminal 에 **통째로** 붙여 넣는다 (두 번 실행해도
안전하다):

```bash
bash <<'SCRIPT'
set -e
# DB 를 **이미지 이름으로 찾지 않는다** — §1.5-0-A 참조.
# ★ 이름·포트로 고르지 않는다 — **우리 표가 있는 DB** 를 가진 앱을 찾는다 (§1.5-0-A)
API=""; for C in $(docker ps --format '{{.Names}}'); do
  U=$(docker exec "$C" printenv DATABASE_URL 2>/dev/null) || continue
  H=$(printf '%s' "$U" | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
  US=$(printf '%s' "$U" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
  N=$(printf '%s' "$U" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
  [ "$(docker exec "$H" psql -U "$US" -d "$N" -tAc \
      "SELECT to_regclass('public.map_documents') IS NOT NULL" 2>/dev/null)" = "t" ] \
    && { API="$C"; break; }
done
[ -z "$API" ] && { echo "❌ api 컨테이너를 찾지 못했습니다."; docker ps --format '{{.Names}}\t{{.Image}}'; exit 1; }
URL=$(docker exec -i "$API" printenv DATABASE_URL)
DB=$(printf '%s' "$URL"     | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
PGUSER=$(printf '%s' "$URL" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
PGDB=$(printf '%s' "$URL"   | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
docker inspect "$DB" >/dev/null 2>&1 \
  || { echo "❌ DB 호스트($DB)가 이 서버의 컨테이너가 아닙니다 — 그 서버에서 직접 접속해 주세요."; exit 1; }
echo "✅ DB=$DB  계정=$PGUSER  데이터베이스=$PGDB"

docker exec -i "$DB" psql -U "$PGUSER" -d "$PGDB" <<'SQL'
CREATE TABLE IF NOT EXISTS public.plan_quotas (
    plan        TEXT PRIMARY KEY,
    quota_bytes BIGINT NOT NULL CHECK (quota_bytes > 0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  TEXT
);

-- ★ DO NOTHING 이다. DO UPDATE 였다면 이 스크립트를 다시 돌릴 때마다
--   관리자가 콘솔에서 바꾼 값이 조용히 되돌아간다.
INSERT INTO public.plan_quotas (plan, quota_bytes) VALUES
    ('free',      10485760),
    ('basic',  10737418240),
    ('pro',    32212254720),
    ('team',   21474836480)
ON CONFLICT (plan) DO NOTHING;

-- 표를 읽으므로 IMMUTABLE 일 수 없다 → STABLE
CREATE OR REPLACE FUNCTION public.plan_quota_bytes(p TEXT)
RETURNS BIGINT AS $fn$
    SELECT COALESCE(
        (SELECT quota_bytes FROM public.plan_quotas WHERE plan = lower(COALESCE(p, 'free'))),
        (SELECT quota_bytes FROM public.plan_quotas WHERE plan = 'free'),
        10485760::BIGINT
    );
$fn$ LANGUAGE sql STABLE;

\echo '── 적용 결과 ──'
SELECT plan, pg_size_pretty(quota_bytes) AS 한도, COALESCE(updated_by,'(씨앗)') AS 마지막수정
  FROM public.plan_quotas ORDER BY quota_bytes;
\echo '── 함수가 표를 읽는가 (위 basic 값과 같아야 한다) ──'
SELECT pg_size_pretty(public.plan_quota_bytes('basic')) AS 함수가준값;
SQL
SCRIPT
```

네 줄(free/basic/pro/team)과 `함수가준값 = 10 GB` 가 보이면 끝이다.
그 뒤 관리자 콘솔 → **설정관리** 를 열면 요금제 줄에 입력칸이 생긴다.

> ⚠️ **§1.5-0-B 를 다시 돌리지 않는다.** 그 스크립트에는 옛 함수
> (`CASE … IMMUTABLE`)가 들어 있어, 실행하면 함수가 **표를 읽지 않는
> 옛 모습으로 되돌아간다.** 표는 남지만 콘솔에서 바꿔도 아무 일이
> 일어나지 않게 된다. 그때는 이 §1.5-0-E 를 다시 돌리면 복구된다.

**기존 회원의 한도는 따라오지 않는다.** `users.quota_bytes` 는 `plan` 이
바뀔 때만 트리거가 맞춘다. SQL 로 표만 고치면 새로 요금제가 바뀌는
사람부터 적용된다 — **기존 회원까지 옮기려면 관리자 콘솔에서 바꾼다**
(콘솔은 옛 한도를 그대로 쓰던 사람만 옮기고, 한도를 따로 올려 둔 특별
계약 계정은 손대지 않는다).

### 1.5-0-F. 로그인 접속 기록 표 만들기 (2026-08-14)

로그인 이력에 **접속한 곳(IP·기기)** 을 보여 주려면 표가 하나 필요하다.
인증 서버(GoTrue)가 IP 를 남기지 않아 우리가 직접 기록한다
(`admin-console.md` §3.1).

**적용 전에도 앱은 그대로 돈다.** 로그인도 되고 이력도 보인다 —
접속한 곳만 비어 있고, `/v1/health` 가 `degraded` 로 알려 준다.

```bash
bash <<'SCRIPT'
set -e
# DB 를 **이미지 이름으로 찾지 않는다** — §1.5-0-A 참조.
# ★ 이름·포트로 고르지 않는다 — **우리 표가 있는 DB** 를 가진 앱을 찾는다 (§1.5-0-A)
API=""; for C in $(docker ps --format '{{.Names}}'); do
  U=$(docker exec "$C" printenv DATABASE_URL 2>/dev/null) || continue
  H=$(printf '%s' "$U" | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
  US=$(printf '%s' "$U" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
  N=$(printf '%s' "$U" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
  [ "$(docker exec "$H" psql -U "$US" -d "$N" -tAc \
      "SELECT to_regclass('public.map_documents') IS NOT NULL" 2>/dev/null)" = "t" ] \
    && { API="$C"; break; }
done
[ -z "$API" ] && { echo "❌ api 컨테이너를 찾지 못했습니다."; docker ps --format '{{.Names}}\t{{.Image}}'; exit 1; }
URL=$(docker exec -i "$API" printenv DATABASE_URL)
DB=$(printf '%s' "$URL"     | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
PGUSER=$(printf '%s' "$URL" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
PGDB=$(printf '%s' "$URL"   | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
docker inspect "$DB" >/dev/null 2>&1 \
  || { echo "❌ DB 호스트($DB)가 이 서버의 컨테이너가 아닙니다 — 그 서버에서 직접 접속해 주세요."; exit 1; }
echo "✅ DB=$DB  계정=$PGUSER  데이터베이스=$PGDB"

docker exec -i "$DB" psql -U "$PGUSER" -d "$PGDB" <<'SQL'
CREATE TABLE IF NOT EXISTS public.login_events (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- VARCHAR 다. INET 을 쓰면 `client_ip::text` 가 '203.0.113.9/32' 처럼
    -- 넷마스크를 붙여 화면에 그대로 새어 나간다 (실제로 겪었다).
    client_ip   VARCHAR(45),
    platform    VARCHAR(60),
    browser     VARCHAR(60)
);

CREATE INDEX IF NOT EXISTS login_events_user_at_idx
    ON public.login_events (user_id, at DESC);

\echo '── 적용 결과 ──'
SELECT to_regclass('public.login_events') AS 표, count(*) AS 지금건수
  FROM public.login_events;
SQL
SCRIPT
```

`표 = login_events`, `지금건수 = 0` 이면 끝이다. 그 뒤 **로그인부터**
기록이 쌓인다 — 이미 지난 로그인은 채워지지 않는다(없는 것을 지어내지
않는다).

**확인**: 로그아웃했다가 다시 로그인한 뒤, 아바타 → 🕘 로그인 기록에서
맨 윗줄에 IP 와 기기가 보이면 된다.

### 1.5-0-G. 맵 참가자 표 만들기 — 협업 공유 (2026-08-18)

공유받은 사람이 남의 맵을 열려면 **참가자 표**가 있어야 한다(공개 #298,
`27-sync-model.md` §14). 협업 자체는 유료 기능이지만, **"이 사람이 이 맵을
열어도 되는가"는 코어가 답한다** — 판정이 플러그인 쪽에 흩어지면 플러그인이
틀렸을 때 남의 문서가 열린다.

**적용 전에도 앱은 그대로 돈다.** 다만 **소유자만** 자기 맵을 연다(예전과
똑같다). `/v1/health` 가 `missingTables` 에 `map_members` 를 넣어 알려 준다.
적용하면 **재기동 없이 1분 안에** 반영된다(코어가 60초마다 다시 확인한다).

```bash
bash <<'SCRIPT'
set -e
# ★ 이름·포트로 고르지 않는다 — **우리 표가 있는 DB** 를 가진 앱을 찾는다 (§1.5-0-A)
API=""; for C in $(docker ps --format '{{.Names}}'); do
  U=$(docker exec "$C" printenv DATABASE_URL 2>/dev/null) || continue
  H=$(printf '%s' "$U" | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
  US=$(printf '%s' "$U" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
  N=$(printf '%s' "$U" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
  [ "$(docker exec "$H" psql -U "$US" -d "$N" -tAc \
      "SELECT to_regclass('public.map_documents') IS NOT NULL" 2>/dev/null)" = "t" ] \
    && { API="$C"; break; }
done
[ -z "$API" ] && { echo "❌ api 컨테이너를 찾지 못했습니다."; docker ps --format '{{.Names}}\t{{.Image}}'; exit 1; }
URL=$(docker exec -i "$API" printenv DATABASE_URL)
DB=$(printf '%s' "$URL"     | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
PGUSER=$(printf '%s' "$URL" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
PGDB=$(printf '%s' "$URL"   | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
docker inspect "$DB" >/dev/null 2>&1 \
  || { echo "❌ DB 호스트($DB)가 이 서버의 컨테이너가 아닙니다 — 그 서버에서 직접 접속해 주세요."; exit 1; }
echo "✅ DB=$DB  계정=$PGUSER  데이터베이스=$PGDB"

docker exec -i "$DB" psql -U "$PGUSER" -d "$PGDB" <<'SQL'
CREATE TABLE IF NOT EXISTS public.map_members (
    map_id      UUID NOT NULL REFERENCES public.maps(id)  ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL DEFAULT 'editor',
    invited_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (map_id, user_id),
    CONSTRAINT map_members_role_chk CHECK (role IN ('editor', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_map_members_user ON public.map_members(user_id);

\echo '── 적용 결과 ──'
SELECT to_regclass('public.map_members') AS 표, count(*) AS 지금참가자수
  FROM public.map_members;
SQL
SCRIPT
```

`표 = map_members`, `지금참가자수 = 0` 이면 끝이다. 두 번 실행해도 안전하다
(`IF NOT EXISTS`).

**확인**: 브라우저에서 `https://api-dev.mindmap.ai.kr/v1/health` 를 열어
`missingTables` 에 `map_members` 가 **없으면** 적용된 것이다.

**사람을 넣는 것은 아직 SQL 이다** — 초대 화면은 유료 모듈 쪽이고 아직
없다. 손으로 넣어 보려면(맵 id 와 사용자 id 를 알고 있을 때):

```sql
INSERT INTO public.map_members (map_id, user_id, role)
VALUES ('<맵 id>', '<초대할 사용자 id>', 'editor')
ON CONFLICT (map_id, user_id) DO UPDATE SET role = EXCLUDED.role;
```

`role` 은 `editor`(읽기·쓰기) 또는 `viewer`(읽기만 — 저장하면 403 과 함께
"이 맵에는 읽기 권한만 있습니다"가 뜬다). **소유자는 넣지 않는다**
(`maps.owner_id` 가 이미 답한다).

⚠️ 넣은 사람은 **맵 id 를 알아야** 들어갈 수 있다 — 문서함의 "나에게
공유된 맵" 목록은 아직 없다(협업 프런트엔드와 함께 만든다).

### 1.5-H. 재기동·재배포 때 알아야 할 것 (2026-08-18)

**API 는 SIGTERM 을 받으면 정리하고 끝난다.** `main.ts` 의
`app.enableShutdownHooks()` 가 그 연결이다 — 이게 없으면 종료 훅이 **한
번도 불리지 않는다**(2026-08-18 실측).

- 협업(유료)이 켜진 배포에서는 종료 순간에 **메모리에 있던 편집을 문서로
  되돌려 쓴다.** 실측: 편집 0.6초 뒤 SIGTERM → **저장됨**, 프로세스는
  **2.1초** 만에 종료.
- 접속 중이던 브라우저는 닫힘코드 **1001** 을 받고 **스스로 다시 붙는다**
  (재배포하면 몇 초 뒤 협업이 돌아온다).
- 그러므로 컨테이너 **정지 유예 시간(stop grace period)은 10초 이상**이어야
  한다. 그보다 짧으면 SIGKILL 이 먼저 와서 **마지막 편집이 사라진다.**

> Coolify 기본값은 10초다. 그대로 두면 된다 — **줄이지 말 것.**

### 1.5-A. Ubuntu 호스트에 NAS NFS 마운트

```bash
# 1) NFS 클라이언트
sudo apt install -y nfs-common

# 2) NAS 내보내기 확인 (IP 는 예시 — 실제 값은 서버 관리 문서에만)
showmount -e 192.168.0.20

# 3) 마운트 지점 + 수동 마운트 테스트
sudo mkdir -p /mnt/nas/emm-files
sudo mount -t nfs -o vers=4.1 192.168.0.20:/volume1/emm-files /mnt/nas/emm-files
sudo touch /mnt/nas/emm-files/test.txt && ls -l /mnt/nas/emm-files
```

`/etc/fstab` (부팅 자동 마운트 — `_netdev` 로 네트워크 이후, `hard` 로
쓰기 유실 방지):

```
192.168.0.20:/volume1/emm-files  /mnt/nas/emm-files  nfs  vers=4.1,_netdev,noatime,hard,timeo=150,retrans=3  0  0
```

적용: `sudo mount -a` 후 오류 없는지 확인.

### 1.5-B. API 컨테이너 설정 (Coolify)

- **볼륨 매핑**: `/mnt/nas/emm-files` → `/data/emm-attachments`
- **환경변수**:
  - `STORAGE_LOCAL_DIR=/data/emm-attachments`
  - `ATTACHMENT_MAX_MB` (단일 요청 업로드 상한, 기본 **200**)
  - `ATTACHMENT_CHUNK_MAX_MB` (청크 업로드 상한, 기본 **1024** = 1GB)
  - `ATTACHMENT_PART_KB` (조각 크기, 기본 **8192** = 8MB)

확인: 배포 후 에디터에서 2MB 초과 파일을 첨부(로그인 상태) →
`/mnt/nas/emm-files/u/<사용자ID>/` 에 파일이 생기면 정상.

> **프록시 본문 제한을 1GB 로 열 필요가 없다.** 8MB 를 넘는 파일은
> **조각(기본 8MB)으로 나뉘어** 여러 요청으로 올라간다(청크 업로드,
> `attachment-storage.md` §12). 리버스 프록시가 통과시켜야 하는 것은
> **조각 하나의 크기**뿐이다. 게이트웨이 타임아웃도 마찬가지 —
> 요청 하나가 짧아진다.
>
> 올리는 도중의 조각은 `/data/emm-attachments/tmp/<사용자ID>/<uploadId>/`
> 에 쌓이고, 완료·취소 시 지워진다. 끝내 완료되지 않은 세션은 **24시간
> 뒤 GC**(기동 시 1회 + 6시간 주기)가 정리한다 — 이 디렉터리가 계속
> 커지면 GC 로그(`ChunkUploadService`)를 확인한다.

### 1.5-C. 장애 시 동작

- NAS/NFS 가 죽으면 첨부 API 는 **503 + "첨부 저장소에 접근할 수
  없습니다"** 를 반환한다 (스키마 드리프트 503 과 같은 진단 패턴).
- 저장 용량 쿼터(DB+첨부 합산 — 요금제가 정한다: Free 10MB / Basic 10GB /
  Pro 30GB / Team 20GB)를 넘으면 업로드·저장이
  **413 + 한도 안내** 로 거부된다. 한도 상향(유료 10GB):
  `UPDATE public.users SET quota_bytes = 10737418240 WHERE id = '<사용자>';`

## 2. 백업 — `.env` (APP_KEY) 최우선

```bash
sudo cp /data/coolify/source/.env ~/coolify-env-backup-$(date +%Y%m%d)
# 서버 밖(개발 PC 등 안전한 곳)에도 사본 보관
```

- **`APP_KEY` 분실 = Coolify에 저장된 전 비밀값(환경변수·DB 비밀번호·
  GitHub App 자격증명) 복호화 불가.** 서버 재설치 시 이 파일만 있으면
  복구된다.

### 2.1 ★ DB 백업 — 스크립트는 있다, **거는 것은 남았다**

Coolify → `easymindmap-db` → **Backups** 탭은 여전히
`No scheduled backups configured.` 다. **이 서버가 죽으면 맵·계정·첨부를
전부 잃는다.** 외부 공개(B14 ④)의 전제이기 전에 지금 당장의 구멍이다.

2026-08-28 부터 스크립트와 절차가 저장소에 있다 —
[`scripts/emm-db-backup.sh`](../../scripts/emm-db-backup.sh), 가짜 docker 로
24항목을 통과한다([`emm-db-backup.test.sh`](../../scripts/emm-db-backup.test.sh)).
**남은 것은 서버에 거는 일 하나뿐이고, 그것은 저장소에서 할 수 없다.**

#### 왜 Coolify 의 Scheduled Backup 만으로는 부족한가 ⚠️

**로그인 계정은 앱 DB 에 없다.** GoTrue 는 **별도 데이터베이스**(`gotrue`)
를 쓴다. Coolify 의 백업은 기본적으로 **`POSTGRES_DB` 하나만** 담는다
(Import 화면의 `Backup includes all databases` 체크박스가 그 증거다).

그대로 두면 이렇게 된다.

> 장애 → 복원 → 맵과 문서는 살아났는데 **아무도 로그인할 수 없다**

그래서 **`pg_dumpall` 로 그 인스턴스의 모든 데이터베이스를 담는다.**
Coolify UI 를 쓴다면 **"모든 데이터베이스 포함"을 반드시 켠다.**

#### 지금 당장 — 1회 백업 (2분)

아래 **설치**의 ①②만 하면 된다. cron 을 걸지 않아도 그 자리에서 한 벌이
남는다.

손으로 붙여 넣는 긴 판이 여기 있었는데, 그것이 12일 동안 아무도 걸지
않은 이유였을 가능성이 크다 — 헬스체크 감시(§2.2)는 `curl` 한 줄로
설치되는데 백업만 문서에서 복사해야 했다.

#### 자동 백업 — 호스트 cron (권장)

스크립트: [`scripts/emm-db-backup.sh`](../../scripts/emm-db-backup.sh)

Coolify UI 대신 이 방법을 권하는 이유: **모든 데이터베이스를 담는 것이
기본**이고, 담은 뒤 **확인까지 한다.** 크기가 0 이 아닌지가 아니라 —

- gzip 이 온전한지
- `gotrue` 가 **파일 안에 실제로 있는지** (목록에 있었다는 것과 담겼다는
  것은 다르다)
- 푼 크기가 껍데기 수준이 아닌지

무엇 하나라도 어긋나면 **파일을 남기지 않고 실패로 끝내고, 관리자에게
메일을 보낸다.** 확인하지 않는 백업은 백업이 아니라 백업했다는 기분이다.

#### 설치

```bash
sudo curl -fsSL https://raw.githubusercontent.com/okpojung/easymindmap/main/scripts/emm-db-backup.sh \
  -o /usr/local/bin/emm-db-backup.sh
sudo chmod +x /usr/local/bin/emm-db-backup.sh

# ① 먼저 담지 말고 전제만 본다 — DB 를 찾는지, gotrue 가 있는지
sudo /usr/local/bin/emm-db-backup.sh --check

# ② 한 번 손으로 돌려 본다
sudo /usr/local/bin/emm-db-backup.sh

sudo crontab -e
# 매일 새벽 3시 10분
10 3 * * * /usr/local/bin/emm-db-backup.sh >> /var/log/emm-backup.log 2>&1
```

메일 설정은 **새로 넣을 것이 없다** — §2.2 와 같이 api 컨테이너의
`SMTP_*` 와 `ADMIN_EMAILS` 를 `docker inspect` 로 읽는다.

#### 설정

| 환경변수 | 기본값 | 무엇 |
|---|---|---|
| `DEST` | `/var/backups/emm` | 담는 곳 |
| `KEEP_DAYS` | `14` | 이보다 오래된 백업은 지운다 |
| `REQUIRE_DBS` | `gotrue` | **이 이름이 파일 안에 없으면 실패.** 쉼표로 여럿 |
| `OFFSITE_CMD` | (없음) | 서버 밖으로 옮기는 명령. 파일 경로가 `$1` |
| `MIN_BYTES` | `10240` | 푼 크기의 바닥값 |

#### ★ 서버 밖으로 — 안 하면 백업이 아니다

`DEST` 는 **같은 서버다.** 서버가 통째로 죽으면 백업도 함께 죽는다.
`OFFSITE_CMD` 를 주지 않으면 스크립트가 매번 경고를 남긴다.

```bash
# 예 — rclone 으로 원격 저장소에
10 3 * * * OFFSITE_CMD='rclone copy "$1" remote:emm-backups/' /usr/local/bin/emm-db-backup.sh >> /var/log/emm-backup.log 2>&1
```

`DEST` 자체를 NAS 마운트(§1.5-A)로 두는 것도 같은 효과다.

#### 알려진 구멍 — cron 이 조용히 멈추는 경우

스크립트는 **실패하면** 메일을 보내지만, **아예 돌지 않으면** 아무 일도
일어나지 않는다. 멈춘 cron 은 자기가 멈췄다고 말해 줄 수 없다.

성공할 때마다 `/var/lib/emm-backup/last-success` 에 시각을 남겨 두므로
확인은 언제든 가능하다:

```bash
date -d "@$(cat /var/lib/emm-backup/last-success)"
```

이 파일을 주기적으로 보고 오래됐으면 알리는 감시는 **아직 없다**(백로그
B18). 근본적으로는 외부 감시가 필요한 종류의 문제이고, 외부 감시는
쓰지 않기로 했다(2026-08-15 사용자 결정, §2.2).

#### 복원 절차

```bash
# ① 앱을 멈춘다 (쓰기가 섞이지 않게) — Coolify 에서 api·frontend Stop
# ② 복원
gunzip -c /var/backups/emm/all-YYYYMMDD-HHMM.sql.gz \
  | docker exec -i "$DB" psql -U "$PGUSER" -d postgres
# ③ 스키마 확인
curl -s https://api-dev.mindmap.ai.kr/v1/health      # "schema":"ok" 여야 한다
# ④ 로그인해 본다 — gotrue 가 복원됐는지는 이것으로만 알 수 있다
```

`pg_dumpall` 결과에는 `CREATE DATABASE` 가 들어 있어 **데이터베이스째**
되살아난다. 그래서 ②는 `-d postgres` 로 붙어도 된다.

> **★ 복원 리허설을 한 번은 해야 한다.** 백업은 "잡아 뒀다"가 아니라
> **"되돌려 봤다"** 여야 믿을 수 있다. 운영 인스턴스(B14 ③)를 세울 때
> dev 백업을 그쪽에 복원해 보는 것이 가장 싼 리허설이다 — 어차피 한 번은
> 옮겨야 하는 데이터다.

### 2.2 ★ 헬스체크 감시 — 나빠지면 메일 (2026-08-15, B14 ⑤)

지금은 무언가 잘못돼도 **사용자가 말해 줘야** 안다. `/v1/health` 를
5분마다 보고 **상태가 바뀔 때** 관리자에게 메일을 보낸다.

스크립트: [`scripts/health-watch.sh`](../../scripts/health-watch.sh)

#### 왜 API 안이 아니라 호스트인가 ⚠️

**API 안에 넣으면 API 가 죽었을 때 아무도 알리지 못한다.** 배포 직후
기동 실패가 정확히 그 경우다.

| 무엇이 잡히나 | API 안 | **호스트(이 방식)** | 외부 서비스 |
|---|---|---|---|
| `degraded` (스키마 누락·DB 끊김) | ✅ | ✅ | ⚠️ 상태만 |
| API 프로세스 정지 | ❌ | ✅ | ✅ |
| 서버·전원·네트워크 다운 | ❌ | ❌ | ✅ |

마지막 줄은 이 방식도 못 잡는다 — 그건 외부 감시(UptimeRobot 등)가
필요하다. **쓰지 않기로 했다**(2026-08-15 사용자 결정).

#### 설치

```bash
sudo curl -fsSL https://raw.githubusercontent.com/okpojung/easymindmap/main/scripts/health-watch.sh \
  -o /usr/local/bin/health-watch.sh
sudo chmod +x /usr/local/bin/health-watch.sh

# 먼저 손으로 한 번 (정상이면 **메일이 오지 않는 것이 정상**이다)
sudo HEALTH_URL=https://api-dev.mindmap.ai.kr/v1/health /usr/local/bin/health-watch.sh

sudo crontab -e
# 5분마다
*/5 * * * * HEALTH_URL=https://api-dev.mindmap.ai.kr/v1/health /usr/local/bin/health-watch.sh >> /var/log/emm-health.log 2>&1
```

#### 설정 — **새로 넣을 것이 없다**

| 무엇 | 어디서 가져오나 |
|---|---|
| 받는 사람 | api 컨테이너의 **`ADMIN_EMAILS`** (콘솔에 들어갈 수 있는 사람 = 조치할 사람) |
| 메일 서버 | api 컨테이너의 `SMTP_*` |

**`docker inspect` 로 읽는다 — 컨테이너가 멈춰 있어도 읽힌다.** API 가
죽은 상황에서 알려야 하므로 이게 핵심이다. 서버에 비밀값을 두 번 두지
않는다는 뜻이기도 하다.

받는 사람을 따로 두려면 api 에 `ALERT_EMAILS` 를 더한다(있으면 그게 이긴다).

#### 알림 규칙 — **같은 장애로 5분마다 오지 않는다**

| 언제 | 보내나 |
|---|---|
| 처음 도는데 정상 | ❌ 아무 말 없음 |
| 정상 → 이상 | ✅ `⚠️ 서버 이상` |
| 이상이 계속됨 | ❌ (하루 한 번만 `⚠️ 서버 이상 계속됨`) |
| 이상 → 정상 | ✅ `✅ 서버 복구됨` |
| 처음 도는데 이미 이상 | ✅ (알아야 할 소식이다) |

메일 본문에는 **응답 원문**(`missingTables` 등)과 **무엇을 볼지**가 함께
들어간다 — `degraded` 면 §0 의 델타 SQL, `down` 이면 Coolify 배포 로그.

> 상태는 `/var/lib/emm-health/state` 에 한 줄로 남는다. 알림이 이상하면
> 이 파일을 지우고 다시 돌리면 처음부터 시작한다.

검증: **e2e153** — 상태를 마음대로 바꾸는 가짜 헬스 엔드포인트와 가짜
SMTP 로 18항목(위 표의 다섯 경우 + 제목 MIME 인코딩 + 수신자 여럿).

## 3. 컨테이너 진단 명령 모음

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'   # 전체 상태
docker logs -n 100 -f <컨테이너>                                  # 런타임 로그
docker exec -it <db> psql -U postgres -d postgres                # DB 콘솔
docker exec -it <api> sh -c 'wget -qO- localhost:3000/v1/health' # 내부 health
docker network ls && docker network inspect <net> | grep -i subnet # 네트워크 대역
docker exec -it coolify php artisan tinker                        # Coolify 내부 조작
```

증상별 첫 확인처:

| 증상 | 먼저 볼 곳 |
|---|---|
| `/v1/health` = `"db":"down"` | api 로그의 `password authentication failed` → DATABASE_URL 특수문자 (coolify §5.1) |
| 502 | 해당 리소스 **Ports Exposes** 누락 / NPM Forward 포트(§7.6~7.8) |
| 화면은 뜨는데 API 실패 | `VITE_API_URL`이 Buildtime 체크 없이 빈 값으로 빌드됨 (coolify §5.3) · CORS 차단이면 api `CORS_ORIGIN` 에 그 출처 추가(콤마 목록 가능) |
| 재배포했는데 옛 화면 | NPM `Cache Assets` 켜져 있음 (§7.6) — index.html 캐시 |
| 이미지 든 맵 저장 413 (API 로그 없음) | NPM `client_max_body_size` 누락 (§7.7) |
| Coolify "실시간 서비스 연결 불가" | §7.8의 `/app/`(:6001) 웹소켓 프록시 누락 |
| main 푸시해도 배포 안 됨 | §7.8 `/webhooks/` Access List 예외 / GitHub App 웹훅 URL |
| 화면에 "서버 데이터베이스 스키마가 최신이 아닙니다"(503) | **스키마 미적용** — §0 의 `npm run db:apply`. 어떤 것이 빠졌는지는 `/v1/health` 의 missingTables·missingColumns |
| api 컨테이너가 기동 즉시 죽고 롤백 (`ERR_REQUIRE_ESM`) | api 는 CommonJS 빌드 — **ESM 전용 패키지 import 금지**. 로컬 재현: `node --no-experimental-require-module dist/main.js` (backend-phase1.md Phase 3 경고) |

## 4. Docker 네트워크 대역 — VPN 충돌 확인

Coolify가 `10.0.0.0/24`, `10.0.1.0/24`를 자체 네트워크로 사용 중이다.
FortiGate VPN 대역이 이와 **겹치면 VPN 클라이언트가 컨테이너와
통신하지 못한다.**

**✅ 2026-08-01 전수 확인 완료 — 충돌 없음** (SSL-VPN 풀·IPsec
로컬/리모트 모두 불겹침, 판정 표는 `infra-architecture.md` §7.3).
이후 FortiGate에 대역을 **추가할 때마다** 아래로 재확인한다:

```bash
docker network inspect $(docker network ls -q) 2>/dev/null | grep -i subnet
```

- 겹치게 될 경우 **Coolify 측 대역 변경 권장** (VPN 정책 변경보다 영향
  범위가 작음).

## 5. 일상 운영

- 재배포/롤백: 리소스 → Deployments → Redeploy (특정 커밋 선택 = 롤백)
- Coolify 업데이트: 대시보드 안내에 따라 (업데이트 전 §2 `.env` 백업)
- 로그: 리소스 → Logs (빌드/런타임 분리)

---

## 6. 트러블슈팅

### 6.1 내부망은 되는데 **외부망에서만** API 실패 (2026-08-07 실사용 · 2026-08-08 해결 확인)

**증상**: 외부망 PC 에서 **로그인은 되는데** 화면에 *"⚠ 서버에 연결할 수
없습니다. 백엔드가 켜져 있는지 확인하세요."* 가 뜨고 문서함이 비어 있다.
내부망 PC 에서는 정상.

**원인**: NPM 의 **API 프록시 호스트에 Access List(Basic 인증)** 가 걸려
있었다. Access List 는 *IP 허용 목록에 없으면 Basic 인증을 요구*하는데,
**브라우저는 preflight(OPTIONS)에 인증 정보를 절대 싣지 않는다**(규격).
그래서 외부망에서는 preflight 가 **401** → CORS error → 본 요청이 아예
나가지 못한다. 내부망 IP 는 허용 목록에 걸려 통과하므로 멀쩡해 보인다.

**진단** — 브라우저 F12 → Network:

| 보이는 것 | 뜻 |
| --- | --- |
| `folders` / `maps?...` → **CORS error** | 증상일 뿐, 원인이 아니다 |
| 같은 이름의 **`preflight` 행 → 401** | ← **여기가 원인** |
| 그 401 응답 헤더에 `server: openresty` | 우리 앱이 아니라 **NPM 이 낸 응답** |
| `www-authenticate: Basic realm="Authorization required"` | **Access List 확정** |

> **우리 API 는 OPTIONS 에 401 을 낼 수 없다.** NestJS `app.enableCors()`
> 는 Express `cors` 미들웨어라 **가드보다 먼저** 돌고 OPTIONS 를 **204** 로
> 끝낸다. 출처가 허용 목록 밖이어도 `Access-Control-Allow-Origin` 헤더만
> 빠질 뿐 여전히 204 다. **OPTIONS 에 401 이 보이면 무조건 앞단이다.**

**조치**: NPM → Proxy Hosts → Edit → Access List → `Publicly Accessible`.
**대상이 두 곳**이다 (2026-08-07 실측 보강).

| 호스트 | 조치 | 이유 |
| --- | --- | --- |
| **API**(`api-dev.…`) | **푼다** | 브라우저 XHR — preflight 401 |
| **프런트**(`dev.…`) | **푼다** | 안 풀면 **새 사용자는 앱 화면조차 못 본다**(Basic 인증 팝업) |
| 인증(`auth-dev.…`) | 이미 열려 있음 | 그래서 **로그인만 되는 것처럼 보였다** |
| Coolify UI(`coolify-dev.…`) | **건드리지 않는다** | 사람이 직접 여는 관리 화면 |

> **"프런트는 뜨는데 API 만 안 된다"에 속지 말 것.** 프런트도 Access List
> 가 걸려 있었는데, 개발자 브라우저가 **Basic 인증 자격을 캐시**하고
> 있어 멀쩡해 보였다. **자격 캐시가 없는 새 브라우저(시크릿 창)** 로
> 확인해야 진짜 상태가 보인다.

> 사내 전용으로 유지할 생각이면 지금 설정이 맞다 — 대신 외부 접속은
> VPN 으로만 가능하다. 외부 테스트를 열 계획이면 **공개 범위를 넓히기
> 전에** 레이트 리밋·가입 통제가 필요하다(백로그 B14).

**"그럼 API 가 무방비 아닌가"** — 아니다. Access List 는 JWT 위에 덧씌운
이중 잠금이었고, 아래가 그대로 남는다.

| 층 | 상태 |
| --- | --- |
| ~~NPM Access List~~ | 해제 — **브라우저용 API 에는 원리적으로 쓸 수 없다** |
| **JWT 인증 가드** | `Authorization: Bearer` 없으면 401 (`auth.guard.ts`) |
| **소유자 검증** | 남의 맵은 못 읽는다 |
| **RLS** | 유지 |

> ⚠️ **Coolify 관리 UI(`coolify-dev.…`)의 Access List 는 절대 풀지 말
> 것.** 그건 사람이 직접 여는 관리 화면이라 VPN 제한이 맞다. 푸는 것은
> **API 호스트 하나뿐**이다.

**함정 — 비슷하지만 다른 원인**: 같은 화면 증상이 `VITE_API_URL` 오설정
으로도 난다(빌드 시점에 번들에 구워지는 값이라 **재빌드할 때만** 바뀐다).
**가르는 법은 하나다** — Network 탭에 **HTTP 상태 코드가 찍혔는가**.

| 상태 | 원인 |
| --- | --- |
| 상태 코드가 **있다**(401 등) | 주소는 정상. **앞단 게이트** 문제 |
| `(failed)` · `ERR_CONNECTION_*` · DNS 실패 | **`VITE_API_URL`** 이 내부 주소/빈 값으로 구워짐 → Coolify Build Variable 확인 후 재빌드 |

**고쳐졌는지 확인 — preflight 한 줄** (2026-08-08 실측으로 확정한 방법).
브라우저를 열 것도 없이 **외부망에서** 이 한 줄이면 끝난다.

```bash
curl -i -X OPTIONS https://<API도메인>/v1/folders \
  -H "Origin: https://<프런트도메인>" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

| 응답 | 뜻 |
| --- | --- |
| **`204`** + `Access-Control-Allow-Origin: <프런트도메인>` + `X-Powered-By: Express` | ✅ **해결** — `X-Powered-By` 가 곧 "nginx 가 가로채지 않고 **우리 앱이 답했다**" 는 증거다 |
| `401` + `www-authenticate: Basic` + `Server: openresty` | ❌ Access List 가 아직 남아 있다 |

> Windows `cmd.exe` 는 줄바꿈이 `\` 가 아니라 `^` 다. 헷갈리면 한 줄로
> 붙여 쓴다. (같은 함정: §6.1 의 `^{commit}` — cmd 는 `^` 를 먹는다)

**브라우저로 확인할 때는 반드시 시크릿 창.** 평소 창은 Basic 인증 자격을
캐시하고 있어 이미 고쳐진 것처럼 보인다 — 실제로 그 때문에 "프런트는
되는데 API 만 안 된다" 로 오해했다.

**구조적 개선(선택)**: preflight 가 생기는 것 자체가 프런트와 API 가
**다른 출처**이기 때문이다. `VITE_API_URL` 을 같은 출처(`https://<프런트
도메인>/api`)로 두고 NPM 에서 `/api` 를 API 컨테이너로 넘기면 preflight 가
사라지고 `CORS_ORIGIN` 관리도 없어져, 이 부류의 문제가 재발하지 않는다.

### 6.4 히스토리의 접속 IP 가 **내부 주소로만 보인다** (2026-08-09 실사용)

**증상**: 맵 히스토리·문서함 상세의 IP 가 PC 든 휴대폰이든, 내부망이든
외부망이든 **전부 같은 사설 주소**(예: `192.168.94.74`)로 남는다.

#### 먼저 이걸 연다 — `GET /v1/health/ip`

서버가 그 요청의 IP 를 무엇으로 보는지 그대로 돌려준다.

**어디서 · 무엇을 입력하나** (막연히 "열어 본다"로 적지 않는다)

| 어디서 | 무엇을 |
|---|---|
| **PC 웹 브라우저 주소창** (권장) | `https://<API 도메인>/v1/health/ip` 를 입력하고 Enter. 프런트 도메인(`dev.…`)이 아니라 **API 도메인**(`api-dev.…`)이다 |
| **휴대폰 브라우저** | 같은 주소 — 기기마다 값이 달라지는지 보려면 PC 와 둘 다 연다 |
| **em-dev 터미널** | `curl -s https://<API 도메인>/v1/health/ip` — 다만 이건 **서버 자신의 접속**이라 `ip` 는 서버의 공인 IP 다. `xForwardedFor` 항목 수를 보는 데는 충분하다 |

> API 도메인이 헷갈리면: 프런트에서 맵을 연 뒤 **F12 → Network** 탭 →
> 아무 요청이나 클릭 → `Request URL` 이 `https://…/v1/maps…` 다.
> 그 `https://…` 부분이 API 도메인이다.

**고치기 전에 실제로 받은 값**(2026-08-09):

```json
{ "ip": "192.168.94.74",
  "ips": ["192.168.94.74"],
  "xForwardedFor": "192.168.94.74",
  "xRealIp": "192.168.94.74",
  "remoteAddress": "::ffff:10.0.1.6",
  "trustProxy": ["loopback","linklocal","uniquelocal"] }
```
**읽는 법** — 이 네 줄이 사슬을 그대로 말해 준다.

| 값 | 뜻 |
|---|---|
| `remoteAddress: 10.0.1.6` | **우리 API 에 직접 연결한 상대** = 우리 앞 프록시(Traefik) |
| `xForwardedFor: 192.168.94.74` (**항목 1개**) | 그 프록시가 "접속자는 이 주소"라고 적어 보냈다 |
| 그런데 그 값도 **사설 주소** | 즉 우리 앞 프록시가 본 상대도 진짜 접속자가 아니라 **또 다른 내부 장치**였다 |
| 서로 다른 기기·외부망에서도 **같은 값** | 접속자별로 달라지지 않는다 = 접속자 주소가 아니다 |

→ **진짜 접속자 IP 는 우리 API 에 닿기 전에 이미 사라졌다.**
`TRUST_PROXY` 를 어떻게 고쳐도 복구할 수 없다 — 없는 정보를 벗겨 낼 수는
없다. 고칠 자리는 **`xForwardedFor` 에 찍힌 그 장치**다.

#### 그 장치가 무엇인지부터 찾는다

```bash
# 1) 그 IP 를 가진 컨테이너 이름
for c in $(docker ps -q); do
  ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$c")
  case "$ip" in *192.168.94.74*) docker inspect -f '{{.Name}}  → '"$ip" "$c";; esac
done

# 2) 아무 컨테이너도 아니면 호스트/게이트웨이다 (Docker 포트 공개 방식 문제)
ip -4 addr | grep 192.168.94
docker network ls -q | xargs -r -n1 docker network inspect \
  -f '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{.Gateway}}{{end}}'
```

#### 원인별 조치

| `xForwardedFor` 의 주소가 | 뜻 | 조치 |
|---|---|---|
| **어느 컨테이너도 아니다** (위 명령이 아무것도 안 찍는다) | 그 장치는 **도커 밖**이다 — 보통 **다른 장비에서 도는 NPM** 이 Traefik 앞에 있다 | ⇒ 아래 "Traefik 이 헤더를 버린다" 를 먼저 본다 |
| **Docker 네트워크 게이트웨이** | 포트 공개가 **userland-proxy** 를 거쳐 출발지 주소가 게이트웨이로 바뀐다 | `/etc/docker/daemon.json` 에 `{"userland-proxy": false}` 후 도커 재시작, 또는 에지 프록시를 `network_mode: host` 로 |
| **NPM(nginx) 컨테이너** | NPM 도 접속자 IP 를 못 받고 있다 — NPM 앞에 또 하나가 있다 | NPM **접근 로그**를 본다. 거기도 사설이면 그 앞을 고친다 |

#### ★ 가장 흔한 함정 — **Traefik 은 남이 붙인 X-Forwarded-\* 를 버린다**

Traefik 은 **신뢰하지 않는 상대가 보낸 `X-Forwarded-*` 헤더를 지우고 자기가
다시 쓴다**(보안 기본값 — 아무나 헤더를 위조해 IP 를 속이지 못하게).
그래서 NPM 이 접속자 IP 를 제대로 적어 보내도, Traefik 이 그것을 버리고
**자기가 본 상대(= NPM 의 주소)** 로 덮어쓴다. 우리 API 에는 사설 주소
하나만 남는다 — **바로 이 증상이다.**

신뢰 목록에 NPM 이 있는 대역을 넣어 주면 Traefik 이 헤더를 **이어받는다**.

##### 어디서 고치나 — **Coolify 가 도는 서버(em-dev)의 프록시 설정**

⚠️ 셸 명령이 아니라 **Traefik 의 설정 파일**이다. 고치는 자리는 두 곳 중
하나이고, **UI 쪽을 권한다**(Coolify 가 프록시를 다시 만들 때 UI 에 넣은
값은 유지된다).

**① 확인 — 지금 무엇이 도는지, 이미 설정돼 있는지**

`em-dev` 서버에 SSH 로 들어가서:

```bash
# Coolify 의 프록시(Traefik) 컨테이너 이름 — 보통 coolify-proxy
docker ps --format '{{.Names}}\t{{.Image}}' | grep -i traefik

# 지금 걸린 옵션에 forwardedHeaders 가 있는지 (없으면 이번 건이 맞다)
docker inspect coolify-proxy -f '{{range .Config.Cmd}}{{println .}}{{end}}' \
  | grep -i forwarded || echo '  → forwardedHeaders 설정 없음'

# 설정 파일 원본
sudo cat /data/coolify/proxy/docker-compose.yml
```

**② 고치기 (권장) — Coolify 웹 UI**

`Servers` → **em-dev 서버 선택** → `Proxy` 탭 → **Configuration**(설정
파일 편집기, 버전에 따라 `Advanced`/`Configuration` 로 표기) → 열린
YAML 의 `services:` → `traefik:` → **`command:` 목록**에 두 줄을 더한다
→ `Save` → **`Restart Proxy`**.

아래는 2026-08-09 em-dev 의 **실제** `command:` 블록에 두 줄(← 표시)을
넣은 모습이다. **UI 에 넣어야** Coolify 가 프록시를 다시 만들 때도 남는다.

```yaml
    command:
      - '--ping=true'
      - '--ping.entrypoint=http'
      - '--api.dashboard=true'
      - '--entrypoints.http.address=:80'
      - '--entrypoints.https.address=:443'
      - '--entrypoints.http.http.encodequerysemicolons=true'
      - '--entryPoints.http.http2.maxConcurrentStreams=250'
      - '--entrypoints.https.http.encodequerysemicolons=true'
      - '--entryPoints.https.http2.maxConcurrentStreams=250'
      - '--entrypoints.http.forwardedHeaders.trustedIPs=192.168.94.0/24'   # ←
      - '--entrypoints.https.forwardedHeaders.trustedIPs=192.168.94.0/24'  # ←
      - '--entrypoints.https.http3'
      - '--providers.file.directory=/traefik/dynamic/'
      # … 나머지는 그대로
```

**③ UI 를 못 쓰면 — 파일에 직접 (백업 + 두 번 실행해도 안전)**

`INSERT_AFTER` 줄 **뒤에** 두 줄을 끼워 넣는다. 이미 있으면 건드리지 않는다.

```bash
cd /data/coolify/proxy
sudo cp docker-compose.yml docker-compose.yml.bak

sudo python3 -c '
p = "/data/coolify/proxy/docker-compose.yml"
s = open(p).read()
anchor = "      - \x27--entryPoints.https.http2.maxConcurrentStreams=250\x27\n"
add = ("      - \x27--entrypoints.http.forwardedHeaders.trustedIPs=192.168.94.0/24\x27\n"
       "      - \x27--entrypoints.https.forwardedHeaders.trustedIPs=192.168.94.0/24\x27\n")
if "forwardedHeaders" in s: print("이미 있음 — 바꾸지 않았습니다")
elif anchor not in s:      print("기준 줄을 못 찾았습니다 — 손으로 넣어 주세요")
else:
    open(p, "w").write(s.replace(anchor, anchor + add, 1)); print("두 줄을 넣었습니다")
'

diff docker-compose.yml.bak docker-compose.yml   # 무엇이 바뀌었는지 눈으로 확인
sudo docker compose up -d                        # 프록시만 다시 뜬다
```

> 파일을 직접 고쳤다면, 동작을 확인한 뒤 **같은 내용을 Coolify UI 편집기에도
> 넣어 둔다** — Coolify 가 프록시 설정을 다시 만들 때 파일 쪽 수정은 지워질
> 수 있다.
* 대역은 **NPM 이 있는 사설 대역**으로 — 여기서는 `/v1/health/ip` 의
  `xForwardedFor` 에 찍힌 주소(`192.168.94.74`)가 속한 `192.168.94.0/24`.
  여러 곳이면 콤마로 나열한다.
* ⚠️ `forwardedHeaders.insecure=true` (아무나 신뢰)는 쓰지 않는다 —
  접속자가 헤더를 위조해 IP 를 마음대로 바꿀 수 있다.
* 재시작하면 **모든 사이트가 잠깐 끊긴다**(수 초). 프록시만 다시 뜨는
  것이라 애플리케이션 컨테이너는 그대로다.

고쳐졌으면 `xForwardedFor` 가 **두 항목**이 된다.

```
xForwardedFor: "203.0.113.9, 192.168.94.74"   ← 접속자, NPM
ip:            "203.0.113.9"                   ← 우리가 기록하는 값
```

여전히 한 항목이면 이번엔 **NPM 이 안 보내는 것**이다 — NPM 의 해당 호스트
Advanced 에 아래 헤더를 넣는다.

> **판정 기준 하나**: 사슬의 어느 단계든 **접속자마다 값이 달라져야**
> 한다. 서로 다른 기기에서 같은 값이 나오면 그 단계에서 이미 잃은 것이다.

#### ✅ 해결 확인 (2026-08-09)

em-dev 의 Coolify 프록시(`traefik:v3.6`)에 두 줄을 넣고 `Save` →
`Restart Proxy` 한 직후:

```json
{ "ip": "58.230.60.22",
  "ips": ["58.230.60.22", "192.168.94.74"],
  "xForwardedFor": "58.230.60.22, 192.168.94.74",
  "xRealIp": "58.230.60.22",
  "remoteAddress": "::ffff:10.0.1.6",
  "hint": "OK — 공인 IP 입니다. 히스토리에도 이 값이 남습니다." }
```

`xForwardedFor` 가 **두 항목**(접속자 → NPM)이 되었고, 우리가 기록하는
`ip` 가 진짜 접속자 주소가 됐다. **원인은 Traefik 이 남의 X-Forwarded-\*
를 버리는 기본 동작이 맞았다.**

같이 고쳐진 것: 레이트 리밋도 이 값을 쓴다 — 그동안 **모든 사용자가 한
바구니**에 묶여 있었다(한 사람이 많이 쓰면 전원이 막히는 상태).

#### NPM 에서 헤더를 넘기게 하기 (해당 호스트 → Advanced)

```nginx
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

`$proxy_add_x_forwarded_for` 는 **기존 값에 이어 붙인다** — 단계가 늘어도
사슬이 보존된다(`$remote_addr` 로 덮어쓰면 앞 단계가 지워진다).

고치고 나면 `/v1/health/ip` 의 `hint` 가 `OK — 공인 IP 입니다` 로 바뀐다.
그때부터 저장하는 버전에 진짜 IP 가 남는다(이미 쌓인 기록은 그대로다).

#### 사슬이 **전부 사설**일 때 — 판별법 (2026-08-14 실사용)

로그인 기록에 `192.168.94.1` 이 찍혀 물어보셨다. 그때 `/v1/health/ip`:

```
ip: 192.168.94.1
xForwardedFor: "192.168.94.1, 192.168.94.74"
remoteAddress: ::ffff:10.0.1.9        ← Traefik
trustProxy: [loopback, linklocal, uniquelocal]
```

사슬이 **둘인데 둘 다 사설**이다. 이 상태에서 `TRUST_PROXY` 를 아무리
바꿔도 소용없다 — **사슬 안에 공인 IP 가 아예 없기 때문이다.** 남은
가능성은 둘뿐이다.

| | 뜻 | 할 일 |
|---|---|---|
| ⑴ | 지금 **같은 사설망에서** 접속 중이다 | 없음 — 정상이다 |
| ⑵ | 맨 앞(`192.168.94.1`)이 원본 IP 를 버렸다 | 그 장비의 프록시 설정을 고친다 |

**가르는 법: 휴대폰에서 와이파이를 끄고 LTE 로 `/v1/health/ip` 를 연다.**
거기서 공인 IP 가 나오면 ⑴이고 고칠 것이 없다. LTE 에서도 사설이면 ⑵이다.

> `hint` 가 이 경우를 알아보고 그대로 안내한다(2026-08-14 추가). 그전에는
> "TRUST_PROXY 조정이 필요합니다"라고만 말해 **고칠 수 없는 자리를 고치라고
> 안내하고 있었다.**
