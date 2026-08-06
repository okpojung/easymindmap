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
- 저장 용량 쿼터(DB+첨부 합산, 기본 1GB)를 넘으면 업로드·저장이
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
