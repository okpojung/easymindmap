# easymindmap — 다국어 자동 번역 기능 최종 설계서

**문서 위치**: `docs/04-extensions/multilingual-translation.md` (전면 대체)  
**버전**: v3.0  
**작성일**: 2026-03-30  
**적용 단계**: V2  
**상태**: 확정

---

## 1. 기능 개요

협업 또는 공유 맵을 열 때, 각 노드의 텍스트를 열람자의 언어로 자동 번역하여 표시하는 기능.

```
작성자 (한국어): [AI 전략]
일본 사용자가 열면: [AI戦略]
영어 사용자가 열면: [AI Strategy]
```

### 핵심 원칙

1. DB에는 원문만 저장 (`nodes.text`)
2. 번역본은 캐시 테이블에 저장 (`node_translations`)
3. 클라이언트가 열람자 언어에 맞춰 표시
4. 번역 여부는 3단계 정책(사용자 → 맵 → 노드)으로 결정
5. 영어는 세계 공용어이므로 기본적으로 번역 생략 대상
6. 오역 대응을 위해 열람자는 언제든 원문을 확인할 수 있어야 함
7. **실시간 협업 채팅 번역은 노드 번역과 별도 파이프라인으로 처리**한다.
8. 채팅 번역은 수신자별 실시간 UI를 제공하되, 내부적으로는 **언어별 캐시(language-group cache)** 를 사용한다.

### 경쟁사 현황

| 서비스 | 다국어 번역 |
|--------|-----------|
| XMind | 없음 |
| MindMeister | 없음 |
| Miro | 없음 |
| Thinkwise | 유사 기능 (제한적) |
| **easymindmap** | **완전 자동 번역 + 3단계 정책** |

---

## 2. 번역 정책 3단계 계층 구조

번역 여부는 아래 3단계 계층으로 결정되며, 상위 단계가 하위 단계보다 우선한다.

```
┌─────────────────────────────────────────┐
│  레벨 3. 노드별 설정 (nodes)             │  ← 최우선
│  translation_override = force_on/off    │
├─────────────────────────────────────────┤
│  레벨 2. 맵별 정책 (maps)               │  ← 중간
│  translation_policy_json                │
├─────────────────────────────────────────┤
│  레벨 1. 사용자 기본 설정 (users)        │  ← 기본값
│  preferred_language                     │
│  secondary_languages                    │
│  skip_english_translation               │
└─────────────────────────────────────────┘
```

### 2.1 레벨 1 — 사용자 기본 설정 (방안 1/2/3)

사용자가 한 번 설정하면 모든 맵에 기본으로 적용된다.

| 설정 항목 | 설명 | 방안 |
|----------|------|------|
| `preferred_language` | 기본 언어 (이 언어로 작성된 노드는 번역 안 함) | 기본 |
| `secondary_languages` | 2차 언어 목록 (이 언어들도 번역 안 함, 최대 3개) | 방안 2/3 |
| `skip_english_translation` | 영어 텍스트 번역 생략 여부 (기본: true) | 방안 1/3 |

**예시:**
```
한국어 사용자, 일본어 학습 맵 작성자:
  preferred_language = 'ko'
  secondary_languages = ['ja']
  skip_english_translation = true
  → ko, ja, en 으로 작성된 노드는 모두 번역 안 함
  → 그 외 언어(zh, fr 등)로 작성된 노드는 번역됨
```

### 2.2 레벨 2 — 맵별 번역 정책 (방안 2/3 맵 단위 override)

특정 맵에서만 다른 번역 정책을 적용할 때 사용한다.  
`NULL`이면 사용자 기본 설정을 그대로 따른다.

```json
// maps.translation_policy_json 예시

// 일본어 학습 맵 — 이 맵에서만 ja를 번역하지 않음
{
  "skipLanguages": ["ja"],
  "skipEnglish": true
}

// 글로벌 협업 맵 — 이 맵에서만 영어도 번역 대상으로 처리
{
  "skipLanguages": [],
  "skipEnglish": false
}

// 정책 없음 (사용자 기본 설정 따름)
null
```

