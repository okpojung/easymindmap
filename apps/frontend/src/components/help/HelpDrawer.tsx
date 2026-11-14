import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { I } from '@/components/icons';
import { THEMES, type ThemeTokens } from '@/components/design-tokens/theme';
import './HelpDrawer.css';

export interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 부모의 현재 테마 토큰. 생략하면 밝은 테마. */
  t?: ThemeTokens;
}

const chapters = [
  ['icons', '아이콘 안내'], ['shortcuts', '단축키'], ['notes', '메모'],
  ['ai', 'AI / MCP'], ['variables', '변수 [&이름]'], ['project', '프로젝트 태그 / 간트'],
  ['connectors', '연결선'], ['redmine', 'Redmine'], ['save', '저장 / 내보내기'],
] as const;
const shortcuts = [
  ['저장 (단독 편집 맵)', 'Ctrl+S'],
  ['자식 노드 추가', 'Space / Tab'], ['다음 형제 노드 추가', 'Enter / Shift+Space'],
  ['이전 형제 노드 추가', 'Ctrl+Shift+Space'], ['부모 노드 추가', 'Ctrl+←'],
  ['다중 노드 추가', 'Ctrl+Space'], ['실행 취소', 'Ctrl+Z'],
  ['다시 실행', 'Ctrl+Y / Ctrl+Shift+Z'], ['노드 복사 / 잘라내기 / 붙여넣기', 'Ctrl+C / X / V'],
  ['선택 노드 또는 연결선 삭제', 'Delete'], ['확대 / 축소', '+ / −'],
  ['보기 초기화', '0'], ['화면 이동 모드', 'H'], ['미니맵 표시 / 숨기기', 'Alt+H'],
  ['선택 노드에 초점', 'Alt+F'], ['선택 하위 모두 펼치기 / 접기', 'Alt++ / Alt+−'],
  ['도움말 열기 (입력 중 제외)', '?'], ['모드 취소 / 도움말 닫기', 'Esc'],
];
const iconGuide = [
  { icon: I.Undo, name: '실행 취소', detail: '직전 편집을 되돌립니다.', key: 'Ctrl+Z' },
  { icon: I.Redo, name: '다시 실행', detail: '되돌린 편집을 다시 적용합니다.', key: 'Ctrl+Y' },
  { icon: I.Note, name: '노트', detail: '선택 노드에 메모를 추가하거나 맵의 메모를 살펴봅니다.' },
  { icon: I.Variable, name: '변수', detail: '반복해서 사용하는 값을 등록합니다.' },
  { icon: I.Tag, name: '태그', detail: '일반 태그와 일정·담당자·진척률을 관리합니다.' },
  { icon: I.Gantt, name: '간트', detail: '프로젝트 일정을 시간축으로 봅니다.' },
  { icon: I.Sparkles, name: 'AI', detail: '앱에서 제공하는 AI 기능을 엽니다. MCP 설정과는 별개입니다.' },
  { icon: I.Share, name: '공유', detail: '저장된 맵의 공유 설정을 엽니다. 계정·서버에 따라 제공 범위가 다릅니다.' },
  { icon: I.Globe, name: '퍼블리싱', detail: '맵의 공개 설정을 엽니다. 공개 범위를 먼저 확인하세요.' },
  { icon: I.Download, name: '내보내기', detail: 'HTML 또는 Markdown 파일로 내려받습니다.' },
  { icon: I.Minimap, name: '미니맵', detail: '전체 맵에서 현재 위치를 확인합니다.', key: 'Alt+H' },
  { icon: I.Hand, name: '화면 이동', detail: '맵을 편집하지 않고 화면을 이동합니다.', key: 'H' },
];

/** 부모의 ? 키 연결용. 입력·IME 조합 중이거나 다른 모달이 열리면 제외한다. */
export function isHelpShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.repeat || event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, [role="textbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"])')) return false;
  return !document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]');
}

