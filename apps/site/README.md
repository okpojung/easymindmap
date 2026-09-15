# apps/site — 홈페이지 (`www.easymindmap.org`)

소개·EMM 표준·**지식창고**(공개된 맵 목록)가 사는 곳. 앱(에디터)과 **다른 앱**이다.

```
www.easymindmap.org
├ /                → 이 앱 (소개)
├ /emm             → 이 앱 (EMM 표준 소개)
├ /library         → 이 앱 (지식창고 — 공개된 맵 목록)
├ /site-assets/…   → 이 앱의 번들
├ /p/{id}          → **앱으로 프록시** (퍼블리싱 공개 뷰어)
└ /assets/…        → 그 앱의 번들
```

★ **뷰어를 여기에 복제하지 않는다.** 뷰어는 내보내기 HTML 생성기
(`exportHtml.ts`)와 레이아웃 엔진을 통째로 쓴다. 복제하면 두 벌이
갈라지고, 갈라지면 "앱에서는 멀쩡한데 홈페이지에서는 깨진" 사고가 난다
(실제로 겪었다 — `test-catalog.md` e2e255).

## 돌려 보기

```bash
npm ci
npm run dev            # http://localhost:5174 — API 는 api-dev 를 본다
```

`/p/{id}` 는 dev 서버에 없다(프록시는 nginx 가 한다). 그 화면은 앱에서 본다.

## 환경변수 — **빌드 시점**에 박힌다

| 변수 | 뜻 | 기본값 |
|---|---|---|
| `VITE_API_URL` | 진열대 목록을 읽는 곳 | `https://api-dev.mindmap.ai.kr` |
| `VITE_APP_URL` | [시작하기]·[앱 열기] 가 가는 곳 | `https://pro-dev.mindmap.ai.kr` |

런타임에는 nginx 가 `APP_ORIGIN`(프록시 대상) 하나를 읽는다.

배포 설정: [`dev-server-coolify.md`](../../docs/90-architecture/dev-server-coolify.md) §5.3-A
설계: [`27a-paid-publish.md`](../../docs/04-extensions/publish/27a-paid-publish.md) §0.4 ⑵
