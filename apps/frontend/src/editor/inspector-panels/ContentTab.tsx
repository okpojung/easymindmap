// ContentTab — node icon/symbol, hyperlink, attachments (document + media),
// and background image. Per feedback, raw node text input is intentionally NOT
// here — it is edited inline on the node (double-click) or in the Note tab.
//
// Spec refs:
//   - Icon: NS-05 (docs/assets/도형.png, 노드-인디케이트(mindmanager).png)
//   - Attachments split: node_attachments (docs) vs node_media (multimedia)
//   - Background image: NodeBackgroundImage spec § 14 (IMG-01~05)

import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { InspectorSection, InspectorRow } from './InspectorSection';

const EMOJI_PALETTE = [
  '📌','✅','⭐','⚠️','💡','🚀','🔥','🎯',
  '📊','🧱','🔒','💬','📎','🌐','⏱','🗂',
];

export function ContentTab({ t }: { t: ThemeTokens }) {
  return (
    <div>
      <InspectorSection t={t} title="아이콘 · 기호 (NS-05)">
        <InspectorRow t={t} label="현재">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 8px', background: t.surfaceAlt,
            border: `1px solid ${t.border}`, borderRadius: 6,
          }}>
            <span style={{ fontSize: 18 }}>🚀</span>
            <span style={{ fontSize: 11, color: t.textMuted, flex: 1 }}>로켓</span>
            <button style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 3,
              background: 'transparent', border: `1px solid ${t.border}`,
              color: t.textMuted, cursor: 'pointer',
            }}>제거</button>
          </div>
        </InspectorRow>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3,
          padding: 6, borderRadius: 6,
          background: t.surfaceAlt, border: `1px solid ${t.border}`,
        }}>
          {EMOJI_PALETTE.map(em => (
            <button key={em} title={em}
              onMouseEnter={e => (e.currentTarget.style.background = t.surface)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              style={{
                padding: 4, borderRadius: 4,
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 16,
              }}>
              {em}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <button style={{
            flex: 1, padding: 6, borderRadius: 5,
            background: t.surfaceAlt, border: `1px solid ${t.border}`,
            color: t.text, cursor: 'pointer',
            fontSize: 11, fontWeight: 500,
          }}>이모지 더보기</button>
          <button style={{
            flex: 1, padding: 6, borderRadius: 5,
            background: t.surfaceAlt, border: `1px solid ${t.border}`,
            color: t.text, cursor: 'pointer',
            fontSize: 11, fontWeight: 500,
          }}>아이콘 라이브러리</button>
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="하이퍼링크">
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 8px', background: t.surfaceAlt,
          border: `1px solid ${t.border}`, borderRadius: 6,
          fontSize: 11.5, color: t.accent,
          fontFamily: 'ui-monospace, monospace',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <I.Link size={12} /> docs/node-editing.md
          <button style={{
            marginLeft: 'auto', background: 'none', border: 'none',
            color: t.textMuted, cursor: 'pointer', padding: 0, display: 'flex',
          }}>
            <I.X size={11} />
          </button>
        </div>
      </InspectorSection>

      <InspectorSection t={t} title="첨부 (문서)">
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 6, lineHeight: 1.5 }}>
          PDF · Office · 텍스트 파일.{' '}
          <code style={{ fontSize: 10, padding: '0 3px', background: t.surfaceAlt, borderRadius: 2 }}>
            node_attachments
          </code>{' '}로 저장.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          <AttachmentRow t={t} icon="📄" name="기능명세서.pdf"   size="2.4MB" />
          <AttachmentRow t={t} icon="📊" name="KPI_2026Q1.xlsx" size="184KB" />
        </div>
        <AttachmentButton t={t} label="문서 첨부" />
      </InspectorSection>

      <InspectorSection t={t} title="첨부 (멀티미디어)">
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 6, lineHeight: 1.5 }}>
          이미지 · 오디오 · 비디오.{' '}
          <code style={{ fontSize: 10, padding: '0 3px', background: t.surfaceAlt, borderRadius: 2 }}>
            node_media
          </code>{' '}로 저장.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
          <AttachmentRow t={t} icon="🖼️" name="아키텍처_다이어그램.png" size="1.1MB" />
          <AttachmentRow t={t} icon="🎤" name="음성_노트_0405.m4a"    size="3:24" />
        </div>
        <AttachmentButton t={t} label="미디어 첨부" />
      </InspectorSection>

      <InspectorSection t={t} title="노드 배경 이미지 (IMG-01~05)">
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 6, lineHeight: 1.5 }}>
          노드 도형 내부 배경. 텍스트는 위에 합성됩니다. 첨부와는 별도 저장.
        </div>
        <div style={{
          height: 70, borderRadius: 6,
          background: t.surfaceAlt, border: `1px dashed ${t.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11.5, color: t.textMuted, flexDirection: 'column', gap: 3,
          cursor: 'pointer',
        }}>
          <I.Plus size={14} />
          이미지 드래그 또는 프리셋에서 선택
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <select defaultValue="cover" style={selectStyle(t)}>
            <option value="cover">cover</option>
            <option value="contain">contain</option>
            <option value="stretch">stretch</option>
            <option value="original">원본</option>
          </select>
          <select defaultValue="center" style={selectStyle(t)}>
            <option value="center">중앙</option>
            <option value="top">상단</option>
            <option value="bottom">하단</option>
          </select>
        </div>
      </InspectorSection>
    </div>
  );
}

function selectStyle(t: ThemeTokens) {
  return {
    flex: 1, padding: '5px 8px', borderRadius: 5,
    border: `1px solid ${t.border}`,
    background: t.surface, color: t.text,
    fontSize: 11, fontFamily: 'inherit' as const,
  };
}

function AttachmentRow({ t, icon, name, size }: { t: ThemeTokens; icon: string; name: string; size: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 8px',
      background: t.surface, border: `1px solid ${t.border}`,
      borderRadius: 5,
    }}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11.5, color: t.text, fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{name}</div>
        <div style={{ fontSize: 10, color: t.textSubtle }}>{size}</div>
      </div>
      <button style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: t.textMuted, padding: 2, display: 'flex',
      }}>
        <I.X size={11} />
      </button>
    </div>
  );
}

function AttachmentButton({ t, label }: { t: ThemeTokens; label: string }) {
  return (
    <button style={{
      display: 'flex', alignItems: 'center', gap: 6,
      width: '100%', padding: '6px 10px',
      background: 'transparent', border: `1px dashed ${t.border}`,
      borderRadius: 5, color: t.textMuted, cursor: 'pointer',
      fontSize: 11.5, fontWeight: 500, justifyContent: 'center',
    }}>
      <I.Plus size={12} /> {label}
    </button>
  );
}
