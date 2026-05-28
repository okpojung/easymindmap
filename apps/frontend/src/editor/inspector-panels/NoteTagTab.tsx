// NoteTagTab — tag chips + structured note (paragraph/code_block/warning/tip/checklist).
// Note structure follows the spec at docs/00-project-overview/vision.md § 6 and
// MVP scope: "structured note: paragraph / code_block / warning / tip / checklist".

import type { ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { InspectorSection } from './InspectorSection';
import { resolveTagColor } from '@/editor/node-renderer/resolveTagColor';

export function NoteTagTab({ t }: { t: ThemeTokens }) {
  return (
    <div>
      <InspectorSection t={t} title="태그">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {['MVP', 'Core', 'Q1'].map(tagName => {
            const tc = resolveTagColor(tagName, t);
            return (
              <span key={tagName} style={{
                fontSize: 11, fontWeight: 600,
                padding: '3px 7px', borderRadius: 3,
                background: tc.bg, color: tc.text,
                border: `1px solid ${tc.border}`,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                letterSpacing: 0.2,
              }}>
                #{tagName}
                <span style={{ opacity: 0.6, cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>×</span>
              </span>
            );
          })}
          <button style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 3,
            border: `1px dashed ${t.border}`, background: 'transparent',
            color: t.textMuted, cursor: 'pointer',
          }}>+ 태그</button>
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="노드 노트" action={<AddBlockMenu t={t} />}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <NoteBlock t={t} type="paragraph">
            노드 생성 · 읽기 · 수정 · 삭제 CRUD. 루트 노드는 삭제/이동 불가 제약.
          </NoteBlock>

          <NoteBlock t={t} type="code_block" lang="typescript">
{`type NodeCrud = {
  create: (parent: NodeId) => Node;
  update: (id: NodeId, patch: Partial<Node>) => void;
  remove: (id: NodeId) => void;
};`}
          </NoteBlock>

          <NoteBlock t={t} type="tip">
            Space 키로 자식 노드를, ⇧Space로 형제 노드를 빠르게 추가할 수 있어요.
          </NoteBlock>

          <NoteBlock t={t} type="checklist" items={[
            { done: true,  label: 'API 엔드포인트 정의' },
            { done: true,  label: 'Zustand 스토어 설계' },
            { done: false, label: 'Drag & Drop 이동' },
            { done: false, label: 'Collapse/Expand 동기화' },
          ]} />

          <NoteBlock t={t} type="warning">
            depth 50 초과는 DB CHECK 제약으로 거부됩니다.
          </NoteBlock>
        </div>
      </InspectorSection>
    </div>
  );
}

function AddBlockMenu({ t }: { t: ThemeTokens }) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '3px 7px', borderRadius: 5,
      background: t.primarySoft, color: t.primary,
      border: `1px solid ${t.primaryBorder}40`,
      fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
    }}>
      <I.Plus size={11} /> 블록 추가
    </button>
  );
}

type BlockType = 'paragraph' | 'code_block' | 'warning' | 'tip' | 'checklist';

interface NoteBlockProps {
  t: ThemeTokens;
  type: BlockType;
  lang?: string;
  children?: ReactNode;
  items?: { done: boolean; label: string }[];
}

function NoteBlock({ t, type, lang, children, items }: NoteBlockProps) {
  const meta = {
    paragraph:  { icon: '¶',   label: '문단',                   color: t.textMuted },
    code_block: { icon: '</>', label: `코드 · ${lang || 'text'}`, color: t.accent    },
    warning:    { icon: '⚠',   label: '경고',                   color: t.danger    },
    tip:        { icon: '💡',  label: '팁',                     color: t.primary   },
    checklist:  { icon: '☑',   label: '체크리스트',             color: t.success   },
  }[type];

  const bg = {
    paragraph: t.surfaceAlt,
    code_block: t.surfaceSunken,
    warning: t.name === 'dark' ? '#3B1414' : '#FEE2E2',
    tip: t.primarySoft,
    checklist: t.surfaceAlt,
  }[type];

  const leftBorder = {
    paragraph: 'transparent',
    code_block: t.accent,
    warning: t.danger,
    tip: t.primary,
    checklist: t.success,
  }[type];

  return (
    <div style={{
      borderRadius: 6,
      background: bg,
      borderLeft: `3px solid ${leftBorder}`,
      border: `1px solid ${t.border}`,
      borderLeftColor: leftBorder,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 8px 3px',
        fontSize: 9.5, fontWeight: 700,
        color: meta.color, letterSpacing: 0.3,
        textTransform: 'uppercase',
        borderBottom: type === 'paragraph' ? 'none' : `1px solid ${t.divider}`,
      }}>
        <span style={{ fontSize: 10 }}>{meta.icon}</span>
        <span>{meta.label}</span>
        {type === 'code_block' && (
          <button style={{
            marginLeft: 'auto', padding: '1px 6px',
            background: 'transparent', border: `1px solid ${t.border}`,
            borderRadius: 3, fontSize: 9.5, color: t.textMuted,
            cursor: 'pointer', fontWeight: 600,
          }}>Copy</button>
        )}
      </div>

      <div style={{ padding: '6px 10px 8px' }}>
        {type === 'paragraph' && (
          <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5 }}>{children}</div>
        )}
        {type === 'code_block' && (
          <pre style={{
            margin: 0, fontSize: 11, lineHeight: 1.5,
            color: t.text,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            whiteSpace: 'pre', overflow: 'auto',
          }}>{children}</pre>
        )}
        {(type === 'warning' || type === 'tip') && (
          <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5 }}>{children}</div>
        )}
        {type === 'checklist' && items && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {items.map((item, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 12, lineHeight: 1.4,
                color: item.done ? t.textMuted : t.text,
                textDecoration: item.done ? 'line-through' : 'none',
              }}>
                <span style={{
                  width: 13, height: 13, borderRadius: 3,
                  border: `1.5px solid ${item.done ? t.success : t.borderStrong}`,
                  background: item.done ? t.success : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {item.done && <I.Check size={9} style={{ color: '#fff' }} />}
                </span>
                {item.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
