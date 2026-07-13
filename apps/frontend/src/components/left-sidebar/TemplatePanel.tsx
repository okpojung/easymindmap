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
  type UserTemplate,
} from '@/utils/userTemplates';

const TEMPLATES = [
  { name: '제품 로드맵',   desc: 'Q1~Q4 분기별 마일스톤', colors: ['#D97706','#0284C7','#15803D','#9333EA'] },
  { name: '브레인스토밍', desc: '자유 확장 방사형 맵',    colors: ['#F59E0B','#FBBF24'] },
  { name: 'WBS 프로젝트', desc: '계층형 작업 분해 구조',  colors: ['#0284C7','#38BDF8','#7DD3FC'] },
  { name: 'Kanban 보드',  desc: '백로그 → 완료 흐름',     colors: ['#958A78','#D97706','#0284C7','#15803D'] },
  { name: '회의록',       desc: '안건 · 결정 · 액션',     colors: ['#DC2626','#F59E0B','#15803D'] },
];

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

  const apply = (tpl: UserTemplate) => {
    loadMap(tpl.map);
    // 맵 전체 레이아웃·간격 복원 — 문서(map)에는 노드별 오버라이드만 있고
    // 전체 레이아웃은 editorUiStore가 들고 있어서 함께 되살려야
    // 등록 당시 모습 그대로 나온다. (구버전 템플릿은 root.layoutType 폴백)
    const lt = tpl.editor?.layoutType ?? tpl.map.root.layoutType;
    if (lt) setLayoutType(lt);
    if (tpl.editor?.spacingX) setSpacingX(tpl.editor.spacingX);
    if (tpl.editor?.spacingY) setSpacingY(tpl.editor.spacingY);
    flash(`'${tpl.name}' 템플릿을 적용했습니다 (Ctrl+Z로 되돌리기)`);
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
              title="현재 맵을 이 템플릿으로 교체합니다 (Ctrl+Z로 되돌리기 가능)"
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
      {TEMPLATES.map((tpl, i) => (
        <div key={i} style={{
          padding: 10, borderRadius: 8,
          background: t.surface, border: `1px solid ${t.border}`,
          marginBottom: 6, cursor: 'pointer',
        }}>
          <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
            {tpl.colors.map((c, j) => (
              <span key={j} style={{ width: 18, height: 6, borderRadius: 3, background: c }} />
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 2 }}>
            {tpl.name}
          </div>
          <div style={{ fontSize: 11, color: t.textMuted }}>{tpl.desc}</div>
        </div>
      ))}
    </div>
  );
}
