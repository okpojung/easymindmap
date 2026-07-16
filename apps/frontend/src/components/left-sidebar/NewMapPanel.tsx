// NewMapPanel — 좌측 '새 맵' 메뉴.
// 맵을 처음 만들 때: ① 기본 맵(3레벨 골격)으로 시작하거나 ② 등록된 내
// 템플릿을 골라 그 구조로 시작하거나 ③ 로컬 MD 파일을 불러온다.
//
// 어느 경우든 실행 전에 "현재 편집 중인 맵을 닫고 진행할까요?" 확인
// 단계를 거친다 — 사용자가 명시적으로 현재 맵 종료를 승인해야 교체된다
// (실수로 덮어쓰기 방지, Ctrl+Z 복구·보존 방법 안내 포함).
// [서버 연결 예정] 서버 연동 시 '닫기 = 자동 저장 후 문서 목록', '새 맵 =
// 새 maps 레코드 생성'으로 바뀌어 교체·확인 개념이 자연히 사라진다.

import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { parseHtmlMapFile, parseMarkdownMapFile, parseZipMapFile } from '@/utils/importMapFile';
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
  const mapTitle = useDocumentStore((s) => s.map.title);
  // 실행 대기 중인 동작 — 확인(현재 맵 닫기 승인) 후에 실행된다
  const [pending, setPending] = useState<{ label: string; run: () => void } | null>(null);

  useEffect(() => {
    setUserTpls(loadUserTemplates());
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2500);
  };

  const doStartBlank = () => {
    // 기본 맵: 중심 주제 + 주제 1~3 + 하위 주제 (3레벨) · 방사형 오른쪽
    newMap(title.trim() || '새 마인드맵');
    setLayoutType('radial-right');
    resetSpacing();
    setSelectedId('root');
    setTitle('');
    flash('새 맵을 시작했습니다 — 노드를 더블클릭해 내용을 채워 보세요');
  };

  const doStartFromTemplate = (tpl: UserTemplate) => {
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

  // 확인 게이트 — 현재 맵을 닫는 것을 사용자가 승인한 뒤 실행
  const confirmThen = (label: string, run: () => void) => {
    setPending({ label, run });
  };

  const startBlank = () => confirmThen('기본 맵으로 시작', doStartBlank);
  const startFromTemplate = (tpl: UserTemplate) =>
    confirmThen(`'${tpl.name}' 템플릿으로 시작`, () => doStartFromTemplate(tpl));
  const startImportFile = () =>
    confirmThen('MD/HTML/ZIP 파일 불러오기', () => fileRef.current?.click());

  // 로컬 MD/HTML 파일 불러오기.
  //  · EasyMindMap이 내보낸 HTML/MD: 내장 메타데이터로 원본 맵을 복원
  //    (MD는 본문에서 고친 구조·텍스트도 반영 — importMapFile.ts)
  //  · 일반 MD: # 견출/리스트 구조를 맵으로 변환
  const applyImported = (imported: {
    map: Parameters<typeof loadMap>[0];
    editor?: { layoutType?: Parameters<typeof setLayoutType>[0]; spacingX?: number; spacingY?: number };
    source: string;
  } & { relinked?: number }) => {
    loadMap(imported.map);
    if (imported.editor?.layoutType) setLayoutType(imported.editor.layoutType);
    else setLayoutType('radial-right');
    if (imported.editor?.spacingX) setSpacingX(imported.editor.spacingX);
    else resetSpacing();
    if (imported.editor?.spacingY) setSpacingY(imported.editor.spacingY);
    setSelectedId('root');
    const extra = imported.relinked ? ` (첨부 ${imported.relinked}개 연결)` : '';
    flash(
      imported.source === 'plain-md'
        ? `'${imported.map.title}' — MD 파일에서 맵을 만들었습니다`
        : `'${imported.map.title}' — EasyMindMap 파일에서 맵을 복원했습니다${extra}`,
    );
  };

  const importFile = (file: File) => {
    // ZIP(맵 + files/) — 안의 맵 파일 + 첨부를 함께 복원
    if (/\.zip$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        void (async () => {
          const bytes = new Uint8Array(reader.result as ArrayBuffer);
          const imported = await parseZipMapFile(bytes);
          if (!imported) {
            flash('ZIP 안에서 EasyMindMap 맵 파일(.md/.html)을 찾지 못했습니다');
            return;
          }
          applyImported(imported);
        })();
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const name = file.name.replace(/\.(md|markdown|txt|html?)$/i, '');
      // HTML 판별은 확장자 + 내용 둘 다 — 확장자가 지워진/바뀐 파일도 인식
      const isHtml = /\.html?$/i.test(file.name) ||
        /^\s*<!doctype html/i.test(text) ||
        text.includes('id="easymindmap-map"');
      const imported = isHtml
        ? parseHtmlMapFile(text)
        : parseMarkdownMapFile(text, name);
      if (!imported) {
        flash(isHtml
          ? 'EasyMindMap이 내보낸 HTML이 아닙니다 (맵 메타데이터 없음)'
          : '맵으로 만들 견출(#)·리스트(-) 구조를 찾지 못했습니다');
        return;
      }
      applyImported(imported);
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

      {/* 현재 맵 닫기 확인 — 새 맵/템플릿/MD 불러오기 공통 게이트 */}
      {pending && (
        <div style={{
          border: `1px solid ${t.primaryBorder}`, borderRadius: 8,
          background: t.primarySoft, padding: '10px 12px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 4 }}>
            현재 맵 '{mapTitle}'을(를) 닫고 진행할까요?
          </div>
          <div style={{ fontSize: 10.5, color: t.textMuted, lineHeight: 1.55, marginBottom: 8 }}>
            {pending.label} — 편집 중인 맵은 화면에서 닫힙니다 (Ctrl+Z로 복구
            가능). 보존하려면 먼저 <b>템플릿으로 등록</b>하거나 <b>HTML로
            내보내기</b> 해 두세요.
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              onClick={() => { const run = pending.run; setPending(null); run(); }}
              style={{
                flex: 1, fontSize: 11.5, padding: '6px 0', borderRadius: 6,
                border: 'none', background: t.primary, color: '#FFF',
                cursor: 'pointer', fontWeight: 700,
              }}>현재 맵 닫고 계속</button>
            <button
              onClick={() => setPending(null)}
              style={{
                flex: 1, fontSize: 11.5, padding: '6px 0', borderRadius: 6,
                border: `1px solid ${t.border}`, background: t.surface,
                color: t.text, cursor: 'pointer', fontWeight: 600,
              }}>취소</button>
          </div>
        </div>
      )}

      {/* ---- 맵 불러오기 ---- */}
      <div style={{
        fontSize: 11, color: t.textSubtle, margin: '4px 0 8px',
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>맵 불러오기</div>

      <input
        ref={fileRef}
        type="file"
        accept=".md,.markdown,.txt,.html,.htm,.zip"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = '';
        }}
      />
      <button onClick={startImportFile}
        title="일반 MD(# 견출·- 리스트), EasyMindMap이 내보낸 MD/HTML(메타데이터로 원본 복원), 또는 ZIP(맵+첨부 files/ 재연결)을 불러옵니다"
        style={{
          width: '100%', fontSize: 11.5, padding: '7px 0', borderRadius: 6,
          border: `1px solid ${t.border}`, background: t.surfaceAlt,
          color: t.text, cursor: 'pointer', fontWeight: 600, marginBottom: 5,
        }}>📄 MD / HTML / ZIP 파일 불러오기</button>

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
