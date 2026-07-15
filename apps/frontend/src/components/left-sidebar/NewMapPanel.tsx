// NewMapPanel — 좌측 '새 맵' 메뉴.
// 맵을 처음 만들 때: ① 기본 맵(루트만 있는 빈 맵)으로 시작하거나
// ② 등록된 내 템플릿을 골라 그 구조로 시작한다.
// 현재 편집 중인 맵은 교체되지만 Ctrl+Z로 되돌릴 수 있다.
// [서버 연결 예정] 서버 연동 시 새 문서(maps 레코드) 생성으로 이관.

import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { parseMarkdownToMap } from '@/utils/importMarkdown';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import {
  loadUserTemplates,
  templateSkeletonMap,
  type UserTemplate,
} from '@/utils/userTemplates';

export function NewMapPanel({ t }: { t: ThemeTokens }) {
  const newMap = useDocumentStore((s) => s.newMap);
  const loadMap = useDocumentStore((s) => s.loadMap);
  const setLayoutType = useEditorUiStore((s) => s.setLayoutType);
  const setSpacingX = useEditorUiStore((s) => s.setSpacingX);
  const setSpacingY = useEditorUiStore((s) => s.setSpacingY);
  const resetSpacing = useEditorUiStore((s) => s.resetSpacing);
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);

  const [title, setTitle] = useState('');
  const [userTpls, setUserTpls] = useState<UserTemplate[]>([]);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setUserTpls(loadUserTemplates());
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2500);
  };

  const startBlank = () => {
    // 기본 맵: 중심 주제 + 주제 1~3 + 하위 주제 (3레벨) · 방사형 오른쪽
    newMap(title.trim() || '새 마인드맵');
    setLayoutType('radial-right');
    resetSpacing();
    setSelectedId('root');
    setTitle('');
    flash('새 맵을 시작했습니다 — 노드를 더블클릭해 내용을 채워 보세요');
  };

  const startFromTemplate = (tpl: UserTemplate) => {
    // 템플릿은 맵의 속성(레이아웃·폰트·도형·스타일)과 뼈대만 물려준다 —
    // 구조는 4레벨까지, 노드 텍스트는 자리 표시 텍스트(중심 주제/주제 N/
    // 하위 주제/내용)로 교체 (ThinkWise 방식, templateSkeletonMap).
    const map = templateSkeletonMap(tpl.map);
    if (title.trim()) {
      map.title = title.trim();
      map.root = { ...map.root, text: title.trim() }; // 제목 = 중심 주제
    }
    loadMap(map);
    // 템플릿 등록 당시의 맵 전체 레이아웃·간격 복원 (템플릿 패널과 동일)
    const lt = tpl.editor?.layoutType ?? tpl.map.root.layoutType;
    if (lt) setLayoutType(lt);
    if (tpl.editor?.spacingX) setSpacingX(tpl.editor.spacingX);
    if (tpl.editor?.spacingY) setSpacingY(tpl.editor.spacingY);
    setSelectedId('root');
    setTitle('');
    flash(`'${tpl.name}' 템플릿으로 새 맵을 시작했습니다`);
  };

  // 로컬 Markdown 파일 불러오기 — # 견출/리스트 구조를 맵으로 변환
  const importMd = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const name = file.name.replace(/\.(md|markdown|txt)$/i, '');
      const map = parseMarkdownToMap(String(reader.result ?? ''), name);
      if (!map) {
        flash('맵으로 만들 견출(#)·리스트(-) 구조를 찾지 못했습니다');
        return;
      }
      loadMap(map);
      setLayoutType('radial-right');
      resetSpacing();
      setSelectedId('root');
      flash(`'${map.title}' — MD 파일에서 맵을 만들었습니다`);
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ padding: 12 }}>
      <div style={{
        fontSize: 11, color: t.textSubtle, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>새 맵 만들기</div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="새 맵 제목 (비우면 자동)"
        style={{
          width: '100%', fontSize: 11.5, padding: '6px 9px', borderRadius: 6,
          border: `1px solid ${t.border}`, background: t.surface, color: t.text,
          outline: 'none', marginBottom: 8,
        }}
      />

      <button onClick={startBlank}
        title="중심 주제 + 주제 1~3 + 하위 주제(3레벨) 기본 골격으로 시작합니다"
        style={{
          width: '100%', fontSize: 12, padding: '9px 0', borderRadius: 7,
          border: `1px solid ${t.primaryBorder}40`, background: t.primarySoft,
          color: t.primary, cursor: 'pointer', fontWeight: 700, marginBottom: 6,
        }}>+ 기본 맵으로 시작</button>

      <div style={{ fontSize: 10, color: t.textSubtle, lineHeight: 1.5, marginBottom: 10 }}>
        현재 편집 중인 맵은 교체됩니다 (Ctrl+Z로 되돌리기 가능).
        서버 연결 후에는 새 문서로 저장됩니다.
      </div>

      {notice && (
        <div style={{
          fontSize: 10.5, color: t.primary, fontWeight: 600, marginBottom: 8,
          padding: '5px 8px', borderRadius: 5, background: t.primarySoft,
        }}>{notice}</div>
      )}

      {/* ---- 맵 불러오기 ---- */}
      <div style={{
        fontSize: 11, color: t.textSubtle, margin: '4px 0 8px',
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>맵 불러오기</div>

      <input
        ref={fileRef}
        type="file"
        accept=".md,.markdown,.txt"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importMd(f);
          e.target.value = '';
        }}
      />
      <button onClick={() => fileRef.current?.click()}
        title="로컬 Markdown 파일(# 견출·- 리스트)을 맵으로 변환합니다"
        style={{
          width: '100%', fontSize: 11.5, padding: '7px 0', borderRadius: 6,
          border: `1px solid ${t.border}`, background: t.surfaceAlt,
          color: t.text, cursor: 'pointer', fontWeight: 600, marginBottom: 5,
        }}>📄 MD 파일 불러오기</button>

      {/* [서버 연결 예정] 서버에 저장된 맵 목록에서 불러오기 —
          maps 테이블 연동 후 활성화 (docs/02-domain/db-schema.md) */}
      <button disabled
        title="서버 연결 후 사용할 수 있습니다"
        style={{
          width: '100%', fontSize: 11.5, padding: '7px 0', borderRadius: 6,
          border: `1px dashed ${t.border}`, background: 'transparent',
          color: t.textSubtle, cursor: 'default', fontWeight: 600, marginBottom: 10,
        }}>☁ 서버에 저장된 맵 불러오기 (서버 연결 후)</button>

      <div style={{
        fontSize: 11, color: t.textSubtle, margin: '4px 0 8px',
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>등록된 템플릿에서 시작</div>
      <div style={{ fontSize: 10, color: t.textSubtle, lineHeight: 1.5, marginBottom: 8 }}>
        템플릿의 레이아웃·폰트·도형·스타일과 뼈대 구조(4레벨까지)만
        가져오고, 노드 텍스트는 자리 표시 텍스트(중심 주제 · 주제 1~n ·
        하위 주제 · 내용)로 채워집니다. 원본 맵의 내용은 복사되지 않습니다.
      </div>

      {userTpls.length === 0 && (
        <div style={{ fontSize: 10.5, color: t.textSubtle, lineHeight: 1.5 }}>
          등록된 내 템플릿이 없습니다. 템플릿 패널에서 현재 맵을
          템플릿으로 등록해 두면 여기에서 골라 시작할 수 있습니다.
        </div>
      )}
      {userTpls.map((tpl) => (
        <div key={tpl.id} style={{
          padding: '8px 10px', borderRadius: 8,
          background: t.surface, border: `1px solid ${t.border}`,
          marginBottom: 6,
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: t.text, marginBottom: 2 }}>
            {tpl.name}
          </div>
          <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 6 }}>
            노드 {tpl.nodeCount}개 · {tpl.savedAt.slice(0, 10)}
          </div>
          <button onClick={() => startFromTemplate(tpl)}
            title="이 템플릿의 구조로 새 맵을 시작합니다"
            style={{
              fontSize: 10.5, padding: '3px 10px', borderRadius: 4, fontWeight: 600,
              border: `1px solid ${t.primaryBorder}40`, background: t.primarySoft,
              color: t.primary, cursor: 'pointer',
            }}>이 템플릿으로 시작</button>
        </div>
      ))}
    </div>
  );
}
