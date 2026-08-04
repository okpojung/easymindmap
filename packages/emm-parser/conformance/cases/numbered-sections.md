## Prompt:
1\. 2대의 리눅스 서버에 각각 아래와 같이 설치 절차를 명령어와 함께 자세히 설명해줘.

\- 웹 서버 : Nginx 설치 및 구성

\- 앱 서버 : Node.js 설치 및 서비스 등록

2. 웹 서버와 앱 서버 연동(리버스 프록시) 구성 절차를 자세히 설명해줘

## Response:
네, 물론입니다. 합성 예시 환경(가상의 두 서버 web01 · app01)을 기준으로 설명드리겠습니다.

1. 웹 서버 - Nginx 설치 및 구성

```bash
sudo dnf install -y nginx
sudo systemctl enable --now nginx
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

설정 확인:

```bash
nginx -t
curl -I http://localhost/
```

2. 앱 서버 - Node.js 설치 및 서비스 등록

```bash
sudo dnf module install -y nodejs:20
node --version
```

간단한 앱을 서비스로 등록합니다.

```ini
[Unit]
Description=Demo App

[Service]
ExecStart=/usr/bin/node /opt/demo/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now demo-app
```

3. 웹-앱 연동 (리버스 프록시)

Nginx 설정에 프록시 블록을 추가합니다.

```nginx
location /api/ {
    proxy_pass http://app01.internal.example:3000/;
    proxy_set_header Host $host;
}
```

적용 및 검증:

1. 설정 문법 검사
   ```bash
   sudo nginx -t
   ```
2. 무중단 반영
   ```bash
   sudo systemctl reload nginx
   ```
3. 종단 확인
   ```bash
   curl http://web01.internal.example/api/health
   ```

| 구간 | 확인 명령 | 기대 결과 |
|------|-----------|-----------|
| 웹 → 앱 | `curl /api/health` | `200 OK` |
| 앱 단독 | `curl :3000/health` | `200 OK` |

이상으로 두 서버 구성과 연동이 완료됩니다.
