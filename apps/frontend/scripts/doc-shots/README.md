# doc-shots — 사용자 가이드 스크린샷을 코드에서 만든다

사람이 캡처하지 않는다. **실제 프런트엔드를 vite 로 띄우고 Playwright 로
조작해** 찍는다. 그래서 그림을 만드는 일이 곧 그 기능의 동작 확인이다
(가이드 03 의 `+` 방향 12장이 그렇게 검증됐다 — test-catalog 201차).

## 한 번에 돌리기

```bash
cd apps/frontend && npm ci
# ① 에디터(개발 모드 · 인증 없음) — 가이드 03 계열
VITE_API_URL=http://api.local npx vite --port 5199 --strictPort --host 127.0.0.1 &
export PLAYWRIGHT_MODULE=$(npm root -g)/playwright/index.mjs   # 전역 설치본
node scripts/doc-shots/node-add.mjs /tmp/doc-shots
node scripts/doc-shots/guide03.mjs  /tmp/doc-shots /tmp/article-img.b64
node scripts/doc-shots/guide03-table.mjs /tmp/doc-shots   # 표 ⊞ 격자·팝업·코드 팝업 (+ 검증 13항목)
node scripts/doc-shots/guide03-style-copy.mjs /tmp/doc-shots   # 스타일 복사(붓) 버튼·커서·칠한 뒤 (+ 검증 27항목)
node scripts/doc-shots/guide05-note-table.mjs /tmp/doc-shots   # 노트 표: +표 격자 · 그려진 표 + ✎ (+ 검증 16항목)
node scripts/doc-shots/guide04-layout-nested.mjs /tmp/doc-shots   # 3레벨 노드에 레이아웃 걸기 — 엔진·화면 모두 겹침 0 (+ 검증 17항목)
node scripts/doc-shots/guide05-note-multi.mjs /tmp/doc-shots   # 노트 문단·코드·표 여러 개 + 배지 개수 (캔버스·팝업·아웃라인·HTML 뷰어) (+ 검증 14항목)
node scripts/doc-shots/guide04-minimap.mjs /tmp/doc-shots   # 미니맵 (+ 검증 35항목)
node scripts/doc-shots/guide04-layout-multi.mjs /tmp/doc-shots   # 다중 선택 레이아웃 · 접힘 배지 · 다크 칩 (+ 검증 13항목)
node scripts/doc-shots/guide03-calendar.mjs /tmp/doc-shots   # [+] 메뉴 · 달력 노드(년→월, 년월→주→날짜 7개·빨간 날·회색 점선, 표로 붙여넣기) · 노드 표 2개·코드 2개 · HTML 내보내기 (+ 검증 52항목)
node scripts/doc-shots/guide03-connector.mjs /tmp/doc-shots   # 연결선 — [연결] 단추·패널(모양·두께·종류·화살표·색·라벨·닿는 면)·접힘·삭제·되돌리기·mmd/HTML 왕복 (+ 검증 44항목)
node scripts/doc-shots/guide04-expand-zoom.mjs                   # [+]/[−] 뒤 선택 노드 100% 중앙 (검증 11항목, 스크린샷 없음)
# ② 인증 켠 화면 — 가이드 12 계열 (vite 를 이렇게 다시 띄운다)
VITE_SUPABASE_URL=http://auth.local VITE_SUPABASE_ANON_KEY=anon VITE_SUPABASE_AUTH_PREFIX= \
  VITE_API_URL=https://api-dev.mindmap.ai.kr npx vite --port 5199 --strictPort --host 127.0.0.1 &
node scripts/doc-shots/mcp-consent.mjs /tmp/doc-shots/mcp-connector-consent.png
node scripts/doc-shots/mcp-token.mjs   /tmp/doc-shots/mcp-token.png
node scripts/doc-shots/guide01-browser-refresh.mjs /tmp/doc-shots   # 문서함 ↻ 새로고침 (+ 검증 9항목)
# ③ 마무리 — 폭 1000 이하 + 연회색 테두리, 그리고 assets 로
python3 scripts/doc-shots/finish.py /tmp/doc-shots/mark-toolbar.png ../../docs/user-guide/assets/mark-toolbar.png 420
```

## 새 장면을 추가할 때

- `lib.mjs` 의 `stores.*` 로 상태를 만든다 — 레이아웃 `layout()`, 선택
  `select()`, 다중 선택 `multi()`, 화면 중앙 `center()`. vite 개발 서버는
  같은 모듈 URL 을 같은 인스턴스로 주므로 페이지 안에서 `import('/src/stores/…')`
  하면 앱과 상태가 공유된다.
- **캔버스는 스크롤이 아니라 pan/scale** 이다 — `scrollIntoView` 는 듣지
  않는다. `center()`(= `requestCenterNode`)를 쓴다.
- 드래그는 `page.mouse` 로 누르고 **4px 넘게** 움직여야 시작된다.
- 붙여넣기는 `ClipboardEvent('paste', { clipboardData: new DataTransfer() })`
  를 `window` 에 보낸다. 사진은 `data:` URI 로 넣는다(외부 URL 은 프록시로
  막힌다).
- 브라우저 네이티브 툴팁(`<title>`)은 안 찍힌다 — 필요하면 `node-add.mjs`
  처럼 그 문구를 SVG 라벨로 얹고 **문서에 "설명용" 이라고 밝힌다**.
- 스텁 응답의 모양은 `apiClient.ts` 의 타입을 보고 맞춘다 — `/folders` 를
  `[]` 로 주면 문서함이 죽어 계정 메뉴까지 못 간다.
- 토큰·이메일 같은 값은 예시(`you@example.com`, `emm_a1b2c3d4…`)로 넣고
  문서에 예시라고 적는다.
- 폰트: CDN(Pretendard)이 막힌 환경이면 `~/.fonts` 에 Pretendard OTF 를
  넣고 `fc-cache -f` (raw.githubusercontent.com 의 orioncactus/pretendard).

## 문서에 넣는 규칙

`docs/user-guide/assets/README.md` — `<img width>` 로 크기, 테두리는 파일에.