**맵별 정책이 필요한 이유:**

```
사용자 설정: secondary_languages = ['ja']

  맵 A — 일본어 학습 맵:
    → 사용자 설정 또는 맵 정책으로 ja 번역X  ✅ 원하는 동작

  맵 B — 국제 협업 맵 (일본 동료와 작업):
    → 맵 정책: skipLanguages=[] → ja도 번역O  ✅ 원하는 동작

  맵 정책 없으면 맵 B의 일본어 노드도 번역이 안 돼서 문제 발생!
```

### 2.3 레벨 3 — 노드별 강제 ON/OFF (방안 4)

자동 감지 오류 보정이나 특정 노드 예외 처리에 사용한다.  
다른 모든 설정을 무시하고 최우선 적용된다.

| 값 | 동작 |
|----|------|
| `null` | 자동 정책 적용 (기본) |
| `'force_on'` | 강제 번역 (skip 설정도 무시하고 번역 실행) |
| `'force_off'` | 강제 번역 금지 (모든 열람자에게 원문 표시) |

---

## 3. 번역 여부 결정 알고리즘 (shouldTranslate)

```typescript
type SupportedLanguage =
  | 'ko' | 'en' | 'ja' | 'zh' | 'zh-TW'
  | 'fr' | 'de' | 'es' | 'pt' | 'ru'
  | 'ar' | 'vi' | 'th';

interface NodeTranslationMeta {
  text_lang: string;                               // 작성 언어
  translation_mode: 'auto' | 'skip';              // 저장 시 자동 결정
  translation_override: 'force_on' | 'force_off' | null;  // 노드별 수동 설정
}

interface MapTranslationPolicy {
  skipLanguages: SupportedLanguage[];
  skipEnglish: boolean | null;  // null = 사용자 설정 따름
}

interface ViewerSettings {
  preferredLanguage: SupportedLanguage;
  secondaryLanguages: SupportedLanguage[];
  skipEnglish: boolean;
}

type TranslateSkipReason =
  | 'force_off'           // 노드 강제 OFF
  | 'same_language'       // 기본 언어 일치
  | 'map_policy'          // 맵 정책으로 skip
  | 'secondary_language'  // 2차 언어 일치
  | 'english_skip'        // 영어 공용어 skip
  | 'author_english';     // 비영어권 작성자가 영어 작성

type TranslateDecision = {
  shouldTranslate: boolean;
  reason: TranslateSkipReason | 'translate' | 'force_on';
};

function shouldTranslate(
  node: NodeTranslationMeta,
  viewer: ViewerSettings,
  mapPolicy: MapTranslationPolicy | null,
): TranslateDecision {

  // ── 레벨 3: 노드별 override (최우선) ─────────────────────
  if (node.translation_override === 'force_off') {
    return { shouldTranslate: false, reason: 'force_off' };
  }
  if (node.translation_override === 'force_on') {
    return { shouldTranslate: true, reason: 'force_on' };
  }

  // ── 기존 translation_mode (저장 시 결정된 값) ─────────────
  // 비영어권 작성자가 영어/2차언어로 쓴 노드 → skip
  if (node.translation_mode === 'skip') {
    return { shouldTranslate: false, reason: 'author_english' };
  }

  // ── 기본 언어 일치 ────────────────────────────────────────
  if (node.text_lang === viewer.preferredLanguage) {
    return { shouldTranslate: false, reason: 'same_language' };
  }

  // ── 레벨 2: 맵별 정책 ─────────────────────────────────────
  if (mapPolicy !== null) {
    if (mapPolicy.skipLanguages.includes(node.text_lang as SupportedLanguage)) {
      return { shouldTranslate: false, reason: 'map_policy' };
    }
    const mapSkipEnglish = mapPolicy.skipEnglish ?? viewer.skipEnglish;
    if (mapSkipEnglish && node.text_lang === 'en') {
      return { shouldTranslate: false, reason: 'map_policy' };
    }
  } else {
    // ── 레벨 1: 사용자 기본 설정 ──────────────────────────────
    if (viewer.secondaryLanguages.includes(node.text_lang as SupportedLanguage)) {
      return { shouldTranslate: false, reason: 'secondary_language' };
    }
    if (viewer.skipEnglish && node.text_lang === 'en') {
      return { shouldTranslate: false, reason: 'english_skip' };
    }
  }

  // ── 번역 실행 ─────────────────────────────────────────────
  return { shouldTranslate: true, reason: 'translate' };
}
```

