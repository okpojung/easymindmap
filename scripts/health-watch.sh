#!/bin/bash
# health-watch.sh — /v1/health 를 지켜보다 나빠지면 메일로 알린다.
#
# 왜 **호스트에서** 도는가: API 안에 넣으면 **API 가 죽었을 때 아무도
# 알리지 못한다.** 배포 직후 기동 실패가 정확히 그 경우다.
# (서버가 통째로 죽는 경우는 이것도 못 잡는다 — 그건 외부 감시가 필요하다.
#  런북 §2.2 참조.)
#
# 설치·cron 등록은 docs/90-architecture/dev-server-runbook.md §2.2.
#
#   사용법:  health-watch.sh [헬스체크 URL]
#   기본값:  $HEALTH_URL 또는 https://api-dev.mindmap.ai.kr/v1/health
set -uo pipefail

URL="${1:-${HEALTH_URL:-https://api-dev.mindmap.ai.kr/v1/health}}"
STATE_DIR="${STATE_DIR:-/var/lib/emm-health}"
STATE_FILE="$STATE_DIR/state"
# 같은 장애로 5분마다 메일이 오면 아무도 보지 않는다 —
# **상태가 바뀔 때만** 보내고, 계속 나쁘면 하루 한 번만 다시 알린다.
REMIND_SEC="${REMIND_SEC:-86400}"
TIMEOUT="${TIMEOUT:-10}"

mkdir -p "$STATE_DIR"

# ── 1) 지금 상태를 본다 ────────────────────────────────────────────
BODY=$(curl -sS --max-time "$TIMEOUT" -w '\n%{http_code}' "$URL" 2>/dev/null)
CODE=$(printf '%s' "$BODY" | tail -1)
JSON=$(printf '%s' "$BODY" | sed '$d')

if [ "$CODE" != "200" ]; then
  # 응답이 없거나 200 이 아니다 = API 가 떠 있지 않다
  STATE="down"
  DETAIL="HTTP ${CODE:-응답없음} — API 가 응답하지 않습니다."
elif printf '%s' "$JSON" | grep -q '"status":"ok"'; then
  STATE="ok"
  DETAIL="$JSON"
else
  STATE="degraded"
  DETAIL="$JSON"
fi

# ── 2) 지난번과 비교한다 ──────────────────────────────────────────
PREV_STATE=""; PREV_AT=0
if [ -f "$STATE_FILE" ]; then
  PREV_STATE=$(cut -d' ' -f1 "$STATE_FILE" 2>/dev/null)
  PREV_AT=$(cut -d' ' -f2 "$STATE_FILE" 2>/dev/null)
fi
NOW=$(date +%s)
: "${PREV_AT:=0}"

SEND=no; KIND=""
if [ -z "$PREV_STATE" ] && [ "$STATE" = "ok" ]; then
  # **처음 도는데 정상이면 아무 말도 하지 않는다.** 이걸 "복구됨"으로
  # 보내면 설치하자마자 뜬금없는 복구 메일이 온다(실제로 그랬다).
  SEND=no
elif [ "$STATE" != "$PREV_STATE" ]; then
  # 상태가 바뀌었다 — 나빠졌거나(알림) 복구됐거나(복구 알림).
  # 첫 실행인데 이미 나쁘면 알린다 — 그건 알아야 할 소식이다.
  SEND=yes
  [ "$STATE" = "ok" ] && KIND="recovered" || KIND="alert"
elif [ "$STATE" != "ok" ] && [ $((NOW - PREV_AT)) -ge "$REMIND_SEC" ]; then
  SEND=yes; KIND="remind"          # 계속 나쁘다 — 하루 한 번만 다시
fi

# 알림을 보낸 시각만 갱신한다(리마인드 주기를 세려면 그래야 한다).
# 상태가 같고 안 보냈으면 **옛 시각을 유지**한다.
if [ "$SEND" = "yes" ]; then
  echo "$STATE $NOW" > "$STATE_FILE"
else
  echo "$STATE ${PREV_AT:-$NOW}" > "$STATE_FILE"
fi

echo "$(date '+%F %T') state=$STATE prev=${PREV_STATE:-없음} send=$SEND"
[ "$SEND" = "yes" ] || exit 0

# ── 3) 메일 설정을 **api 컨테이너에서** 읽는다 ────────────────────
# 서버에 비밀값을 두 번 두지 않는다. `docker inspect` 는 컨테이너가
# **멈춰 있어도** 읽힌다 — API 가 죽은 상황에서 알려야 하므로 이게 중요하다.
# (환경변수로 직접 주면 그것을 먼저 쓴다 — 시험용)
envof() {
  docker inspect "$1" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | sed -n "s/^$2=//p" | head -1
}
API_CT=$(docker ps -a --format '{{.Names}}|{{.Ports}}' 2>/dev/null \
  | grep '3000/tcp' | head -1 | cut -d'|' -f1)

