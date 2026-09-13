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

