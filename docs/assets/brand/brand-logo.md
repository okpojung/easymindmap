# EasyMindMap 브랜드 로고

> 2026-08 확정 (사용자 제공 도안의 SVG 재현). 원본 파일:
> [`logo.svg`](./logo.svg) — 이 파일이 도안의 단일 원본(source of truth)이다.

<img src="./logo.svg" width="120" alt="EasyMindMap 로고" />

## 도안 구성

| 요소 | 설명 |
|---|---|
| 흰 라운드 사각 바탕 | rx 18 / 96×96 뷰박스 |
| 주황 그라디언트 'e' 링 | 소문자 e — Markdown 의 'e'asy. 스트로크 10, 라운드 캡 |
| Mark / Down 글자 | 링 안 2줄, 브라운 `#5C3B25`, 볼드 14 (작은 크기에서도 판독되게 2026-08-04 확대) |
| 중심 점 + 마인드맵 트리 | 'Down' 오른쪽 점에서 위 3 + 아래 2 리프로 분기 — "Markdown 이 맵이 된다" |

## 색

| 용도 | 값 |
|---|---|
| 그라디언트 시작 (골드) | `#F2B01E` |
| 그라디언트 중간 | `#EC8B10` (offset 0.55) |
| 그라디언트 끝 (딥 오렌지) | `#DF5F0D` |
| 글자·워드마크 브라운 | `#5C3B25` |
| 워드마크 다크 테마 대체 | `#E8C9A6` (밝은 탠 — 가독) |

워드마크는 별도 파일이 아니라 **로고 + 텍스트 'EasyMindMap'**
(Pretendard 계열 900, 브라운) 조합으로 쓴다 — WelcomeScreen 참조.

## 사용처 — 바꿀 때 전부 함께 바꾼다 (동기 규칙)

| 위치 | 파일 |
|---|---|
| 도안 원본 | `docs/assets/brand/logo.svg` (이 폴더) |
| 브라우저 탭 파비콘 | `apps/frontend/index.html` (data URL 인코딩본) |
| 앱 로고 컴포넌트 (툴바·로그인) | `apps/frontend/src/components/icons/index.tsx` `I.Logo` (JSX) |
| 내보낸 HTML 뷰어 헤더·파비콘 | `apps/frontend/src/export/exportHtml.ts` `LOGO_SVG` (문자열) |
| GitHub README 헤더 | `/README.md` (이 SVG 를 img 로 참조) |

네 사본은 인코딩만 다르고 도형·좌표·색이 같아야 한다. 도안을 고치면
**logo.svg 를 먼저 고치고** 나머지 세 코드 사본에 반영한다.

## 주의

- 파비콘/앱 사본의 글자는 `font-family` 폴백(sans-serif)으로도 형태가
  유지되도록 위치·크기를 넉넉히 잡았다 — 글자 크기를 줄이지 말 것.
- 흰 바탕은 도안의 일부다(다크 툴바에서도 흰 배지로 표시) — 투명
  배경 변형을 만들 때는 별도 파일로 추가한다.
