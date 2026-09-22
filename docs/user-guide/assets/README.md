# 사용자 가이드 스크린샷

이 폴더에 사용자 가이드용 화면 캡처를 넣는다. 각 가이드 문서의
`TODO(스크린샷)` 표시 위치에 대응하는 이미지를 파일명으로 참조한다.

## ★ 캡처는 사람이 아니라 코드가 만든다 (2026-09-13 사용자 결정)

가이드에 `TODO(스크린샷)` 가 있으면 **AI(Claude Code)가 실제 프런트엔드를
vite + Playwright 로 띄워 그 장면을 만들어 찍는다.** 사용자가 손으로
캡처하는 것은 우리 화면이 아닌 것(claude.ai 대화상자 등)뿐이다.
스크립트와 요령은 [`apps/frontend/scripts/doc-shots/`](../../../apps/frontend/scripts/doc-shots/README.md)
에 있다. 진짜 컴포넌트를 렌더하므로 **캡처가 곧 동작 확인**이다 — 그림과
코드가 어긋나면 그 자리에서 드러난다(가이드 03 의 `+` 방향 12장, 201차).

| 그림 | 만든 스크립트 |
|---|---|
| `mcp-connector-consent.png` | `mcp-consent.mjs` |
| `mcp-token.png` | `mcp-token.mjs` |
| `mcp-cloud-env.png` | (claude.ai 화면 — 사용자 캡처, #475) |
| `node-add-*.png` (12) | `node-add.mjs` |
| `mark-toolbar.png` · `node-drag-*.png` (4) · `paste-article.png` | `guide03.mjs` |
| `mark-toolbar.png`(⊞ 포함, 2026-09-17 재촬영) · `03-table-grid.png` · `03-table-dialog.png` · `03-table-dialog-md.png` · `03-table-node.png` · `03-code-dialog.png` · `03-code-node.png` | `guide03-table.mjs` (동작 검증 13항목도 함께 돈다) |
| `03-style-copy-button.png` · `03-style-copy-brush.png` · `03-style-copy-after.png` (2026-09-19) | `guide03-style-copy.mjs` (붓 동작 검증 27항목도 함께 돈다) |
| `05-note-table-picker.png` · `05-note-table.png` (2026-09-19) | `guide05-note-table.mjs` (노트 표 격자·팝업·✎ 검증 16항목도 함께 돈다) |
| `04-minimap.png` · `04-minimap-window.png` (2026-09-21) | `guide04-minimap.mjs` (미니맵 토글·사각형 크기·끌기·클릭·창 모드·따라오기·휠·대비·열 때 100% 검증 35항목도 함께 돈다) |
| `01-browser-refresh.png` (2026-09-21) | `guide01-browser-refresh.mjs` — 인증 모드 vite (문서함 새로고침 검증 9항목도 함께 돈다) |
| `03-add-menu.png` · `03-calendar-dialog.png` · `03-calendar-dialog-month.png` · `03-calendar-weeks.png` · `03-calendar-holiday.png` · `03-calendar-dialog-table.png` · `03-calendar-table.png` · `03-two-tables.png` (2026-09-22) | `guide03-calendar.mjs` (+ 메뉴·달력 노드·표로 붙여넣기·표 2개 검증 41항목도 함께 돈다) |
| `04-layout-multi.png` · `04-layout-multi-collapsed.png` (2026-09-21) | `guide04-layout-multi.mjs` (다중 선택 레이아웃·접힘 배지·다크 칩 검증 13항목도 함께 돈다) |
| `01-overview.png` · `01-theme-toggle.png` · `01-dark.png` · `02-newmap-menu.png` · `02-template-choose.png` · `02-template-register.png` | `guide01-02.mjs` |
| `04-layout-tab.png` · `04-collapse-badge.png` · `04-outline-split.png` · `04-mainview-toggle.png` · `04-outline-mode.png` | `guide04.mjs` |
| `05-note-tab.png` · `05-note-popup.png` · `05-tags.png` · `06-search-panel.png` · `06-search-hit.png` | `guide05-06.mjs` |
| `07-ai-settings.png` · `07-ai-result.png` · `07-ai-expand.png` | `guide07.mjs` (AI 제공사 HTTP 스텁) |
| `08-export-menu.png` · `08-viewer-header.png` · `08-viewer-full.png` · `08-import-buttons.png` | `guide08.mjs` (뷰어는 실제 내보내기 함수로 만든 HTML) |
| `11-version-history.png` | `guide11.mjs` (`/versions` 스텁) |
| `11-transfer-ownership.png` | (유료 모듈 화면 — 사용자가 운영에서 캡처, 이름·이메일은 모자이크) |

## 넣는 규칙 (2026-09-13)

- **크기**는 마크다운 `![]()` 가 아니라 `<img src="assets/…" width="400" alt="…">`
  로 준다 — GitHub 는 `![]()` 에 크기를 못 주고 `style` 속성은 지운다.
  본문 폭(약 900px)에 맞춰 대화상자는 340~480 정도가 읽기 좋다.
- **테두리**는 그림 파일 자체에 넣는다(연회색 `#bfbfbf`, 표시 배율로 나눠
  화면에서 1px). 어느 렌더러에서 열어도 같게 보이게 하려는 것이다.
  ```bash
  python3 -c "from PIL import Image,ImageOps;im=Image.open('x.png').convert('RGB');ImageOps.expand(im,border=round(im.width/400),fill=(191,191,191)).save('x.png',optimize=True)"
  ```
- 배경 여백이 넓은 캡처는 **대상 주변 40px 만 남기고 자른다** — 폭을 줄였을
  때 대상이 너무 작아진다.
- 토큰·이메일 같은 값은 넣기 전에 가리거나 예시 값으로 바꾼다.

