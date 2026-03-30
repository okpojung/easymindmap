# easymindmap — Markdown Export (EXPORT-01)

문서 버전: v2.0
결정일: 2026-03-29

> **[v2.0 주요 추가]**
> - 이미지 처리 정책 상세화 (배경 이미지, 첨부 이미지)
> - 태그 export 옵션 상세화
> - 접힌 노드(collapsed) 처리 정책 확정
> - Export API Request Body 옵션 정의

---

## 목적

NodeTree를 Markdown 헤더 계층 구조로 직렬화하여 `.md` 파일로 제공.

---

## Export API

```
POST /maps/{mapId}/export/markdown
```

**Request Body**
```json
{
  "includeCollapsed": true,
  "includeTags": true,
  "includeLinks": true,
  "includeNotes": true,
  "imageHandling": "omit",
  "tagFormat": "badge"
}
```

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `includeCollapsed` | boolean | `true` | 접힌 노드 포함 여부 |
| `includeTags` | boolean | `true` | 태그 export 여부 |
| `includeLinks` | boolean | `true` | 하이퍼링크 export 여부 |
| `includeNotes` | boolean | `true` | 노드 메모 export 여부 |
| `imageHandling` | string | `"omit"` | `"omit"` \| `"alt-text"` \| `"link"` |
| `tagFormat` | string | `"badge"` | `"badge"` \| `"hashtag"` \| `"list"` |

---

## 출력 형식

### 기본 규칙

| Node depth | Markdown 표현 |
|------------|---------------|
| 0 (root) | `# Root` |
| 1 | `## Level 1` |
| 2 | `### Level 2` |
| 3 | `#### Level 3` |
| 4+ | `#####` (5레벨 이상 동일) |

### 예시 출력

```markdown
# AI

## Machine Learning
`#AI` `#연구`

머신러닝은 데이터에서 패턴을 학습하는 AI의 한 분야입니다.

