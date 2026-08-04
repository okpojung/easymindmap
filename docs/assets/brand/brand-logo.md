# EasyMindMap 브랜드 로고

> 2026-08-04 v3 — **사용자 제공 원본 벡터 SVG**를 그대로 채택
> (1254×1254 뷰박스, 트레이스 벡터 33패스). 원본 파일:
> [`logo.svg`](./logo.svg) — 이 파일이 도안의 단일 원본(source of truth)이다.
> 이전 v1·v2(코드로 그린 96/1024 재현본)는 폐기.

<img src="./logo.svg" width="160" alt="EasyMindMap 로고" />

## 자산 파일

| 파일 | 형식 | 용도 |
|---|---|---|
| `logo.svg` | 벡터 (1254×1254 viewBox) | 단일 원본 — 문서·README·앱이 모두 이 도안을 사용 |
| `logo.png` | 래스터 1024×1024 | 외부 홍보·문서 첨부·SVG 미지원 환경 |
| `logo-256.png` | 래스터 256×256 | 소형 아이콘 용도 |

PNG 는 `logo.svg` 에서 렌더한 사본이다 — SVG 를 바꾸면 PNG 도 다시
렌더한다.

## 도안 구성

- 흰 정사각 바탕(라운딩 없음), 주황 계열 'e' 링(크로스바가 링 안쪽으로
  진입, 오른쪽 아래 열림)
- 링 안 브라운(`#5C3011` 계열) **Mark / Down** 2줄 글자
- Down 오른쪽 점에서 위·아래로 갈라지는 마인드맵 트리 — 위 3 · 아래 2
  리프 — "Markdown 이 맵이 된다"

## 사용처 — 단일 파일 import 구조 (v3)

앱은 더 이상 도안을 코드에 복제하지 않는다. **SVG 파일 하나**를 세 곳이
직접 참조한다:

| 위치 | 참조 방식 |
|---|---|
| 앱 원본 | `apps/frontend/src/assets/brand-logo.svg` — `docs/assets/brand/logo.svg` 와 **동일 바이트** |
| 브라우저 탭 파비콘 | `apps/frontend/index.html` → `<link rel="icon" href="/src/assets/brand-logo.svg">` (Vite 가 빌드 시 해시 URL 로 치환) |
| 앱 로고 컴포넌트 (툴바·로그인) | `components/icons/index.tsx` `I.Logo` → `<img src={import된 URL}>` |
| 내보낸 HTML 뷰어 헤더·파비콘 | `export/exportHtml.ts` `LOGO_SVG` → `?raw` import 로 문자열 내장 (고정 width/height 속성만 제거) |
| GitHub README 헤더 | `/README.md` → `docs/assets/brand/logo.svg` img 참조 |

**로고 교체 절차**: ① `docs/assets/brand/logo.svg` 교체 → ② 같은 파일을
`apps/frontend/src/assets/brand-logo.svg` 로 복사 → ③ PNG 2종 재렌더.
코드는 손댈 필요 없다.

## 주의

- 흰 바탕은 도안의 일부다(다크 툴바에서도 흰 배지로 표시). `I.Logo` 는
  CSS `border-radius` 로 모서리만 살짝 둥글게 마스킹한다 — SVG 자체는
  수정하지 않는다.
- 원본은 비트맵 트레이스 벡터라 패스를 손으로 수정하기 어렵다 — 도안
  변경은 새 원본 파일 교체로만 한다.