---

## 4. translation_mode 결정 로직 (노드 저장 시)

노드를 저장할 때 자동으로 `translation_mode`를 결정한다.

```typescript
function determineTranslationMode(
  detectedLang: string,
  author: ViewerSettings,
  mapPolicy: MapTranslationPolicy | null,
): 'auto' | 'skip' {

  // 기본 언어와 동일 언어로 작성 → auto (번역 대상)
  if (detectedLang === author.preferredLanguage) return 'auto';

  // 맵 정책이 있는 경우: 맵의 skipLanguages에 포함되면 skip
  if (mapPolicy?.skipLanguages.includes(detectedLang as SupportedLanguage)) {
    return 'skip';
  }

  // 맵 정책 없는 경우: 사용자 2차 언어에 포함되면 skip
  if (!mapPolicy && author.secondaryLanguages.includes(detectedLang as SupportedLanguage)) {
    return 'skip';
  }

  // 영어 skip 설정 + 비영어권 작성자가 영어로 작성 → skip
  const skipEnglish = mapPolicy?.skipEnglish ?? author.skipEnglish;
  if (skipEnglish && detectedLang === 'en' && author.preferredLanguage !== 'en') {
    return 'skip';
  }

  return 'auto';
}
```

### 결정 테이블

| 작성자 기본 언어 | 2차 언어 | skipEnglish | 작성 언어 | translation_mode |
|----------------|---------|------------|----------|-----------------|
| ko | ja | true | ko | auto |
| ko | ja | true | ja | **skip** (2차 언어) |
| ko | ja | true | en | **skip** (영어 공용어) |
| ko | ja | true | zh | auto (번역 대상) |
| ko | ja | false | en | auto (번역 대상) |
| en | - | true | en | auto |
| en | - | - | ko | auto (번역 대상) |

---

## 5. 언어 자동 감지

작성자가 언어를 수동 선택하지 않아도 자동으로 `text_lang`을 결정한다.

```bash
npm install franc-min  # 경량 언어 감지 라이브러리 (82개 언어 지원)
```

```typescript
import { franc } from 'franc-min';

// ISO 639-3 → ISO 639-1 매핑 테이블
const LANG_MAP: Record<string, SupportedLanguage> = {
  kor: 'ko', eng: 'en', jpn: 'ja',
  zho: 'zh', fra: 'fr', deu: 'de',
  spa: 'es', por: 'pt', rus: 'ru',
  ara: 'ar', vie: 'vi', tha: 'th',
};

function detectLanguage(text: string, fallback: SupportedLanguage): SupportedLanguage {
  if (!text || text.trim().length < 3) return fallback;

  const detected = franc(text, { minLength: 3 });
  if (detected === 'und') return fallback;  // 감지 실패

  return LANG_MAP[detected] ?? fallback;
}
```

**감지 실패 케이스 및 처리:**

| 케이스 | 예시 | 처리 |
|--------|------|------|
| 3자 미만 | "AI", "OK" | 작성자 기본 언어로 fallback |
| 감지 실패 | 특수문자만 | 작성자 기본 언어로 fallback |
| 지원 외 언어 | 힌디어 | 작성자 기본 언어로 fallback |
| 영어/숫자 혼합 | "iPhone 15 Pro" | 영어로 감지 → skip 처리 |

---

## 6. 번역 파이프라인

### 6.1 전체 흐름

