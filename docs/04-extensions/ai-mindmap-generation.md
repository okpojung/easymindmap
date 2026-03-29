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
