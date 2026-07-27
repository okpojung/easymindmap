# 개발 서버 — Ubuntu 22.04 + Coolify (프로덕션 패리티)

> **결정 (2026-07)**: 개발용 서버는 **프로덕션과 똑같은 방식**으로 구축해
> 테스트한다. 구축 도구는 **Coolify**(셀프호스팅 PaaS)이며, OS는
> **Ubuntu 22.04**. 개발 서버에서 검증된 구성을 그대로 프로덕션에
> 복제하는 것이 원칙이다 (dev/prod parity).
>
> 이 문서가 개발 서버 구축의 **기준 문서**다. `infra-architecture.md`
> §12(VM-DEV)의 이전 방식(수동 Node/pm2/supabase-cli)은 이 문서로
> 대체되었다.
>
> ⚠️ IP·도메인은 문서용 예시(placeholder)다. 실제 값은 저장소 밖에서 관리.

---

## 1. 왜 이 방식인가

| 항목 | 내용 |
|---|---|
| **dev/prod parity** | 개발 서버와 프로덕션이 같은 OS·같은 배포 도구·같은 컨테이너 구성. "개발에선 됐는데 운영에서 안 된다"를 구조적으로 제거 |
| **Coolify** | 오픈소스 셀프호스팅 PaaS. 서버에 설치하면 **GitHub 연동 자동 배포**(푸시 → 빌드 → 재기동), 앱/DB를 웹 UI로 관리, Traefik 리버스 프록시 + Let's Encrypt 자동 |
| **내 PC는 브라우저만** | 개발 PC에는 아무것도 설치하지 않는다(Node/Docker 불필요). 컨테이너·Docker는 **서버 안에서 Coolify가 자동 설치·관리** |
| **배포 흐름 단순화** | GitHub Actions는 CI(빌드·타입체크·스모크) 품질 게이트만 담당, **배포(CD)는 Coolify**가 담당(웹훅 자동) |

```
[개발 PC]                      [개발 서버 VM-DEV (Ubuntu 22.04)]
 브라우저만 ──────────▶  Coolify (Traefik 80/443, UI :8000)
                          ├─ app: frontend  (apps/frontend, 정적 빌드)
 [GitHub]                 ├─ app: api       (apps/api, NestJS :3000)
  main 푸시 ─웹훅─▶       └─ db : PostgreSQL 16 (+ ltree, 스키마 로드)
  (자동 재빌드·재배포)
                         ※ 프로덕션 서버도 동일 구성(값만 다름)
```

---

## 2. 서버 준비 (Ubuntu 22.04, 1회)

최소 사양: 2 vCPU / 2GB RAM (권장 4 vCPU / 8GB+, VM-DEV는 8 vCPU/16GB).

```bash
# OS 업데이트
sudo apt update && sudo apt upgrade -y

# 방화벽 — 필요한 것만 (내부망/VPN 기준 예시)
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp          # Traefik (앱 접속)
sudo ufw allow from <개발PC_IP> to any port 8000   # Coolify 대시보드
sudo ufw enable
```

## 3. Coolify 설치 (1회)

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

- 스크립트가 **Docker를 포함해 필요한 것을 자동 설치**한다(수동 Docker 설치 불필요).
- 완료 후 브라우저에서 `http://<서버IP>:8000` 접속 → **첫 가입 계정이 관리자**가 된다(즉시 가입해 둘 것).
- Onboarding에서 서버는 `localhost`(자기 자신)를 선택.

## 4. GitHub 연동 (1회)

1. Coolify → **Sources → Add → GitHub App** → 안내에 따라 GitHub App 생성 →
   `okpojung/easymindmap` 저장소에 설치.
2. 이후 앱 리소스 생성 시 이 Source를 선택하면 **main 푸시 때마다 자동
   재빌드·재배포**된다(웹훅).

## 5. 리소스 구성 — 프로젝트 `easymindmap-dev`

Coolify에서 **Project**를 만들고 아래 3개 리소스를 추가한다.

### 5.1 PostgreSQL 16 (DB)

- **Add Resource → Database → PostgreSQL** (이미지 `postgres:16` — ltree 포함).
- 생성 후 접속정보(내부 URL) 확인. 예:
  `postgres://postgres:<자동생성PW>@<내부호스트>:5432/postgres`
