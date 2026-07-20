// NoteTagTab — tag chips + structured note (paragraph/code_block/table/checklist)
// editor, wired to the selected node via documentStore.

import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { NoteBlock as NoteBlockData, NoteBlockType } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { InspectorSection } from './InspectorSection';
import { resolveTagColor } from '@/editor/node-renderer/resolveTagColor';
import { sanitizeRichHtml } from '@/utils/sanitizeRichHtml';

// 코드 블록 언어 목록.
// [서버 연결 예정] Supabase 연동 시 이 하드코딩 목록은 code_languages
// 테이블로 이관되어 시스템 관리자 설정 메뉴에서 추가·수정·삭제한다
// (docs/02-domain/db-schema.md §향후 관리 테이블, 32-settings.md 참조).
const CODE_LANGUAGES = [
  'Shell', 'JavaScript', 'TypeScript', 'Node', 'Python', 'PHP', 'Java',
  'C', 'C++', 'C#', 'Go', 'Rust', 'SQL', 'HTML', 'CSS', 'JSON', 'YAML',
  'Markdown', '기타',
];

// 노트 블록 입력창 높이(행 수) — 길이를 조절하려면 이 숫자만 바꾸면 된다.
// (docs/03-editor-core/node/04-node-content.md §UI 조정 가이드 참조)
const NOTE_INPUT_ROWS: Record<string, number> = {
  paragraph: 15,
  code_block: 15,
  table: 15,
};

const BLOCK_TYPES: { type: NoteBlockType; label: string }[] = [
  { type: 'paragraph', label: '문단' },
  { type: 'code_block', label: '코드' },
  { type: 'table', label: '표' },
  { type: 'checklist', label: '체크' },
];

export function NoteTagTab({ t, selectedId }: { t: ThemeTokens; selectedId: string | null }) {
  const map = useDocumentStore((s) => s.map);
  const addNodeTag = useDocumentStore((s) => s.addNodeTag);
  const removeNodeTag = useDocumentStore((s) => s.removeNodeTag);
  const addNoteBlock = useDocumentStore((s) => s.addNoteBlock);
  const updateNoteBlock = useDocumentStore((s) => s.updateNoteBlock);
  const removeNoteBlock = useDocumentStore((s) => s.removeNoteBlock);

  const [tagDraft, setTagDraft] = useState('');

  const node = findNodeInMap(map, selectedId);
  const disabled = !selectedId || !node;
  const tags = node?.tags ?? (node?.tag ? [node.tag] : []);
  const notes = node?.notes ?? [];

  const commitTag = () => {
    const v = tagDraft.trim();
    if (v && selectedId) addNodeTag(selectedId, v);
    setTagDraft('');
  };

  return (
    <div style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <InspectorSection t={t} title="태그">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {tags.map((tagName) => {
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
                <span
                  onClick={() => selectedId && removeNodeTag(selectedId, tagName)}
                  style={{ opacity: 0.6, cursor: 'pointer', fontSize: 11, lineHeight: 1 }}
                >×</span>
              </span>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTag(); }}
            placeholder="태그 입력 후 Enter"
            style={{
              flex: 1, fontSize: 11, padding: '4px 7px', borderRadius: 4,
              border: `1px solid ${t.border}`, background: t.surface, color: t.text,
              outline: 'none',
            }}
          />
          <button onClick={commitTag} style={{
            fontSize: 11, padding: '4px 8px', borderRadius: 4,
            border: `1px solid ${t.primaryBorder}40`, background: t.primarySoft,
            color: t.primary, cursor: 'pointer', fontWeight: 600,
          }}>추가</button>
        </div>
      </InspectorSection>

      <InspectorSection
        t={t}
        title="노드 노트"
        action={
          <div style={{ display: 'flex', gap: 3 }}>
            {BLOCK_TYPES.map((b) => {
              // 문단/코드/표는 노드당 1개만 — 이미 있으면 추가 비활성.
              // 체크리스트만 여러 개 허용.
              const exists =
                b.type !== 'checklist' && notes.some((n) => n.type === b.type);
              return (
                <button key={b.type}
                  onClick={() => !exists && selectedId && addNoteBlock(selectedId, b.type)}
                  disabled={exists}
                  title={exists ? `${b.label} 블록은 노드당 1개만 추가할 수 있습니다` : `${b.label} 블록 추가`}
                  style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                    background: exists ? t.surfaceAlt : t.primarySoft,
                    color: exists ? t.textSubtle : t.primary,
                    border: `1px solid ${exists ? t.border : `${t.primaryBorder}40`}`,
                    cursor: exists ? 'default' : 'pointer',
                    opacity: exists ? 0.6 : 1,
                  }}>+{b.label}</button>
              );
            })}
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {notes.length === 0 && (
            <div style={{ fontSize: 10.5, color: t.textSubtle, lineHeight: 1.5 }}>
              위 버튼으로 노트 블록을 추가하세요. 문단·코드·표는 노드당
              1개, 체크리스트는 여러 개 추가할 수 있습니다.
            </div>
          )}
          {notes.map((block) => (
            <NoteBlockEditor
              key={block.id}
              t={t}
              block={block}
              onChange={(patch) => selectedId && updateNoteBlock(selectedId, block.id, patch)}
              onRemove={() => selectedId && removeNoteBlock(selectedId, block.id)}
            />
          ))}
        </div>
      </InspectorSection>
    </div>
  );
}

