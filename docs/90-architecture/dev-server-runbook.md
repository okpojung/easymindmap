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
  docker exec -i "$DB" psql -U postgres -d postgres \
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
docker exec -i "$DB" psql -U postgres -d postgres < apps/api/database/schema.sql
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
docker exec -i "$DB" psql -U postgres -d postgres <<'SQL'
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
docker exec -i "$DB" psql -U postgres -d postgres -tA <<'SQL'
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

### 1.5-0-B. 요금제 컬럼 + 기존 계정 Basic 승격 — 2026-08-06

**정책**: Free 10MB · Basic 10GB · Pro 30GB · Team 20GB/사용자.
신규 가입은 **Free**(컬럼 기본값), **2026-08-06 12:00 UTC 이전에 가입한
계정은 Basic**. 용량은 `users.plan` 이 정하고 트리거가 `quota_bytes` 를
맞춘다 — **결제가 붙으면 `plan` 만 바꾸면 된다.**

`schema.sql` 에 들어 있으므로 스키마를 재적용(§2-B·§2-C)하면 함께
적용되지만, **스키마를 다시 밀 일이 없다면** 아래만 붙여넣으면 된다.

```bash
bash <<'SCRIPT'
set -e
DB=$(docker ps --format '{{.Names}}\t{{.Image}}' \
  | awk -F'\t' 'tolower($2) ~ /supabase\/postgres/ {print $1; exit}')
[ -z "$DB" ] && DB=$(docker ps --format '{{.Names}}\t{{.Image}}' \
  | awk -F'\t' 'tolower($2) ~ /postgres/ {print $1; exit}')
[ -z "$DB" ] && { echo "❌ postgres 컨테이너를 찾지 못했습니다."; exit 1; }
echo "✅ DB 컨테이너: $DB"

docker exec -i "$DB" psql -U postgres -d postgres <<'SQL'
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
docker exec -i "$DB" psql -U postgres -d postgres -tA <<'SQL'
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
- DB 데이터는 Coolify DB 리소스의 **Scheduled Backup**(S3 호환 대상
  지정 가능)으로.

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
