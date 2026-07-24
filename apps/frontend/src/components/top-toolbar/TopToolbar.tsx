import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { IconBtn } from './IconBtn';
import { CollabAvatars } from './CollabAvatars';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { downloadMapAsHtml } from '@/export/exportHtml';
import { downloadMapAsMarkdown } from '@/export/exportMarkdown';

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
  const themeName = useEditorUiStore((s) => s.themeName);
  const setInspectorTab = useEditorUiStore((s) => s.setInspectorTab);
  const setThemeName = useEditorUiStore((s) => s.setThemeName);
  const spacingX = useEditorUiStore((s) => s.spacingX);
  const spacingY = useEditorUiStore((s) => s.spacingY);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const canUndo = useDocumentStore((s) => s.past.length > 0);
  const canRedo = useDocumentStore((s) => s.future.length > 0);

  // 내보내기 메뉴 — HTML/MD를 하위 항목으로 구분 (바깥 클릭 시 닫힘)
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const close = (e: PointerEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [exportOpen]);

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
        {/* EasyMindMap 로고 — 배지형이라 배경 상자 없이 그대로 표시 */}
        <div
          style={{
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          title="EasyMindMap"
        >
          <I.Logo size={30} />
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
        onClick={() => setInspectorTab('ai')}
        title="AI에게 질문하고 답변을 그대로 맵으로 변환합니다"
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

      {/* 다크 모드 토글 — 라이트/다크 테마 전환 (브라우저에 저장) */}
      <button
        title={themeName === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        data-testid="theme-toggle"
        onClick={() => setThemeName(themeName === 'dark' ? 'light' : 'dark')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 32, borderRadius: 8,
          background: t.surfaceAlt, color: t.text,
          border: `1px solid ${t.border}`, cursor: 'pointer', fontSize: 15,
        }}
      >
        {themeName === 'dark' ? '☀' : '🌙'}
      </button>

      {/* 내보내기 메뉴 — 하위 항목: HTML 파일 / MD 파일. 두 형식 모두
          맵 메타데이터를 내장해 '새 맵 > 불러오기'로 편집 가능하게
          복원되고, 사진·첨부가 있으면 ZIP(파일 + files/)으로 내려간다. */}
      <div ref={exportRef} style={{ position: 'relative' }}>
        <button
          title="내보내기"
          onClick={() => setExportOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            height: 32, padding: '0 10px', borderRadius: 7,
            border: `1px solid ${exportOpen ? t.primaryBorder : t.border}`,
            background: exportOpen ? t.primarySoft : t.surface,
            color: exportOpen ? t.primary : t.text,
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
        >
          <I.Download size={15} /> 내보내기 <span style={{ fontSize: 8 }}>▼</span>
        </button>
        {exportOpen && (
          <div
            data-testid="export-menu"
            style={{
              position: 'absolute', top: 38, right: 0, zIndex: 40,
              minWidth: 250, background: t.surface,
              border: `1px solid ${t.border}`, borderRadius: 9,
              boxShadow: '0 8px 24px rgba(80,60,20,0.18)', padding: 5,
            }}
          >
            {([
              {
                label: 'HTML 파일 내보내기',
                desc: '읽기 전용 뷰어 · 다시 불러오기 가능',
                title: '내보내기 (HTML — 읽기 전용 뷰어 + 다시 불러오기 가능)',
                run: () => downloadMapAsHtml(map, layoutType, { x: spacingX, y: spacingY }),
              },
              {
                label: 'MD 파일 내보내기',
                desc: '일반 에디터에서 수정 · 다시 불러오기 가능',
                title: '내보내기 (Markdown — 일반 에디터에서 수정 + 다시 불러오기 가능)',
                run: () => downloadMapAsMarkdown(map, layoutType, { x: spacingX, y: spacingY }),
              },
            ] as const).map((item) => (
              <button
                key={item.label}
                title={item.title}
                onClick={() => { setExportOpen(false); void item.run(); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 6, border: 'none',
                  background: 'transparent', cursor: 'pointer', color: t.text,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = t.surfaceAlt;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{item.label}</div>
                <div style={{ fontSize: 10.5, color: t.textMuted, marginTop: 1 }}>{item.desc}</div>
              </button>
            ))}
            <div style={{
              fontSize: 9.5, color: t.textSubtle, padding: '6px 10px 4px',
              borderTop: `1px solid ${t.divider}`, marginTop: 4, lineHeight: 1.5,
            }}>
              사진·첨부가 있으면 ZIP(파일 + files/)으로 내려갑니다
            </div>
          </div>
        )}
      </div>

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