- **스키마 로드**(1회): Coolify의 DB 터미널(또는 개발 PC에서 psql)로
  아래 순서대로 실행 — **순정 PG라 shim 먼저**:
  ```
  apps/api/database/dev/00-supabase-shim.sql
  apps/api/database/schema.sql
  apps/api/database/functions/move_node_subtree.sql
  apps/api/database/dev/01-seed-dev-user.sql
  ```

### 5.2 api (백엔드)

- **Add Resource → Application → GitHub(위 Source)** → 저장소 선택.
- **Base Directory**: `apps/api` / Build Pack: **Nixpacks**(Node 자동 감지)
  - Build: `npm ci && npm run build` / Start: `node dist/main.js`
  - (추후 `apps/api/Dockerfile` 추가 시 Dockerfile 빌드로 전환 — Phase 5 예정)
- **Port**: 3000, 도메인 예: `api-dev.example.com`
- **환경변수**:
  ```
  PORT=3000
  DATABASE_URL=<5.1의 내부 접속 URL>
  AUTH_MODE=dev              # Phase 3(Supabase Auth) 전까지
  DEV_USER_ID=00000000-0000-0000-0000-000000000001
  CORS_ORIGIN=https://dev.example.com
  ```

### 5.3 frontend (프론트)

- **Add Resource → Application → GitHub** → **Base Directory**: `apps/frontend`
- Build Pack: **Nixpacks(static)** — Build: `npm ci && npm run build`,
  Publish Directory: `dist`
- 도메인 예: `dev.example.com`
- **환경변수(빌드 타임!)** — `VITE_*`는 빌드 시점에 박히므로 반드시
  빌드 환경변수로 설정:
  ```
  VITE_API_URL=https://api-dev.example.com
  ```

> 도메인/HTTPS: DNS(또는 내부 NPM)를 서버로 향하게 하면 Traefik이
> Let's Encrypt 인증서를 자동 발급한다. 내부망 전용이면 `http://<서버IP>`
> 기반 사설 도메인(sslip.io 등)도 가능.

## 6. 동작 확인 체크리스트

- [ ] `https://api-dev.example.com/v1/health` → `{"status":"ok","db":"up"}`
- [ ] `https://dev.example.com` 접속 → 에디터 표시
- [ ] ☁ 클라우드 → 저장 → 토스트 / 편집 → 자동 저장 배지
- [ ] ☁ → 열기 → 목록·이름변경·삭제
- [ ] `git push origin main` → Coolify가 자동 재배포(Deployments 로그 확인)

## 7. 프로덕션 전환 (같은 방식 복제)

프로덕션도 **동일하게 Coolify로** 구축한다 — 개발 서버에서 검증한 구성을
그대로 복제하고 값만 바꾼다:

| 항목 | 개발(dev) | 프로덕션(prod) |
|---|---|---|
| 서버 | VM-DEV (예: 192.168.0.110) | VM-02/03 등 운영 VM |
| 프로젝트 | `easymindmap-dev` | `easymindmap-prod` |
| 도메인 | dev.example.com / api-dev.example.com | example.com / api.example.com |
| 자동 배포 | main 푸시 즉시 | 태그/릴리스 또는 수동 Deploy 버튼(권장) |
| AUTH_MODE | dev(Phase 3 전) | supabase (Phase 3 이후) |
| DB | Coolify PostgreSQL 16 | 동일(백업 정책 강화) + Phase 3에서 Supabase 스택 |

> Supabase Self-hosted·Redis 는 해당 Phase(3~) 진행 시 **Coolify의
> Docker Compose 리소스**로 같은 방식으로 얹는다
> (`docker-compose-spec.md`의 서비스 정의 참조).

## 8. 운영 팁

- **로그**: 각 리소스 → Logs (빌드/런타임 분리).
- **재배포**: Deployments → Redeploy (특정 커밋 선택 = 롤백).
- **Coolify 자체 업데이트**: 대시보드에서 안내에 따라 진행.
- **백업**: DB 리소스의 Scheduled Backup 기능 사용(S3 호환 대상 지정 가능).

---

관련: `infra-architecture.md`(네트워크·VM 배치), `docker-compose-spec.md`
(서비스 구성 스펙), `ci-cd-github-actions.md`(CI 품질 게이트 — 배포는
Coolify 담당), `../05-implementation/backend-phase1.md`(백엔드 단계).
