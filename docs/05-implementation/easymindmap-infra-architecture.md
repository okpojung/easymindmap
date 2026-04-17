# easymindmap — 인프라 아키텍처 & 설치 가이드

> **문서 위치**: `docs/05-implementation/easymindmap-infra-architecture.md`
> **최종 업데이트**: 2026-04-16
> **버전**: v1.3
> **환경**: IDC / ESXi 5대 / FortiGate IPSec VPN / 192.168.94.0/24
>
> **[v1.3 변경 — 2026-04-16]**
> - VM-05 Worker 구성에 `worker-redmine` 추가 (BullMQ 'redmine-sync' 큐)
> - Redis 용도 표에 Soft Lock (TTL 5초) 명시
> - Supabase Realtime 협업 채널 역할 분리 설명 추가
> - VM-05 Worker 레이어 → 외부 Redmine 연결 경로 명시
> - IDC 내부 VM 통신 구조에 WebSocket Soft Lock / Realtime 협업 경로 보완

---

## 목차

1. [전체 인프라 구성도](#1-전체-인프라-구성도)
2. [ESXi 호스트 사양 및 VM 배치 전략](#2-esxi-호스트-사양-및-vm-배치-전략)
3. [네트워크 주소 전체 정의](#3-네트워크-주소-전체-정의)
4. [DAU 단계별 VM 스펙 계획](#4-dau-단계별-vm-스펙-계획)
5. [ESXi VM 생성 절차](#5-esxi-vm-생성-절차)
6. [Ubuntu 22.04 공통 설치 절차](#6-ubuntu-2204-공통-설치-절차)
7. [NPM 연동 설정 (Cloudflare + Let's Encrypt)](#7-npm-연동-설정-cloudflare--lets-encrypt)
8. [VM-03: Supabase Self-hosted 설치](#8-vm-03-supabase-self-hosted-설치)
9. [VM-04: Redis 설치](#9-vm-04-redis-설치)
10. [VM-02: App 서버 배포](#10-vm-02-app-서버-배포)
11. [VM-05: Worker 서버 설치](#11-vm-05-worker-서버-설치)
12. [VM-DEV: 개발 서버 구성](#12-vm-dev-개발-서버-구성)
13. [원격 접속 환경 (FortiGate IPSec VPN + RDP)](#13-원격-접속-환경-fortigate-ipsec-vpn--rdp)
14. [개발 워크플로우](#14-개발-워크플로우)
15. [백업 전략](#15-백업-전략)
16. [모니터링](#16-모니터링)
17. [DAU별 확장 체크리스트](#17-dau별-확장-체크리스트)

---

## 1. 전체 인프라 구성도

### 1.1 네트워크 전체 흐름

```
[ 인터넷 ]
     │
     ▼
[ Cloudflare DNS ]
  mindmap.ai.kr → 218.232.94.74 (A 레코드)
  Proxy: 오렌지 클라우드 OFF (DNS only) 권장
  ※ NPM이 SSL 처리하므로 Cloudflare Proxy 불필요
     │
     ▼
[ IDC 방화벽 (FortiGate) ]
  공인 IP  : 218.232.94.74
  오픈 포트 : 80 (HTTP), 443 (HTTPS)
  RDP 포트 : 3389 → 192.168.94.201 (사무실/집 IP 허용)
  VPN      : IPSec VPN (사무실/집 PC → IDC 내부망)
     │
     ▼ NAT → 192.168.94.0/24
     │
     ├──────────────────────────────────────────────────┐
     ▼                                                  ▼
[ L4 스위치 ]                                   [ NPM 서버 ]
  Nortel Application Switch 3408                  내부: 192.168.94.74
  VIP : 192.168.94.2                              외부: npm74.baro.me
  관리: 192.168.94.160 / 161                      역할: Reverse Proxy + SSL
  역할: 내부 부하분산 (DAU 300+ 활성화)                │
                                                  ├── mindmap.ai.kr
                                                  │     → VM-02 :5173
                                                  ├── api.mindmap.ai.kr
                                                  │     → VM-02 :3000
                                                  ├── supabase.mindmap.ai.kr
                                                  │     → VM-03 :54323 [IP제한]
                                                  └── dev.mindmap.ai.kr
                                                        → VM-DEV :5173 [IP제한]
```

### 1.2 IDC 내부 VM 통신 구조

```
NPM (192.168.94.74)
  ├──[443→5173]──▶ VM-02  Frontend    (192.168.94.112)
  ├──[443→3000]──▶ VM-02  NestJS API  (192.168.94.112)
  ├──[443→3100]──▶ VM-02  WebSocket   (192.168.94.112)
  └──[443→54323]─▶ VM-03  Supabase Studio (192.168.94.113) [IP 제한]

VM-02 App (192.168.94.112)
  ├──▶ VM-03 :5432   PostgreSQL 16
  ├──▶ VM-03 :9999   Supabase Auth
  ├──▶ VM-03 :9000   Supabase Storage
  ├──▶ VM-03 :4000   Supabase Realtime
  └──▶ VM-04 :6379   Redis 7

VM-05 Worker (192.168.94.115)
  ├──▶ VM-03 :5432   PostgreSQL
  ├──▶ VM-03 :9000   Supabase Storage (export 결과 저장)
  ├──▶ VM-04 :6379   Redis (BullMQ 큐: export / ai-generate / translation / redmine-sync)
  ├──▶ 외부 openai.com   (AI API — worker-ai)
  ├──▶ 외부 api.deepl.com (Translation API — worker-translation, V2~)
  └──▶ 외부 redmine.example.com (Redmine REST API — worker-redmine, V1 WBS~)

VM-DEV (192.168.94.110)
  └── 개발 전체 스택 (Docker: Supabase + Redis + NestJS + Vite)

개발 PC — Windows 11 (192.168.94.201)
  ├── VS Code / 브라우저 / DBeaver
  └── VM-DEV 접속 (VS Code Remote SSH)

사무실 / 집 PC (32GB RAM+, GPU)
  └──[FortiGate IPSec VPN]──▶ IDC 192.168.94.0/24
      ├── RDP  → 192.168.94.201:3389 (개발 PC)
      └── SSH  → 192.168.94.110:2222 (VM-DEV 직접)
```

---

## 2. ESXi 호스트 사양 및 VM 배치 전략

### 2.1 ESXi 호스트 사양표

| ESXi IP | 모델 | CPU | 코어(물리/논리) | RAM | 스토리지 |
|---|---|---|---|---|---|
| 192.168.94.80 | HP ProLiant DL380 Gen9 | E5-2630 v3 × 2 | 16코어 / 32스레드 | 256 GB | HDD 10TB + NVMe 931GB |
| 192.168.94.81 | HP ProLiant DL380 Gen8 | E5-2690 v0 × 2 | 16코어 / 32스레드 | 192 GB | HDD 10TB + NVMe 931GB |
| 192.168.94.82 | HP ProLiant DL380 Gen8 | E5-2630 v3 × 2 | 16코어 / 32스레드 | 192 GB | HDD 10TB + NVMe 931GB |
| 192.168.94.11 | HP ProLiant DL360 Gen9 | E5-2660 v4 × 2 | **28코어 / 56스레드** | 256 GB | SSD 3TB + NVMe **3.8TB** |
| 192.168.94.12 | HP ProLiant DL360 Gen9 | E5-2660 v4 × 2 | **28코어 / 56스레드** | 256 GB | SSD 3TB + NVMe **2TB** |

> **E5-2630 v3**: 8코어, E5-2690 v0: 8코어, E5-2660 v4: 14코어 (2소켓 합산)

### 2.2 VM 배치 권장안

NVMe 용량이 크고 CPU 성능이 높은 .11, .12 호스트에 I/O 집약적 VM을 우선 배치합니다.

| ESXi 호스트 | 배치 VM | 이유 |
|---|---|---|
| **192.168.94.11** (NVMe 3.8TB) | **VM-03 Supabase** | PostgreSQL I/O 집약적 → NVMe 최대 활용 |
| **192.168.94.11** (NVMe 3.8TB) | **VM-DEV** | 개발 스택 전체 → 빠른 Docker 빌드 |
| **192.168.94.12** (NVMe 2TB) | **VM-02 App** | NestJS + Frontend 서빙 |
| **192.168.94.12** (NVMe 2TB) | **VM-05 Worker** | AI/Export 처리 |
| **192.168.94.80** (NVMe 931GB) | **VM-04 Redis** | Redis AOF 영속성용 NVMe |
| 192.168.94.81, 82 | 예비 / 확장 | DAU 300+ 시 Read Replica, Worker 추가 |

### 2.3 ESXi 데이터스토어 구성 권장

각 호스트에서 NVMe를 VM 디스크 전용 데이터스토어로 구성:

```
ESXi 192.168.94.11 데이터스토어:
  datastore-nvme   → NVMe 3.8TB (VM 디스크 — VM-03, VM-DEV)
  datastore-ssd    → SSD 3TB    (백업, ISO)

ESXi 192.168.94.12 데이터스토어:
  datastore-nvme   → NVMe 2TB   (VM 디스크 — VM-02, VM-05)
  datastore-ssd    → SSD 3TB    (백업, ISO)

ESXi 192.168.94.80 데이터스토어:
  datastore-nvme   → NVMe 931GB (VM 디스크 — VM-04)
  datastore-hdd    → HDD 10TB   (백업 저장)
```

---

## 3. 네트워크 주소 전체 정의

### 3.1 전체 IP 할당표

| 구분 | 호스트명 | IP | 포트 | 역할 |
|---|---|---|---|---|
| FortiGate | — | 218.232.94.74 (공인) | 80,443,3389,IPSec | 방화벽 / IPSec VPN |
| L4 스위치 | Nortel AS3408 | 192.168.94.2 (VIP) | — | 부하분산 VIP |
| L4 스위치 | Nortel AS3408 | 192.168.94.160 / .161 | — | 관리 포트 |
| NPM | npm74.baro.me | 192.168.94.74 | 80,443,81 | Nginx Proxy Manager |
| ESXi #1 | — | 192.168.94.80 | 443 | HP DL380 Gen9 |
| ESXi #2 | — | 192.168.94.81 | 443 | HP DL380 Gen8 |
| ESXi #3 | — | 192.168.94.82 | 443 | HP DL380 Gen8 |
| ESXi #4 | — | 192.168.94.11 | 443 | HP DL360 Gen9 ★ (VM-03, VM-DEV 호스트) |
| ESXi #5 | — | 192.168.94.12 | 443 | HP DL360 Gen9 ★ (VM-02, VM-05 호스트) |
| **VM-DEV** | em-dev | **192.168.94.110** | 2222,3000,5173,54323 | 개발 서버 |
| **VM-02** | em-app | **192.168.94.112** | 2222,3000,3100,5173 | App (NestJS+Frontend) |
| **VM-03** | em-supabase | **192.168.94.113** | 2222,5432,9999,9000,4000,54323 | Supabase |
| **VM-04** | em-redis | **192.168.94.114** | 2222,6379 | Redis |
| **VM-05** | em-worker | **192.168.94.115** | 2222 | Worker |
| 개발 PC | dev-pc | **192.168.94.201** | 3389 | Windows 11 (RDP) |

### 3.2 게이트웨이 및 DNS

```
Subnet  : 192.168.94.0/24
Gateway : 192.168.94.1
DNS     : 8.8.8.8, 1.1.1.1
```

### 3.3 도메인 및 NPM Proxy 연결표

| 도메인 | Cloudflare | NPM Forward | 접근 제한 | SSL |
|---|---|---|---|---|
| mindmap.ai.kr | A 218.232.94.74 (DNS only) | 192.168.94.112:5173 | 없음 | Let's Encrypt |
| api.mindmap.ai.kr | A 218.232.94.74 (DNS only) | 192.168.94.112:3000 | 없음 | Let's Encrypt |
| supabase.mindmap.ai.kr | A 218.232.94.74 (DNS only) | 192.168.94.113:54323 | IPSec VPN IP 허용 | Let's Encrypt |
| dev.mindmap.ai.kr | A 218.232.94.74 (DNS only) | 192.168.94.110:5173 | IPSec VPN IP 허용 | Let's Encrypt |

> **Cloudflare 주의사항**:
> - Proxy (오렌지 클라우드) 를 **OFF (DNS only, 회색 구름)** 으로 설정해야 합니다
> - Proxy ON 상태에서는 Let's Encrypt 인증이 실패하거나 NPM Rate Limit과 충돌할 수 있습니다
> - SSL/TLS 관리는 NPM이 전담합니다

---

## 4. DAU 단계별 VM 스펙 계획

### DAU 100 — 초기 운영

| VM | IP | ESXi 호스트 | vCPU | RAM | Disk (NVMe) |
|---|---|---|---|---|---|
| VM-DEV | 192.168.94.110 | 192.168.94.11 | 8 | 16 GB | 200 GB |
| VM-02 | 192.168.94.112 | 192.168.94.12 | 4 | 8 GB | 50 GB |
| VM-03 | 192.168.94.113 | 192.168.94.11 | 4 | 8 GB | 100 GB |
| VM-04 | 192.168.94.114 | 192.168.94.80 | 2 | 4 GB | 20 GB |
| VM-05 | 192.168.94.115 | 192.168.94.12 | 2 | 4 GB | 50 GB |

> 전체 VM 합계: vCPU 20개, RAM 40GB — 각 호스트 리소스에 여유 충분

### DAU 300 — 중간 단계 업그레이드

| VM | vCPU | RAM | 주요 변경 |
|---|---|---|---|
| VM-02 | 6 | 12 GB | PM2 instances: 2→4 |
| VM-03 | 6 | 16 GB | max_connections=200, shared_buffers=4GB |
| VM-04 | 2 | 8 GB | Redis maxmemory=4GB |
| VM-05 | 4 | 8 GB | Worker 프로세스 수 증가 |

### DAU 1,000 — 최대 확장

| VM | vCPU | RAM | 추가 조치 |
|---|---|---|---|
| VM-02 | 8 | 16 GB | PM2 instances=8 / L4 VIP 부하분산 |
| VM-03 | 8 | 32 GB | PG Read Replica (VM-06, ESXi .81/.82에 배치) |
| VM-04 | 4 | 16 GB | Redis Cluster 검토 |
| VM-05 | 6 | 16 GB | Worker VM 추가 (VM-07) |

---

## 5. ESXi VM 생성 절차

### 5.1 ESXi 웹 콘솔 접속

```
ESXi #4 (VM-03, VM-DEV 생성):  https://192.168.94.11/ui
ESXi #5 (VM-02, VM-05 생성):   https://192.168.94.12/ui
ESXi #1 (VM-04 생성):          https://192.168.94.80/ui
계정: root / [비밀번호]
```

### 5.2 Ubuntu ISO 업로드

```
각 ESXi 콘솔:
Storage → datastore-ssd → Datastore browser
→ Upload → ubuntu-22.04.4-live-server-amd64.iso
```

### 5.3 VM 생성 파라미터 (VM-03 Supabase 예시)

```
Virtual Machines → Create/Register VM

Step 1: Create a new virtual machine
Step 2:
  Name:             easymindmap-vm03-supabase
  Guest OS family:  Linux
  Guest OS version: Ubuntu Linux (64-bit)
Step 3:
  Datastore: datastore-nvme  ← 반드시 NVMe 데이터스토어 선택
Step 4:
  CPU:          4
  Memory:       8192 MB
  Hard disk 1:  100 GB (Thin provisioned)
  Network:      [192.168.94.0/24 Port Group 선택]
  CD/DVD:       Datastore ISO → ubuntu-22.04.4-live-server-amd64.iso
                Connect at power on: ✅
Step 5: Finish → Power On
```

### 5.4 VM별 생성 파라미터 전체 요약

| VM | ESXi | ESXi Datastore | vCPU | RAM (MB) | Disk | ESXi Name |
|---|---|---|---|---|---|---|
| VM-DEV | 192.168.94.11 | datastore-nvme | 8 | 16384 | 200 GB | easymindmap-vmdev |
| VM-02 | 192.168.94.12 | datastore-nvme | 4 | 8192 | 50 GB | easymindmap-vm02-app |
| VM-03 | 192.168.94.11 | datastore-nvme | 4 | 8192 | 100 GB | easymindmap-vm03-supabase |
| VM-04 | 192.168.94.80 | datastore-nvme | 2 | 4096 | 20 GB | easymindmap-vm04-redis |
| VM-05 | 192.168.94.12 | datastore-nvme | 2 | 4096 | 50 GB | easymindmap-vm05-worker |

---

## 6. Ubuntu 22.04 공통 설치 절차

### 6.1 Ubuntu Server 설치

```
언어:     English
Keyboard: English US

Network:
  ens192: Static
    IP:      [VM별 IP — 아래 표 참조]
    Mask:    255.255.255.0
    Gateway: 192.168.94.1
    DNS:     8.8.8.8, 1.1.1.1

Storage: Use entire disk + LVM ✅

Profile:
  Server name: [VM별 hostname]
  Username:    ubuntu
  Password:    [강력한 비밀번호 — VM마다 다르게]

SSH: Install OpenSSH server ✅
→ 완료 후 Reboot
```

### 6.2 VM별 IP 및 Hostname

| VM | IP | Hostname |
|---|---|---|
| VM-DEV | 192.168.94.110 | em-dev |
| VM-02 | 192.168.94.112 | em-app |
| VM-03 | 192.168.94.113 | em-supabase |
| VM-04 | 192.168.94.114 | em-redis |
| VM-05 | 192.168.94.115 | em-worker |

### 6.3 고정 IP netplan 설정

```bash
sudo nano /etc/netplan/00-installer-config.yaml
```

```yaml
# VM별 IP로 변경 (아래는 VM-03 예시)
network:
  version: 2
  ethernets:
    ens192:
      addresses:
        - 192.168.94.113/24    # ← VM별 IP
      routes:
        - to: default
          via: 192.168.94.1
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
```

```bash
sudo netplan apply
ping -c 3 192.168.94.1    # 게이트웨이 확인
ping -c 3 8.8.8.8         # 외부 인터넷 확인
ping -c 3 github.com      # GitHub 통신 확인
```

### 6.4 공통 패키지 설치

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  curl wget git vim htop net-tools \
  ufw fail2ban ca-certificates gnupg \
  lsb-release unzip jq

# Docker 설치 (VM-02, VM-03, VM-05, VM-DEV에만)
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /usr/share/keyrings/docker.gpg

echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker ubuntu
newgrp docker

# 방화벽 기본 설정
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22
sudo ufw enable

# Fail2ban
sudo systemctl enable fail2ban && sudo systemctl start fail2ban
```

### 6.5 SSH 보안 설정 (전체 VM 공통)

```bash
sudo nano /etc/ssh/sshd_config
```

```conf
Port 2222
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
ClientAliveInterval 60
ClientAliveCountMax 3
```

```bash
sudo ufw allow 2222
sudo ufw delete allow 22
sudo systemctl restart ssh
```

---

## 7. NPM 연동 설정 (Cloudflare + Let's Encrypt)

> - NPM 관리 UI: `http://192.168.94.74:81`
> - NPM 서버 SSH: `ssh ubuntu@192.168.94.74 -p 2222`

### 7.1 Cloudflare DNS 설정

Cloudflare 대시보드 → DNS 탭:

```
Type  Name                        Content          Proxy
A     mindmap.ai.kr               218.232.94.74    🔘 DNS only (회색)
A     api.mindmap.ai.kr           218.232.94.74    🔘 DNS only (회색)
A     supabase.mindmap.ai.kr      218.232.94.74    🔘 DNS only (회색)
A     dev.mindmap.ai.kr           218.232.94.74    🔘 DNS only (회색)
```

> ⚠️ **Proxy (오렌지 클라우드) 반드시 OFF** — NPM이 직접 SSL 처리합니다

### 7.2 NPM Rate Limit 전역 설정

```bash
ssh ubuntu@192.168.94.74 -p 2222

# NPM 커스텀 Nginx 설정 경로 (실제 경로 확인 필요)
sudo mkdir -p /opt/npm/data/nginx/custom
sudo tee /opt/npm/data/nginx/custom/http_top.conf << 'EOF'
limit_req_zone $binary_remote_addr zone=api:10m  rate=30r/m;
limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
limit_req_zone $binary_remote_addr zone=ai:10m   rate=20r/h;
EOF

# NPM 컨테이너 재시작
docker restart npm  # 또는 nginx-proxy-manager
```

### 7.3 NPM Access List 생성 (supabase, dev 도메인용)

NPM UI → Access Lists → Add:

```
Name: IPSec-VPN-Only
Satisfy: Any

Allowed IPs:
  192.168.94.201              # 개발 PC (Windows 11)
  [IPSec VPN 클라이언트 대역]  # FortiGate에서 할당하는 VPN IP 확인 후 추가
  예) 10.x.x.0/24 또는 172.x.x.0/24

Pass Auth: ✅ (Allow)
```

### 7.4 Proxy Host — mindmap.ai.kr

NPM UI → Hosts → Proxy Hosts → Add:

```
[ Details 탭 ]
Domain Names:       mindmap.ai.kr
Scheme:             http
Forward Hostname:   192.168.94.112
Forward Port:       5173
Cache Assets:       ✅
Block Common Exploits: ✅
Websockets Support: ✅

[ SSL 탭 ]
SSL Certificate:    Request a new SSL Certificate
Email:              admin@mindmap.ai.kr
Force SSL:          ✅
HTTP/2 Support:     ✅
HSTS Enabled:       ✅

[ Advanced 탭 ]
```

```nginx
# API → NestJS
location /api/ {
    proxy_pass         http://192.168.94.112:3000/;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_connect_timeout 30s;
    proxy_read_timeout    60s;
    limit_req zone=api burst=30 nodelay;
}

# Auth — 엄격한 Rate Limit
location /api/auth/ {
    proxy_pass         http://192.168.94.112:3000/auth/;
    proxy_http_version 1.1;
    proxy_set_header   Host            $host;
    proxy_set_header   X-Real-IP       $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    limit_req zone=auth burst=5 nodelay;
}

# WebSocket
location /ws/ {
    proxy_pass         http://192.168.94.112:3100/;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade    $http_upgrade;
    proxy_set_header   Connection "upgrade";
    proxy_set_header   Host       $host;
    proxy_read_timeout 86400s;
}

# 정적 파일 캐시
location ~* \.(js|css|png|jpg|gif|ico|svg|woff2|webp)$ {
    proxy_pass http://192.168.94.112:5173;
    expires 30d;
    add_header Cache-Control "public, immutable";
}

add_header X-Frame-Options        SAMEORIGIN;
add_header X-Content-Type-Options nosniff;
```

### 7.5 Proxy Host — supabase.mindmap.ai.kr

```
Domain:   supabase.mindmap.ai.kr
Forward:  http://192.168.94.113:54323
SSL:      Let's Encrypt + Force SSL ✅
Access:   IPSec-VPN-Only  ← Access List 적용
```

### 7.6 Proxy Host — dev.mindmap.ai.kr

```
Domain:   dev.mindmap.ai.kr
Forward:  http://192.168.94.110:5173
WS:       ✅
SSL:      Let's Encrypt + Force SSL ✅
Access:   IPSec-VPN-Only  ← Access List 적용
```

---

## 8. VM-03: Supabase Self-hosted 설치

> **호스트**: ESXi 192.168.94.11 (DL360 Gen9, NVMe 3.8TB)
> **VM IP**: 192.168.94.113

### 8.1 방화벽 설정

```bash
# NPM (Proxy)
sudo ufw allow from 192.168.94.74  to any port 9999    # Auth
sudo ufw allow from 192.168.94.74  to any port 54323   # Studio

# VM-02 App
sudo ufw allow from 192.168.94.112 to any port 5432
sudo ufw allow from 192.168.94.112 to any port 9999
sudo ufw allow from 192.168.94.112 to any port 9000
sudo ufw allow from 192.168.94.112 to any port 4000

# VM-05 Worker
sudo ufw allow from 192.168.94.115 to any port 5432
sudo ufw allow from 192.168.94.115 to any port 9000

# VM-DEV
sudo ufw allow from 192.168.94.110 to any port 5432

sudo ufw reload
```

### 8.2 Supabase 설치

```bash
mkdir -p /opt/supabase && cd /opt/supabase
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

### 8.3 JWT Key 생성

```bash
sudo apt install -y nodejs

cat > /tmp/gen-keys.js << 'SCRIPT'
const crypto = require('crypto');
const secret = process.argv[2];
if (!secret || secret.length < 32) {
  console.error('JWT secret must be >= 32 chars'); process.exit(1);
}
function b64url(s) {
  return Buffer.from(s).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function sign(payload, secret) {
  const h = b64url(JSON.stringify({alg:'HS256',typ:'JWT'}));
  const b = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret)
    .update(`${h}.${b}`).digest('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  return `${h}.${b}.${sig}`;
}
const now = Math.floor(Date.now()/1000);
const exp = now + 315360000;
console.log('ANON_KEY=' +
  sign({role:'anon',iss:'supabase',iat:now,exp},secret));
console.log('SERVICE_ROLE_KEY=' +
  sign({role:'service_role',iss:'supabase',iat:now,exp},secret));
SCRIPT

# 실행 (32자 이상 랜덤값 사용)
node /tmp/gen-keys.js "반드시-여기에-32자이상-강력한-JWT-시크릿-값을-입력하세요"
```

### 8.4 .env 설정

```bash
nano /opt/supabase/supabase/docker/.env
```

```env
############################################################
# 필수 변경
############################################################
POSTGRES_PASSWORD=강력한_Postgres_비밀번호_여기에_입력

JWT_SECRET=반드시-여기에-32자이상-강력한-JWT-시크릿-값을-입력하세요

ANON_KEY=eyJ...          # gen-keys.js 출력값
SERVICE_ROLE_KEY=eyJ...  # gen-keys.js 출력값

DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=강력한_대시보드_비밀번호

############################################################
# URL (NPM 도메인)
############################################################
SITE_URL=https://mindmap.ai.kr
API_EXTERNAL_URL=https://mindmap.ai.kr/api
SUPABASE_PUBLIC_URL=https://mindmap.ai.kr

############################################################
# SMTP — Gmail 또는 Synology MailPlus 선택
############################################################

# 방법 A: Gmail 앱 비밀번호
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=Gmail_앱_비밀번호_16자리
SMTP_ADMIN_EMAIL=admin@mindmap.ai.kr
SMTP_SENDER_NAME=easymindmap

# 방법 B: Synology MailPlus Server (사내 SMTP)
# SMTP_HOST=[Synology_NAS_IP]
# SMTP_PORT=587
# SMTP_USER=noreply@yourdomain.com
# SMTP_PASS=[MailPlus 계정 비밀번호]

############################################################
# Storage
############################################################
STORAGE_BACKEND=file
FILE_STORAGE_BACKEND_PATH=/var/lib/storage
```

### 8.5 PostgreSQL 성능 튜닝 (RAM 8GB, NVMe SSD)

```bash
cat >> /opt/supabase/supabase/docker/volumes/db/postgresql.conf << 'EOF'

# ============================
# easymindmap 성능 튜닝
# VM RAM 8GB / NVMe SSD 기준
# ============================
shared_buffers            = 2GB
effective_cache_size      = 6GB
work_mem                  = 64MB
maintenance_work_mem      = 512MB
max_connections           = 100
checkpoint_completion_target = 0.9
wal_buffers               = 16MB
default_statistics_target = 100
random_page_cost          = 1.1       # NVMe SSD
effective_io_concurrency  = 200       # NVMe SSD
log_min_duration_statement = 1000     # 1초 이상 느린 쿼리 로그
EOF
```

### 8.6 실행 및 스키마 적용

```bash
cd /opt/supabase/supabase/docker
docker compose up -d

# 상태 확인 (모든 서비스 healthy 확인)
docker compose ps

# easymindmap 스키마 적용
docker exec -i supabase-db psql -U postgres -d postgres \
  < /opt/easymindmap/docs/02-domain/schema.sql

# 확인
docker exec -it supabase-db psql -U postgres -d postgres -c "\dt public.*"
```

### 8.7 자동 시작

```bash
sudo tee /etc/systemd/system/supabase.service << 'EOF'
[Unit]
Description=Supabase Self-hosted
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/supabase/supabase/docker
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable supabase
sudo systemctl start supabase
```

---

## 8-1. WebSocket 라우팅 — 협업 실시간 통신

VM-02의 WebSocket Gateway (포트 3100)는 다음 두 채널을 구분하여 처리한다:

| 채널 | 담당 레이어 | 주 용도 |
|------|-----------|---------|
| **Supabase Realtime** (VM-03:4000) | Presence / Cursor / Selection | 일시적 UI 상태 — DB 저장 불필요 |
| **Redis Pub/Sub** (VM-04:6379) | Map patch broadcast / Soft Lock / Translation Ready / Dashboard refresh | 문서 무결성 보장 — API 서버 경유 |

```
클라이언트 WSS
    │
    ▼
VM-02 WebSocket Gateway (:3100)
    ├── Supabase Realtime Channel ──▶ VM-03:4000
    │    └── map:{mapId} Presence/Cursor (일시 UI 상태)
    └── Redis Pub/Sub ──────────────▶ VM-04:6379
         ├── map:{mapId}         (patch broadcast / Soft Lock)
         └── dashboard:{mapId}  (dashboard refresh 신호)
```

> **Soft Lock**: Redis Key `lock:node:{nodeId}`, TTL **5초**  
> 노드 편집 시작 시 SET NX EX 5 로 Lock 획득, 편집 완료 시 DEL.  
> TTL 만료 전 편집 중인 경우 Worker가 자동 갱신(EXPIRE 5).

---

## 9. VM-04: Redis 설치

> **호스트**: ESXi 192.168.94.80

### Redis 용도 전체 정리

| 용도 | Key 패턴 | TTL | 담당 서비스 |
|------|---------|-----|------------|
| **Snapshot 캐시** | `snapshot:{mapId}` | `refresh_interval × 0.8` (최소 30s) | SnapshotService |
| **번역 캐시** (Sliding TTL) | `trans:{nodeId}:{lang}` | Initial 2h + Sliding 30min + Max 6h (±10min jitter) | TranslationCacheService |
| **채팅 번역 캐시** | `chat_trans:{messageId}:{lang}` | 24h | ChatTranslationService |
| **Soft Lock** (협업) | `lock:node:{nodeId}` | **5초** (편집 시작/갱신 시 리셋) | CollaborationService |
| **BullMQ 큐** | `bull:{queue}:*` | 큐 보유 동안 영속 | BullMQ Worker |
| **Pub/Sub 채널** | `map:{mapId}`, `dashboard:{mapId}` | — | WsGateway / DashboardService |
| **Patch 멱등성** | `patch:{mapId}:{patchId}` | 24h | AutosaveService |

```bash
# 방화벽
sudo ufw allow from 192.168.94.112 to any port 6379
sudo ufw allow from 192.168.94.115 to any port 6379
sudo ufw allow from 192.168.94.110 to any port 6379
sudo ufw reload

# 설치
sudo apt install -y redis-server
sudo nano /etc/redis/redis.conf
```

```conf
bind 192.168.94.114 127.0.0.1
requirepass 강력한_Redis_비밀번호

# DAU 100 → 1GB, DAU 300+ → 4GB
maxmemory 1gb
maxmemory-policy allkeys-lru

appendonly yes
appendfsync everysec
maxclients 200
loglevel notice
logfile /var/log/redis/redis-server.log
```

```bash
sudo systemctl enable redis-server
sudo systemctl restart redis-server
redis-cli -h 192.168.94.114 -a 강력한_Redis_비밀번호 ping
# PONG 확인
```

---

## 10. VM-02: App 서버 배포

> **호스트**: ESXi 192.168.94.12

### 10.1 방화벽 및 Node.js 설치

```bash
sudo ufw allow from 192.168.94.74 to any port 3000
sudo ufw allow from 192.168.94.74 to any port 3100
sudo ufw allow from 192.168.94.74 to any port 5173
sudo ufw reload

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 10.2 앱 배포 및 환경변수

```bash
mkdir -p /opt/easymindmap && cd /opt/easymindmap
git clone https://github.com/okpojung/easymindmap.git .

# Backend 환경변수 (전체 명세: docs/05-implementation/env-spec.md)
cat > apps/backend/.env << 'EOF'
NODE_ENV=production
PORT=3000
SUPABASE_URL=http://192.168.94.113:8000
SUPABASE_SERVICE_ROLE_KEY=eyJ...SERVICE_ROLE_KEY
DATABASE_URL=postgresql://postgres:Postgres_비밀번호@192.168.94.113:5432/postgres
REDIS_HOST=192.168.94.114
REDIS_PORT=6379
REDIS_PASSWORD=Redis_비밀번호
OPENAI_API_KEY=sk-...
AI_MODEL_GENERATE=gpt-4o
TRANSLATION_PROVIDER=hybrid
TRANSLATION_DEEPL_API_KEY=...
REDMINE_ENCRYPTION_KEY=...
INVITE_TOKEN_SECRET=...
APP_URL=https://mindmap.ai.kr
EOF

# Frontend 환경변수
cat > apps/frontend/.env << 'EOF'
VITE_API_URL=https://mindmap.ai.kr/api
VITE_WS_URL=wss://mindmap.ai.kr/ws
VITE_SUPABASE_URL=https://mindmap.ai.kr
VITE_SUPABASE_ANON_KEY=eyJ...ANON_KEY
EOF

# 빌드
cd apps/backend  && npm install && npm run build && cd ../..
cd apps/frontend && npm install && npm run build && cd ../..
```

### 10.3 PM2 설정 및 실행

```bash
cat > /opt/easymindmap/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'em-api',
      cwd: '/opt/easymindmap/apps/backend',
      script: 'dist/main.js',
      instances: 2,           // DAU 300+: 4
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      error_file: '/var/log/easymindmap/api-error.log',
      out_file:   '/var/log/easymindmap/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'em-frontend',
      cwd: '/opt/easymindmap/apps/frontend',
      script: 'node_modules/.bin/vite',
      args: 'preview --port 5173 --host 0.0.0.0',
      instances: 1,
      error_file: '/var/log/easymindmap/fe-error.log',
      out_file:   '/var/log/easymindmap/fe-out.log',
    }
  ]
};
EOF

mkdir -p /var/log/easymindmap
pm2 start /opt/easymindmap/ecosystem.config.js
pm2 save && pm2 startup
```

---

## 11. VM-05: Worker 서버 설치

> **호스트**: ESXi 192.168.94.12  
> **외부 연결**: VM-05는 AI API(openai.com), 번역 API(api.deepl.com), Redmine 인스턴스(외부 또는 내부망)에 HTTPS 아웃바운드 접속 필요

```bash
# 방화벽 — VM-03/04 접근 허용 (아웃바운드는 기본 허용)
sudo ufw allow from 192.168.94.112 to any port 6379   # 이미 Redis 설정에 포함
# VM-05 → VM-03 Supabase Storage
sudo ufw allow from 192.168.94.115 to any port 9000
sudo ufw reload

curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs && sudo npm install -g pm2

mkdir -p /opt/easymindmap-worker && cd /opt/easymindmap-worker
git clone https://github.com/okpojung/easymindmap.git .

cat > apps/worker/.env << 'EOF'
NODE_ENV=production
REDIS_URL=redis://:Redis_비밀번호@192.168.94.114:6379
DATABASE_URL=postgresql://postgres:Postgres_비밀번호@192.168.94.113:5432/postgres
SUPABASE_URL=http://192.168.94.113:8000
SUPABASE_SERVICE_ROLE_KEY=eyJ...SERVICE_ROLE_KEY
SUPABASE_STORAGE_URL=http://192.168.94.113:9000

# AI (worker-ai)
OPENAI_API_KEY=sk-...
AI_MODEL_GENERATE=gpt-4o
AI_MODEL_EXPAND=gpt-4o-mini

# Translation (worker-translation, V2)
TRANSLATION_PROVIDER=hybrid
TRANSLATION_DEEPL_API_KEY=...
TRANSLATION_QUEUE_CONCURRENCY=5

# Redmine (worker-redmine, V1 WBS)
REDMINE_ENCRYPTION_KEY=...
REDMINE_SYNC_QUEUE_CONCURRENCY=3
REDMINE_SYNC_RETRY_TIMES=3

# Export (worker-export)
EXPORT_QUEUE_CONCURRENCY=3
EOF

cd apps/worker && npm install && npm run build

# BullMQ 워커별 PM2 프로세스 실행
pm2 start dist/worker/ai.js          --name em-worker-ai          -i 1
pm2 start dist/worker/export.js      --name em-worker-export      -i 1
pm2 start dist/worker/translation.js --name em-worker-translation -i 1
pm2 start dist/worker/redmine.js     --name em-worker-redmine     -i 1
pm2 start dist/worker/core.js        --name em-worker-core        -i 1
pm2 save && pm2 startup
```

> **BullMQ 큐 → Worker 매핑**
>
> | 큐 이름 | PM2 프로세스 | 비고 |
> |---------|------------|------|
> | `ai-generate` | `em-worker-ai` | solo-only 정책: 협업 중 비활성 |
> | `export` | `em-worker-export` | Markdown / HTML export |
> | `translation` | `em-worker-translation` | DeepL + LLM fallback (V2~) |
> | `redmine-sync` | `em-worker-redmine` | Exponential Backoff 3회 재시도 (V1 WBS~) |
> | (공통 cleanup) | `em-worker-core` | 인덱스 재정규화 등 |

---

## 12. VM-DEV: 개발 서버 구성

> **호스트**: ESXi 192.168.94.11 (DL360 Gen9, NVMe 3.8TB)
> **VM IP**: 192.168.94.110

### 12.1 방화벽 설정

```bash
# 개발 PC 접근 허용
sudo ufw allow from 192.168.94.201 to any port 3000
sudo ufw allow from 192.168.94.201 to any port 5173
sudo ufw allow from 192.168.94.201 to any port 54323
sudo ufw allow from 192.168.94.201 to any port 5432

# NPM (dev.mindmap.ai.kr 경유)
sudo ufw allow from 192.168.94.74 to any port 5173

# IPSec VPN 클라이언트 대역 (FortiGate 설정 후 실제 대역으로 변경)
# 예: sudo ufw allow from 10.x.x.0/24 to any port 5173
sudo ufw reload
```

### 12.2 개발 스택 설치 및 시작

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g @supabase/cli typescript ts-node pm2

mkdir -p /opt/easymindmap-dev && cd /opt/easymindmap-dev
git clone https://github.com/okpojung/easymindmap.git .

# Supabase 로컬 스택 시작
npx supabase init
npx supabase start
# → 출력값에서 anon key, service_role key 복사

# 스키마 적용
npx supabase db push
# 또는
psql postgresql://postgres:postgres@localhost:54322/postgres \
  < docs/02-domain/schema.sql
```

### 12.3 개발 환경변수

```bash
cat > apps/backend/.env.local << 'EOF'
NODE_ENV=development
PORT=3000
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_KEY=[supabase start 출력 service_role key]
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-jwt-secret-minimum-32-characters-long
APP_URL=http://192.168.94.110:5173
OPENAI_API_KEY=sk-...
EOF

cat > apps/frontend/.env.local << 'EOF'
VITE_API_URL=http://192.168.94.110:3000
VITE_WS_URL=ws://192.168.94.110:3100
VITE_SUPABASE_URL=http://192.168.94.110:54321
VITE_SUPABASE_ANON_KEY=[supabase start 출력 anon key]
EOF
```

### 12.4 개발 서버 시작 스크립트

```bash
cat > /opt/easymindmap-dev/dev-start.sh << 'EOF'
#!/bin/bash
echo "=== easymindmap 개발 서버 시작 $(date) ==="
cd /opt/easymindmap-dev

# Redis
docker ps | grep em-dev-redis > /dev/null 2>&1 || \
  docker run -d --name em-dev-redis -p 6379:6379 redis:7-alpine

# Supabase
npx supabase status > /dev/null 2>&1 || npx supabase start

echo ""
echo "접속 주소 (개발 PC 브라우저):"
echo "  Frontend  : http://192.168.94.110:5173"
echo "  API       : http://192.168.94.110:3000"
echo "  DB Studio : http://192.168.94.110:54323"
echo ""
echo "개발 서버 시작 (VS Code 터미널):"
echo "  터미널 1: cd apps/backend  && npm run start:dev"
echo "  터미널 2: cd apps/frontend && npm run dev -- --host 0.0.0.0"
EOF

chmod +x /opt/easymindmap-dev/dev-start.sh
```

---

## 13. 원격 접속 환경 (FortiGate IPSec VPN + RDP)

### 13.1 전체 원격 접속 구조

```
사무실 PC / 집 PC / IDC 개발 PC
  (RAM 32GB+, GPU 충분)
       │
       ├─[A] RDP 직접 (3389 방화벽 오픈, 사무실/집 IP 허용)
       │      FortiGate → 192.168.94.201:3389
       │      개발 PC (Windows 11, 192.168.94.201)
       │          │
       │          │ VS Code Remote SSH
       │          ▼
       │      VM-DEV (192.168.94.110)
       │
       └─[B] IPSec VPN 연결 후 내부망 직접 접속
              → RDP  → 192.168.94.201 (개발 PC)
              → SSH  → 192.168.94.110 (VM-DEV 직접)
              → 브라우저 → http://192.168.94.110:5173
```

### 13.2 FortiGate RDP 포트포워딩 (방법 A)

FortiGate 방화벽 정책:

```
정책명: RDP-DevPC
인터페이스: WAN → LAN
소스 IP: [사무실 공인 IP], [집 공인 IP]
목적지: 192.168.94.201
포트: TCP 3389
동작: ALLOW
```

RDP 접속:
```
Windows 원격 데스크탑 → 218.232.94.74:3389
사용자: [Windows 계정]
```

### 13.3 FortiGate IPSec VPN 설정 (방법 B)

FortiGate IPSec VPN 구성:

```
VPN 타입: IPSec Site-to-Client (Road Warrior)
인터페이스: WAN
Pre-shared Key: [강력한 사전 공유 키]

Phase 1:
  IKE: IKEv2
  암호화: AES-256
  해시: SHA-256
  DH Group: 14

Phase 2:
  암호화: AES-256
  해시: SHA-256
  내부 네트워크: 192.168.94.0/24

VPN 클라이언트 IP 풀: 예) 10.10.10.0/24
→ 이 대역을 NPM Access List에 등록 필요
```

VPN 클라이언트:
```
FortiClient 설치 → VPN 설정 추가
Type: IPSec VPN
Server: 218.232.94.74
Pre-shared Key: [위 설정값]
```

### 13.4 개발 PC (Windows 11, 192.168.94.201) 필수 도구

```
필수 설치:
  ✅ VS Code
       Extensions: Remote-SSH, GitLens, ESLint, Prettier
  ✅ Git for Windows
  ✅ FortiClient (IPSec VPN — 집에서 접속용)
  ✅ Chrome / Edge

권장 설치:
  ✅ DBeaver        → VM-03 PostgreSQL 접속 (192.168.94.113:5432)
  ✅ Redis Insight  → VM-04 Redis 모니터링 (192.168.94.114:6379)
  ✅ Postman        → API 테스트
  ✅ Windows Terminal
  ✅ Node.js 20 LTS (로컬 빌드 필요 시)

GPU 활용 (32GB RAM+, GPU 충분):
  ✅ 로컬 AI 모델 테스트 (Ollama 등) — 선택
  ✅ 이미지 처리 작업 — 선택
```

### 13.5 VS Code Remote SSH 설정 (개발 PC → VM-DEV)

개발 PC (Windows 11) PowerShell:

```powershell
# SSH 키 생성
ssh-keygen -t ed25519 -C "devpc-em" -f "$env:USERPROFILE\.ssh\id_ed25519_em"

# 공개키 확인 (VM-DEV에 등록 필요)
Get-Content "$env:USERPROFILE\.ssh\id_ed25519_em.pub"
```

VM-DEV에서:
```bash
echo "[위 공개키 내용]" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

개발 PC SSH Config (`C:\Users\[사용자]\.ssh\config`):
```conf
Host em-dev
    HostName 192.168.94.110
    Port 2222
    User ubuntu
    IdentityFile C:\Users\[사용자]\.ssh\id_ed25519_em
    ServerAliveInterval 60
    ServerAliveCountMax 3
```

VS Code 접속:
```
F1 → Remote-SSH: Connect to Host → em-dev
→ /opt/easymindmap-dev 폴더 열기
→ 터미널: bash dev-start.sh
```

---

## 14. 개발 워크플로우

### 14.1 일상 개발 흐름

```
사무실 또는 집
  │
  ├─ 방법 A: RDP → 개발 PC (192.168.94.201)
  │              FortiGate 3389 포트포워딩
  │              → VS Code Remote SSH → VM-DEV
  │              → 개발 서버 시작 (start:dev / vite dev)
  │              → 브라우저 http://192.168.94.110:5173
  │
  └─ 방법 B: IPSec VPN → 내부망 직접 접속
              → RDP  192.168.94.201 (개발 PC 경유)
              → 또는 SSH 192.168.94.110 (VM-DEV 직접)
              → 브라우저 https://dev.mindmap.ai.kr
```

### 14.2 프로덕션 배포 스크립트

```bash
# VM-02에서: /opt/easymindmap/deploy.sh
cat > /opt/easymindmap/deploy.sh << 'EOF'
#!/bin/bash
set -e
echo "=== 배포 시작: $(date) ==="

cd /opt/easymindmap
git pull origin main

echo "--- Backend 빌드 ---"
cd apps/backend
npm install --omit=dev
npm run build
pm2 restart em-api

echo "--- Frontend 빌드 ---"
cd ../frontend
npm install --omit=dev
npm run build
pm2 restart em-frontend

pm2 status
echo "=== 배포 완료: $(date) ==="
EOF

chmod +x /opt/easymindmap/deploy.sh
```

### 14.3 브랜치 전략

```
main      → 프로덕션 (VM-02, VM-05) — deploy.sh 실행
develop   → 개발 서버 (VM-DEV) — git pull + pm2 restart
feature/* → 기능 개발 → develop PR → main PR
```

---

## 15. 백업 전략

### 15.1 PostgreSQL 자동 백업 (VM-03)

```bash
sudo mkdir -p /opt/backup/pg

cat > /opt/backup/pg-backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backup/pg"
LOG="/var/log/pg-backup.log"
mkdir -p $BACKUP_DIR

docker exec supabase-db pg_dump \
  -U postgres -d postgres --clean --if-exists \
  | gzip > $BACKUP_DIR/em_$DATE.sql.gz

[ $? -eq 0 ] && \
  echo "[$(date)] ✅ 성공: em_$DATE.sql.gz" >> $LOG || \
  echo "[$(date)] ❌ 실패" >> $LOG

# 30일 이상 삭제
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
EOF

chmod +x /opt/backup/pg-backup.sh
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/backup/pg-backup.sh") | crontab -
```

### 15.2 Synology NAS 원격 백업 (선택)

Synology NAS가 있는 경우 백업 파일을 NAS에도 복사:

```bash
# /opt/backup/sync-to-nas.sh
cat > /opt/backup/sync-to-nas.sh << 'EOF'
#!/bin/bash
# Synology NAS로 rsync 백업
rsync -avz --delete \
  /opt/backup/pg/ \
  ubuntu@[NAS_IP]:/volume1/backup/easymindmap/pg/
EOF

chmod +x /opt/backup/sync-to-nas.sh
(crontab -l 2>/dev/null; echo "30 3 * * * /opt/backup/sync-to-nas.sh") | crontab -
```

### 15.3 복구 방법

```bash
# 특정 날짜 백업으로 복구
BACKUP="/opt/backup/pg/em_20260401_030000.sql.gz"
gunzip -c $BACKUP | \
  docker exec -i supabase-db psql -U postgres -d postgres
```

---

## 16. 모니터링

### 16.1 API 헬스체크 (VM-02)

```bash
cat > /opt/healthcheck.sh << 'EOF'
#!/bin/bash
LOG="/var/log/healthcheck.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 5 http://localhost:3000/health)

if [ "$STATUS" != "200" ]; then
  echo "[$DATE] ❌ API DOWN($STATUS) — 재시작" >> $LOG
  pm2 restart em-api
else
  echo "[$DATE] ✅ API OK" >> $LOG
fi

REDIS=$(redis-cli -h 192.168.94.114 -a Redis_비밀번호 ping 2>/dev/null)
[ "$REDIS" != "PONG" ] && echo "[$DATE] ❌ Redis DOWN" >> $LOG
EOF

chmod +x /opt/healthcheck.sh
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/healthcheck.sh") | crontab -
```

### 16.2 디스크 알림 (모든 VM)

```bash
cat > /opt/disk-check.sh << 'EOF'
#!/bin/bash
THRESHOLD=80
USAGE=$(df / | awk 'NR==2{print $5}' | tr -d '%')
[ $USAGE -gt $THRESHOLD ] && \
  echo "⚠️ $(hostname) 디스크 ${USAGE}% 사용 중"
EOF

chmod +x /opt/disk-check.sh
(crontab -l 2>/dev/null; echo "0 9 * * * /opt/disk-check.sh") | crontab -
```

---

## 17. DAU별 확장 체크리스트

### DAU 100 초기 운영 완료 기준

```
인프라:
  ✅ ESXi 4대에 VM 생성 (.11×2, .12×2, .80×1)
  ✅ 각 VM Ubuntu 22.04 + 고정 IP 설정
  ✅ Cloudflare DNS A 레코드 설정 (4개 도메인, DNS only)
  ✅ NPM Proxy Host 4개 + SSL 인증서 발급
  ✅ NPM Access List 설정 (supabase, dev 도메인)
  ✅ Supabase Self-hosted 실행 + 스키마 적용
  ✅ Redis 설치 및 설정
  ✅ PM2 클러스터 실행 (API × 2 + Frontend)
  ✅ Worker 실행
  ✅ VM-DEV 개발 스택 실행
  ✅ 일일 백업 crontab 등록 (새벽 3시)
  ✅ 헬스체크 스크립트 등록 (5분 간격)

보안:
  ✅ SSH 포트 22 → 2222 변경
  ✅ SSH 키 인증만 허용 (비밀번호 차단)
  ✅ 각 VM ufw 방화벽 — 필요 포트만 허용
  ✅ Fail2ban 활성화
  ✅ FortiGate RDP 포워딩 (사무실/집 IP만 허용)

원격 개발:
  ✅ IPSec VPN 접속 확인 (사무실 PC)
  ✅ IPSec VPN 접속 확인 (집 PC)
  ✅ RDP → 개발 PC (192.168.94.201) 접속 확인
  ✅ VS Code Remote SSH → VM-DEV 접속 확인
  ✅ 브라우저 → http://192.168.94.110:5173 확인
  ✅ https://dev.mindmap.ai.kr 확인 (VPN 경유)
  ✅ https://mindmap.ai.kr 프로덕션 확인
```

### DAU 300 전환 시

```
  ⬆️ VM-02: PM2 instances 2 → 4, RAM 12GB
  ⬆️ VM-03: max_connections=200, shared_buffers=4GB, RAM 16GB
  ⬆️ VM-04: maxmemory=4gb, RAM 8GB
  ➕ L4 Nortel AS3408 VIP(192.168.94.2) 부하분산 설정
  ➕ NPM Rate Limit 강화
```

### DAU 1,000 전환 시

```
  ⬆️ VM-02: PM2 instances=8, RAM 16GB
  ⬆️ VM-03: RAM 32GB, NVMe 증설 검토
  ➕ VM-06 PG Read Replica (ESXi .81 또는 .82 배치)
  ➕ VM-07 Worker 추가 (ESXi .81 배치)
  ➕ Cloudflare CDN Proxy 활성화 검토
  ➕ Loki + Grafana 모니터링 스택 구축
  ➕ Sentry APM 도입
```

---

## 부록: 포트 및 접근 권한 전체 참조표

| 서버 | IP | 포트 | 서비스 | 허용 대상 |
|---|---|---|---|---|
| FortiGate | 218.232.94.74 | 80, 443 | HTTP/HTTPS | 전체 |
| FortiGate | 218.232.94.74 | 3389 | RDP → 개발 PC | 사무실/집 공인 IP |
| FortiGate | 218.232.94.74 | 4500/500 | IPSec VPN | 사무실/집 공인 IP |
| L4 스위치 | 192.168.94.2 | — | 부하분산 VIP | 내부망 |
| NPM | 192.168.94.74 | 80, 443 | Reverse Proxy | 전체 (FortiGate 경유) |
| NPM | 192.168.94.74 | 81 | 관리 UI | 내부망만 |
| VM-DEV | 192.168.94.110 | 2222 | SSH | 개발 PC, VPN 경유 |
| VM-DEV | 192.168.94.110 | 3000 | API (개발) | 개발 PC, NPM |
| VM-DEV | 192.168.94.110 | 5173 | Frontend (개발) | 개발 PC, NPM |
| VM-DEV | 192.168.94.110 | 54323 | Supabase Studio | 개발 PC, NPM (IP 제한) |
| VM-02 | 192.168.94.112 | 2222 | SSH | VPN 경유 |
| VM-02 | 192.168.94.112 | 3000 | NestJS API | NPM만 |
| VM-02 | 192.168.94.112 | 3100 | WebSocket | NPM만 |
| VM-02 | 192.168.94.112 | 5173 | Frontend | NPM만 |
| VM-03 | 192.168.94.113 | 2222 | SSH | VPN 경유 |
| VM-03 | 192.168.94.113 | 5432 | PostgreSQL | VM-02, VM-05, VM-DEV |
| VM-03 | 192.168.94.113 | 9999 | Supabase Auth | VM-02, VM-05 |
| VM-03 | 192.168.94.113 | 9000 | Supabase Storage | VM-02, VM-05 |
| VM-03 | 192.168.94.113 | 4000 | Supabase Realtime | VM-02 |
| VM-03 | 192.168.94.113 | 54323 | Supabase Studio | NPM (IP 제한) |
| VM-04 | 192.168.94.114 | 2222 | SSH | VPN 경유 |
| VM-04 | 192.168.94.114 | 6379 | Redis | VM-02, VM-05, VM-DEV |
| VM-05 | 192.168.94.115 | 2222 | SSH | VPN 경유 |
| VM-05 | 192.168.94.115 | — | BullMQ Workers (outbound only) | openai.com / api.deepl.com / Redmine |
| 개발 PC | 192.168.94.201 | 3389 | RDP (Windows 11) | FortiGate 경유 (IP 제한) |

---

## 부록: ESXi 호스트별 리소스 여유 현황

| ESXi | CPU (물리코어) | RAM | NVMe | VM 배치 | 남은 NVMe |
|---|---|---|---|---|---|
| 192.168.94.11 | 28코어 | 256 GB | 3.8 TB | VM-03(100GB) + VM-DEV(200GB) | ~3.5 TB |
| 192.168.94.12 | 28코어 | 256 GB | 2.0 TB | VM-02(50GB) + VM-05(50GB) | ~1.9 TB |
| 192.168.94.80 | 16코어 | 256 GB | 931 GB | VM-04(20GB) | ~911 GB |
| 192.168.94.81 | 16코어 | 192 GB | 931 GB | **예비** (확장용) | ~931 GB |
| 192.168.94.82 | 16코어 | 192 GB | 931 GB | **예비** (확장용) | ~931 GB |

> ESXi .81, .82는 DAU 300+ 확장 시 Read Replica, Worker 추가에 활용합니다.

---

*easymindmap-infra-architecture.md v1.3 — 최종 업데이트: 2026-04-16*
*IDC 환경: FortiGate IPSec VPN(218.232.94.74) / NPM(192.168.94.74) / L4 Nortel AS3408(192.168.94.2)*
*Cloudflare DNS: mindmap.ai.kr / ESXi 5대 / 192.168.94.0/24*
*VM-05 Workers: worker-ai / worker-export / worker-translation / worker-redmine / worker-core*
*BullMQ 큐: ai-generate / export / translation / redmine-sync*
