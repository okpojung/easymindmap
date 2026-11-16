# Markdown Editor 1.0.7의 EMM 선택 통합

## 고정 기준과 범위

- EMM 기준: `d3ece22c22a21e411eab3902459cb38f5a095af2`.
- 공통 Markdown Editor: `620e3ed3c1375802db70e69146e4daa20bba7a10` (1.0.7).
- EMM의 기존 1.0.6 편집기와 공통 1.0.6 → 1.0.7 차이를 대조하여 아웃라인 변경만 선택 통합한다. 공통 `index.html` 전체 덮어쓰기가 아니다.
- standalone guard, desktop bridge, 배포 도구, 테스트 실행 코드를 제품 런타임이나 내보낸 HTML에 넣지 않는다. 테스트 파일은 `scripts/` 아래에만 둔다.
- 기존 메뉴 stacking 수정, 첨부 다운로드, Native/Plugin 작업, 암호화 공통 런타임은 유지한다.

## 입력과 저장 계약

아웃라인 입력은 blur 이전에 `innerText`를 읽는 직접 commit callback을 제공한다. 미확정 입력도 dirty에 포함되며, 부모 capture·저장·이탈은 callback으로 최신 입력을 확정한다. 도구의 Markdown 범위, 선택·포커스, Undo/Redo, 빈 목록 취소와 분할 창 스크롤 매핑은 공통 1.0.7 변경을 사용한다.

부모는 초기 `mde:loaded`의 정확한 Markdown와 `loadNonce`를 확인한 뒤에만 capture한다. `MDE.getHostSnapshot(loadNonce)` 외에 raw `MDE.markdown`나 직접 `flushPendingEdits()`로 우회하지 않는다. 준비된 프레임의 API 부재·잘못된 반환도 실패로 처리하므로 캐시된 구형 iframe을 저장 완료로 오인하여 닫지 않는다.

EMM의 `mde:change`, `mde:save`, 성공·실패 ACK는 load nonce로 결합한다. 늦은 ACK를 처리하기 전 최신 미확정 입력을 commit하고, saved 기준은 실제 전송한 snapshot으로만 갱신한다. nonce를 사용하지 않는 공통의 일반 iframe 프로토콜은 별도로 유지한다.

로컬 새 문서 또는 파일 열기는 이전 첨부의 host 바인딩·nonce·pending ACK를 해제한다. 보호 문서나 분리된 로컬 문서의 원문을 이전 첨부에 반환·전송하지 않는다. clean이면 capture가 `null`이고, 미저장 입력 또는 debounce 전 렌더링 입력이 있으면 고정 오류로 부모 저장·이탈을 차단한다. 해당 문서는 로컬 문서의 저장 경로를 사용해야 한다.

부모의 명시적인 기존 맵 저장과 새 맵 저장은 `flushMdExits()`를 먼저 완료한다. 실패하면 맵 PUT·생성 POST·허위 saved를 진행하지 않는다. 추가 await 경계에서 docEpoch와 맵 ID를 다시 확인한다. Ctrl/Cmd+S도 같은 저장 서비스를 사용하므로 iframe 입력의 blur에 의존하지 않는다.

## 보존하는 보안·영속성 경계

- source/origin, `mde:loaded`, 보호 문서 차단, EMM 인증과 읽기 전용 처리 유지.
- token·PUT·해시 await 이후 docEpoch 재확인. 옛 문서의 완료가 새 문서의 ACK·첨부 크기를 갱신하지 않음.
- 기존 If-Match 및 409/412 충돌 처리 유지. 실패 초안 보존, 자동 재시도 루프나 성공 ACK 없음.
- 기존 opener/inline 서버 저장도 실제 송신한 snapshot만 ACK하고 교체된 문서는 갱신하지 않음.
- 암호화 형식·KDF·CSP·opaque sandbox·보호 파일명·평문 내보내기 동의는 변경하지 않음.
- 암호화 생성 검사는 입력/출력을 LF로 정규화하여 Windows CRLF checkout과 Linux에서 동일한 결과를 검사한다. 인용 문자열 내부의 이스케이프 차이는 무시하지 않는다. 기존 생성 암호화 런타임 자체를 교체하지 않는다.

## 재현 가능한 로컬 검사

`apps/frontend`에서 실행한다.

```text
node scripts/test-md107-contract.cjs
node scripts/run-vite-test.mjs src/utils/mdFrameLoad.test.ts
node scripts/run-vite-test.mjs src/utils/mdSession.test.ts
node scripts/run-vite-test.mjs src/services/cloud/mapSessionMdSave.test.ts
pnpm test:unit
pnpm build
```

첫 검사는 병합된 실제 APP_JS 함수와 메시지 handler를 AST로 가져와 VM에서 실행한다. 가짜 문서·토큰·HTTP만 사용한다. 부모 저장 검사는 실제 저장 서비스와 MD exit registry에 합성 문서·mock cloudApi를 연결한다.

브라우저 회귀:

```text
node scripts/md107-browser/serve-fixtures.cjs <Core 저장소 절대 경로>
```

`http://127.0.0.1:5187/`의 격리 fixture에서 각 회귀 버튼을 실행한다. 서버는 loopback만 사용한다. 공통 고정 원본의 outline·toolbar·table·rendered-tail·split-scroll·embed-host·protected-export 회귀와 EMM의 별도 host 경계 회귀를 제공한다. protected-export에는 기존 EMM 공유 암호화 API에 연결하는 테스트 전용 어댑터만 덧붙인다. 각 결과는 실제 제공된 제품 HTML의 SHA-256와 공통 고정 커밋을 기록한다.

암호는 fixture 메모리에서 생성하고 결과에 쓰지 않는다. 파일 picker는 메모리 writer이며 네이티브 OS 파일 저장을 검증한 것으로 간주하지 않는다. 실제 EMM 첨부 PUT·맵 버전·서버 해시·재열기는 이 로컬 회귀와 별도의 실서버 검증이다.

## 운영 전환

로컬 통합 검사는 배포 승인이 아니다. 실제 서버 검증은 단일 배포 담당자가 정렬한 개발 후보에서 별도 소유 QA 맵·첨부로만 수행한다. 사용자 원본 자료는 건드리지 않고 QA 자료만 정리한다. 정식 CI, 최신 보안 경계 감사, Draft manifest/영수증 검증, Publish와 운영 확인 전에는 운영 전환 완료로 보고하지 않는다. 게이트·controller·DB 설정은 이 통합 변경의 범위가 아니다.
