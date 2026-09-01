#!/bin/bash
# emm-db-backup.test.sh — emm-db-backup.sh 를 가짜 docker 로 실제로 돌린다.
#
# 백업 스크립트는 **필요할 때 처음 돌아간다.** 그때 처음 돌리면 늦다.
# 여기서는 PATH 앞에 가짜 `docker` 를 놓아, 컨테이너도 PostgreSQL 도 없이
# 스크립트의 판단 전부를 밟아 본다.
#
#   bash scripts/emm-db-backup.test.sh
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
SUT="$HERE/emm-db-backup.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

pass=0; fail=0
ok()   { pass=$((pass+1)); echo "PASS  $1"; }
# `&& bad || ok` 로 쓰이므로 **반드시 0 을 돌려준다** — 1 을 돌려주면 실패를
# 세고 나서 ok 까지 함께 돌아 한 항목이 FAIL 과 PASS 로 두 번 찍힌다.
bad()  { fail=$((fail+1)); echo "FAIL  $1"; [ -n "${2:-}" ] && echo "      $2"; return 0; }
check() { # 이름, 기대(정규식), 실제
  if printf '%s' "$3" | grep -qE "$2"; then ok "$1"; else bad "$1" "받음: $(printf '%s' "$3" | tr '\n' ' ' | cut -c1-160)"; fi
}
check_not() {
  if printf '%s' "$3" | grep -qE "$2"; then bad "$1" "있으면 안 되는 것이 있음"; else ok "$1"; fi
}

# ── 가짜 docker ───────────────────────────────────────────────────
#
# 시나리오는 환경변수로 조종한다.
#   FAKE_DBS      psql 이 돌려줄 데이터베이스 목록
#   FAKE_DUMP_DBS 덤프 안에 \connect 로 적힐 이름들
#   FAKE_DUMP_PAD 덤프를 부풀릴 바이트 수 (작게 두면 '너무 작다' 경로)
#   FAKE_DIE      1 이면 pg_dumpall 이 도중에 죽는다
#   FAKE_NO_TABLE 1 이면 우리 표를 가진 DB 가 없다
mkdir -p "$WORK/bin"
cat > "$WORK/bin/docker" <<'FAKE'
#!/bin/bash
case "$1" in
  ps)
    # --format '{{.Names}}' 와 '{{.Names}}|{{.Ports}}' 두 가지로 불린다
    if printf '%s' "$*" | grep -q 'Ports'; then echo "api-ct|0.0.0.0:3000->3000/tcp"; else echo "api-ct"; fi ;;
  inspect)
    echo "SMTP_HOST=127.0.0.1"; echo "SMTP_PORT=2525"; echo "SMTP_FROM=noreply@test"
    echo "ADMIN_EMAILS=admin@test" ;;
  exec)
    shift
    [ "$1" = "-i" ] && shift
    CT="$1"; shift
    if [ "$1" = "printenv" ]; then
      echo "postgres://emm:pw@dbhost:5432/easymindmap"
    elif [ "$1" = "psql" ]; then
      if printf '%s' "$*" | grep -q 'to_regclass'; then
        [ "${FAKE_NO_TABLE:-0}" = "1" ] && echo "f" || echo "t"
      else
        printf '%s\n' ${FAKE_DBS:-easymindmap gotrue}
      fi
    elif [ "$1" = "pg_dumpall" ]; then
      [ "${FAKE_DIE:-0}" = "1" ] && { echo "-- 중간까지만 나오고"; exit 1; }
      { echo "-- pg_dumpall"
        for d in ${FAKE_DUMP_DBS:-easymindmap gotrue}; do
          echo "CREATE DATABASE $d;"; echo "\\connect $d"; echo "-- rows";
        done
        head -c "${FAKE_DUMP_PAD:-40000}" /dev/zero | tr '\0' 'x'
      }
    fi ;;
esac
exit 0
FAKE
chmod +x "$WORK/bin/docker"

# 메일은 보내지 않는다 — 보내려 했는지만 기록한다
cat > "$WORK/bin/curl" <<'FAKE'
#!/bin/bash
echo "curl-called $*" >> "$MAIL_LOG"
exit 0
FAKE
chmod +x "$WORK/bin/curl"

export PATH="$WORK/bin:$PATH"
export MAIL_LOG="$WORK/mail.log"

run() { # 나머지 인자는 스크립트에 그대로
  : > "$MAIL_LOG"
  DEST="$WORK/dest" STATE_DIR="$WORK/state" bash "$SUT" "$@" 2>&1
}

# ── ① 정상 ────────────────────────────────────────────────────────
rm -rf "$WORK/dest" "$WORK/state"
OUT=$(run)
check '① 우리 표를 가진 DB 를 찾는다'        'api=api-ct'                 "$OUT"
check '① 담을 목록을 보여준다'                'gotrue'                     "$OUT"
check '① 성공을 알린다'                       '✅.*all-.*\.sql\.gz'        "$OUT"
check '① 서버 밖 복사가 없으면 경고한다'      'OFFSITE_CMD 가 없습니다'    "$OUT"
[ "$(ls "$WORK/dest"/all-*.sql.gz 2>/dev/null | wc -l)" = "1" ] \
  && ok '① 파일이 하나 생겼다' || bad '① 파일이 하나 생겼다'