**참고 링크**
- [scikit-learn](https://scikit-learn.org)

### Supervised

### Unsupervised

## Deep Learning

### Transformer
```

---

## 1. 접힌 노드 (Collapsed) 처리 정책

> **확정 정책**: `collapsed: true`인 노드는 **화면 표시와 무관하게 항상 export에 포함**한다.

| 옵션 `includeCollapsed` | 동작 |
|-------------------------|------|
| `true` (기본값) | collapsed 노드 및 그 하위 subtree 전체 포함 |
| `false` | collapsed 노드의 **하위 subtree만 제외**, 해당 노드 자체는 포함 |

**`includeCollapsed: false` 예시**

```
AI (root)
 └ Machine Learning (collapsed: true)
     └ Supervised      ← 미포함
     └ Unsupervised    ← 미포함
```

출력:
```markdown
# AI

## Machine Learning
<!-- 하위 노드는 접힌 상태로 제외됨 -->
```

**근거**: collapsed는 "사용자가 임시로 숨긴 것"이므로 export 시 기본적으로 포함한다. 내보내기 전 확인 다이얼로그에서 옵션을 제공한다.

---

## 2. 태그 처리 정책

옵션 `includeTags: true`일 때, 노드에 태그가 있으면 헤더 바로 아래에 표시.

### tagFormat: "badge" (기본값)
```markdown
## Machine Learning
`#AI` `#연구`
```

### tagFormat: "hashtag"
```markdown
## Machine Learning
#AI #연구
```

### tagFormat: "list"
```markdown
## Machine Learning
**태그**: AI, 연구
```

`includeTags: false`이면 태그 행 자체를 출력하지 않는다.

---

## 3. 배경 이미지 처리 정책

Markdown은 이미지 스타일 정보(overlay, fit 등)를 표현할 수 없으므로 아래 정책을 따른다.

| 옵션 `imageHandling` | 동작 | 출력 예시 |
|----------------------|------|-----------|
| `"omit"` **(기본값)** | 배경 이미지 정보 완전 제외 | (없음) |
| `"alt-text"` | 이미지 존재 여부만 텍스트로 표시 | `> 🖼 배경 이미지 포함` |
| `"link"` | 이미지 URL을 Markdown 링크로 삽입 | `![배경 이미지](https://...)` |

**`imageHandling: "alt-text"` 출력 예시**
```markdown
## Machine Learning
> 🖼 배경 이미지 포함

머신러닝은...
```

**`imageHandling: "link"` 출력 예시**
```markdown
## Machine Learning
![배경 이미지](https://storage.mindmap.ai.kr/uploads/nodes/uuid/bg.png)

머신러닝은...
```

**근거**: Markdown은 이미지 overlay/opacity/fit 스타일을 표현할 수 없으므로 `omit`이 기본값이다. 첨부파일(node_attachments)은 이미지 처리와 별도로, `includeLinks` 옵션에 따라 파일명과 URL을 목록으로 출력한다.

---

## 4. 노드 메모 처리

`includeNotes: true`일 때, 노드에 메모가 있으면 헤더 바로 아래에 본문으로 추가.

```markdown
## Machine Learning

머신러닝은 데이터에서 패턴을 학습하는 AI의 한 분야입니다.

### Supervised
```

---

## 5. 하이퍼링크 처리

`includeLinks: true`일 때, 노드에 링크가 있으면 목록으로 추가.

```markdown
## Machine Learning

**참고 링크**
- [scikit-learn](https://scikit-learn.org)
- [Kaggle](https://kaggle.com)
```

---

## 6. 출력 순서 규칙

노드 한 개당 Markdown 출력 순서:

```
1. 헤더 (#, ##, ...)  ← node.text
2. 태그 행            ← includeTags: true + node.tags
3. 배경 이미지 행     ← imageHandling: "alt-text" 또는 "link"
4. 메모 본문          ← includeNotes: true + node.note
5. 하이퍼링크 목록    ← includeLinks: true + node.links
6. (하위 노드 재귀)
```

---

## 변환 알고리즘

```typescript
interface MarkdownExportOptions {
  includeCollapsed: boolean;
  includeTags: boolean;
  includeLinks: boolean;
  includeNotes: boolean;
  imageHandling: 'omit' | 'alt-text' | 'link';
  tagFormat: 'badge' | 'hashtag' | 'list';
}

function exportToMarkdown(
  nodes: NodeObject[],
  rootId: string,
  options: MarkdownExportOptions
): string {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const lines: string[] = [];

  function visit(nodeId: string, depth: number) {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    const hLevel = Math.min(depth + 1, 5);
    const hPrefix = '#'.repeat(hLevel);

    // 1. 헤더
    lines.push(`${hPrefix} ${node.text}`);

    // 2. 태그
    if (options.includeTags && node.tags && node.tags.length > 0) {
      const tagLine = formatTags(node.tags, options.tagFormat);
      lines.push(tagLine);
    }

    // 3. 배경 이미지
    if (options.imageHandling !== 'omit' && node.backgroundImage) {
      if (options.imageHandling === 'alt-text') {
        lines.push('> 🖼 배경 이미지 포함');
      } else if (options.imageHandling === 'link') {
        lines.push(`![배경 이미지](${node.backgroundImage.url})`);
      }
    }

    lines.push('');

    // 4. 메모
    if (options.includeNotes && node.note) {
      lines.push(node.note);
      lines.push('');
    }

    // 5. 링크
    if (options.includeLinks && node.hyperlinkIds && node.hyperlinkIds.length > 0) {
      lines.push('**참고 링크**');
      for (const link of node.links ?? []) {
        lines.push(`- [${link.label ?? link.url}](${link.url})`);
      }
      lines.push('');
    }

    // 6. 하위 노드
    const children = nodes
      .filter(n => n.parentId === nodeId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    for (const child of children) {
      // collapsed 정책 적용
      if (!options.includeCollapsed && node.collapsed) continue;
      visit(child.id, depth + 1);
    }
  }

  visit(rootId, 0);
  return lines.join('\n');
}

function formatTags(
  tags: Tag[],
  format: 'badge' | 'hashtag' | 'list'
): string {
  switch (format) {
    case 'badge':    return tags.map(t => `\`#${t.name}\``).join(' ');
    case 'hashtag':  return tags.map(t => `#${t.name}`).join(' ');
    case 'list':     return `**태그**: ${tags.map(t => t.name).join(', ')}`;
  }
}
```

---

## 파일명 규칙

- 맵 제목에서 특수문자 제거
- 공백은 언더스코어(`_`)로 치환
- 예: `"AI 개념 정리"` → `AI_개념_정리.md`

---

## 제한 사항

| 항목 | 제한 |
|------|------|
| 최대 노드 수 | 제한 없음 (서버에서 처리) |
| 최대 파일 크기 | 10MB (초과 시 경고) |
| 인코딩 | UTF-8 |
| imageHandling: "link" | 이미지 URL 유효성은 보장하지 않음 (만료 URL 가능) |
