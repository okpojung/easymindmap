#!/bin/bash
# emm-db-backup.sh — 이 인스턴스의 **모든** 데이터베이스를 한 파일로 담는다.
#
# 왜 `pg_dumpall` 인가: **로그인 계정은 앱 DB 에 없다.** GoTrue 는 별도
# 데이터베이스(`gotrue`)를 쓰고, Coolify 의 기본 백업은 `POSTGRES_DB` 하나만
# 담는다. 그대로 두면 복원 뒤에 이렇게 된다 —
#
#   장애 → 복원 → 맵과 문서는 살아났는데 **아무도 로그인할 수 없다**
#
# 그래서 이 스크립트는 담은 뒤 **확인까지 한다.** 크기가 0 이 아닌지가
# 아니라, gzip 이 온전한지 · 담겼어야 할 데이터베이스가 실제로 그 안에
# 있는지를 본다. 확인하지 않는 백업은 백업이 아니라 **백업했다는 기분**이다.
#
# 설치·cron 등록은 docs/90-architecture/dev-server-runbook.md §2.1.
#
#   사용법:  emm-db-backup.sh            평소 (cron)
#            emm-db-backup.sh --check    담지 않고 전제만 확인한다
set -uo pipefail

DEST="${DEST:-/var/backups/emm}"
STATE_DIR="${STATE_DIR:-/var/lib/emm-backup}"
KEEP_DAYS="${KEEP_DAYS:-14}"
# 헤더만 담긴 껍데기를 성공으로 세지 않기 위한 바닥값. 빈 스키마도 이보다는 크다.
MIN_BYTES="${MIN_BYTES:-10240}"
# 이 이름들이 덤프 안에 없으면 **실패로 친다.** gotrue 가 여기 있는 이유가
# 이 파일 전체의 존재 이유다.
REQUIRE_DBS="${REQUIRE_DBS:-gotrue}"
# 서버 밖으로 한 벌 더 옮기는 명령. 파일 경로가 $1 로 들어간다.
#   예) OFFSITE_CMD='cp "$1" /mnt/nas/db-backup/'
OFFSITE_CMD="${OFFSITE_CMD:-}"
# 여기가 **실제로 마운트되어 있어야** 시작한다. 비워 두면 확인하지 않는다.
#
# 네트워크 마운트가 끊기면 그 자리는 **빈 로컬 디렉터리**가 된다. 그대로
# 두면 스크립트는 거기에 태연히 쓰고 성공을 보고하고, 몇 달 동안 NAS 에
# 백업이 쌓이고 있다고 믿게 된다 — 정작 필요할 때 서버와 함께 죽은 로컬
# 사본만 남는다. 이 스크립트가 막으려는 실패가 바로 그 종류다.
REQUIRE_MOUNT="${REQUIRE_MOUNT:-}"

CHECK_ONLY=no
[ "${1:-}" = "--check" ] && CHECK_ONLY=yes

fail() {
  echo "❌ $*" >&2
  notify "$*"
  exit 1
}

# ── 메일 ──────────────────────────────────────────────────────────
#
# 설정은 **api 컨테이너에서 읽는다** — 서버에 비밀값을 두 번 두지 않기
# 위해서다. `docker inspect` 는 컨테이너가 멈춰 있어도 읽힌다.
#
# health-watch.sh 에 같은 코드가 있고, 일부러 합치지 않았다. 그쪽은
# e2e153 이 지키고 있는데 이 저장소에서 그 테스트를 돌릴 수 없어,
# **검증된 경로를 검증되지 않은 공용 코드로 바꾸는 것**이 되기 때문이다.
# 합치려면 두 스크립트를 함께 시험할 수 있게 된 다음에 한다.
envof() {
  docker inspect "$1" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | sed -n "s/^$2=//p" | head -1
}

