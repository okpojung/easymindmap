# 24. Chat Translation
## CHAT_TRANSLATION

* 문서 버전: v1.0
* 작성일: 2026-04-16
* 참조: `docs/01-product/functional-spec.md § TRANSLATION TRANS-08~11`, `docs/04-extensions/collaboration/26-realtime-chat.md`

---

### 1. 기능 목적

* 협업 중 실시간 채팅 메시지를 **수신자 언어로 자동 번역하여 표시**하는 기능 (V2)
* 언어가 다른 협업자 간 소통 장벽 제거
* Language-group 캐시로 동일 메시지를 언어별 1회만 번역하여 비용 최적화

---

### 2. 기능 범위

* 포함:
  * 채팅 메시지 자동 번역 (TRANS-08)
  * Language-group 캐시 (TRANS-09)
  * Short Message Guard (TRANS-10)
  * 원문 + 번역문 동시 표시 (TRANS-11)

* 제외:
  * 노드 텍스트 번역 (→ `23-node-translation.md`)
  * 번역 결과 영구 저장 (채팅 번역은 세션 캐시만)

---

### 3. 세부 기능 목록

| 기능ID     | 기능명                     | 설명                                    | 주요 동작           |
| -------- | ----------------------- | --------------------------------------- | --------------- |
| TRANS-08 | Live Chat Translate     | 채팅 메시지를 수신자 언어로 실시간 번역                  | 수신 시 자동 번역      |
| TRANS-09 | Language-group Cache    | 동일 메시지를 targetLang별 1회만 번역 후 fan-out    | 번역 결과 공유        |
| TRANS-10 | Short Message Guard     | 매우 짧은 메시지는 번역 생략 또는 원문 우선 표시            | 5자 미만 생략        |
| TRANS-11 | Original + Translation  | 채팅에서 원문 + 번역문 동시 표시                    | 메시지 하단에 번역문 표시  |

---

### 4. 기능 정의 (What)

#### 4.1 chat_message_translations 캐시 구조

```typescript
// Redis 캐시 (세션 단위, 24시간 TTL)
type ChatTranslationCache = {
  messageId: string;
  originalText: string;
  translations: {
    [targetLang: string]: string;  // { 'ko': '안녕하세요', 'ja': 'こんにちは' }
  };
};
```

#### 4.2 채팅 메시지 표시 형태

```text
[Alice] 12:34
"Let's start with the database schema"
  번역: "데이터베이스 스키마부터 시작합시다"    ← 수신자 언어 번역문
```

#### 4.3 원문 + 번역문 토글

```text
[Alice] 12:34
"データベースのスキーマから始めましょう"
  번역: "데이터베이스 스키마부터 시작합시다"  [원문 숨기기]
```

#### 4.4 Language-group Fan-out 전략

```
수신된 채팅 메시지: "Let's discuss the timeline"
    │
    ▼
접속 협업자 언어 그룹 확인:
  ko: [User A, User C]
  ja: [User B]
    │
    ▼
번역 요청: ko 1회 + ja 1회 (중복 번역 방지)
    │
    ▼
번역 완료 → fan-out
  ko 번역 → User A, User C 전송
  ja 번역 → User B 전송
```

---

### 5. 동작 방식 (How)

#### 5.1 사용자 동작

* 채팅 창에서 메시지 수신
* 자신의 언어와 다른 언어의 메시지 → 자동 번역 표시 (메시지 하단 번역문)
* `[원문 보기]` 버튼 → 원문 표시
* `[번역 끄기]` → 전체 채팅 번역 비활성화

#### 5.2 채팅 메시지 번역 처리 흐름