```
노드 편집 확정 (Enter / blur)
        │
        ▼
text_hash 계산 (SHA-256[:16])
nodes.text_lang, text_hash, translation_mode, translation_override 저장
        │
        ├── translation_mode = 'skip' → 번역 큐 투입 안 함 (종료)
        │
        └── translation_mode = 'auto'
                │
                ▼
        translation_jobs 큐 투입 (BullMQ)
                │
                ▼
        Translation Worker (VM-05)
                │
                ▼
        1차: DeepL API
        실패 시 2차: LLM (GPT) fallback
                │
                ▼
        node_translations 테이블 저장 (PostgreSQL, 영구)
        Redis 캐시 저장 (Sliding TTL 30분, Max 6시간)
                │
                ▼
        WebSocket broadcast: translation:ready 이벤트
                │
                ▼
        모든 열람자 화면 자동 업데이트
```

### 6.2 번역 트리거 시점

```
타이핑 중     → 번역 요청 X (API 비용 방지)
Enter 키      → 번역 트리거 ✅
blur 이벤트   → 번역 트리거 ✅
```

### 6.3 번역 엔진 전략

| 순위 | 엔진 | 용도 | 비용 |
|------|------|------|------|
| 1차 | DeepL API | 일반 텍스트, 빠른 번역 | 저렴 |
| 2차 | LLM (GPT 등) | DeepL 미지원 언어, 전문 용어, 문맥 필요 시 | 고가 (fallback만) |

```bash
# 환경변수
TRANSLATION_PROVIDER=deepl              # deepl / openai / hybrid
TRANSLATION_DEEPL_API_KEY=your_key
TRANSLATION_DEFAULT_TARGETS=ko,en,ja   # 기본 번역 대상 언어
TRANSLATION_SKIP_SAME_LANGUAGE=true
```

---

## 7. Redis 캐시 전략

### 7.1 TTL 정책 (확정값)

```
저장 시 초기 TTL  : 2시간 + ±10분 jitter
Sliding TTL      : 30분 (접근 시마다 갱신)
절대 Max TTL     : 6시간
maxmemory        : 512MB
eviction policy  : allkeys-lru
```

| TTL 방식 | 값 | 설명 |
|---------|-----|------|
| 초기 저장 | 2시간 | 처음 번역 저장 시 |
| Sliding | 30분 | 캐시 조회 시마다 TTL 리셋 |
| Max | 6시간 | 절대 상한 |

**이유**: 번역 캐시는 시간 기반이 아닌 이벤트 기반 변경 데이터이므로,  
메모리 관리 목적으로만 TTL을 설정한다.  
Redis Miss 발생 시 PostgreSQL에서 수 ms 만에 재로드되므로 데이터 손실 없음.

### 7.2 Thundering Herd 방지 (Jitter)

```typescript
const TTL_BASE = 7200;    // 2시간
const TTL_JITTER = 600;   // ±10분
const ttl = TTL_BASE + Math.floor(Math.random() * TTL_JITTER);
await redis.setex(key, ttl, value);
```

### 7.3 캐시 무효화 트리거

| 이벤트 | 처리 |
|--------|------|
| 노드 텍스트 수정 | text_hash 변경 → Redis DEL + 재번역 큐 투입 |
| 노드 삭제 | Redis DEL (PostgreSQL CASCADE) |
| TTL 만료 | Redis 자동 삭제, PostgreSQL 유지 |
| Redis 재시작 | 다음 조회 시 PostgreSQL에서 재로드 |

### 7.4 환경변수

```bash
TRANSLATION_CACHE_TTL_INITIAL=7200        # 초기 TTL: 2시간
TRANSLATION_CACHE_TTL_SLIDING=1800        # Sliding TTL: 30분
TRANSLATION_CACHE_TTL_MAX=21600           # Max TTL: 6시간
TRANSLATION_CACHE_TTL_JITTER=600          # Jitter: ±10분
TRANSLATION_CACHE_MAX_MEMORY=512mb        # Redis 메모리 상한
TRANSLATION_CACHE_EVICTION_POLICY=allkeys-lru
```

