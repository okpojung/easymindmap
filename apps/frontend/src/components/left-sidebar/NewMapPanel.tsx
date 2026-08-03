// NewMapPanel — 좌측 '새 맵' 메뉴 (2026-07 2차 재편 — 깔끔한 3단 구성).
//
//   · 새 맵 만들기        → 만든 직후 "적용할 템플릿 선택" 단계가 뜬다.
//                          여기서 고르면 그 템플릿의 골격(4레벨 자리
//                          표시)+속성으로 시작 (templateSkeletonMap) —
//                          별도의 '등록된 템플릿에서 시작' 섹션은 이
//                          단계로 통합되어 제거됐다.
//   · 서버 맵 불러오기    (서버 연결 후)
//   · Local 파일 불러오기
//       · MD 파일 불러오기   (블록 배치 옵션 — 버튼 바로 아래)
//       · HTML 파일 불러오기 (EasyMindMap이 생성한 HTML만)
//       · ZIP 파일 불러오기  (EasyMindMap HTML/MD + files/ 첨부)
//
// 파일을 불러온 직후의 템플릿 선택은 내용을 유지한 채 속성만 입힌다
// (applyTemplateStyles). 어느 경우든 실행 전에 "현재 편집 중인 맵을
// 닫고 진행할까요?" 확인 단계를 거친다.
// '맵 닫기'(= 저장 후 닫기)는 2026-08-02 정리에서 **상단 툴바의 ✕** 로
// 옮겼다 — 이 패널은 '맵을 시작/불러오는' 곳으로 역할을 좁혔다.

import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import { parseHtmlMapFile, parseMarkdownMapFile, parseZipMapFile } from '@/utils/importMapFile';
import { resolveRemoteImages } from '@/utils/remoteImages';
import { isDocumentEmpty, NEW_MAP_TITLE, useDocumentStore } from '@/stores/documentStore';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { detachFromServer } from '@/services/cloud/mapSession';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import {
  loadUserTemplates,
  templateSkeletonMap,
  applyTemplateStyles,
  type UserTemplate,
} from '@/utils/userTemplates';
import { LIBRARY_TEMPLATES } from '@/utils/libraryTemplates';

type ImportKind = 'md' | 'html' | 'zip';

interface TplChoice {
  key: string;
  name: string;
  meta: string;
  map: SampleMap;
  editor?: { layoutType?: LayoutType; spacingX?: number; spacingY?: number };
}

