// rich — 사전 문장 속 꾸밈을 JSX 로 그린다 (i18n, 2026-10-05).
//
// 언어마다 어순이 달라 문장을 조각내 사전에 넣을 수 없다. 그래서 한 문장을
// 한 키로 두고, 꾸밀 자리를 문장 안에 표시한다:
//   **굵게**   `코드`   줄바꿈(\n)   {자리} ← slots 로 넘긴 JSX
//
//   rich(tr('auth.welcome.intro'))
//   rich(tr('inspector.ai.guide'), { marker: <code>@source</code> })
//   rich(tr('shell.user.confirmPrompt', { phrase }), undefined, { color: t.danger })

import { Fragment, type CSSProperties, type ReactNode } from 'react';

const TOKEN = /(\{\w+\}|\*\*.+?\*\*|`[^`]+`)/g;

export function rich(
  text: string,
  slots?: Record<string, ReactNode>,
  boldStyle?: CSSProperties,
): ReactNode {
  return text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line.split(TOKEN).filter(Boolean).map((part, j) => {
        const slot = /^\{(\w+)\}$/.exec(part);
        if (slot && slots && slot[1] in slots) return <Fragment key={j}>{slots[slot[1]]}</Fragment>;
        if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
          return <b key={j} style={boldStyle}>{part.slice(2, -2)}</b>;
        }
        if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return <code key={j}>{part.slice(1, -1)}</code>;
        return <Fragment key={j}>{part}</Fragment>;
      })}
    </Fragment>
  ));
}
