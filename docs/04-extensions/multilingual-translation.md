easymindmap — 다국어 자동 번역 기능 설계

적용 단계: V2
참고: Thinkwise Web에 유사 기능 존재 (시장 검증 완료)


1. 기능 개요
협업 또는 공유 맵을 열 때, 각 노드의 텍스트를 열람자의 언어로 자동 번역하여 표시하는 기능.
작성자 (한국어):  [AI 전략]
일본 사용자가 열면: [AI戦略]
영문 사용자가 열면: [AI Strategy]

핵심 원칙
1. DB에는 원문만 저장 (nodes.text)
2. 번역본은 캐시 테이블에 저장 (node_translations)
3. 클라이언트가 열람자 언어에 맞춰 표시
4. 원문 언어와 열람자 언어가 같으면 번역 불필요


2. 데이터 모델
nodes 테이블 (기존 컬럼 활용)
text        TEXT    -- 원문 그대로 저장
text_lang   VARCHAR(20)  -- 작성 언어 코드 ('ko', 'en', 'ja' ...)
text_hash   VARCHAR(128) -- 번역 캐시 무효화 키 (SHA-256 앞 16자)
node_translations 테이블
CREATE TABLE node_translations (
    id                UUID PRIMARY KEY,
    node_id           UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_lang       VARCHAR(20) NOT NULL,
    translated_text   TEXT NOT NULL,
    source_text_hash  VARCHAR(128) NOT NULL,  -- 이 hash가 nodes.text_hash와 다르면 무효
    model_version     VARCHAR(60) NULL,        -- 번역 엔진/버전 기록
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (node_id, target_lang)
);

3. 번역 파이프라인
전체 흐름
노드 편집 확정 (Enter 키 / blur)
        │
        ▼
text_hash 계산 (SHA-256[:16])
        │
        ▼
Redis cache 조회 (hot tier)
        │
   ┌────┴────┐
 Hit          Miss
   │          │
   ▼          ▼
즉시 표시     translation_jobs 큐에 투입 (BullMQ)
               │
               ▼
         Translation Worker
         (DeepL API 1차)
         (LLM 2차 fallback)
               │
               ▼
         node_translations 저장
         Redis cache 갱신
               │
               ▼
         WebSocket broadcast
         (translation:ready 이벤트)
               │
               ▼
         해당 맵 열람자 화면 업데이트

⚠️ 중요: 번역 트리거 시점
타이핑 중  → 번역 요청 X  (API 비용 폭발 방지)
Enter 키   → 번역 트리거  (편집 확정)
blur 이벤트 → 번역 트리거  (포커스 이탈)


4. 번역 엔진 전략
1차: DeepL API
  - 품질 우수 / 속도 빠름 / 비용 저렴
  - 일반적인 텍스트에 적합

2차: LLM (OpenAI GPT 등) fallback
  - DeepL 미지원 언어 또는 전문 용어
  - 문맥 이해가 필요한 경우
  - 비용 높으므로 fallback 용도로만 사용

환경변수 설정
TRANSLATION_PROVIDER=deepl          # deepl / openai / hybrid
TRANSLATION_DEEPL_API_KEY=your_key
TRANSLATION_ENABLE_CACHE=true
TRANSLATION_QUEUE_CONCURRENCY=5
TRANSLATION_DEFAULT_TARGETS=ko,en,ja
TRANSLATION_SKIP_SAME_LANGUAGE=true

5. 캐시 무효화 전략
노드 텍스트 변경
    │
    ▼
text_hash 재계산 → nodes.text_hash 업데이트
    │
    ▼
node_translations의 source_text_hash != nodes.text_hash
    → 해당 번역 캐시 무효
    → 재번역 큐 투입


6. 초기 맵 로딩 전략
대형 맵(노드 1,000개 이상)에서 번역이 필요한 노드가 많을 경우:
맵 오픈
    │
    ▼
전체 노드 로드 (원문)
    │
    ▼
번역이 필요한 노드 식별
(node.text_lang != user.locale)
    │
    ▼
캐시된 번역 즉시 적용
    │
    ▼
미캐시 노드: Skeleton Text 표시
    │
    ▼
Background translate (배치 요청)
    │
    ▼
번역 완료 시 순차적으로 Skeleton → 번역본 교체


7. 프론트엔드 구현
노드 텍스트 표시 로직
const displayText = useMemo(() => {
  // 내 언어로 작성된 노드 → 원문 표시
  if (node.text_lang === userLocale || !node.text_lang) {
    return node.text;
  }

  // 번역 캐시 확인
  const cached = translationCache[node.id]?.[userLocale];
  if (cached?.hash === node.text_hash) {
    return cached.text;   // 유효한 캐시
  }

  // 번역 대기 중
  return null; // → Skeleton 표시
}, [node, userLocale, translationCache]);
UX 상태 표시

상태
표시

내 언어
원문 그대로 표시


번역 캐시 존재 (유효)
번역본 표시


번역 대기 중
Skeleton (회색 바)


번역 실패
원문 표시 + 번역 실패 아이콘

원문 토글 기능
노드 호버 시:
[번역본 표시]  ← 기본
[원문 보기] 버튼 클릭 → 원문 표시


8. WebSocket 이벤트
translation:ready
{
  nodeId: "...",
  targetLang: "en",
  translatedText: "AI Strategy",
  textHash: "a1b2c3d4..."
}

해당 맵을 열고 있는 모든 클라이언트에게 broadcast → 자동 업데이트.

9. 실시간 협업 시 동작
User A (KR): "AI 전략" 노드 생성
    │
    ▼
WebSocket broadcast → 모든 참가자에게 새 노드 전달
    │
    ▼
User B (JP): text_lang='ko' 노드 수신
    → 번역 캐시 확인 → Miss
    → translation:pending 상태 (Skeleton)
    → 백그라운드 번역 완료 후 "AI戦略" 표시

User C (EN): 동일 과정 → "AI Strategy" 표시


10. 난이도 평가

항목
난이도

번역 API 연동 (DeepL)
낮음


번역 캐시 구조
중간


캐시 무효화
중간


협업 동기화
중간


초기 로딩 최적화
중간


전체
중간~중상

11. 전략적 가치
경쟁사 현황:
  XMind         → 다국어 번역 없음
  MindMeister   → 다국어 번역 없음
  Miro          → 다국어 번역 없음
  Thinkwise     → 유사 기능 있으나 제한적

easymindmap:
  AI mindmap + multilingual collaboration
  = 강력한 차별화 포인트


12. 구현 순서 권장
Step 1: nodes 테이블 text_lang, text_hash 컬럼 추가
Step 2: node_translations 테이블 생성
Step 3: translation_jobs 큐 + Translation Worker 구현
Step 4: DeepL API 연동
Step 5: WebSocket translation:ready 이벤트
Step 6: 프론트엔드 번역 캐시 store + Skeleton UI
Step 7: 원문 토글 UI
Step 8: 초기 로딩 배치 번역 최적화
