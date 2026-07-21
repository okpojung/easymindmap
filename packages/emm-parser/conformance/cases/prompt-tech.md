# Ubuntu Apache + SSL 구축

## 사전 준비

> Ubuntu 22.04 LTS 기준. sudo 권한과 도메인(A 레코드 연결)이 필요하다.

- 서버 SSH 접속 확인
- sudo 권한 확인
- 도메인 DNS 연결 확인

## Apache 설치

> 패키지 목록을 갱신한 뒤 Apache를 설치하고 서비스 상태를 확인한다.

```bash
sudo apt update
sudo apt install -y apache2
sudo systemctl status apache2
```

### 방화벽 개방

```bash
sudo ufw allow "Apache Full"
```

## SSL 발급 (Let's Encrypt)

> certbot이 Apache 설정을 자동으로 수정해 HTTPS를 활성화한다.

```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache
```

### 자동 갱신 확인

```bash
sudo certbot renew --dry-run
```

## 설치 검증

1. 브라우저에서 https://도메인 접속
2. 인증서 발급자(Let's Encrypt) 확인
3. http → https 리다이렉트 확인

🔗 [Certbot 공식 문서](https://certbot.eff.org/)
