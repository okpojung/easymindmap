---
title: 문서 머리말이 있는 파일
emm:
  template: tree-progtree
  levels:
    2:
      shape: rounded
      font: 15
markmap:
  colorFreezeLevel: 2
---

# 배포 절차

문서 맨 앞의 `---` 블록은 CommonMark 가 아니다. 걷어내지 않으면 표준
파서가 수평선 + setext 헤딩으로 읽어 **가짜 노드**를 만든다.

## 준비

- 저장소 받기
- 의존성 설치

## 실행

> 순서를 지킨다.

```bash
npm run build
npm run deploy
```

## 확인

| 항목 | 방법 |
|---|---|
| 상태 | `systemctl status` |
| 로그 | `journalctl -u app` |