---

## 8. 캐시 무효화 상세 흐름

```
노드 텍스트 변경 확정
        │
        ▼
SHA-256[:16] 계산 → nodes.text_hash 업데이트 (DB)
        │
        ▼
Redis DEL tr:{nodeId}:* (모든 언어 캐시 즉시 삭제)
        │
        ▼
translation_mode 재결정 → translation_jobs 큐 투입 (재번역)
        │
        ▼
번역 완료 → node_translations 업데이트 → Redis 재캐시
```

---

## 9. 초기 맵 로딩 전략 (대형 맵 최적화)

```
맵 오픈
    │
    ▼
전체 노드 원문으로 즉시 로드 (렌더링 시작)
    │
    ▼
번역 필요 노드 식별
  (shouldTranslate = true AND text_lang ≠ viewerLang)
    │
    ▼
캐시된 번역 즉시 적용 (Redis/Memory Hit)
    │
    ▼
미캐시 노드 → Skeleton(회색 바) 표시
    │
    ▼
Background translate (배치 요청)
    │
    ▼
번역 완료 시 순차적으로 Skeleton → 번역본 교체
```

---

## 10. 프론트엔드 — 번역 표시 로직

### 10.1 노드 텍스트 표시

```typescript
const displayText = useMemo(() => {
  const decision = shouldTranslate(node, viewerSettings, mapPolicy);

  // 번역 불필요 → 원문 표시
  if (!decision.shouldTranslate) return node.text;

  // 번역 캐시 확인
  const cached = translationCache[node.id]?.[viewerLang];
  if (cached?.hash === node.text_hash) return cached.text;

  return null; // → Skeleton 표시
}, [node, viewerSettings, mapPolicy, translationCache]);
```

### 10.2 UX 상태별 표시

| 상태 | 표시 | 아이콘 |
|------|------|--------|
| 내 언어로 작성된 노드 | 원문 그대로 | 없음 |
| 유효한 번역 캐시 있음 | 번역본 표시 | 🔤 (클릭 → 원문 팝오버) |
| 번역 대기 중 | Skeleton (회색 바) | 없음 |
| 번역 실패 | 원문 표시 | 🔴 |
| force_off 노드 (편집자) | 원문 표시 | ⛔ |
| force_on 노드 (편집자) | 번역본 표시 | 🔁 |

### 10.3 원문 보기 기능 (오역 대응)

```
번역된 노드 hover 시:
  [딸기 🔤]

🔤 클릭 시:
  ┌─────────────────────────┐
  │ 원문 (English)           │
  │ strawberry               │
  │ [번역본으로 돌아가기]     │
  └─────────────────────────┘
```

원문 보기는 API 호출 없이 클라이언트 state 전환으로 처리한다.

### 10.4 WebSocket 이벤트

```typescript
// 번역 완료 이벤트 수신 → 캐시 갱신 → 화면 자동 업데이트
wsClient.on('translation:ready', ({ nodeId, targetLang, translatedText, textHash }) => {
  translationStore.setTranslation(nodeId, targetLang, translatedText, textHash);
});
```

---

## 11. 실시간 협업 시나리오

### 시나리오: 한국어 + 영어 사용자 협업

```
User A (ko, secondary=[], skipEnglish=true)
User B (en, secondary=[], skipEnglish=true)

[초기 상태]
User A가 작성: 과일 → 사과, 바나나, 토마토
                (ko)   (ko)   (ko)    (ko)

[User B가 맵 오픈]
  Fruit → apple, banana, tomato  (전부 번역됨)

[User B가 strawberry 노드 추가]
  text_lang='en', author.preferredLanguage='en'
  → translation_mode='auto'  (영어권 사용자가 영어로 작성)

  User B 화면: strawberry  (같은 언어, 번역X)
  User A 화면: 딸기         (en→ko 번역됨)

[User A가 오렌지 추가]
  text_lang='ko', translation_mode='auto'

  User A 화면: 오렌지  (같은 언어, 번역X)
  User B 화면: orange  (ko→en 번역됨)

[User A가 "React.js" 추가]
  franc 감지: en
  author.preferredLanguage='ko', skipEnglish=true
  → translation_mode='skip'

  User A 화면: React.js  (skip)
  User B 화면: React.js  (skip — english_skip)
  User C(ja) 화면: React.js  (skip)
```