[ -f "$WORK/state/last-success" ] && ok '① 마지막 성공 시각을 남긴다' || bad '① 마지막 성공 시각을 남긴다'
check_not '① 성공했으면 메일을 보내지 않는다' 'curl-called' "$(cat "$MAIL_LOG")"
ls "$WORK/dest"/*.tmp >/dev/null 2>&1 && bad '① 임시 파일을 남기지 않는다' || ok '① 임시 파일을 남기지 않는다'

# ── ② gotrue 가 빠진 덤프 — 이 스크립트의 존재 이유 ───────────────
rm -rf "$WORK/dest" "$WORK/state"
OUT=$(FAKE_DUMP_DBS="easymindmap" run)
check '② gotrue 가 덤프에 없으면 실패한다'    "'gotrue' 이 백업 파일 안에 없습니다" "$OUT"
check '② 왜 문제인지 말해준다'                '로그인할 수 없게'           "$OUT"
ls "$WORK/dest"/all-*.sql.gz >/dev/null 2>&1 \
  && bad '② 실패한 백업을 남기지 않는다' || ok '② 실패한 백업을 남기지 않는다'
check '② 실패하면 메일을 보낸다'              'curl-called'                "$(cat "$MAIL_LOG")"

# ── ③ 인스턴스에 gotrue 자체가 없다 ───────────────────────────────
OUT=$(FAKE_DBS="easymindmap" run)
check '③ 담기 전에 먼저 말한다'               "'gotrue' 이 이 인스턴스에 없습니다" "$OUT"
check_not '③ 그 경우 덤프를 뜨지 않는다'      '✅.*sql\.gz'                "$OUT"

# ── ④ 껍데기 / 깨진 파일 ──────────────────────────────────────────
OUT=$(FAKE_DUMP_PAD=10 run)
check '④ 너무 작으면 실패한다'                '너무 작습니다'              "$OUT"
# 깨진 gzip 은 파이프를 거치면 만들 수 없다 — 쓰레기가 들어와도 gzip 은
# 성공한다. 실제로 일어나는 것은 **pg_dumpall 이 도중에 죽는** 경우이고,
# 그때 파이프라인이 실패로 보이려면 `pipefail` 이 켜져 있어야 한다.
OUT=$(FAKE_DIE=1 run)
check '④ pg_dumpall 이 죽으면 실패한다'       'pg_dumpall 이 실패'         "$OUT"
ls "$WORK/dest"/all-*.sql.gz >/dev/null 2>&1 \
  && bad '④ 반쪽 파일을 남기지 않는다' || ok '④ 반쪽 파일을 남기지 않는다'

# ── ⑤ 우리 표를 가진 DB 가 없다 ───────────────────────────────────
OUT=$(FAKE_NO_TABLE=1 run)
check '⑤ 찾지 못하면 그렇게 말한다'           'map_documents.*찾지 못했습니다' "$OUT"

# ── ⑥ --check 는 담지 않는다 ──────────────────────────────────────
rm -rf "$WORK/dest" "$WORK/state"
OUT=$(run --check)
check '⑥ 전제만 확인한다'                     '전제 확인 완료'             "$OUT"
ls "$WORK/dest"/all-*.sql.gz >/dev/null 2>&1 \
  && bad '⑥ --check 는 파일을 만들지 않는다' || ok '⑥ --check 는 파일을 만들지 않는다'

# ── ⑦ 서버 밖 복사 ────────────────────────────────────────────────
rm -rf "$WORK/dest" "$WORK/state"; mkdir -p "$WORK/offsite"
OUT=$(OFFSITE_CMD="cp \"\$1\" $WORK/offsite/" run)
check '⑦ 설정하면 복사한다'                   '서버 밖으로 복사했습니다'   "$OUT"
[ "$(ls "$WORK/offsite" | wc -l)" = "1" ] && ok '⑦ 사본이 실제로 생겼다' || bad '⑦ 사본이 실제로 생겼다'
OUT=$(OFFSITE_CMD="false" run)
check '⑦ 복사가 실패하면 백업도 실패로 본다'  '서버 밖 복사에 실패'        "$OUT"

# ── ⑧ 마운트 확인 — NAS 가 끊긴 채로 쓰지 않는다 ─────────────────
rm -rf "$WORK/dest" "$WORK/state"; mkdir -p "$WORK/notmounted"
OUT=$(REQUIRE_MOUNT="$WORK/notmounted" run)
check '⑧ 마운트가 아니면 시작하지 않는다'     '마운트되어 있지 않습니다'   "$OUT"
check '⑧ 왜 문제인지 말해준다'                '서버 안에만 남습니다'       "$OUT"
ls "$WORK/dest"/all-*.sql.gz >/dev/null 2>&1 \
  && bad '⑧ 그 경우 담지 않는다' || ok '⑧ 그 경우 담지 않는다'
check '⑧ 마운트가 없으면 메일을 보낸다'       'curl-called'                "$(cat "$MAIL_LOG")"
OUT=$(REQUIRE_MOUNT="$WORK/없는경로" run)
check '⑧ 경로 자체가 없어도 잡는다'           '마운트되어 있지 않습니다'   "$OUT"
# --check 로도 잡혀야 한다 — cron 을 걸기 전에 알아야 하는 것이다
OUT=$(REQUIRE_MOUNT="$WORK/notmounted" run --check)
check '⑧ --check 도 마운트를 본다'            '마운트되어 있지 않습니다'   "$OUT"

# ── ⑨ 보관 정책 ───────────────────────────────────────────────────
rm -rf "$WORK/dest" "$WORK/state"; mkdir -p "$WORK/dest"
touch -d '30 days ago' "$WORK/dest/all-20260101-0000.sql.gz" 2>/dev/null \
  || touch -t 202601010000 "$WORK/dest/all-20260101-0000.sql.gz"
OUT=$(run)
ls "$WORK/dest/all-20260101-0000.sql.gz" >/dev/null 2>&1 \
  && bad '⑨ 오래된 백업을 지운다' || ok '⑨ 오래된 백업을 지운다'

echo
echo "합계: ${pass}건 통과, ${fail}건 실패"
[ "$fail" = "0" ] || exit 1