notify() {
  local reason="$1"
  local api_ct smtp_host smtp_port smtp_user smtp_pass smtp_from to_list
  api_ct=$(docker ps -a --format '{{.Names}}|{{.Ports}}' 2>/dev/null \
    | grep '3000/tcp' | head -1 | cut -d'|' -f1)

  smtp_host="${SMTP_HOST:-$(envof "$api_ct" SMTP_HOST)}"
  smtp_port="${SMTP_PORT:-$(envof "$api_ct" SMTP_PORT)}"
  smtp_user="${SMTP_USER:-$(envof "$api_ct" SMTP_USER)}"
  smtp_pass="${SMTP_PASS:-$(envof "$api_ct" SMTP_PASS)}"
  smtp_from="${SMTP_FROM:-$(envof "$api_ct" SMTP_FROM)}"
  to_list="${ALERT_EMAILS:-$(envof "$api_ct" ALERT_EMAILS)}"
  [ -z "$to_list" ] && to_list=$(envof "$api_ct" ADMIN_EMAILS)

  if [ -z "$smtp_host" ] || [ -z "$to_list" ]; then
    echo "   (메일 설정을 찾지 못해 알리지 못했습니다 — api=${api_ct:-못 찾음})" >&2
    return 0
  fi
  [ -z "$smtp_from" ] && smtp_from="$smtp_user"
  : "${smtp_port:=587}"

  local subj proto envelope mail
  subj="[EasyMindMap] ❌ DB 백업 실패"
  # 한글 제목은 MIME 인코딩해야 한다 — 그대로 보내면 클라이언트가 깨뜨린다.
  subj="=?UTF-8?B?$(printf '%s' "$subj" | base64 -w0)?="
  [ "$smtp_port" = "465" ] && proto="smtps" || proto="smtp"
  envelope=$(printf '%s' "$smtp_from" | sed -E 's/.*<([^>]+)>.*/\1/')

  local rcpt=()
  local IFS=','
  read -ra tos <<< "$to_list"
  unset IFS
  local t
  for t in "${tos[@]}"; do
    t=$(printf '%s' "$t" | tr -d ' ')
    [ -n "$t" ] && rcpt+=(--mail-rcpt "$t")
  done

  mail=$(mktemp)
  {
    printf 'From: %s\r\n' "$smtp_from"
    printf 'To: %s\r\n' "$to_list"
    printf 'Subject: %s\r\n' "$subj"
    printf 'MIME-Version: 1.0\r\n'
    printf 'Content-Type: text/plain; charset=UTF-8\r\n'
    printf 'Content-Transfer-Encoding: 8bit\r\n'
    printf '\r\n'
    printf '무엇이: %s\r\n' "$reason"
    printf '시각:   %s\r\n' "$(date '+%F %T %Z')"
    printf '서버:   %s\r\n' "$(hostname 2>/dev/null)"
    printf '\r\n'
    printf '백업이 없는 채로 하루가 지나가고 있습니다. 런북 §2.1 을 보세요.\r\n'
  } > "$mail"

  local auth=()
  [ -n "$smtp_user" ] && auth=(--user "$smtp_user:$smtp_pass")
  if curl -sS --max-time 20 --url "$proto://$smtp_host:$smtp_port" \
       $([ "$proto" = "smtp" ] && [ "$smtp_port" != "2525" ] && echo --ssl-reqd) \
       --mail-from "$envelope" "${rcpt[@]}" "${auth[@]}" -T "$mail" >/dev/null; then
    echo "   알림 보냄 → $to_list" >&2
  else
    echo "   (메일 발송도 실패했습니다)" >&2
  fi
  rm -f "$mail"
}

# ── 0) 마운트가 살아 있는지 ───────────────────────────────────────
#
# `mountpoint` 가 없는 환경도 있으므로, 그 디렉터리와 부모의 장치 번호를
# 비교하는 방법으로 물러선다 — 다른 장치면 마운트된 것이다.
is_mounted() {
  [ -d "$1" ] || return 1
  if command -v mountpoint >/dev/null 2>&1; then
    mountpoint -q "$1" && return 0 || return 1
  fi
  local d p
  d=$(stat -c %d "$1" 2>/dev/null) || return 1
  p=$(stat -c %d "$1/.." 2>/dev/null) || return 1
  [ "$d" != "$p" ]
}

if [ -n "$REQUIRE_MOUNT" ]; then
  is_mounted "$REQUIRE_MOUNT" \
    || fail "'$REQUIRE_MOUNT' 이 마운트되어 있지 않습니다 — 여기 쓰면 백업이 서버 안에만 남습니다."
  echo "마운트 확인: $REQUIRE_MOUNT"
fi

