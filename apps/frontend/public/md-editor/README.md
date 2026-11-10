# md-editor — 마크다운 첨부 웹 편집기 (외부 사본)

이 폴더의 `index.html`은 상위 원본에 **암호화 HTML 보안 패치**를 적용한 사본이다.
일반 편집기 수정은 상위 저장소에서 먼저 진행한다. 현재 암호화 패치의 상위 반영은
아직 확인되지 않았으므로, 단순 원본 복사로 덮어쓰면 암호화 기능이 사라진다.
패치 범위와 제약은 `docs/04-extensions/import-export/23-encrypted-html.md`를 따른다.

| 항목 | 값 |
|---|---|
| 출처 저장소 | <https://github.com/okpojung/markdown-editor> |
| 파일 | `index.html` (단일 파일 편집기) |
| 커밋 | `e4815cb63868932d614c463fa98ad9e073c5f334` (2026-11-08 상위 main 기준, 아래 로컬 보안 패치 포함) |
| sha256 | `dda5d0442e7718255c0a0c8f7ed037c95f15f9ee09c71dde3a07c718d8b7f766` |
| 라이선스 | MIT — 아래 고지 |

## 어떻게 서빙되나

Vite 는 `public/` 을 빌드 결과(`dist/`) 루트로 그대로 복사한다. 그래서
`dist/md-editor/index.html` 이 되고, nginx 의 `try_files $uri $uri/ …` 가
`https://<프런트>/md-editor/` 요청에 이 파일을 내보낸다. 앱과 **같은 origin** 이다.

앱은 서버 첨부(`/v1/attachments/{id}`) 중 `.md`/`.markdown` 을 이렇게 연다
(`src/utils/openAttachment.ts` · `src/utils/mdEditorUrl.ts`).

```
/md-editor/?att=<첨부 id>&api=<API 베이스>&name=<파일 이름>#t=<액세스 토큰>
```

- 토큰은 **해시(`#t=`)에만** 붙는다 — 쿼리는 접근 로그·Referer 로 새어 나간다.
- 편집기는 같은 origin 의 localStorage `emm.auth` 에서 토큰을 먼저 읽고, 없을
  때만 `#t=` 를 쓴다(앱이 갱신해 둔 최신 토큰을 쓰려는 것이다).
- 읽기 `GET /v1/attachments/:id`(Bearer), 저장 `PUT /v1/attachments/:id/content`
  (Bearer · 원문 바디 · `If-Match: "sha256:<hex>"` — 409 면 덮어쓸지 묻는다).
- 저장하면 opener 로 `postMessage({type:"mde:attachment-saved", att, sizeBytes}, origin)`
  를 보내고, 앱은 그 첨부의 `size` 를 고친다(상태바 첨부 용량).

맵 **내장** 첨부(data URL, ≤2MB — 대부분의 `.md`)는 서버 자리가 없으므로
편집기를 연 앱 탭(opener)이 내용을 건네고 저장을 받는다
(`src/utils/mdEmbedBridge.ts` · `openAttachment.ts`).

```
/md-editor/?src=opener&key=<노드 id>~<첨부 id>&name=<파일 이름>
```

- 편집기 → 앱 `{type:"mde:hello", key}` (0.5초 간격 최대 10초) → 앱 → 편집기
  `{type:"mde:load", key, markdown, readOnly}`
- 편집기 → 앱 `{type:"mde:save", key, markdown, reqId}` → 앱 → 편집기
  `{type:"mde:saved", key, reqId, ok}` (실패면 `ok:false, error`)
- 보낼 때 targetOrigin = `location.origin`, 받을 때 `event.origin === location.origin`.

편집 부품(Toast UI Editor·CodeMirror·Mermaid)은 **jsDelivr CDN** 에서 받는다.
CDN 을 못 쓰는 환경에서는 편집기가 원문 텍스트 상자로 물러난다(편집기 자체 동작).