export function NewMapPanel({ t }: { t: ThemeTokens }) {
  const newMap = useDocumentStore((s) => s.newMap);
  const loadMap = useDocumentStore((s) => s.loadMap);
  const setLayoutType = useEditorUiStore((s) => s.setLayoutType);
  const setSpacingX = useEditorUiStore((s) => s.setSpacingX);
  const setSpacingY = useEditorUiStore((s) => s.setSpacingY);
  const resetSpacing = useEditorUiStore((s) => s.resetSpacing);
  const setSelectedId = useInteractionStore((s) => s.setSelectedId);

  const [userTpls, setUserTpls] = useState<UserTemplate[]>([]);
  const [notice, setNotice] = useState('');
  // 문서함은 편집 영역에 연다 (2026-08-02 — 팝업 모달에서 이동)
  const setBrowserOpen = useEditorUiStore((s) => s.setBrowserOpen);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [importKind, setImportKind] = useState<ImportKind>('md');
  // MD 블록 배치 옵션 (리치 노드 P3) — 문단·코드·표·체크를 노드 본문에
  // 넣을지(기본), 기존처럼 노트로 넣을지. 선택은 기억된다.
  const [blockPlacement, setBlockPlacement] = useState<'node' | 'note'>(() => {
    try {
      return window.localStorage.getItem('emm.import.blockPlacement') === 'note'
        ? 'note' : 'node';
    } catch { return 'node'; }
  });
  const chooseBlockPlacement = (v: 'node' | 'note') => {
    setBlockPlacement(v);
    try { window.localStorage.setItem('emm.import.blockPlacement', v); } catch { /* 무시 */ }
  };
  const mapTitle = useDocumentStore((s) => s.map.title);
  // 실행 대기 중인 동작 — 확인(현재 맵 닫기 승인) 후에 실행된다
  const [pending, setPending] = useState<{ label: string; run: () => void } | null>(null);
  // 아코디언 펼침 상태 — 새 맵 만들기는 기본 펼침, Local 파일은 접힘
  // (선택 시 하위 메뉴가 트리 형태로 펼쳐진다)
  const [openLocal, setOpenLocal] = useState(false);
  // 로그인 상태 — 서버 맵 메뉴 숨김 판단 (2026-08-03)
  const session = useAuthStore((s) => s.session);
  // 새 맵/불러오기 직후 — 적용할 템플릿 선택 단계.
  //   mode 'new'   : 템플릿 골격+속성으로 새 맵 시작 (templateSkeletonMap)
  //   mode 'import': 불러온 내용은 유지, 속성만 입힘 (applyTemplateStyles)
  const [chooseTpl, setChooseTpl] =
    useState<{ msg: string; mode: 'new' | 'import' } | null>(null);

  useEffect(() => {
    setUserTpls(loadUserTemplates());
  }, []);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2500);
  };

  const doStartBlank = () => {
    // 기본 맵 = '트리-진행트리맵' 기본 템플릿: 중심 주제 + 주제 1~3 +
    // 하위 주제 + 내용 (4레벨) · 1레벨 트리·오른쪽 → 2레벨 진행트리 →
    // 3레벨 트리 → 4레벨 진행트리 (documentStore.newMap과 한 쌍)
    //
    // 2026-08-02: **여기서 제목을 묻지 않는다.** 항상 'NEW_MAP_TITLE'로
    // 시작하고, 편집을 마치고 ☁ 저장할 때 폴더와 이름을 정한다(규칙 3).
    // 새 문서다 — 조금 전까지 열려 있던 서버 맵과의 연결을 끊는다.
    // (끊지 않으면 자동저장이 그 서버 맵을 이 새 맵으로 덮어쓴다)
    detachFromServer();
    setBrowserOpen(false); // 문서함이 열려 있었다면 닫고 편집 화면으로
    newMap(NEW_MAP_TITLE);
    setLayoutType('tree-right');
    resetSpacing();
    setSelectedId('root');
    setChooseTpl({ msg: '새 맵을 시작했습니다', mode: 'new' });
  };

  // 확인 게이트 — 현재 맵을 닫는 것을 사용자가 승인한 뒤 실행.
  // 묻지 않는 경우 (잃을 것이 없다):
  //  · 편집 이력이 전혀 없는 처음 상태 (undo 히스토리 비어 있음)
  //  · **문서가 비어 있는 상태** ('문서 없음' — 맵 닫기 직후·로그인 직후).
  //    undo 에 이전 맵이 남아 있어도, 화면에 닫을 맵이 없는데
  //    "현재 맵 '문서 없음'을 닫고 진행할까요?" 를 묻는 것은 무의미하다
  //    (2026-08-02 사용자 보고).
  const confirmThen = (label: string, run: () => void) => {
    setChooseTpl(null);
    const doc = useDocumentStore.getState();
    if (doc.past.length === 0 || isDocumentEmpty(doc.map)) {
      run();
      return;
    }
    setPending({ label, run });
  };

  const startBlank = () => confirmThen('새 맵 만들기', doStartBlank);
  const startImportFile = (kind: ImportKind) =>
    confirmThen(
      kind === 'md' ? 'MD 파일 불러오기'
        : kind === 'html' ? 'HTML 파일 불러오기'
          : 'ZIP 파일 불러오기',
      () => {
        setImportKind(kind);
        // accept가 state 반영된 뒤 열리도록 다음 틱에
        window.setTimeout(() => fileRef.current?.click(), 0);
      },
    );

  // 새 맵/불러오기 직후 — 템플릿 선택.
  //   'new'   : 템플릿 골격(4레벨 자리 표시)+속성으로 시작 — 기존
  //             '등록된 템플릿에서 시작' 기능이 이 단계로 통합됐다
  //   'import': 불러온 내용은 유지, 속성(레이아웃·스타일·맵 설정)만
  const applyChosenTpl = (tpl: TplChoice) => {
    if (chooseTpl?.mode === 'new') {
      const curTitle = useDocumentStore.getState().map.title;
      const map = templateSkeletonMap(tpl.map);
      map.title = curTitle;
      map.root = { ...map.root, text: curTitle }; // 제목 = 중심 주제
      loadMap(map);
      const lt0 = tpl.editor?.layoutType ?? tpl.map.root.layoutType;
      if (lt0) setLayoutType(lt0);
      if (tpl.editor?.spacingX) setSpacingX(tpl.editor.spacingX);
      if (tpl.editor?.spacingY) setSpacingY(tpl.editor.spacingY);
      setSelectedId('root');
      setChooseTpl(null);
      flash(`'${tpl.name}' 템플릿 골격으로 새 맵을 시작했습니다`);
      return;
    }
    const cur = useDocumentStore.getState().map;
    loadMap(applyTemplateStyles(cur, tpl.map));
    const lt = tpl.editor?.layoutType ?? tpl.map.root.layoutType;
    if (lt) setLayoutType(lt);
    if (tpl.editor?.spacingX) setSpacingX(tpl.editor.spacingX);
    if (tpl.editor?.spacingY) setSpacingY(tpl.editor.spacingY);
    setChooseTpl(null);
    flash(`'${tpl.name}' 템플릿을 적용했습니다 (Ctrl+Z로 되돌리기 가능)`);
  };

  const tplChoices: TplChoice[] = [
    ...userTpls.map((tpl) => ({
      key: tpl.id,
      name: tpl.name,
      meta: `내 템플릿 · 노드 ${tpl.nodeCount}개`,
      map: tpl.map,
      editor: tpl.editor,
    })),
    ...LIBRARY_TEMPLATES.map((tpl) => ({
      key: tpl.id,
      name: tpl.name,
      meta: `라이브러리 · ${tpl.desc}`,
      map: tpl.map,
      editor: tpl.editor,
    })),
  ];

  // 로컬 MD/HTML/ZIP 파일 불러오기.
  //  · EasyMindMap이 내보낸 HTML/MD: 내장 메타데이터로 원본 맵을 복원
  //    (MD는 본문에서 고친 구조·텍스트도 반영 — importMapFile.ts)
  //  · 일반 MD: # 견출/리스트 구조를 맵으로 변환
  const applyImported = async (imported: {
    map: Parameters<typeof loadMap>[0];
    editor?: { layoutType?: Parameters<typeof setLayoutType>[0]; spacingX?: number; spacingY?: number };
    source: string;
  } & { relinked?: number }, movedToNote = 0) => {
    // MD의 원격 이미지 URL(![](https://…png))을 다운로드해 내장 —
    // 실패분은 원격 참조 유지 또는 링크 폴백 (remoteImages.ts)
    const { map: resolvedMap, stats: img } = await resolveRemoteImages(imported.map);
    // 불러온 파일도 새 문서다 — 서버 맵 연결을 끊는다 (위 doStartBlank 주석)
    detachFromServer();
    setBrowserOpen(false);
    loadMap(resolvedMap);
    if (imported.editor?.layoutType) setLayoutType(imported.editor.layoutType);
    else setLayoutType('radial-right');
    if (imported.editor?.spacingX) setSpacingX(imported.editor.spacingX);
    else resetSpacing();
    if (imported.editor?.spacingY) setSpacingY(imported.editor.spacingY);
    setSelectedId('root');
    const extra = imported.relinked ? ` (첨부 ${imported.relinked}개 연결)` : '';
    // A4 분량 초과로 노트로 옮긴 블록 안내 (데이터는 잃지 않는다 — P3)
    const moved = movedToNote > 0
      ? ` · A4 분량을 넘어 블록 ${movedToNote}개를 노트로 옮겼습니다`
      : '';
    const imgNote = [
      img.embedded ? `사진 ${img.embedded}개 내장` : '',
      img.kept ? `사진 ${img.kept}개 원격 참조` : '',
      img.linked ? `이미지 ${img.linked}개는 다운로드 실패로 링크로 대체` : '',
    ].filter(Boolean).join(' · ');
    const imgMsg = imgNote ? ` · ${imgNote}` : '';
    setChooseTpl({
      msg: imported.source === 'plain-md'
        ? `'${imported.map.title}' — MD 파일에서 맵을 만들었습니다${moved}${imgMsg}`
        : `'${imported.map.title}' — EasyMindMap 파일에서 맵을 복원했습니다${extra}${imgMsg}`,
      mode: 'import',
    });
  };

  const importFile = (file: File, kind: ImportKind) => {
    // 블록 배치 옵션 + 이동 통계 (일반 MD에만 적용 — importMapFile.ts)
    const stats = { movedToNote: 0 };
    const parseOpts = { blockPlacement, stats };
    // ZIP(맵 + files/) — 안의 맵 파일 + 첨부를 함께 복원
    if (kind === 'zip' || /\.zip$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        void (async () => {
          const bytes = new Uint8Array(reader.result as ArrayBuffer);
          const imported = await parseZipMapFile(bytes, parseOpts);
          if (!imported) {
            flash('ZIP 안에서 EasyMindMap 맵 파일(.md/.html)을 찾지 못했습니다');
            return;
          }
          await applyImported(imported, stats.movedToNote);
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
      const isHtml = kind === 'html' || /\.html?$/i.test(file.name) ||
        /^\s*<!doctype html/i.test(text) ||
        text.includes('id="easymindmap-map"');
      const imported = isHtml
        ? parseHtmlMapFile(text)
        : parseMarkdownMapFile(text, name, parseOpts);
      if (!imported) {
        flash(isHtml
          ? 'EasyMindMap이 내보낸 HTML이 아닙니다 (맵 메타데이터 없음)'
          : '맵으로 만들 견출(#)·리스트(-) 구조를 찾지 못했습니다');
        return;
      }
      void applyImported(imported, stats.movedToNote);
    };
    reader.readAsText(file);
  };

  // 상위 메뉴 행 (아코디언 헤더) — 아이콘 + 라벨 + 펼침 표시(▸/▾)
  const menuHeader = (opts: {
    icon: string; label: string; open?: boolean;
    onClick?: () => void; disabled?: boolean; badge?: string; tip?: string;
  }) => (
    <button
      onClick={opts.onClick}
      disabled={opts.disabled}
      title={opts.tip}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12.5, fontWeight: 700, padding: '9px 11px',
        borderRadius: 8, marginBottom: 6, textAlign: 'left',
        border: opts.disabled ? `1px dashed ${t.border}` : `1px solid ${t.border}`,
        background: opts.open ? t.primarySoft : opts.disabled ? 'transparent' : t.surface,
        color: opts.disabled ? t.textSubtle : opts.open ? t.primary : t.text,
        cursor: opts.disabled ? 'default' : 'pointer',
      }}
    >
      <span style={{ fontSize: 14, lineHeight: 1 }}>{opts.icon}</span>
      <span style={{ flex: 1 }}>{opts.label}</span>
      {opts.badge && (
        <span style={{
          fontSize: 9.5, fontWeight: 600, color: t.textSubtle,
          border: `1px solid ${t.border}`, borderRadius: 8, padding: '1px 7px',
        }}>{opts.badge}</span>
      )}
      {opts.onClick && !opts.disabled && (
        <span style={{ fontSize: 10, color: t.textMuted }}>{opts.open ? '▾' : '▸'}</span>
      )}
    </button>
  );

  // 하위(트리) 영역 — 세로 안내선 + 들여쓰기 (아웃라인 느낌)
  const treeBoxStyle = {
    margin: '0 0 8px 10px',
    paddingLeft: 10,
    borderLeft: `2px solid ${t.border}`,
  } as const;

  const fileBtnStyle = {
    width: '100%', fontSize: 11.5, padding: '7px 9px', borderRadius: 6,
    border: `1px solid ${t.border}`, background: t.surfaceAlt,
    color: t.text, cursor: 'pointer', fontWeight: 600, marginBottom: 5,
    textAlign: 'left',
  } as const;

  return (
    <div style={{ padding: 12 }}>
      {notice && (
        <div data-testid="newmap-notice" style={{
          fontSize: 10.5, color: t.primary, fontWeight: 600, marginBottom: 8,
          padding: '5px 8px', borderRadius: 5, background: t.primarySoft,
        }}>{notice}</div>
      )}

      {/* 현재 맵 닫기 확인 — 새 맵/템플릿/파일 불러오기 공통 게이트 */}
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

      {/* 새 맵/불러오기 직후 — 적용할 템플릿 선택 단계 */}
      {chooseTpl && (
        <div data-testid="tpl-choose" style={{
          border: `1px solid ${t.primaryBorder}`, borderRadius: 8,
          background: t.surface, padding: '10px 12px', marginBottom: 10,
        }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: t.primary, marginBottom: 3 }}>
            {chooseTpl.msg}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 4 }}>
            적용할 템플릿을 선택하세요
          </div>
          <div style={{ fontSize: 10.5, color: t.textMuted, lineHeight: 1.55, marginBottom: 8 }}>
            {chooseTpl.mode === 'new'
              ? '고른 템플릿의 골격(4레벨 자리 표시 텍스트)과 레이아웃·스타일로 시작합니다. 건너뛰면 기본 골격 그대로 시작합니다.'
              : '내용은 그대로 두고 템플릿의 레이아웃·스타일·맵 설정만 입힙니다. 건너뛰면 기본 모양 그대로 시작합니다.'}
          </div>
          <div style={{ maxHeight: 210, overflowY: 'auto', marginBottom: 8 }}>
            {tplChoices.map((tpl) => (
              <button key={tpl.key} onClick={() => applyChosenTpl(tpl)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  fontSize: 11.5, padding: '6px 9px', borderRadius: 6,
                  border: `1px solid ${t.border}`, background: t.surfaceAlt,
                  color: t.text, cursor: 'pointer', marginBottom: 4,
                }}>
                <b>{tpl.name}</b>
                <span style={{ color: t.textSubtle, marginLeft: 6, fontSize: 10 }}>{tpl.meta}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setChooseTpl(null)}
            style={{
              width: '100%', fontSize: 11.5, padding: '6px 0', borderRadius: 6,
              border: `1px solid ${t.border}`, background: t.surface,
              color: t.text, cursor: 'pointer', fontWeight: 600,
            }}>건너뛰기 (기본 그대로)</button>
        </div>
      )}

      {/* ═══ 1. 새 맵 만들기 — 단일 버튼 (2026-08-03: 트리 하위에 같은
          버튼이 한 번 더 있던 이중 구조 제거) ═══ */}
      {menuHeader({
        icon: '＋', label: '새 맵 만들기',
        onClick: startBlank,
        tip: `기본 템플릿 '트리-진행트리맵' 골격으로 새 맵을 시작하고, 이어서 적용할 템플릿을 고릅니다. 제목은 저장할 때 폴더와 함께 정합니다 — 그전까지는 '${NEW_MAP_TITLE}'. 현재 편집 중인 맵은 교체됩니다(Ctrl+Z로 복구).`,
      })}

      {/* ═══ 2. 서버 맵 불러오기 ═══
          로그인 상태에서는 숨긴다 (2026-08-03) — 로그인 직후·맵 닫기 후
          문서함이 자동으로 열리고, 상단의 '내 문서'를 눌러도 열리므로
          왼쪽 메뉴는 중복이다. 인증 꺼진 개발 빌드에서만 유지. */}
      {!(authEnabled && session) && menuHeader({
        icon: '☁', label: '서버 맵 불러오기',
        onClick: () => setBrowserOpen(true),
        tip: '서버에 저장된 내 문서함을 편집 영역에 엽니다 (폴더·정렬 지원)',
      })}

      {/* ═══ 3. Local 파일 불러오기 — 선택하면 하위 메뉴가 트리로 ═══ */}
      {menuHeader({
        icon: '📂', label: 'Local 파일 불러오기', open: openLocal,
        onClick: () => setOpenLocal((v) => !v),
        tip: 'MD·HTML·ZIP 파일을 불러옵니다 (선택하면 하위 메뉴가 펼쳐집니다)',
      })}
      <input
        ref={fileRef}
        type="file"
        accept={importKind === 'md' ? '.md,.markdown,.txt'
          : importKind === 'html' ? '.html,.htm' : '.zip'}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f, importKind);
          e.target.value = '';
        }}
      />
      {openLocal && (
        <div style={treeBoxStyle}>
      <button onClick={() => startImportFile('md')}
        title="일반 MD 파일과 EasyMindMap에서 생성된 MD 파일을 불러옵니다"
        style={{ ...fileBtnStyle, marginBottom: 3 }}>📄 MD 파일 불러오기</button>
      {/* MD 블록 배치 옵션 (일반 MD 전용) — MD 항목의 하위 트리 */}
      <div data-testid="block-placement" style={{
        border: `1px solid ${t.border}`, borderRadius: 6,
        padding: '5px 8px', margin: '0 0 6px 12px', background: t.surface,
      }}>
        <div style={{ fontSize: 10, color: t.textSubtle, fontWeight: 600, marginBottom: 3 }}>
          블록(문단·코드·표·체크) 배치
        </div>
        {([
          ['node', '노드로 (기본)', '코드·표·이미지 블록은 각각의 자식 노드로 분리합니다(markmap 방식). 블록 바로 뒤의 인용문은 그 블록 노드에 이어 붙습니다'],
          ['note', '노트로', '기존 방식 — 문단·코드·표·체크를 노드의 노트로 넣습니다'],
        ] as const).map(([v, label, tip]) => (
          <label key={v} title={tip} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 11, color: t.text, cursor: 'pointer', padding: '2px 0',
          }}>
            <input
              type="radio"
              name="block-placement"
              checked={blockPlacement === v}
              onChange={() => chooseBlockPlacement(v)}
              style={{ accentColor: t.primary }}
            />
            {label}
          </label>
        ))}
      </div>
      <button onClick={() => startImportFile('html')}
        title="EasyMindMap에서 생성된 HTML 파일만 불러올 수 있습니다"
        style={fileBtnStyle}>🌐 HTML 파일 불러오기</button>
      <button onClick={() => startImportFile('zip')}
        title="EasyMindMap에서 생성된 HTML/MD와 files/ 폴더의 첨부파일을 포함한 ZIP을 불러옵니다"
        style={fileBtnStyle}>🗜 ZIP 파일 불러오기</button>
      <div style={{ fontSize: 10, color: t.textSubtle, lineHeight: 1.5, margin: '2px 0 4px' }}>
        MD는 일반 문서·EasyMindMap 생성 파일 모두, HTML/ZIP은 EasyMindMap이
        생성한 파일만 지원합니다. 불러온 뒤 적용할 템플릿을 고를 수 있습니다.
      </div>
        </div>
      )}

    </div>
  );
}
