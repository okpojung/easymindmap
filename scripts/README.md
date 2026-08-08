# scripts — 운영 점검 스크립트

Node 18 이상이면 **설치 없이** 바로 돈다 (`fetch` 내장).

## rate-limit-probe.mjs — 레이트 리밋이 걸려 있는지 확인

배포된 **API** 에 요청을 몰아 보내 429 가 나오는지 본다.
설명: [docs/05-implementation/rate-limit.md](../docs/05-implementation/rate-limit.md)

```bash
node scripts/rate-limit-probe.mjs https://<API호스트>/v1/maps
```

- ⚠️ **프런트(web.…)가 아니라 API 호스트**를 겨눈다. 프런트는 정적
  파일만 주는 곳이라 레이트 리밋이 없다.
- ⚠️ 경로는 **`/v1/maps`**. `/v1/health` 는 리밋 제외라 429 가 안 난다.
- 로그인 안 해도 된다 — 401 이 나와도 레이트 리밋은 그 앞에서 센다.

판정:
- `✅ 걸려 있다` + 한국어 안내 문구 = 우리 API 의 레이트 리밋 (정상)
- `❌ 안 걸렸다` = 리밋이 없거나 / 최신 배포 아님 / 한도가 시도 횟수보다 높음
- `⚠️ 연결 못 함` = 주소가 틀렸거나 호스트가 꺼짐 (리밋 유무 판단 불가)

API 주소를 모르면 먼저:

```bash
node scripts/find-api-host.mjs https://web.thinkwise.co.kr/
```

## find-api-host.mjs — 프런트 번들에서 API 주소 추측

프런트 JS 에 빌드 때 구워진 `VITE_API_URL` 을 찾아 준다. 못 찾으면
브라우저 F12 → Network 에서 `/v1/` 요청의 호스트를 직접 확인한다.