/** Native modal dialog provides an inert background and keyboard focus containment. */
export function HelpDrawer({ open, onClose, t = THEMES.light }: HelpDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    closeRef.current?.focus({ preventScroll: true });
    // Canvas has window-level handlers; do not let help keystrokes edit the map.
    const isolate = (event: KeyboardEvent) => {
      event.stopImmediatePropagation();
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault();
        closeCallback.current();
      }
    };
    const isolateClipboard = (event: ClipboardEvent) => event.stopImmediatePropagation();
    window.addEventListener('keydown', isolate, true);
    window.addEventListener('paste', isolateClipboard, true);
    return () => {
      window.removeEventListener('keydown', isolate, true);
      window.removeEventListener('paste', isolateClipboard, true);
      if (dialog.open) dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open || typeof document === 'undefined') return null;
  const colors = {
    '--help-surface': t.surface, '--help-alt': t.surfaceAlt, '--help-text': t.text,
    '--help-muted': t.textMuted, '--help-border': t.border, '--help-primary': t.primary,
    '--help-soft': t.primarySoft,
  } as CSSProperties;
  const sectionId = (key: string) => id + '-' + key;
  return createPortal(
    <dialog ref={dialogRef} className="emm-help" style={colors} lang="ko" aria-modal="true"
      aria-labelledby={id + '-title'} aria-describedby={id + '-intro'} data-testid="help-drawer"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header className="emm-help__header">
        <div><span className="emm-help__eyebrow">EasyMindMap 사용 안내</span><h2 id={id + '-title'}>도움말</h2></div>
        <button ref={closeRef} className="emm-help__close" type="button" aria-label="도움말 닫기 (Esc)" onClick={onClose}><I.X size={20} aria-hidden="true" /></button>
      </header>
      <div className="emm-help__body">
        <p id={id + '-intro'} className="emm-help__intro">아이콘부터 저장까지, 필요한 내용을 골라 보세요. 기능은 서버·계정 권한·보기 모드에 따라 달라질 수 있습니다.</p>
        <nav className="emm-help__toc" aria-label="도움말 목차">{chapters.map(([key, title], index) => <a key={key} href={'#' + sectionId(key)} onClick={(event) => {
          event.preventDefault(); const target = document.getElementById(sectionId(key)); target?.scrollIntoView({ block: 'start' }); target?.focus({ preventScroll: true });
        }}><span>{String(index + 1).padStart(2, '0')}</span>{title}</a>)}</nav>
        <section className="emm-help__section" id={sectionId('icons')} tabIndex={-1} aria-labelledby={sectionId('icons-title')}>
          <h3 id={sectionId('icons-title')}>01 · 아이콘 안내</h3>
          <p>아이콘의 이름은 마우스를 올려 확인하세요. 모바일에서는 화면의 메뉴 이름과 이 안내를 함께 참고하세요.</p>
          <p>상단은 저장·보기·간트·공유/공개 그룹으로 구분됩니다. 보기 그룹의 첫 아이콘은 현재 화면과 반대인 맵 또는 아웃라인으로 전환하며, 분할 화면과 테마는 옆에서 선택합니다. 공유·퍼블리싱·대시보드맵은 공유/공개 메뉴에 있습니다. 캔버스 도구막대는 화살표로 접고, 점 손잡이를 끌어 이동하고, 핀으로 위치를 고정합니다. 손잡이를 두 번 누르거나 Home 키를 누르면 위치를 초기화합니다. 화면 이동(Pan)·초점·맞춤·전체화면은 하단에서 사용하며, 모바일 Pan은 항상 표시됩니다. 하단의 현재 배율을 누르면 100%로 돌아갑니다. 미니맵 표시·숨기기는 Alt+H입니다.</p>
          <dl className="emm-help__icons">{iconGuide.map(({ icon: Icon, name, detail, key }) => <div key={name}><dt><Icon size={18} aria-hidden="true" /><strong>{name}</strong>{key && <kbd>{key}</kbd>}</dt><dd>{detail}</dd></div>)}</dl>
        </section>
        <section className="emm-help__section" id={sectionId('shortcuts')} tabIndex={-1} aria-labelledby={sectionId('shortcuts-title')}>
          <h3 id={sectionId('shortcuts-title')}>02 · 단축키</h3>
          <p>아래는 맵 캔버스에서 글자를 편집하지 않을 때의 단축키입니다. Mac에서는 Ctrl 대신 Command를 사용합니다. 브라우저·운영체제가 일부 키를 먼저 사용할 수 있습니다.</p>
          <dl className="emm-help__keys">{shortcuts.map(([label, key]) => <div key={label}><dt>{label}</dt><dd><kbd>{key}</kbd></dd></div>)}</dl>
          <p className="emm-help__callout">아웃라인은 키 동작이 다릅니다. 아웃라인의 Tab / Shift+Tab은 들여쓰기 / 내어쓰기입니다. 읽기 전용이나 내장형 편집기에서는 편집 단축키가 제한됩니다.</p>
        </section>
        <section className="emm-help__section" id={sectionId('notes')} tabIndex={-1} aria-labelledby={sectionId('notes-title')}>
          <h3 id={sectionId('notes-title')}>03 · 메모</h3>
          <p>노드를 선택한 뒤 플로팅 도구막대의 첨부 추가 메뉴에서 MD 파일, 노트 문단, 코드블록, 표를 추가할 수 있습니다. MD 파일은 첨부로, 나머지는 노트로 관리합니다.</p>
          <ol><li>메모를 붙일 노드를 선택합니다.</li><li>왼쪽 메뉴의 <strong>노트</strong>를 엽니다.</li><li>문단, 코드, 표, 체크리스트 중 필요한 유형을 추가하고 저장합니다.</li></ol>
          <p>노트 목록에서 내용을 미리 보거나 편집하고, 해당 노드로 이동할 수 있습니다. 체크리스트는 항목의 완료 여부를 표시합니다.</p>
          <p className="emm-help__callout">메모 추가 전용 단축키는 현재 기본 편집기에 없습니다. 노트 메뉴의 추가 버튼을 사용하세요.</p>
        </section>
        <section className="emm-help__section" id={sectionId('ai')} tabIndex={-1} aria-labelledby={sectionId('ai-title')}>
          <h3 id={sectionId('ai-title')}>04 · AI / MCP</h3>
          <p>왼쪽 메뉴의 AI 버튼과 외부 AI를 연결하는 MCP는 서로 다른 진입점입니다.</p>
          <ol><li><strong>계정 메뉴 → AI 커넥터(MCP)</strong>를 엽니다.</li><li>그 화면에 표시된 연결 주소를 복사합니다. 주소는 서버마다 다르며, 브라우저의 앱 주소와 같다고 가정하면 안 됩니다.</li><li>알아보기 쉬운 이름으로 토큰을 발급합니다. 원문은 발급 직후 한 번만 표시되므로 안전하게 보관합니다.</li><li>MCP를 지원하는 AI 도구의 커넥터 설정에서 주소와 토큰을 등록합니다. 입력 방식은 AI 도구의 안내를 따르세요.</li><li>연결 후 먼저 읽기 요청으로 시험하고, 수정 요청 전에는 대상 맵과 범위를 확인합니다.</li></ol>
          <p className="emm-help__callout">토큰은 비밀번호처럼 취급하세요. 공개 맵이나 채팅에 붙이지 마세요. 분실하거나 더 이상 필요 없으면 같은 화면에서 폐기하세요. 서버가 MCP를 지원하지 않으면 연결할 수 없습니다.</p>
        </section>
        <section className="emm-help__section" id={sectionId('variables')} tabIndex={-1} aria-labelledby={sectionId('variables-title')}>
          <h3 id={sectionId('variables-title')}>05 · 변수 [&amp;이름]</h3>
          <ol><li>왼쪽 <strong>변수</strong> 패널에서 이름, 유형, 값을 등록합니다.</li><li>변수의 복사 버튼을 누르고 노드 글자에 <code>[&amp;이름]</code>을 붙여 넣습니다.</li><li>예: <code>담당: [&amp;담당자]</code>처럼 같은 값을 여러 노드에서 재사용합니다.</li></ol>
          <p>변수 패널에서 표시 결과와 사용 위치를 확인할 수 있습니다. 미등록 변수는 먼저 등록하세요. 노드 참조·개수·수식 유형도 패널에서 선택할 수 있습니다.</p>
          <p>문서 안에 저장하는 값과 DB 저장은 다릅니다. DB / API 기능은 서버 지원과 맵 권한이 있을 때만 사용할 수 있습니다.</p>
        </section>
        <section className="emm-help__section" id={sectionId('project')} tabIndex={-1} aria-labelledby={sectionId('project-title')}>
          <h3 id={sectionId('project-title')}>06 · 프로젝트 태그 / 간트</h3>
          <p>노드를 선택하고 태그 패널의 <strong>프로젝트 태그</strong>에서 시작일·끝일, 담당자, 진척률(0~100)을 입력합니다. 담당자는 최대 3명이며, 후보 검색 지원은 서버에 따라 다릅니다.</p>
          <p>표시 체크를 끄면 노드의 태그만 숨겨지고 값은 남습니다. 일반 해시태그와 일정·담당자 같은 프로젝트 정보는 구분됩니다.</p>
          <p>일반 태그의 표시 설정은 태그 패널 한 곳에서 관리합니다. 전체 표시 스위치나 각 태그 옆 눈 버튼을 사용하세요. 태그 이름을 누르면 표시 전환이 아니라 노드에 붙이는 모드가 켜집니다.</p>
          <p>간트 메뉴에서 화면 안에 붙이기, 새 탭, 새 창 중 원하는 보기를 고릅니다. 일정이 보이지 않으면 노드의 날짜를 확인하세요. 새 창이 안 열리면 브라우저의 팝업 차단을 확인하세요.</p>
        </section>
        <section className="emm-help__section" id={sectionId('connectors')} tabIndex={-1} aria-labelledby={sectionId('connectors-title')}>
          <h3 id={sectionId('connectors-title')}>07 · 연결선</h3>
          <ol><li>출발 노드를 선택하고 캔버스 도구막대의 연결선 버튼을 누릅니다.</li><li>연결할 대상 노드를 선택합니다.</li><li>만들어진 연결선을 선택해 모양, 색, 굵기, 점선, 화살표, 라벨 등을 조정합니다.</li></ol>
          <p>연결선은 부모·자식 가지와 별개의 관계입니다. 선택한 연결선은 Delete로 삭제할 수 있고, 연결 모드는 Esc로 취소할 수 있습니다.</p>
        </section>
        <section className="emm-help__section" id={sectionId('redmine')} tabIndex={-1} aria-labelledby={sectionId('redmine-title')}>
          <h3 id={sectionId('redmine-title')}>08 · Redmine</h3>
          <p>Redmine 연계 제공 여부와 설정 화면은 설치된 서버·추가 모듈에 따라 다릅니다. 이 기본 편집기의 프로젝트 태그만 입력한다고 Redmine 일감이 생성되거나 동기화되는 것은 아닙니다.</p>
          <p>연계 기능이 제공되는 환경에서는 해당 화면에서 서버·프로젝트·계정 권한, 대상 일감과 반영 방향을 먼저 확인하세요. 실제 연계 화면에 없는 자동 동기화나 실시간 반영을 전제로 작업하지 마세요.</p>
          <p className="emm-help__callout">연계 메뉴가 보이지 않으면 현재 환경에서 지원하는지 관리자에게 확인하세요. Redmine의 API 키와 MCP 토큰은 별개이며 공개 맵에 기록하면 안 됩니다.</p>
        </section>
        <section className="emm-help__section" id={sectionId('save')} tabIndex={-1} aria-labelledby={sectionId('save-title')}>
          <h3 id={sectionId('save-title')}>09 · 저장 / 내보내기</h3>
          <p>단독 편집 맵은 상단 저장 표시를 누르거나 Ctrl+S로 저장합니다. 입력 중인 노드 글자는 먼저 확정한 뒤 저장합니다. 버전 저장과 다른 이름으로 저장은 저장 옆의 저장 옵션 아이콘에서 선택합니다. 되돌리기와 다시 실행 사이 숫자는 되돌린 단계 수입니다. 협업맵은 ‘협업 중 · 자동 반영’ 상태만 표시하며, 게스트·읽기 전용·협업맵에서는 수동 저장 단축키가 실행되지 않습니다.</p>
          <p>상단의 저장 상태를 확인하세요. 저장 중, 미저장 변경, 재시도, 오류는 저장 완료와 다릅니다. 게스트 맵이나 아직 서버에 저장하지 않은 맵도 구분해 확인하세요.</p>
          <ul><li><strong>HTML:</strong> 브라우저에서 볼 수 있는 파일로 내보냅니다.</li><li><strong>암호화 HTML:</strong> 암호로 보호하는 내보내기입니다. 암호는 별도의 안전한 경로로 전달하세요.</li><li><strong>Markdown:</strong> 마인드맵 내용을 Markdown 형식으로 내려받습니다.</li></ul>
          <p>첨부파일 처리에 따라 ZIP으로 내려받을 수 있습니다. 내보내기 화면의 안내를 확인하고, 외부 링크나 첨부가 빠지지 않았는지 결과 파일을 열어 확인하세요. 파일 내보내기는 서버 저장이나 공유 설정 변경과 별개입니다.</p>
        </section>
      </div>
      <footer className="emm-help__footer">닫기: <kbd>Esc</kbd><button type="button" onClick={onClose}>편집기로 돌아가기</button></footer>
    </dialog>, document.body,
  );
}
export default HelpDrawer;