## 암호화 런타임 동기화

공통 원본은 `src/export/encryptedHtml.ts`다. 변경 후 `npm run sync:encrypted-runtime`으로
오프라인 독립 실행용 literal과 이 편집기의 인라인 런타임을 함께 생성한다.
`npm run check:encrypted-runtime`은 불일치를 검출하며 build/test에도 포함되어 있다.
원본 편집기를 다시 가져올 때는 파일 메뉴·보호 저장·이미지 정책·스토리지/호스트 격리
패치를 먼저 다시 적용하고 두 runtime marker를 보존한다. 상위 웹사이트/데스크톱 배포는
이 사본 반영만으로 변경되지 않는다.

## 갱신 방법

```bash
SHA=<가져올 커밋 40자리>
curl -fsSL -o apps/frontend/public/md-editor/index.html \
  "https://raw.githubusercontent.com/okpojung/markdown-editor/$SHA/index.html"
sha256sum apps/frontend/public/md-editor/index.html
```

`raw.githubusercontent.com` 이 막힌 환경이면 git 으로 같은 커밋을 받는다.

```bash
git init -q /tmp/mde && git -C /tmp/mde fetch -q --depth 1 https://github.com/okpojung/markdown-editor "$SHA" \
  && git -C /tmp/mde show FETCH_HEAD:index.html > apps/frontend/public/md-editor/index.html
```

그다음 위 표의 **커밋·sha256** 을 고치고, 편집기의 계약(쿼리 이름·저장 경로·
메시지 이름)이 바뀌었으면 `src/utils/mdEditorUrl.ts` · `src/utils/mdEmbedBridge.ts` 와
`docs/04-extensions/attachment-storage.md` §7.4 · §7.5 도 함께 고친다.

## MIT 라이선스 고지

```
MIT License

Copyright (c) 2026 okpojung

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```


## 2026-11-10 독립 로컬 통합 (운영 미반영)

- 기준 EMM 코어: `c93aa6dd7acd7a2d70764d54136e69bce602e652`. 공통 후보: `60b8310095183e016683e57cd82041138c2a15f0`.
- 메뉴: MD / 완전 오프라인 md.html / EMM v1 암호화 md.html 3종. 온라인 파일 가져오기는 유지하며 다시 저장하면 오프라인입니다. Mermaid는 문서 내 사용 여부와 무관하게 포함합니다.
- 공통 1.0.4 의미 블록 기반 분할 스크롤/선택 추종과 언어 전환 후 이벤트 재결선을 이식했습니다.
- 공통 1.0.5 export 직렬화, 문서 epoch, 오래된 파일 열기 거부, 보호 로컬 저장 saved/handle 보완을 이식했습니다.
- EMM 암호화 runtime marker 내부는 기준 원본과 바이트 동일합니다. 공유 알고리즘을 추가하지 않았습니다.
- 공유 런타임의 문자열 표식 오탐을 피하려고 가져오기 경계의 isProtectedFile에서 비실행 DOM의 실제 meta/payload 요소를 확인합니다.
- EMM Bearer/If-Match/403/409/opener 저장 본문, iframe ACK와 닫기 보호를 보존했습니다.
- 새 검사: 작업본 루트 integration-check.cjs, tests/protected-export.emm.browser.js (공통 검사에 EMM API 이름만 어댑트), fixture-server.cjs.
- 기존 암호화 실제 검사 통과. 기존 합성 검사는 함수 문자열/VM fixture가 이전 구조에 결합되어 별도 갱신이 필요합니다.
- check:encrypted-runtime의 TypeScript 의존성이 없어 실행 불가. 의존성을 설치하지 않았습니다. 원본 runtime 바이트 동일성과 원본 TS/생성 스크립트 보존으로 제한 확인했습니다.
- 운영 배포, pro CORE_SHA 상향, 실제 서버 첨부 PUT, 네이티브 파일 저장은 수행하지 않았습니다.