const BLOCK_META: Record<string, { icon: string; label: string }> = {
  paragraph: { icon: '¶', label: '문단' },
  code_block: { icon: '</>', label: '코드' },
  table: { icon: '⊞', label: '표' },
  checklist: { icon: '☑', label: '체크리스트' },
  // 폐기된 옛 타입(warning/tip) 데이터 하위호환 — 문단으로 취급
  warning: { icon: '¶', label: '문단' },
  tip: { icon: '¶', label: '문단' },
};

function NoteBlockEditor({
  t, block, onChange, onRemove,
}: {
  t: ThemeTokens;
  block: NoteBlockData;
  onChange: (patch: Partial<NoteBlockData>) => void;
  onRemove: () => void;
}) {
  // 노트 글꼴·크기 (맵 설정) — 뷰어 팝업과 동일 규칙 (기본 13pt)
  const noteFont = useDocumentStore((st) => st.map.settings?.noteFont);
  const noteFs = noteFont?.size && noteFont.size > 0 ? noteFont.size : 13;
  const noteFamily = noteFont?.family && noteFont.family.trim() ? noteFont.family : undefined;
  const meta = BLOCK_META[block.type] ?? BLOCK_META.paragraph;
  const accent =
    block.type === 'code_block' ? t.accent
    : block.type === 'table' ? t.primary
    : block.type === 'checklist' ? t.success
    : t.borderStrong;

  return (
    <div style={{
      borderRadius: 6,
      background: t.surfaceAlt,
      border: `1px solid ${t.border}`,
      borderLeft: `3px solid ${accent}`,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 8px',
        fontSize: 9.5, fontWeight: 700, color: accent,
        letterSpacing: 0.3, textTransform: 'uppercase',
        borderBottom: `1px solid ${t.divider}`,
      }}>
        <span style={{ fontSize: 10 }}>{meta.icon}</span>
        <span>{meta.label}</span>
        {block.type === 'code_block' && (
          <select
            value={block.lang ?? ''}
            onChange={(e) => onChange({ lang: e.target.value })}
            style={{
              width: 104, fontSize: 9.5, padding: '1px 3px', borderRadius: 3,
              border: `1px solid ${t.border}`, background: t.surface,
              color: t.text, outline: 'none', fontWeight: 500,
              textTransform: 'none', letterSpacing: 0, cursor: 'pointer',
            }}
          >
            <option value="">언어 선택</option>
            {CODE_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
        )}
        <button onClick={onRemove} title="블록 삭제" style={{
          marginLeft: 'auto', background: 'transparent', border: 'none',
          color: t.textMuted, cursor: 'pointer', fontSize: 13, lineHeight: 1,
        }}>×</button>
      </div>

      <div style={{ padding: '6px 8px' }}>
        {block.type === 'checklist' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span
              onClick={() => onChange({ checked: !block.checked })}
              style={{
                width: 14, height: 14, borderRadius: 3, cursor: 'pointer',
                border: `1.5px solid ${block.checked ? t.success : t.borderStrong}`,
                background: block.checked ? t.success : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
            >
              {block.checked && <I.Check size={9} style={{ color: '#fff' }} />}
            </span>
            <input
              value={block.text}
              onChange={(e) => onChange({ text: e.target.value })}
              placeholder="할 일"
              style={{
                flex: 1, fontSize: 12, border: 'none', outline: 'none',
                background: 'transparent', color: t.text,
                textDecoration: block.checked ? 'line-through' : 'none',
              }}
            />
          </div>
        ) : (
          <textarea
            // 새로 추가된 빈 블록은 바로 입력·붙여넣기할 수 있게 자동 포커스
            // (포커스가 없으면 Ctrl+V가 노드 쪽으로 가는 혼동 방지)
            autoFocus={block.text === ''}
            value={block.text}
            // 리치 붙여넣기 후 텍스트를 직접 수정하면 서식(html)은 버리고
            // 일반 텍스트 편집으로 돌아간다 (아래 배지에 안내 표시).
            onChange={(e) => onChange({ text: e.target.value, html: undefined })}
            onPaste={(e) => {
              // 문단 블록: 웹 기사 등에서 복사한 내용(text/html)이 있으면
              // 사진+텍스트를 서식째 살려 붙여넣는다 (sanitize 통과분만).
              if (block.type !== 'paragraph') return;
              const raw = e.clipboardData?.getData('text/html');
              if (!raw) return;
              const clean = sanitizeRichHtml(raw);
              if (!clean.html) return;
              e.preventDefault();
              onChange({ html: clean.html, text: clean.text });
            }}
            rows={NOTE_INPUT_ROWS[block.type] ?? 15}
            placeholder={
              block.type === 'code_block'
                ? '코드를 입력하세요'
                : block.type === 'table'
                  ? '항목 | 값\n행1 | 내용1  (줄=행, |=열 구분)'
                  : '내용을 입력하세요 — 웹 기사 붙여넣기 시 사진·서식 유지'
            }
            style={{
              width: '100%', resize: 'vertical', border: 'none', outline: 'none',
              background: 'transparent', color: t.text,
              // 노트 글꼴·크기 (맵 설정 — 기본 13pt, 코드/표는 고정폭 유지)
              fontSize: block.type === 'code_block' ? Math.max(9, noteFs - 2) : noteFs,
              lineHeight: 1.5,
              fontFamily: block.type === 'code_block' || block.type === 'table'
                ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
                : (noteFamily ?? 'inherit'),
              padding: 0,
            }}
          />
        )}

        {/* 리치 붙여넣기(사진+서식) 미리보기 — 문단 블록에 html이 있을 때.
            배지·"서식 제거" 버튼 등 부가 UI는 두지 않는다(2026-07 사용자
            피드백: 사진+텍스트만 깔끔하게). 위 텍스트를 수정하면 서식은
            자연히 제거된다(onChange에서 html: undefined). */}
        {block.type === 'paragraph' && block.html && (
          <div style={{ marginTop: 6 }}>
            <div
              className="mm-rich-note"
              style={{
                maxHeight: 220, overflow: 'auto', fontSize: 11, lineHeight: 1.6,
                border: `1px solid ${t.border}`, borderRadius: 5,
                background: t.surface, color: t.text, padding: '6px 8px',
              }}
              // sanitizeRichHtml()을 통과한 안전한 HTML만 저장·표시된다
              dangerouslySetInnerHTML={{ __html: block.html }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