### 시나리오: 일본어 학습 맵

```
User A (ko, secondary=['ja'], skipEnglish=true)
맵 설정: translation_policy = { skipLanguages: ['ja'], skipEnglish: true }

User A가 작성:
  과일 (ko, auto)
   ├ りんご (ja, skip)   ← secondary_language로 skip
   ├ バナナ (ja, skip)
   └ apple (en, skip)    ← skipEnglish로 skip

User A 화면: 과일, りんご, バナナ, apple  (모두 원문)
User B (en) 화면: Fruit, りんご, バナナ, apple
  ※ りんご, バナナ는 맵 정책(skipLanguages=['ja'])으로 번역X
  ※ apple은 english_skip으로 번역X
User C (ja) 화면: 果物, りんご, バナナ, apple
```

---


## 12. 실시간 협업 채팅 번역 정책 (V2 확장)

실시간 협업 채팅의 번역은 노드 텍스트 번역과 목적이 다르다.
노드 번역이 **문서 열람 최적화**라면, 채팅 번역은 **현재 접속한 협업자 간 실시간 이해 보조**가 목적이다.

### 12-1. UX 원칙

- 채팅은 현재 접속한 협업자끼리만 사용하는 라이브 패널이다.
- unread count / read receipt / 메시지 상태 추적은 제공하지 않는다.
- 개인 설정으로 채팅 번역 ON/OFF 가능.
- 번역 표시 시에도 **원문 + 번역문**을 함께 보여 오역 대응 가능해야 한다.
- 같은 언어 사용자는 번역 없이 원문만 본다.

### 12-2. 수신자별 표시, 언어별 캐시

잘못된 접근:

```
메시지 1개 → 사용자 수만큼 번역 API 호출
```

권장 구조:

```
메시지 1개 저장
  → ko 번역 1개
  → en 번역 1개
  → ja 번역 1개
  → 각 언어 그룹에 fan-out
```

즉, 외부 번역 호출 단위는 **recipient별**이 아니라 **targetLang별**이어야 한다.
같은 방에 일본어 사용자가 5명 있어도 `ja` 번역은 1회만 생성/캐시한다.

### 12-3. 언어 감지 운영 정책

짧은 채팅은 언어 감지 오탐이 높으므로 노드 번역보다 보수적으로 처리한다.

- 사용자 프로필의 기본 작성 언어를 1차 힌트로 사용
- 3자 이하 혹은 `ok`, `네`, `ㅇㅋ` 같은 초단문은 감지 생략 가능
- 길이가 일정 이상일 때만 자동 감지 수행
- 감지 신뢰도가 낮으면 원문만 우선 표시
- 동일 언어 또는 번역 OFF 사용자는 worker enqueue 자체를 생략

### 12-4. 실시간 처리 흐름

```
chat:message:send
  → chat_messages 원문 저장
  → targetLang별 번역 필요 여부 판정
  → BullMQ translate-chat job enqueue
  → chat:translation:ready 이벤트 broadcast
  → 각 클라이언트가 원문+번역문 동시 렌더링
```

### 12-5. 캐시 키 예시

```text
chat:translation:{messageId}:{targetLang}
```

- Redis: 짧은 TTL 기반 핫 캐시
- PostgreSQL: 재접속 / 최근 메시지 복구용 영속 캐시
- message 원문이 수정되면 `source_text_hash` 기준으로 무효화

## 13. DB 스키마 변경 사항 (최종)

