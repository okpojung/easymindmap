import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { IconBtn } from './IconBtn';
import { CollabAvatars } from './CollabAvatars';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { downloadMapAsHtml } from '@/export/exportHtml';

export type SaveState = 'saved' | 'saving' | 'dirty' | 'error';

interface Props {
  t: ThemeTokens;
  collabs: Collaborator[];
  mapTitle: string;
  saveState?: SaveState;
}

export function TopToolbar({
  t,
  collabs,
  mapTitle,
  saveState = 'saved',
}: Props) {
  const map = useDocumentStore((s) => s.map);
  const layoutType = useEditorUiStore((s) => s.layoutType);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const canUndo = useDocumentStore((s) => s.past.length > 0);
  const canRedo = useDocumentStore((s) => s.future.length > 0);

  const saveStateInfo = ({
    saved: { text: '저장됨 · 방금 전', color: t.textMuted, dot: t.success },
    saving: { text: '저장 중…', color: t.accent, dot: t.accent },
    dirty: { text: '변경사항 있음', color: t.warning, dot: t.warning },
    error: { text: '저장 실패 — 재시도 중', color: t.danger, dot: t.danger },
  } as const)[saveState];

  return (
    <div
      style={{
        height: 52,
        background: t.surface,
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 10,
        position: 'relative',
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 280 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: t.primarySoft,
            border: `1px solid ${t.primaryBorder}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <I.Logo size={20} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: t.textSubtle, fontWeight: 500 }}>
            내 문서 <span style={{ margin: '0 4px', opacity: 0.5 }}>/</span> 제품팀
          </div>

          <div
            style={{
              fontSize: 14,
              color: t.text,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              maxWidth: 260,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mapTitle}
            <span style={{ opacity: 0.5, display: 'flex' }}>
              <I.ChevronDown size={14} />
            </span>
          </div>
        </div>
      </div>

      <div style={{ width: 1, height: 28, background: t.divider }} />

      <div style={{ display: 'flex', gap: 2 }}>
        <IconBtn t={t} title="되돌리기 (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <I.Undo size={17} />
        </IconBtn>
        <IconBtn t={t} title="다시 실행 (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
          <I.Redo size={17} />
        </IconBtn>
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
          color: saveStateInfo.color,
          fontWeight: 500,
          padding: '4px 10px',
          borderRadius: 6,
          background: t.surfaceAlt,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: saveStateInfo.dot,
            boxShadow: `0 0 0 3px ${saveStateInfo.dot}22`,
          }}
        />
        {saveStateInfo.text}
      </div>

      {/* [협업 UI 숨김 — MVP] 협업자 아바타 스택(지/민/J).
          협업 기능(V2) 개발 시 featureFlags.ts의 COLLAB_PRESENCE_UI를 true로
          바꾸면 다시 표시된다. 코드는 삭제하지 않고 보존. */}
      {COLLAB_PRESENCE_UI && (
        <>
          <CollabAvatars t={t} collabs={collabs} />

          <div style={{ width: 1, height: 28, background: t.divider }} />
        </>
      )}

      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          borderRadius: 8,
          background: `linear-gradient(135deg, ${t.primary}, ${t.primaryHover})`,
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          boxShadow: `0 1px 2px ${t.primary}60, 0 0 0 1px ${t.primary}80`,
        }}
      >
        <I.Sparkles size={15} /> AI 생성
      </button>

      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          borderRadius: 8,
          background: t.surfaceAlt,
          color: t.text,
          border: `1px solid ${t.border}`,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        <I.Share size={15} /> 공유
      </button>

      {/* 내보내기 — 단일 HTML 파일(오프라인 읽기 전용 뷰어: 줌·팬·맞춤·
          노드 접기/펴기·태그·링크·메모 지원)로 저장. EXPORT-02. */}
      <IconBtn
        t={t}
        title="내보내기 (HTML 단독 파일)"
        onClick={() => downloadMapAsHtml(map, layoutType)}
      >
        <I.Download size={16} />
      </IconBtn>

      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: `linear-gradient(135deg, ${t.primary}, ${t.primaryHover})`,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 600,
          border: `2px solid ${t.surface}`,
          cursor: 'pointer',
        }}
      >
        지
      </div>
    </div>
  );
}