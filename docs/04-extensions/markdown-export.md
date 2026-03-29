# easymindmap — Markdown Export (EXPORT-01)

## 목적

NodeTree를 Markdown 헤더 계층 구조로 직렬화하여 `.md` 파일로 제공.

---

## 출력 형식

### 기본 규칙

| Node depth | Markdown 표현 |
|------------|---------------|
| 0 (root) | `# Root` |
| 1 | `## Level 1` |
| 2 | `### Level 2` |
| 3 | `#### Level 3` |
| 4+ | `#####` (5레벨 이상은 동일하게 처리) |

### 예시 입력 (NodeTree)
```
AI
 ├ Machine Learning
 │  ├ Supervised
 │  └ Unsupervised
 └ Deep Learning
    └ Transformer
```

### 예시 출력 (Markdown)
```markdown
# AI

## Machine Learning

### Supervised

### Unsupervised

## Deep Learning

### Transformer
```

---

## 노드 노트 처리

노드에 `note` 필드가 있으면 헤더 바로 아래에 본문으로 추가.

```markdown
## Machine Learning

머신러닝은 데이터에서 패턴을 학습하는 AI의 한 분야입니다.

### Supervised
```

---

## 태그 처리

태그가 있는 경우 헤더 다음 줄에 Badge 형식으로 표시 (옵션).

```markdown
## Machine Learning
`#AI` `#연구`
```

---

## 하이퍼링크 처리

노드에 하이퍼링크가 있으면 목록으로 추가.

```markdown
## Machine Learning

**참고 링크**
- [scikit-learn](https://scikit-learn.org)
- [Kaggle](https://kaggle.com)
```

---

## Collapsed 노드 처리

`collapsed: true`인 노드도 Export에는 포함 (화면에서만 숨김).  
모든 노드를 동일하게 직렬화.

---

## 변환 알고리즘

```typescript
function exportToMarkdown(nodes: NodeObject[], rootId: string): string {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const lines: string[] = [];

  function visit(nodeId: string, depth: number) {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const hLevel = Math.min(depth + 1, 5);
    const hPrefix = '#'.repeat(hLevel);

    lines.push(`${hPrefix} ${node.text}`);
    lines.push('');

    if (node.note) {
      lines.push(node.note);
      lines.push('');
    }

    // 자식 노드를 orderIndex 순서로 처리
    const children = nodes
      .filter(n => n.parentId === nodeId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    for (const child of children) {
      visit(child.id, depth + 1);
    }
  }

  visit(rootId, 0);
  return lines.join('\n');
}
```

---

## API 연동

```
POST /maps/{mapId}/export/markdown

Response:
  Content-Type: text/markdown; charset=utf-8
  Content-Disposition: attachment; filename="{mapTitle}.md"
  Body: (Markdown 텍스트)
```

---

## 파일명 규칙

- 맵 제목에서 특수문자 제거
- 공백은 언더스코어(`_`)로 치환
- 예: "AI 개념 정리" → `AI_개념_정리.md`

---

## 제한 사항

| 항목 | 제한 |
|------|------|
| 최대 노드 수 | 제한 없음 (서버에서 처리) |
| 최대 파일 크기 | 10MB (초과 시 경고) |
| 인코딩 | UTF-8 |
