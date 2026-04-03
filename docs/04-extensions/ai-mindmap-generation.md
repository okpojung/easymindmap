# easymindmap — AI Mindmap Generation

## 개요

사용자가 질문(Prompt)을 입력하면 LLM이 Markdown 계층 구조로 응답하고,
이를 NodeTree로 변환하여 Editor에 자동 반영하는 기능.

---

## 파이프라인

```
사용자 프롬프트 입력
  ↓
POST /ai/generate
  ↓
LLM API 호출 (OpenAI GPT-4 / Claude)
  ↓
Markdown 계층 구조 응답
  ↓
Markdown → NodeTree 파서
  ↓
DB 저장
  ↓
Editor 자동 반영
```

---

## 입력 스펙

```typescript
type AIGenerateRequest = {
  prompt: string;         // 사용자 질문
  maxDepth?: number;      // 기본: 3
  maxChildrenPerNode?: number;  // 기본: 5
  language?: 'ko' | 'en' | 'auto';  // 기본: auto
};
```

---

## LLM System Prompt

```
You are a mindmap generator. 
Given a topic or question, generate a structured mindmap in Markdown format.

Rules:
- Use # for root topic
- Use ## for level 1 children  
- Use ### for level 2 children
- Maximum depth: {maxDepth}
- Maximum children per node: {maxChildrenPerNode}
- Response ONLY in Markdown, no explanation text
- Keep node text concise (under 10 words per node)
- Language: {language}
```

---

## Markdown → NodeTree 파서

```typescript
function parseMarkdownToNodes(markdown: string): NodeObject[] {
  // # → depth 0 (root)
  // ## → depth 1
  // ### → depth 2
  // #### → depth 3
  // - 또는 * → 현재 depth의 자식으로 처리
}
```

---

## 출력 예시

**입력**: "Kubernetes 아키텍처를 설명해줘"

**LLM 응답**:
```markdown
# Kubernetes
## Control Plane
### API Server
### Scheduler
### Controller Manager
### etcd
## Worker Node
### kubelet
### kube-proxy
### Container Runtime
## 주요 오브젝트
### Pod
### Deployment
### Service
### ConfigMap
```

---

## 생성 제한

| 항목 | 제한값 |
|------|--------|
| 최대 depth | 4 |
| 노드당 최대 자식 | 7 |
| 노드 텍스트 최대 길이 | 50자 |
| 프롬프트 최대 길이 | 500자 |
| 분당 요청 제한 | 10회 (사용자당) |

---

## AI Workflow Mode (Extended)

> 상세 정의: `docs/01-product/AI-Executable-Workflow-PRD.md`

기존 AI 기능은 단순 mindmap 생성 기능이었으나,
확장 기능에서는 실행형 workflow 생성 기능을 포함한다.

---

### Workflow Generation

AI는 다음 구조를 생성한다:

- step node (short title — node 제목은 짧게, 식별 가능하게)
- structured note (description + code blocks — 명령어/설명/주의사항 포함)

```typescript
type WorkflowGenerateRequest = {
  prompt: string;          // 사용자 자연어 요청
  mode: 'workflow';        // 일반 mindmap과 구분
  language?: 'ko' | 'en' | 'auto';
};
```

---

### Execution-aware AI

AI는 다음을 지원한다:

- step 단위 실행 지원 (각 node를 독립 실행 단위로 처리)
- 오류 기반 재질문 (`POST /ai/workflow/resolve`)
- context 유지 (현재 step의 원래 목적 유지)
- 수정안 제시 (대체 명령어 또는 절차 제안)

---

### Workflow Cleanup

AI 결과는 단순 생성이 아니라 다음을 포함한다:

- 오류 해결 과정 통합 (step 문맥 내에서 흡수)
- 최종 절차 정제 (`POST /ai/workflow/cleanup`)
- 중간 실패 이력 제거 (map에는 최종 성공 절차만 남음)

---

### AI 제한 정책

- 협업 사용자 수 ≥ 2
  → AI 기능 비활성화 (generate / expand / workflow 모두 제한)
- 단독 편집 상태(접속자 1명)에서만 AI Workflow 기능 허용
- UI: AI 버튼 disabled + 안내 메시지 표시