SMTP_HOST="${SMTP_HOST:-$(envof "$API_CT" SMTP_HOST)}"
SMTP_PORT="${SMTP_PORT:-$(envof "$API_CT" SMTP_PORT)}"
SMTP_USER="${SMTP_USER:-$(envof "$API_CT" SMTP_USER)}"
SMTP_PASS="${SMTP_PASS:-$(envof "$API_CT" SMTP_PASS)}"
SMTP_FROM="${SMTP_FROM:-$(envof "$API_CT" SMTP_FROM)}"
# 받는 사람은 **관리자 명단을 그대로 쓴다** — 콘솔에 들어갈 수 있는 사람이
# 곧 장애를 조치할 사람이다. 나눠야 하면 ALERT_EMAILS 로 덮어쓴다.
TO_LIST="${ALERT_EMAILS:-$(envof "$API_CT" ALERT_EMAILS)}"
[ -z "$TO_LIST" ] && TO_LIST=$(envof "$API_CT" ADMIN_EMAILS)

if [ -z "$SMTP_HOST" ] || [ -z "$TO_LIST" ]; then
  echo "❌ 메일 설정을 찾지 못했습니다 (SMTP_HOST 또는 받는 사람)." >&2
  echo "   api 컨테이너=${API_CT:-못 찾음}" >&2
  exit 1
fi
[ -z "$SMTP_FROM" ] && SMTP_FROM="$SMTP_USER"

case "$KIND" in
  alert)     SUBJ="[EasyMindMap] ⚠️ 서버 이상 — $STATE" ;;
  remind)    SUBJ="[EasyMindMap] ⚠️ 서버 이상 계속됨 — $STATE" ;;
  recovered) SUBJ="[EasyMindMap] ✅ 서버 복구됨" ;;
esac

# 한글 제목은 **MIME 인코딩**해야 한다 — 그대로 보내면 메일 클라이언트가
# 깨뜨린다 (2026-08-13 e2e141 에서 겪은 것과 같은 계열).
SUBJ_ENC="=?UTF-8?B?$(printf '%s' "$SUBJ" | base64 -w0)?="

HINT=""
case "$STATE" in
  down)     HINT="Coolify 에서 api 컨테이너 상태와 배포 로그를 확인하세요." ;;
  degraded) HINT="스키마가 낡았을 수 있습니다 — 응답의 missingTables·missingColumns 를 보고 런북 §0 의 델타 SQL 을 적용하세요." ;;
esac

BODY_TXT=$(cat <<EOF
상태: $STATE
시각: $(date '+%F %T %Z')
주소: $URL

응답:
$DETAIL

$HINT

--
이 메일은 서버의 health-watch.sh 가 5분마다 확인해 **상태가 바뀔 때만**
보냅니다. 계속 나쁘면 하루 한 번 다시 알립니다.
EOF
)

# ── 4) 보낸다 (curl 의 SMTP — 호스트에 추가 설치가 필요 없다) ─────
: "${SMTP_PORT:=587}"
if [ "$SMTP_PORT" = "465" ]; then PROTO="smtps"; else PROTO="smtp"; fi

RCPT_ARGS=()
IFS=',' read -ra TOS <<< "$TO_LIST"
for t in "${TOS[@]}"; do
  t=$(printf '%s' "$t" | tr -d ' ')
  [ -n "$t" ] && RCPT_ARGS+=(--mail-rcpt "$t")
done

MAIL=$(mktemp)
{
  printf 'From: %s\r\n' "$SMTP_FROM"
  printf 'To: %s\r\n' "$TO_LIST"
  printf 'Subject: %s\r\n' "$SUBJ_ENC"
  printf 'MIME-Version: 1.0\r\n'
  printf 'Content-Type: text/plain; charset=UTF-8\r\n'
  printf 'Content-Transfer-Encoding: 8bit\r\n'
  printf '\r\n'
  printf '%s\r\n' "$BODY_TXT"
} > "$MAIL"

# SMTP_FROM 이 'EasyMindMap <noreply@…>' 형태일 수 있다 — 봉투 주소는 <> 안쪽만
ENVELOPE=$(printf '%s' "$SMTP_FROM" | sed -E 's/.*<([^>]+)>.*/\1/')

CURL_AUTH=()
[ -n "$SMTP_USER" ] && CURL_AUTH=(--user "$SMTP_USER:$SMTP_PASS")

if curl -sS --max-time 20 --url "$PROTO://$SMTP_HOST:$SMTP_PORT" \
     $([ "$PROTO" = "smtp" ] && [ "$SMTP_PORT" != "2525" ] && echo --ssl-reqd) \
     --mail-from "$ENVELOPE" "${RCPT_ARGS[@]}" \
     "${CURL_AUTH[@]}" -T "$MAIL"; then
  echo "✅ 알림 보냄 ($KIND) → $TO_LIST"
  rm -f "$MAIL"
else
  echo "❌ 메일 발송 실패 — 상태는 기록했습니다." >&2
  rm -f "$MAIL"
  exit 1
fi
