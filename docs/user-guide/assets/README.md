# 사용자 가이드 스크린샷

이 폴더에 사용자 가이드용 화면 캡처를 넣는다. 각 가이드 문서의
`TODO(스크린샷)` 표시 위치에 대응하는 이미지를 파일명으로 참조한다
(예: `01-overview.png`). 기능이 안정화된 뒤 일괄 캡처를 권장한다.

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