# ── 1) DB 를 찾는다 ───────────────────────────────────────────────
#
# 이름이나 포트로 고르지 않는다. **우리 표가 있는 데이터베이스**를 가진
# 앱을 찾는다 — 서버에 postgres 가 여럿일 수 있고, 이름은 배포마다 바뀐다.
API=""
for C in $(docker ps --format '{{.Names}}' 2>/dev/null); do
  U=$(docker exec "$C" printenv DATABASE_URL 2>/dev/null) || continue
  [ -n "$U" ] || continue
  H=$(printf '%s' "$U" | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
  US=$(printf '%s' "$U" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
  N=$(printf '%s' "$U" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
  [ "$(docker exec "$H" psql -U "$US" -d "$N" -tAc \
        "SELECT to_regclass('public.map_documents') IS NOT NULL" 2>/dev/null)" = "t" ] \
    && { API="$C"; break; }
done
[ -n "$API" ] || fail "우리 표(map_documents)를 가진 데이터베이스를 찾지 못했습니다."

URL=$(docker exec -i "$API" printenv DATABASE_URL)
DB=$(printf '%s' "$URL"     | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
PGUSER=$(printf '%s' "$URL" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
echo "DB=$DB  계정=$PGUSER  (api=$API)"

DBS=$(docker exec -i "$DB" psql -U "$PGUSER" -d postgres -tAc \
        "SELECT datname FROM pg_database WHERE datistemplate = false" 2>/dev/null | tr -d '\r')
[ -n "$DBS" ] || fail "데이터베이스 목록을 읽지 못했습니다."
echo "담을 데이터베이스: $(printf '%s' "$DBS" | tr '\n' ' ')"

# 요구한 이름이 이 인스턴스에 아예 없으면, 담아도 없다 — 먼저 말한다.
IFS=',' read -ra NEED <<< "$REQUIRE_DBS"
for n in "${NEED[@]}"; do
  n=$(printf '%s' "$n" | tr -d ' ')
  [ -n "$n" ] || continue
  printf '%s\n' "$DBS" | grep -qx "$n" \
    || fail "'$n' 이 이 인스턴스에 없습니다 — 다른 PostgreSQL 을 쓰고 있을 수 있습니다(런북 §2.1)."
done

if [ "$CHECK_ONLY" = "yes" ]; then
  echo "✅ 전제 확인 완료 — 담지 않고 끝냅니다."
  exit 0
fi

# ── 2) 담는다 ─────────────────────────────────────────────────────
mkdir -p "$DEST" "$STATE_DIR"
OUT="$DEST/all-$(date +%Y%m%d-%H%M).sql.gz"
# 다 받은 뒤에만 정식 이름으로 — 반쪽 파일을 백업으로 착각하지 않게.
docker exec -i "$DB" pg_dumpall -U "$PGUSER" | gzip > "$OUT.tmp" \
  || { rm -f "$OUT.tmp"; fail "pg_dumpall 이 실패했습니다."; }

# ── 3) 확인한다 — 여기가 이 스크립트의 요점이다 ───────────────────
gzip -t "$OUT.tmp" 2>/dev/null || { rm -f "$OUT.tmp"; fail "받은 파일이 온전한 gzip 이 아닙니다."; }

SIZE=$(gzip -cd "$OUT.tmp" 2>/dev/null | wc -c | tr -d ' ')
[ "${SIZE:-0}" -ge "$MIN_BYTES" ] \
  || { rm -f "$OUT.tmp"; fail "백업이 너무 작습니다(푼 크기 ${SIZE}바이트) — 껍데기일 수 있습니다."; }

# 이름이 파일 안에 실제로 있는지 본다. pg_dumpall 은 데이터베이스마다
# `\connect <이름>` 을 적는다 — 목록에 있었다는 것과 담겼다는 것은 다르다.
for n in "${NEED[@]}"; do
  n=$(printf '%s' "$n" | tr -d ' ')
  [ -n "$n" ] || continue
  gzip -cd "$OUT.tmp" 2>/dev/null | grep -qE "^\\\\connect ($n|\"$n\")" \
    || { rm -f "$OUT.tmp"; fail "'$n' 이 백업 파일 안에 없습니다 — 복원해도 로그인할 수 없게 됩니다."; }
done

mv "$OUT.tmp" "$OUT"
echo "✅ $(date '+%F %T') $OUT ($(du -h "$OUT" 2>/dev/null | cut -f1))"

# ── 4) 서버 밖으로 ────────────────────────────────────────────────
#
# `$DEST` 는 **같은 서버다.** 서버가 통째로 죽으면 백업도 함께 죽는다.
if [ -n "$OFFSITE_CMD" ]; then
  bash -c "$OFFSITE_CMD" _ "$OUT" || fail "서버 밖 복사에 실패했습니다: $OFFSITE_CMD"
  echo "✅ 서버 밖으로 복사했습니다"
else
  echo "⚠️  OFFSITE_CMD 가 없습니다 — 이 백업은 서버와 함께 죽습니다(런북 §2.1)." >&2
fi

# ── 5) 보관 정책과 흔적 ───────────────────────────────────────────
find "$DEST" -name 'all-*.sql.gz' -mtime +"$KEEP_DAYS" -delete 2>/dev/null

# 마지막 성공 시각. cron 이 조용히 멈춘 것을 health-watch.sh 가 이걸 보고
# 알아챈다 — 멈춘 cron 은 자기가 멈췄다고 말해 줄 수 없기 때문이다.
date +%s > "$STATE_DIR/last-success"
exit 0
