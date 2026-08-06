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
import { I } from '@/components/icons';
import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import { parseHtmlMapFile, parseMarkdownMapFile, parseZipMapFile } from '@/utils/importMapFile';
import { resolveRemoteImages } from '@/utils/remoteImages';
import { isDocumentEmpty, NEW_MAP_TITLE, useDocumentStore } from '@/stores/documentStore';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { useAiSettingsStore } from '@/stores/aiSettingsStore';
import { detachFromServer } from '@/services/cloud/mapSession';
import { useCloudStore } from '@/stores/cloudStore';
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
  // 안내 문구 — 실패는 **빨간 오류 스타일 + 오래 표시 + 스크롤**로
  // 구분한다. 이전에는 성공과 같은 작은 주황 글씨였고 패널 맨 위에만
  // 떠서, 아래쪽 '불러오기' 버튼을 쓴 사용자에게는 화면 밖이라
  // "아무 반응이 없다"로 보였다 (2026-08-05 보고).
  const [notice, setNotice] =
    useState<{ msg: string; error: boolean } | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
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
  // 로그인 상태 — 서버 맵 메뉴 숨김 판단 (2026-08-03).
  // Guest 체험(2026-08-04)도 서버 맵이 없으므로 함께 숨긴다.
  const session = useAuthStore((s) => s.session);
  const guest = useAuthStore((s) => s.guest);
  // 새 맵/불러오기 직후 — 적용할 템플릿 선택 단계.
  //   mode 'new'   : 템플릿 골격+속성으로 새 맵 시작 (templateSkeletonMap)
  //   mode 'import': 불러온 내용은 유지, 속성만 입힘 (applyTemplateStyles)
  const [chooseTpl, setChooseTpl] =
    useState<{ msg: string; mode: 'new' | 'import' } | null>(null);

  useEffect(() => {
    setUserTpls(loadUserTemplates());
  }, []);

  const flash = (msg: string, error = false) => {
    setNotice({ msg, error });
    window.setTimeout(() => setNotice(null), error ? 8000 : 2500);
    // 실패 문구는 패널이 스크롤돼 있어도 눈에 들어오게 끌어올린다
    if (error) {
      window.setTimeout(() => {
        noticeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 0);
    }
  };

  // 실제로 문서를 갈아 끼우는 부분 — **템플릿을 고르거나 건너뛴 뒤에만**
  // 부른다 (2026-08-05 보고: 선택 단계에서 취소할 수 있어야 한다).
  // 예전에는 '새 맵 만들기'를 누른 순간 곧바로 갈아 끼우고 나서 템플릿을
  // 물었기 때문에, 그 단계의 취소는 "이미 지운 맵을 되살리기"가 됐다.
  const replaceWithBlankDoc = () => {
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
  };

  // 확인 게이트 — 현재 맵을 닫는 것을 사용자가 승인한 뒤 실행.
  //
  // **묻지 않는 경우는 하나뿐이다 — 잃을 것이 정말 없을 때.**
  //  · **문서가 비어 있다** ('문서 없음' — 맵 닫기 직후·로그인 직후).
  //    화면에 닫을 맵이 없는데 "현재 맵을 닫고 진행할까요?" 는 무의미하다
  //    (2026-08-02 사용자 보고).
  //  · 서버 맵과 무관한 문서를 **한 번도 건드리지 않았다**
  //    (첫 화면의 손대지 않은 샘플·기본 골격이 여기 해당한다).
  //
  // **서버 맵을 열어 둔 상태면 편집을 안 했어도 묻는다** (2026-08-06
  // 사용자 보고). 예전 판정은 `past.length === 0` 하나였는데, 되돌리기
  // 경계를 고치면서(§6.6-1) 서버 맵을 연 직후 past 가 0 이 되어 **확인
  // 없이 곧바로 새 맵으로 넘어갔다.** 사용자가 보기엔 열어 둔 맵이 말도
  // 없이 사라지는 것이라, "편집했는가"가 아니라 **"닫을 맵이 열려
  // 있는가"** 를 함께 본다.
  //
  // `saveState === 'unsaved'` 는 쓰지 않는다 — 문서를 **불러오기만 해도**
  // 그 상태가 되므로, 손대지 않은 첫 화면에서도 확인창이 떠 버린다.
  const confirmThen = (label: string, run: () => void) => {
    setChooseTpl(null);
    const doc = useDocumentStore.getState();
    const hasOpenServerMap = !!useCloudStore.getState().cloudMapId;
    const nothingToLose = isDocumentEmpty(doc.map)
      || (!hasOpenServerMap && doc.past.length === 0);
    if (nothingToLose) {
      run();
      return;
    }
    setPending({ label, run });
  };

  // 현재 맵을 닫아도 되는지 확인한 다음 **템플릿 선택 단계만** 연다.
  // 문서는 아직 그대로다 — 여기서 ✕(취소)를 누르면 아무 일도 없었던
  // 것이 된다.
  const startBlank = () => confirmThen('새 맵 만들기', () =>
    setChooseTpl({ msg: '새 맵을 시작합니다', mode: 'new' }));
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
      replaceWithBlankDoc(); // 고른 순간에 비로소 새 문서로 갈아 끼운다
      const curTitle = useDocumentStore.getState().map.title;
      const map = templateSkeletonMap(tpl.map);
      map.title = curTitle;
      map.root = { ...map.root, text: curTitle }; // 제목 = 중심 주제
      // **되돌리기 경계** — 이 loadMap 은 replaceWithBlankDoc() 의 기본
      // 골격을 템플릿 골격으로 **갈아 끼우는** 동작이다. resetHistory 를
      // 빼면 "기본 골격 → 템플릿 골격" 전환이 되돌리기에 한 건 남아,
      // 새 맵에서 Ctrl+Z 를 하면 **고르지도 않은 기본 골격(트리-진행트리
      // 11노드)** 이 튀어나온다 (2026-08-06 실사용 보고).
      loadMap(map, { resetHistory: true });
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
    // 불러온 문서에 스타일만 입힌다 — 출처 유지 (보통 출처 없음)
    loadMap(applyTemplateStyles(cur, tpl.map), { keepOrigin: true });
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
    // 불러오기도 문서 경계 — 되돌리기가 이전 문서로 넘어가지 않게 한다
    loadMap(resolvedMap, { resetHistory: true });
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
            flash(`⚠ '${file.name}' 안에서 EasyMindMap 맵 파일(.md/.html)을 ` +
              '찾지 못했습니다. 이 앱의 [내보내기]로 만든 ZIP만 열 수 있습니다.', true);
            return;
          }
          await applyImported(imported, stats.movedToNote);
        })();
      };
      reader.readAsArrayBuffer(file);
      return;
    }
    setNotice(null); // 새 파일을 고르면 이전 안내(특히 8초 오류)는 치운다
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
          ? `⚠ '${file.name}' 은(는) EasyMindMap 뷰어 HTML이 아닙니다. ` +
            '이 앱의 [내보내기 → HTML 파일]로 만든 파일만 열 수 있습니다 ' +
            '(맵 정보가 들어 있어야 합니다). 일반 웹페이지 HTML은 ' +
            '지원하지 않습니다 — 웹 문서를 맵으로 만들려면 내용을 복사해 ' +
            '노드에 붙여넣거나, MD 파일로 저장해 불러오세요.'
          : `⚠ '${file.name}' 에서 맵으로 만들 구조를 찾지 못했습니다. ` +
            'Markdown 견출(#)이나 리스트(-)가 있는 파일이어야 합니다.',
          true);
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
        <div
          ref={noticeRef}
          data-testid="newmap-notice"
          data-notice-kind={notice.error ? 'error' : 'info'}
          style={notice.error ? {
            fontSize: 11.5, color: '#B91C1C', fontWeight: 600, marginBottom: 8,
            padding: '8px 10px', borderRadius: 6, lineHeight: 1.6,
            background: '#FEF2F2', border: '1px solid #FECACA',
          } : {
            fontSize: 10.5, color: t.primary, fontWeight: 600, marginBottom: 8,
            padding: '5px 8px', borderRadius: 5, background: t.primarySoft,
          }}
        >{notice.msg}</div>
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
          {/* 머리줄: 안내 + ✕ 취소. 아이콘만 있는 버튼이라 툴팁을 남긴다
              (글자가 붙은 목록 행과 달리 여기선 툴팁이 유일한 설명) */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 3,
          }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: t.primary, flex: 1 }}>
              {chooseTpl.msg}
            </div>
            <button
              data-testid="tpl-cancel"
              onClick={() => {
                setChooseTpl(null);
                if (chooseTpl.mode === 'new') flash('새 맵 만들기를 취소했습니다');
              }}
              title={chooseTpl.mode === 'new'
                ? '새 맵 만들기 취소 — 지금 열려 있는 맵을 그대로 둡니다'
                : '닫기 — 불러온 내용을 그대로 둡니다'}
              aria-label={chooseTpl.mode === 'new' ? '새 맵 만들기 취소' : '닫기'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, flexShrink: 0,
                borderRadius: 5, border: `1px solid ${t.border}`,
                background: t.surface, color: t.textMuted, cursor: 'pointer', padding: 0,
              }}><I.X size={13} /></button>
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
          {/* 웹 AI 진입 (방법 A — web-ai-clipboard.md §3-3): 우측 AI
              탭을 웹 AI 모드로 연다. 새 맵은 이미 시작된 상태다. */}
          {chooseTpl.mode === 'new' && (
            <button
              data-testid="tpl-ai-start"
              onClick={() => {
                replaceWithBlankDoc(); // 여기서 새 맵을 시작한다
                setChooseTpl(null);
                useAiSettingsStore.getState().setGenMode('web');
                useEditorUiStore.getState().setInspectorTab('ai');
              }}
              title="AI 웹 구독(Claude·ChatGPT·Gemini)으로 맵 초안을 만듭니다 — API 키 불필요"
              style={{
                width: '100%', fontSize: 11.5, padding: '6px 0', borderRadius: 6,
                border: `1px solid ${t.primaryBorder}`, background: t.primarySoft,
                color: t.primary, cursor: 'pointer', fontWeight: 700, marginBottom: 5,
              }}>🌐 AI로 초안 만들기 (웹 AI · 키 불필요)</button>
          )}
          {/* 건너뛰기 = "템플릿 없이" 진행. 새 맵 모드에서는 이때
              기본 골격으로 문서를 갈아 끼운다 (취소 ✕ 와 다른 동작) */}
          <button
            data-testid="tpl-skip"
            onClick={() => {
              if (chooseTpl.mode === 'new') {
                replaceWithBlankDoc();
                setChooseTpl(null);
                flash('기본 골격으로 새 맵을 시작했습니다');
                return;
              }
              setChooseTpl(null);
            }}
            style={{
              width: '100%', fontSize: 11.5, padding: '6px 0', borderRadius: 6,
              border: `1px solid ${t.border}`, background: t.surface,
              color: t.text, cursor: 'pointer', fontWeight: 600,
            }}>건너뛰기 (기본 그대로)</button>
        </div>
      )}

      {/* 템플릿 선택·맵 닫기 확인 단계가 떠 있는 동안에는 아래 메뉴를
          숨긴다 (2026-08-03 보고 — 선택 카드 밑에 '새 맵 만들기'가 또
          보여 이중으로 오해). 건너뛰기/취소를 누르면 다시 나타난다. */}
      {!chooseTpl && !pending && (<>

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
      {!(authEnabled && (session || guest)) && menuHeader({
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

      </>)}
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
      {!chooseTpl && !pending && openLocal && (
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