```
채팅 메시지 수신 (WebSocket)
    │
    ▼
Short Message Guard 확인 (5자 미만 → 번역 생략)
    │
    ▼
캐시 조회 (Redis: messageId + targetLang)
  ├─ 캐시 HIT → 즉시 번역문 렌더링
  └─ 캐시 MISS
         │
         ▼
    번역 API 호출 (DeepL / LLM Fallback)
         │
         ▼
    Redis 캐시 저장 (TTL: 24h)
         │
         ▼
    같은 언어 그룹 협업자에게 fan-out
```

#### 5.3 언어 자동 감지

* 메시지 발신자의 `users.preferred_language` 참조
* 감지 실패 시 DeepL Language Detection API 사용
* 수신자 언어와 동일 → 번역 생략

---

### 6. 규칙 (Rule)

* Short Message Guard: 5자 미만 메시지 번역 생략
* Language-group Cache TTL: 24시간 (Redis)
* 번역 표시: 원문 + 번역문 동시 표시 (TRANS-11)
* 자신이 작성한 메시지: 번역 표시하지 않음 (본인 언어 기준)
* `users.preferred_language`가 메시지 언어와 동일: 번역 생략

---

### 7. 예외 / 경계 (Edge Case)

* **번역 API 실패**: 원문 그대로 표시 (번역 없음 표시 아이콘)
* **언어 감지 실패**: 원문 그대로 표시
* **초단문 (emoji, OK, ㅋ 등)**: Short Message Guard로 번역 생략
* **오프라인 수신자**: 재접속 시 최근 메시지 캐시 번역 제공

---

### 8. 권한 규칙

| 역할      | 채팅 번역 사용 |
| ------- | --------- |
| creator | ✅         |
| editor  | ✅         |
| viewer  | ✅ (읽기 한정) |

---

### 9. DB 영향

* `chat_messages` — 원문 저장 (번역문 미저장)
* Redis — 번역 캐시 (세션, 24시간 TTL)

---

### 10. API 영향

* `POST /translate/chat` — 채팅 메시지 번역 (내부 서버 간 호출)
* `GET /translate/chat/{messageId}/{targetLang}` — 캐시 조회

---

### 11. 연관 기능

* NODE_TRANSLATION (`23-node-translation.md`)
* REALTIME_CHAT (`26-realtime-chat.md`)
* COLLABORATION (`25-map-collaboration.md`)

---

### 12. 구현 우선순위

#### MVP (V2)
* TRANS-08 Live Chat Translate
* TRANS-10 Short Message Guard
* TRANS-11 원문 + 번역문 동시 표시

#### 2단계 (V2)
* TRANS-09 Language-group Cache (fan-out 최적화)
* 채팅 번역 on/off 설정

---

### 13. Language-group Fan-out 중복 제거 로직

#### 13.1 원칙

같은 방에 접속한 협업자를 언어 그룹별로 묶어, 동일 언어에 대한 번역 API는 1회만 호출한다.  
번역 결과는 해당 언어 그룹의 모든 사용자에게 fan-out한다.

```
메시지 수신: "Let's finalize the roadmap"
    │
    ▼
접속 협업자 언어 그룹 확인
  ko → [User A (Kim), User C (Park)]
  ja → [User B (Tanaka)]
  en → [User D (Alice)]  ← 발신자와 동일 언어 → 번역 생략
    │
    ▼
번역 API 호출: ko 1회, ja 1회  (총 2회, en은 생략)
    │
    ▼
fan-out
  ko 번역 결과 "로드맵을 마무리합시다" → User A, User C에 동시 전송
  ja 번역 결과 "ロードマップを確定させましょう" → User B에 전송
```

**핵심 절약 효과**: 협업자가 20명이어도 언어 그룹이 3개라면 번역 API 호출은 최대 3회.

#### 13.2 Short Message Guard (채팅 vs 노드 비교)

짧은 메시지는 언어 감지 오탐률이 높고 번역 효용도 낮아 번역을 생략한다.

