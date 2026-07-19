// TemplatePanel — 템플릿 라이브러리(기본 제공) + 내 템플릿(사용자 등록).
//
// 내 템플릿: 편집 중인 맵을 이름을 붙여 템플릿으로 등록하고, 나중에
// '적용'으로 현재 맵을 그 템플릿으로 교체한다 (undo로 되돌리기 가능).
// MVS에서는 브라우저 localStorage에 저장한다 — 이 기기·브라우저에서만
// 보인다.
// [서버 연결 예정] Supabase 연동 시 templates 테이블로 이관 — 사용자
// 소유 템플릿 + 워크스페이스 공유 템플릿 (docs/02-domain/db-schema.md
// §향후 관리 테이블 참조). 로컬 등록분은 최초 로그인 시 서버로 옮긴다.

import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import {
  loadUserTemplates,
  saveUserTemplates,
  countMapNodes,
  applyTemplateStyles,
  type UserTemplate,
} from '@/utils/userTemplates';
import { LIBRARY_TEMPLATES } from '@/utils/libraryTemplates';
import type { SampleMap, LayoutType } from '@/editor/__samples__/types';

export function TemplatePanel({ t }: { t: ThemeTokens }) {
  const map = useDocumentStore((s) => s.map);
  const loadMap = useDocumentStore((s) => s.loadMap);
  const layoutType = useEditorUiStore((s) => s.layoutType);
  const spacingX = useEditorUiStore((s) => s.spacingX);
  const spacingY = useEditorUiStore((s) => s.spacingY);
  const setLayoutType = useEditorUiStore((s) => s.setLayoutType);
  const setSpacingX = useEditorUiStore((s) => s.setSpacingX);
  const setSpacingY = useEditorUiStore((s) => s.setSpacingY);

  const [userTpls, setUserTpls] = useState<UserTemplate[]>([]);
  const [nameDraft, setNameDraft] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setUserTpls(loadUserTemplates());
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2500);
  };

  const register = () => {
    const name = nameDraft.trim() || map.title;
    const tpl: UserTemplate = {
      id: `tpl-${Date.now()}`,
      name,
      savedAt: new Date().toISOString(),
      nodeCount: countMapNodes(map),
      map: JSON.parse(JSON.stringify(map)),
      editor: { layoutType, spacingX, spacingY },
    };
    const next = [tpl, ...userTpls];
    if (!saveUserTemplates(next)) {
      flash('저장 공간이 부족해 등록하지 못했습니다');
      return;
    }
    setUserTpls(next);
    setNameDraft('');
    flash(`'${name}' 템플릿으로 등록했습니다`);
  };

  // '적용' = 현재 맵의 내용은 그대로 두고 템플릿의 "속성"만 입힌다 —
  // 레벨별 대표 스타일(도형·색·테두리) + 맵 설정(레벨별 폰트·레이아웃)
  // + 전체 레이아웃·간격. 맵 전체 교체는 '새 맵 > 이 템플릿으로 시작'.
  const apply = (tpl: {
    name: string;
    map: SampleMap;
    editor?: { layoutType?: LayoutType; spacingX?: number; spacingY?: number };
  }) => {
    loadMap(applyTemplateStyles(map, tpl.map));
    const lt = tpl.editor?.layoutType ?? tpl.map.root.layoutType;
    if (lt) setLayoutType(lt);
    if (tpl.editor?.spacingX) setSpacingX(tpl.editor.spacingX);
    if (tpl.editor?.spacingY) setSpacingY(tpl.editor.spacingY);
    flash(`'${tpl.name}' 템플릿의 스타일·설정을 현재 맵에 적용했습니다 (내용 유지 · Ctrl+Z로 되돌리기)`);
  };

  const remove = (tpl: UserTemplate) => {
    const next = userTpls.filter((x) => x.id !== tpl.id);
    saveUserTemplates(next);
    setUserTpls(next);
  };

  const inputStyle = {
    flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 5,
    border: `1px solid ${t.border}`, background: t.surface, color: t.text,
    outline: 'none',
  } as const;

  return (
    <div style={{ padding: 12 }}>
      {/* ---- 내 템플릿 (사용자 등록) ---- */}
      <div style={{
        fontSize: 11, color: t.textSubtle, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>내 템플릿</div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') register(); }}
          placeholder={`템플릿 이름 (기본: ${map.title})`}
          style={inputStyle}
        />
        <button onClick={register} title="편집 중인 맵을 템플릿으로 등록합니다"
          style={{
            fontSize: 11, padding: '5px 9px', borderRadius: 5, fontWeight: 600,
            border: `1px solid ${t.primaryBorder}40`, background: t.primarySoft,
            color: t.primary, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>등록</button>
      </div>
      <div style={{ fontSize: 10, color: t.textSubtle, lineHeight: 1.5, marginBottom: 8 }}>
        현재 편집 중인 맵(노드·노트·태그·스타일·맵 설정 포함)을 저장합니다.
        이 브라우저에만 보관되며, 서버 연결 후 계정 템플릿으로 이관됩니다.
      </div>
      {notice && (
        <div style={{
          fontSize: 10.5, color: t.primary, fontWeight: 600, marginBottom: 8,
          padding: '5px 8px', borderRadius: 5, background: t.primarySoft,
        }}>{notice}</div>
      )}

      {userTpls.length === 0 && (
        <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 12 }}>
          등록된 내 템플릿이 없습니다.
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
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => apply(tpl)}
              title="현재 맵의 내용은 유지하고 템플릿의 스타일·레이아웃·맵 설정만 적용합니다 (Ctrl+Z로 되돌리기 가능)"
              style={{
                fontSize: 10.5, padding: '3px 10px', borderRadius: 4, fontWeight: 600,
                border: `1px solid ${t.primaryBorder}40`, background: t.primarySoft,
                color: t.primary, cursor: 'pointer',
              }}>적용</button>
            <button onClick={() => remove(tpl)} title="내 템플릿에서 삭제"
              style={{
                fontSize: 10.5, padding: '3px 10px', borderRadius: 4,
                border: `1px solid ${t.border}`, background: t.surfaceAlt,
                color: t.textMuted, cursor: 'pointer',
              }}>삭제</button>
          </div>
        </div>
      ))}

      {/* ---- 기본 제공 템플릿 ---- */}
      <div style={{
        fontSize: 11, color: t.textSubtle, margin: '14px 0 8px',
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>템플릿 라이브러리</div>
      <div style={{ fontSize: 10, color: t.textSubtle, lineHeight: 1.5, marginBottom: 8 }}>
        기본 제공 템플릿입니다. '적용'은 현재 맵의 내용은 유지하고
        레이아웃·스타일만 입힙니다. 새 맵으로 시작하려면 '새 맵' 메뉴에서
        고르세요.
      </div>
      {LIBRARY_TEMPLATES.map((tpl) => (
        <div key={tpl.id} style={{
          padding: 10, borderRadius: 8,
          background: t.surface, border: `1px solid ${t.border}`,
          marginBottom: 6,
        }}>
          <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
            {tpl.colors.map((c, j) => (
              <span key={j} style={{ width: 18, height: 6, borderRadius: 3, background: c }} />
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 2 }}>
            {tpl.name}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>{tpl.desc}</div>
          <button onClick={() => apply(tpl)}
            title="현재 맵의 내용은 유지하고 이 템플릿의 레이아웃·스타일·맵 설정만 적용합니다 (Ctrl+Z로 되돌리기 가능)"
            style={{
              fontSize: 10.5, padding: '3px 10px', borderRadius: 4, fontWeight: 600,
              border: `1px solid ${t.primaryBorder}40`, background: t.primarySoft,
              color: t.primary, cursor: 'pointer',
            }}>적용</button>
        </div>
      ))}
    </div>
  );
}
