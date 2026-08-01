# 개발 서버 운영 런북 (VM-DEV · Coolify)

> 구축 절차는 [`dev-server-coolify.md`](dev-server-coolify.md),
> 네트워크·NPM은 [`infra-architecture.md`](infra-architecture.md) 참조.
> 이 문서는 **운영 중 반복 참조**하는 절차·명령 모음이다 (2026-08-01,
> 실구축 세션 결과 기반).
>
> ⚠️ IP·도메인은 문서용 예시(placeholder)다. 실제 값은 저장소 밖에서 관리.

## 1. 스키마 재적용 절차

**순서 의존성이 있다 — shim 선행 필수.** 실패 시 중단하지 않으면
절반만 적용된 스키마가 생기므로 반드시 `ON_ERROR_STOP=1`로 실행한다.

```bash
DB=<db 컨테이너 이름>   # docker ps 로 확인
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

- 순서: `00-supabase-shim.sql`(순정 PG용 shim) → `schema.sql` →
  `functions/move_node_subtree.sql` → `dev/01-seed-dev-user.sql`
- 완전 초기화가 필요하면 DB 리소스를 지우고 재생성 후 위 절차 —
  단, **비밀번호 규칙(영숫자만)** 을 다시 지킬 것
  (dev-server-coolify.md §5.1 경고).

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
| 화면은 뜨는데 API 실패 | `VITE_API_URL`이 Buildtime 체크 없이 빈 값으로 빌드됨 (coolify §5.3) |
| 재배포했는데 옛 화면 | NPM `Cache Assets` 켜져 있음 (§7.6) — index.html 캐시 |
| 이미지 든 맵 저장 413 (API 로그 없음) | NPM `client_max_body_size` 누락 (§7.7) |
| Coolify "실시간 서비스 연결 불가" | §7.8의 `/app/`(:6001) 웹소켓 프록시 누락 |
| main 푸시해도 배포 안 됨 | §7.8 `/webhooks/` Access List 예외 / GitHub App 웹훅 URL |
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
