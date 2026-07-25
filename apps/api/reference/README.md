# reference/ — 구현 참고용 (컴파일 대상 아님)

이 폴더는 `src/` 밖에 있어 빌드·타입체크에 포함되지 않는다. 설계 단계에서
스케치한 코드/자료를 다음 구현 단계의 참고로 보관한다.

| 파일 | 용도 |
|---|---|
| `node.service.skeleton.ts` | 노드 CRUD + ltree 계층 이동 초안. Supabase 클라이언트를 전제로 작성된 설계 스케치. **Phase 2(노드 API)** 에서 이 저장소의 `DatabaseService`(pg) 기반으로 재구현할 때 로직 참고용. |