### 13.1 users 테이블 추가

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS secondary_languages       VARCHAR(20)[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skip_english_translation  BOOLEAN        NOT NULL DEFAULT TRUE;

ALTER TABLE public.users
  ADD CONSTRAINT chk_secondary_languages_max
    CHECK (array_length(secondary_languages, 1) <= 3
           OR secondary_languages = '{}');
```

### 13.2 maps 테이블 추가

```sql
ALTER TABLE public.maps
  ADD COLUMN IF NOT EXISTS translation_policy_json  JSONB  NULL  DEFAULT NULL;
  -- NULL = 사용자 기본 설정 따름
  -- 구조: { "skipLanguages": ["ja"], "skipEnglish": true }

COMMENT ON COLUMN public.maps.translation_policy_json
  IS '맵별 번역 정책. NULL이면 사용자 기본 설정 사용. skipLanguages: 번역 생략 언어 배열, skipEnglish: 영어 번역 생략 여부';
```

### 13.3 nodes 테이블 추가

```sql
ALTER TABLE public.nodes
  ADD COLUMN IF NOT EXISTS translation_mode             VARCHAR(10)  NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS translation_override         VARCHAR(10)  NULL     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS author_preferred_language    VARCHAR(20)  NULL;

ALTER TABLE public.nodes
  ADD CONSTRAINT chk_translation_mode
    CHECK (translation_mode IN ('auto', 'skip')),
  ADD CONSTRAINT chk_translation_override
    CHECK (translation_override IN ('force_on', 'force_off')
           OR translation_override IS NULL);

CREATE INDEX IF NOT EXISTS idx_nodes_translation_mode
  ON public.nodes (map_id, translation_mode)
  WHERE translation_mode = 'skip';
```

### 13.4 node_translations 테이블 (기존 유지)

```sql
CREATE TABLE IF NOT EXISTS public.node_translations (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id             UUID         NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_lang         VARCHAR(20)  NOT NULL,
  translated_text     TEXT         NOT NULL,
  source_text_hash    VARCHAR(128) NOT NULL,
  model_version       VARCHAR(60)  NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (node_id, target_lang)
);
```

---

## 14. 설정 화면 UX

### 14.1 사용자 설정 — 언어 설정

```
설정 > 언어 설정

┌──────────────────────────────────────────────────┐
│ 기본 언어                                          │
│ ┌──────────────────┐                              │
│ │ 한국어 ▼         │  이 언어로 작성된 노드는 번역 안 함│
│ └──────────────────┘                              │
│                                                    │
│ 2차 언어 (번역하지 않을 추가 언어, 최대 3개)         │
│ 학습 맵, 전문 용어 등 번역이 필요 없는 언어를 추가    │
│ ┌──────────────────────────────────┐               │
│ │ + 언어 추가                       │               │
│ │  [日本語 (Japanese) ✕]           │               │
│ └──────────────────────────────────┘               │
│                                                    │
│ 영어 번역 생략               [ON ●────○]            │
│ 영어로 작성된 노드는 번역하지 않습니다               │
│ (기술 용어, 브랜드명, 고유명사 등)                   │
└──────────────────────────────────────────────────┘
```

### 13.2 맵 설정 — 번역 정책

```
맵 설정 > 번역 정책

┌──────────────────────────────────────────────────┐
│ 이 맵의 번역 정책                                   │
│                                                    │
│ ● 사용자 기본 설정 따름                             │
│ ○ 이 맵에서만 다르게 설정                           │
│                                                    │
│  [이 맵에서만 다르게 설정 선택 시 아래 활성화]        │
│                                                    │
│  번역하지 않을 언어                                  │
│  ┌──────────────────────────────────┐              │
│  │ + 언어 추가                       │              │
│  │  [日本語 ✕]                      │              │
│  └──────────────────────────────────┘              │
│                                                    │
│  영어 번역 생략     [ON ●────○]                     │
└──────────────────────────────────────────────────┘
```

### 13.3 노드별 번역 설정 (우클릭 메뉴)

```
노드 우클릭 > 번역 설정

  ┌──────────────────────────┐
  │ 번역 설정                 │
  │                          │
  │ ● 자동 (기본)             │  ← translation_override = null
  │ ○ 번역 강제 ON   🔁       │  ← translation_override = 'force_on'
  │ ○ 번역 강제 OFF  ⛔       │  ← translation_override = 'force_off'
  └──────────────────────────┘
```

---

## 15. 구현 순서 (최종)

| Step | 작업 | 관련 파일 |
|------|------|---------|
| 1 | DB 스키마 변경 (users, maps, nodes, node_translations) | schema.sql |
| 2 | franc 언어 감지 유틸 구현 | worker-translation.ts |
| 3 | translation_mode 결정 로직 구현 | NodeService |
| 4 | shouldTranslate 통합 알고리즘 구현 | translationUtils.ts |
| 5 | translation_jobs 큐 + Worker 구현 | worker-translation.ts |
| 6 | DeepL API 연동 | worker-translation.ts |
| 7 | Redis 캐시 서비스 (Sliding TTL + Jitter) | translationCacheService.ts |
| 8 | WebSocket translation:ready 이벤트 | WsGateway |
| 9 | 프론트엔드 번역 캐시 Store (Zustand) | translationStore.ts |
| 10 | 노드 렌더링 — Skeleton UI + 지구본 아이콘 | NodeText.tsx |
| 11 | 원문 팝오버 UI | NodeText.tsx |
| 12 | 사용자 설정 화면 (언어 설정) | SettingsPage.tsx |
| 13 | 맵 설정 화면 (번역 정책) | MapSettingsPanel.tsx |
| 14 | 노드 우클릭 메뉴 (번역 ON/OFF) | NodeContextMenu.tsx |
| 15 | 초기 맵 로딩 배치 번역 최적화 | EditorPage.tsx |

---

## 16. 난이도 평가

| 항목 | 난이도 | 비고 |
|------|--------|------|
| DB 스키마 변경 | 낮음 | ALTER TABLE 추가만 |
| franc 언어 감지 | 낮음 | 라이브러리 사용 |
| translation_mode 결정 로직 | 낮음 | 조건문 |
| shouldTranslate 통합 알고리즘 | 중간 | 3단계 계층 처리 |
| DeepL API 연동 | 낮음 | REST API |
| Redis Sliding TTL | 중간 | expire 갱신 로직 |
| WebSocket 연동 | 중간 | 기존 WS 인프라 활용 |
| Skeleton UI + 지구본 아이콘 | 중간 | React 상태 관리 |
| 원문 팝오버 | 낮음 | 클라이언트 state 전환 |
| 맵별 번역 정책 UI | 중간 | 설정 저장/적용 |
| 초기 로딩 최적화 | 중상 | 배치 처리, lazy load |
| **전체** | **중간~중상** | |

---

## 17. 전략적 가치

```
XMind, MindMeister, Miro → 다국어 번역 없음

easymindmap:
  ✅ 자동 언어 감지
  ✅ 3단계 번역 정책 (사용자/맵/노드)
  ✅ 영어 공용어 처리
  ✅ 2차 언어 설정 (학습 맵, 전문 용어)
  ✅ 노드별 수동 ON/OFF
  ✅ 원문 보기 (오역 대응)
  ✅ 실시간 협업 중 번역 동기화

= AI mindmap + multilingual collaboration
= 강력한 차별화 포인트
```

---

## 변경 이력

| 버전 | 날짜 | 주요 변경 |
|------|------|---------|
| v1.0 | 초기 | 기본 번역 파이프라인 (DeepL → DB → Redis) |
| v2.0 | 2026-03-30 | 방안 1~4 통합, translation_mode, franc, 원문 보기 |
| **v3.0** | **2026-03-30** | **맵별 번역 정책 추가 (레벨 2), shouldTranslate 3단계 계층, Redis TTL 전략 통합, DB 스키마 최종 확정** |
