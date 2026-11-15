# md-editor — 마크다운 첨부 웹 편집기 (외부 사본)

이 폴더의 `index.html`은 공통 편집기 **v1.0.6** UI와 EMM 전용 저장·보안 처리를 3-way 통합한 사본이다.
일반 편집기 수정은 상위 저장소에서 먼저 진행한다. 상위에도 보호 HTML 기능이 있으나,
EMM은 자체 공통 암호화 생성 런타임을 사용하므로 원본 전체 복사는 금지한다.
패치 범위와 제약은 `docs/04-extensions/import-export/23-encrypted-html.md`를 따른다.

| 항목 | 값 |
|---|---|
| 출처 저장소 | <https://github.com/okpojung/markdown-editor> |
| 파일 | `index.html` (단일 파일 편집기) |
| 커밋 | `ed82e81e42c4ced80625e6b8348a7dbbfae7239a` (v1.0.6 공통 UI, EMM 확장 보존) |
| sha256 | `4c5a4df9cf4868b8f9a4b47667cc2df0bdfe14e86f26036cbf151345d4594c05` |
| 라이선스 | MIT — 아래 고지 |

## v1.0.6 통합 기준

- 실제 EMM 사본의 README 기준 원본 `e4815cb63868932d614c463fa98ad9e073c5f334`와 위 v1.0.6을 3-way 병합했다. `7fe6223`는 공통 1.0.5 비교점이며 EMM 기준본은 아니다.
- 공통 한 줄·모바일 그룹 메뉴, 글머리 토글, 분할 왼쪽 MD/아웃라인 선택·닫기를 반영했다. 내부 `#closeBtn`은 제거하고 파일 메뉴 닫기와 EMM 호스트 닫기는 유지한다.
- EMM 암호화 shared-runtime marker, 보호 저장·이미지·스토리지 격리, 서버 ETag 충돌 처리, opener reqId ACK, iframe source/origin 검사 및 정확한 저장 스냅샷 ACK를 보존했다.
- 독립 웹 서비스의 EMM 연결 차단 보호 코드는 포함하지 않는다. EMM 호스트 TS 계약은 변경하지 않았다.

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

상위 `index.html`은 임시 경로로 다운로드하고, 위 기록의 상위 커밋을 기준으로 현재 EMM 사본과 새 상위 소스를 3-way 병합한다. 원본 전체를 덮어쓰지 않는다. 충돌은 EMM 인증·저장·암호화·iframe 보안 계약을 보존하여 해결한다.

LF 줄바꿈으로 `npm run sync:encrypted-runtime`을 실행하고 출처·sha256을 갱신한다. `test-md-encryption.cjs`, `test-md-encryption-actual.cjs`, 포함형 브리지/URL 검사와 실제 EMM 개발 서버의 저장·재열기·실패/충돌 검증을 실행한다. 공통 toolbar 152개와 격리 iframe 19개는 실제 서버 검증을 대체하지 않는다.

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