| 대상 | Guard 임계값 | 이유 |
|------|------------|------|
| 채팅 메시지 | **5자 미만** | 이모지·감탄사·초단문은 번역 실익 없음 |
| 노드 텍스트 | **3자 미만** | 노드는 키워드 중심이므로 더 짧은 기준 적용 |

```typescript
// 채팅 Short Message Guard
const CHAT_MIN_LENGTH = 5;

function shouldTranslateChatMessage(text: string): boolean {
  if (text.trim().length < CHAT_MIN_LENGTH) return false; // 번역 생략
  return true;
}
```

---

### 14. 언어 감지 힌트 전략

#### 14.1 발신자 `preferred_language`를 1차 힌트로 사용

채팅 메시지는 짧아 `franc` 단독 감지 오탐이 많다.  
발신자 프로필의 `users.preferred_language`를 언어 감지의 1차 힌트로 사용하여 정확도를 높인다.

```typescript
async function detectChatMessageLang(
  text: string,
  senderPreferredLang: SupportedLanguage,
): Promise<SupportedLanguage> {
  // 1차: 발신자 preferred_language를 힌트로 franc 호출
  if (text.trim().length >= 5) {
    const detected = franc(text, { minLength: 5 });
    if (detected !== 'und') {
      return LANG_MAP[detected] ?? senderPreferredLang;
    }
  }
  // 감지 실패 또는 초단문 → 발신자 preferred_language로 fallback
  return senderPreferredLang;
}
```

#### 14.2 수신자 언어와 동일하면 번역 생략

감지(또는 힌트)된 메시지 언어가 수신자의 `preferred_language`와 동일하면  
번역 API 호출 및 큐 enqueue 자체를 건너뛴다.

```typescript
function needsTranslationForRecipient(
  messageLang: SupportedLanguage,
  recipientLang: SupportedLanguage,
): boolean {
  return messageLang !== recipientLang; // 동일 언어면 false → 번역 생략
}
```

| 발신자 언어 | 수신자 언어 | 결과 |
|-----------|-----------|------|
| en | en | 번역 생략 |
| ko | en | 번역 실행 |
| ja | ko | 번역 실행 |
| en | en (여러 명) | 전원 번역 생략 → fan-out 없음 |

---

### 15. 캐시 TTL 전략

#### 15.1 Redis TTL: 24시간

채팅 번역은 문서 번역과 달리 실시간 대화 맥락에 귀속된다.  
세션이 종료되거나 오래된 메시지는 재번역 수요가 없으므로 24시간 TTL로 관리한다.

```typescript
const CHAT_TRANSLATION_TTL = 86400; // 24시간 (초 단위)

await redis.setex(cacheKey, CHAT_TRANSLATION_TTL, translatedText);
```

| 저장소 | TTL | 용도 |
|--------|-----|------|
| Redis | 24시간 | 실시간 채팅 세션 캐시, 재접속 시 빠른 복구 |
| PostgreSQL | 영구 | 없음 (채팅 번역은 영구 저장 안 함) |

> 노드 번역(`TTL_BASE=7200`, Sliding TTL 최대 6시간)과 달리  
> 채팅 번역은 고정 24시간 TTL만 사용하며 Sliding 갱신은 적용하지 않는다.

#### 15.2 메시지별 캐시 키 구조

```text
chat:translation:{messageId}:{targetLang}
```

**예시:**

```text
chat:translation:msg_9f3a2c:ko   → "로드맵을 마무리합시다"
chat:translation:msg_9f3a2c:ja   → "ロードマップを確定させましょう"
chat:translation:msg_7b1d4e:ko   → "스키마부터 시작합시다"
```

**캐시 무효화 규칙:**

| 이벤트 | 처리 |
|--------|------|
| TTL 만료 | Redis 자동 삭제 (24시간 후) |
| 메시지 원문 수정 | `source_text_hash` 변경 → 해당 `messageId` 키 전체 DEL |
| 메시지 삭제 | `chat:translation:{messageId}:*` 패턴 DEL |
