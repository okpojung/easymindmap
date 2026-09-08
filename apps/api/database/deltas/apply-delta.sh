#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# 델타 SQL 적용 — 붙여넣기 한 번 (2026-09-08 사용자 결정)
#
#   서버 SSH 터미널에서:
#     bash apps/api/database/deltas/apply-delta.sh apps/api/database/deltas/2026-09-08-user-avatar.sql
#   또는 저장소가 없는 서버에서는 보고서의 "붙여넣기 블록"(이 파일과 같은
#   find_emm_db + heredoc SQL)을 그대로 붙여넣는다.
#
#   하는 일: ① DB 컨테이너·계정·DB 이름을 **자동으로 찾고**(이미지 이름이
#   아니라 앱 컨테이너의 DATABASE_URL 로 — runbook §1.5-0-A) ② psql 로
#   델타를 실행하고(ON_ERROR_STOP) ③ 파일 끝의 검증 SELECT 결과를 보여 준다.
# ════════════════════════════════════════════════════════════════════
set -euo pipefail

FILE="${1:?델타 SQL 파일 경로를 주세요 (예: apps/api/database/deltas/2026-09-08-user-avatar.sql)}"
[ -f "$FILE" ] || { echo "❌ 파일이 없습니다: $FILE"; exit 1; }

find_emm_db() {
  for C in $(docker ps --format '{{.Names}}'); do
    U=$(docker exec "$C" printenv DATABASE_URL 2>/dev/null) || continue
    H=$(printf '%s' "$U"  | sed -E 's#^[^:]+://[^@]*@([^:/]+).*#\1#')
    US=$(printf '%s' "$U" | sed -E 's#^[^:]+://([^:@]+).*#\1#')
    N=$(printf '%s' "$U"  | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
    OK=$(docker exec "$H" psql -U "$US" -d "$N" -tAc \
          "SELECT to_regclass('public.map_documents') IS NOT NULL" 2>/dev/null) || continue
    if [ "$OK" = "t" ]; then
      API="$C"; DB="$H"; PGUSER="$US"; PGDB="$N"
      echo "✅ easymindmap → 앱=$API DB=$DB 계정=$PGUSER DB이름=$PGDB"
      return 0
    fi
  done
  echo "❌ easymindmap DB 를 찾지 못했습니다. 지금 떠 있는 컨테이너:"; docker ps --format '{{.Names}}'; return 1
}
find_emm_db || exit 1

echo "▶ 적용: $FILE"
docker exec -i "$DB" psql -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 < "$FILE"
echo "✅ 끝 — 위 검증 SELECT 결과에 줄이 보이면 적용된 것입니다."
