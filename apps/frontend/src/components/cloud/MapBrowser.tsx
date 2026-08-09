// MapBrowser — 문서함(서버 맵 목록)을 **편집 영역 안에** 여는 화면.
//
// 2026-08-02 사용자 지시: "서버 맵 불러오기는 팝업창이 아니라 오른쪽
// 편집 화면 영역에 표시하고 선택할 수 있도록". 팝업 모달(MapListModal)을
// 대체한다 — 목록이 길어도 화면을 다 쓰고, 폴더 이동·정렬이 편하다.
//
// ## 2026-08-07 — 폴더 들락날락을 없앤 **트리 목록** (사용자 방안 3)
//
// 예전에는 폴더를 누르면 그 폴더로 **들어가고**(cwd) 경로(breadcrumb)로
// 되돌아 나왔다. 그래서
//   · 파일이 어느 폴더에 있는지 보려면 폴더마다 들어갔다 나와야 했고,
//   · 검색이 **지금 폴더 안에서만** 되어 "내 문서에서 찾기"가 안 됐다.
//
// 지금은 폴더를 누르면 **그 자리에서 하위가 펼쳐진다**. 폴더 위치와
// 파일 이름을 한 화면에서 같이 보고, 검색은 **문서함 전체**를 훑는다.
//   · 기본은 **모두 접기** (첫 화면이 조용하다)
//   · 검색하면 **맞는 파일이 든 폴더만 자동으로 펼쳐지고**, 그 안에서도
//     **맞는 파일만** 남는다
//   · `⊞ 모두 펼치기 / ⊟ 모두 접기` 로 한 번에
//
// 여는 방식은 mapSession 규칙을 따른다 — 편집 중이면 브라우저 새 탭,
// 잃을 것이 없으면 이 탭.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import {
  cloudApi, CloudError,
  type FolderItem, type MapListItem,
} from '@/services/cloud/apiClient';
import { useCloudStore } from '@/stores/cloudStore';
import { canReuseThisTab, openMapHere, openMapInNewTab } from '@/services/cloud/mapSession';
import { FolderPickerDialog } from './FolderPickerDialog';

type SortKey = 'title' | 'createdAt' | 'updatedAt'
  | 'nodeCount' | 'docBytes' | 'attachCount' | 'attachBytes';

/** 한 번에 받아 오는 맵 수 상한 — 서버 list() 의 limit 최대값과 같다 */
const MAP_FETCH_LIMIT = 500;

// 바이트 → 사람이 읽는 값·단위. null(통계 도입 전 저장분)은 '—'
function bytesParts(n: number | null | undefined): { v: string; u: string } {
  if (n === null || n === undefined) return { v: '—', u: '' };
  if (n < 1024) return { v: String(n), u: 'B' };
  if (n < 1024 * 1024) return { v: (n / 1024).toFixed(1), u: 'KB' };
  if (n < 1024 * 1024 * 1024) return { v: (n / 1024 / 1024).toFixed(1), u: 'MB' };
  return { v: (n / 1024 / 1024 / 1024).toFixed(2), u: 'GB' };
}

/** 목록 안의 값 — 예전과 같은 붙여 쓰기 ("309.8KB") */
function fmtBytes(n: number | null | undefined): string {
  const { v, u } = bytesParts(n);
  return v + u;
}

/**
 * 머리글 위 **합계**는 단위를 괄호로 떼어 쓴다 (2026-08-09 요청) —
 * `309.8(KB)` · `1,448(개)`. 숫자와 단위가 붙어 있으면 자릿수를 눈으로
 * 세기 어렵고, 열마다 단위가 달라 값끼리 비교도 헷갈렸다.
 *
 * 숫자와 `(` 사이는 **띄우지 않는다** (같은 날 2차) — 띄우면 좁은 열에서
 * 그 칸에서 줄이 바뀌어 `1,448` / `(개)` 두 줄로 접힌다. 머리글 줄만
 * 높아져 표가 어긋나 보였다. (그래도 안전하게 nowrap 을 함께 건다)
 */
function totalBytesText(n: number | null | undefined): string {
  const { v, u } = bytesParts(n);
  return u ? `${v}(${u})` : v;
}
function totalCountText(n: number): string {
  return `${n.toLocaleString()}(개)`;
}

// 날짜 — 목록 폭에 맞춘 짧은 표기 (YYYY.M.D HH:mm — 브라우저 로캘과
// 무관하게 항상 같은 형태)
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ` +
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
type SortOrder = 'asc' | 'desc';

/**
 * 이름 안의 검색어를 **글자 단위로 강조** (2026-08-08 2차 사용자 결정).
 * 폴더명·파일명이 맞은 경우는 어디가 맞았는지 이름에서 바로 보이면 되고,
 * 맵 **내용**이 맞은 경우만 건수(`맵(12건)`)로 알린다 — 여러 노드·노트가
 * 걸렸을 때 무엇을 보여줄지 고민할 필요가 없어진다.
 * 색은 에디터·뷰어의 검색 강조와 같은 고정색(노랑 + 진한 글자) — 라이트·
 * 다크 어느 쪽에서도 묻히지 않는다.
 */
function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  let key = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at < 0) { out.push(text.slice(from)); break; }
    if (at > from) out.push(text.slice(from, at));
    out.push(
      <mark
        key={key += 1}
        style={{
          background: '#FFE066', color: '#1F1B16',
          borderRadius: 2, padding: '0 1px',
        }}
      >{text.slice(at, at + q.length)}</mark>,
    );
    from = at + q.length;
  }
  return <>{out}</>;
}

/**
 * 화면에 그릴 한 줄 — 폴더 / 맵 / **새 폴더 입력**, `depth` 는 들여쓰기 단계.
 *
 * 새 폴더 입력이 목록의 한 줄인 이유 (2026-08-08 사용자 보고): 예전에는
 * 목록 **맨 위**에 "TTTT 안에 [폴더 이름]" 막대가 떴다. 그런데 누른 곳은
 * 목록 한참 아래의 TTTT 줄이라, 커서는 그대로 **다른 폴더 위에** 놓이고
 * 그 줄이 hover 로 강조된다 — 화면이 "TTTT 안"과 "Guide 선택됨" 두 가지를
 * 동시에 말한다. 입력창을 **누른 그 자리**(그 폴더 바로 아래, 한 단계
 * 들여써서)에 놓으면 어디에 만들어지는지 한눈에 보인다.
 */
type Row =
  | { kind: 'folder'; depth: number; folder: FolderItem }
  | { kind: 'map'; depth: number; map: MapListItem }
  | { kind: 'newFolder'; depth: number };

export function MapBrowser({
  t, onClose, onFlash, onOpened,
}: {
  t: ThemeTokens;
  onClose: () => void;
  onFlash: (msg: string) => void;
  /** 이 탭에 문서를 실제로 열었을 때 (호출부가 브라우저를 닫는다) */
  onOpened?: () => void;
}) {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [maps, setMaps] = useState<MapListItem[] | null>(null);
  // 기본 정렬 = **이름 오름차순** (2026-08-05 보고 — 사람이 찾는 순서는
  // '최근 고친 것'보다 '이름 가나다순'이다)
  const [sort, setSort] = useState<SortKey>('title');
  const [order, setOrder] = useState<SortOrder>('asc');
  const [err, setErr] = useState<string | null>(null);
  /** 새 폴더를 만드는 중 — parentId 는 만들 위치(null = 홈) */
  const [newFolder, setNewFolder] = useState<{ parentId: string | null; name: string } | null>(null);
  /**
   * 검색어 — **문서함 전체**를 훑는다. 2026-08-08 부터 이름뿐 아니라
   * **맵 안(노드 텍스트·노트·태그)** 까지 서버에서 찾는다.
   */
  const [query, setQuery] = useState('');
  /** 서버 내용 검색 결과 — 검색 중일 때 맵 목록을 이걸로 갈아 끼운다 */
  const [found, setFound] = useState<MapListItem[] | null>(null);
  /** 검색에 걸린 총 개수 — 상한(500)에 잘렸는지 알린다 */
  const [foundTotal, setFoundTotal] = useState(0);
  const [finding, setFinding] = useState(false);
  /** 서버 검색이 실패하면 받아 둔 목록에서 **이름만** 훑는 폴백 */
  const [findErr, setFindErr] = useState<string | null>(null);
  /** 펼쳐 둔 폴더 — 기본은 비어 있다(= 모두 접기) */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 폴더 이동 대상 — 눌러서 고르는 창 (window.prompt 대체, 2026-08-02)
  const [moving, setMoving] = useState<MapListItem | null>(null);
  // 상세 정보 카드 (2026-08-09 요청) — 파일명 위에 마우스를 올리거나
  // 행 오른쪽 ⓘ 를 누르면 뜬다. pinned=true(ⓘ 클릭)면 마우스를 떼도
  // 남아 있어 IP 같은 값을 드래그해 복사할 수 있다.
  const [info, setInfo] = useState<
    { map: MapListItem; x: number; y: number; pinned: boolean } | null
  >(null);
  const infoTimer = useRef<number | null>(null);
  const showInfoSoon = (map: MapListItem, el: HTMLElement) => {
    if (info?.pinned) return; // 고정된 카드는 호버로 갈아치우지 않는다
    if (infoTimer.current) window.clearTimeout(infoTimer.current);
    const r = el.getBoundingClientRect();
    infoTimer.current = window.setTimeout(
      () => setInfo({ map, x: r.left, y: r.bottom + 6, pinned: false }), 350);
  };
  const hideInfoSoon = () => {
    if (infoTimer.current) window.clearTimeout(infoTimer.current);
    setInfo((cur) => (cur && !cur.pinned ? null : cur));
  };
  const cloudMapId = useCloudStore((s) => s.cloudMapId);

  // **맵을 폴더별로 나눠 받지 않고 한 번에 전부** 받는다 — 트리와 전체
  // 검색이 모두 "문서함 전부"를 알아야 하기 때문이다. 서버 list() 는
  // folder 를 주지 않으면 그 사용자의 맵 전부를 준다.
  const load = useCallback(async () => {
    setErr(null);
    try {
      const [f, m] = await Promise.all([
        cloudApi.listFolders(),
        cloudApi.listMaps({ sort, order, limit: MAP_FETCH_LIMIT }),
      ]);
      setFolders(f.folders);
      setMaps(m.maps);
      if (m.total > m.maps.length) {
        setErr(`맵이 ${m.total}개라 최근 ${m.maps.length}개만 표시합니다 — 검색으로 좁혀 주세요.`);
      }
    } catch (e) {
      setMaps([]);
      setErr(e instanceof CloudError ? e.message : '문서함을 불러오지 못했습니다.');
    }
  }, [sort, order]);

  // 저장·맵 닫기가 일어나면(lastSavedAt 변화) 목록을 다시 읽는다 —
  // 문서함을 연 채로 저장한 경우에도 크기·수정일이 곧바로 반영된다
  // (2026-08-05 보고: 새로고침해야 반영됐다).
  const lastSavedAt = useCloudStore((s) => s.lastSavedAt);
  useEffect(() => { void load(); }, [load, lastSavedAt]);

  // Esc 는 **안쪽부터** 닫는다 (2026-08-08 사용자 보고에서 함께 발견).
  // 예전에는 무조건 문서함을 닫아서, 새 폴더 이름을 입력하다 Esc 로
  // 취소하면 **문서함이 통째로 닫혔다**. 검색어도 마찬가지였다.
  //   1) 새 폴더 입력 중 → 입력만 취소
  //   2) 검색 중       → 검색어만 지움
  //   3) 그 외          → 문서함 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (info) { setInfo(null); return; }
      if (newFolder) { setNewFolder(null); return; }
      if (query) { setQuery(''); return; }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, newFolder, query, info]);

  // ── 내용 검색 ───────────────────────────────────────────────
  // 서버가 제목 + 맵 안(노드·노트·태그)을 찾아 **맞은 맵만** 돌려준다.
  // 받아 둔 목록에서 훑지 않는 이유: 목록은 최근 N개로 잘려 있어 그
  // 바깥의 맵은 이름조차 못 찾았다. 폴더는 내용이 없으므로 이름 검색
  // 그대로 (폴더 목록은 잘리지 않고 전부 받는다).
  const qRaw = query.trim();
  const searching = qRaw.length > 0;
  useEffect(() => {
    if (!searching) {
      setFound(null); setFoundTotal(0); setFinding(false); setFindErr(null); return;
    }
    let alive = true;
    setFinding(true);
    // 타자마다 서버를 두드리지 않는다 — 멈칫한 뒤에 한 번
    const timer = window.setTimeout(() => {
      cloudApi.listMaps({ q: qRaw, sort, order, limit: MAP_FETCH_LIMIT })
        .then((r) => {
          if (!alive) return;
          setFound(r.maps); setFoundTotal(r.total); setFindErr(null);
        })
        .catch((e) => {
          if (!alive) return;
          setFound(null);
          setFindErr(e instanceof CloudError ? e.message : '검색에 실패했습니다.');
        })
        .finally(() => { if (alive) setFinding(false); });
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [qRaw, searching, sort, order]);

  // ── 트리 계산 ───────────────────────────────────────────────
  const q = qRaw.toLowerCase();
  const hit = (name: string) => name.toLowerCase().includes(q);
  /** 서버 검색이 살아 있으면 그 결과, 실패했으면 이름 폴백 */
  const serverFound = searching && found !== null;
  /** 화면에 그릴 맵 모음 — 검색 중에는 검색 결과 */
  const mapPool = serverFound ? found : (maps ?? []);
  /** 이 맵을 검색 결과로 볼지 — 서버 결과는 전부 맞은 것이다 */
  const mapHit = (m: MapListItem) => (serverFound ? true : hit(m.title || ''));

  /** parentId → 그 아래 폴더들 (이름순. 이름 내림차순 정렬 중이면 역순) */
  const foldersByParent = useMemo(() => {
    const m = new Map<string, FolderItem[]>();
    for (const f of folders) {
      const k = f.parentId ?? '';
      const arr = m.get(k);
      if (arr) arr.push(f); else m.set(k, [f]);
    }
    const desc = sort === 'title' && order === 'desc';
    for (const arr of m.values()) {
      arr.sort((a, b) => (desc
        ? b.name.localeCompare(a.name, 'ko')
        : a.name.localeCompare(b.name, 'ko')));
    }
    return m;
  }, [folders, sort, order]);

  /** folderId → 그 폴더에 **직접** 든 맵들 (서버 정렬 순서 그대로) */
  const mapsByFolder = useMemo(() => {
    const m = new Map<string, MapListItem[]>();
    for (const x of mapPool) {
      const k = x.folderId ?? '';
      const arr = m.get(k);
      if (arr) arr.push(x); else m.set(k, [x]);
    }
    return m;
  }, [mapPool]);

  /**
   * 검색 중일 때 **이 폴더를 화면에 남길지** — 폴더 이름이 맞거나,
   * 하위 어딘가에 맞는 맵/폴더가 있으면 남긴다. (그래야 "검색된 파일이
   * 어느 폴더에 있는지"가 경로째 보인다)
   */
  const keepFolder = useMemo(() => {
    const memo = new Map<string, boolean>();
    const walk = (id: string): boolean => {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      memo.set(id, false); // 순환 방어
      let ok = (mapsByFolder.get(id) ?? []).some((m) => mapHit(m));
      if (!ok) {
        for (const c of foldersByParent.get(id) ?? []) {
          if (hit(c.name) || walk(c.folderId)) { ok = true; break; }
        }
      }
      memo.set(id, ok);
      return ok;
    };
    return (f: FolderItem) => hit(f.name) || walk(f.folderId);
    // hit/mapHit 은 q·serverFound 에서 파생 — 둘을 의존성으로 둔다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foldersByParent, mapsByFolder, q, serverFound]);

  /** 화면에 그릴 줄 목록 (폴더 먼저, 그다음 그 위치의 맵) */
  const rows = useMemo(() => {
    const out: Row[] = [];
    // 새 폴더 입력은 **만들어질 자리**에 그대로 끼워 넣는다 — 홈이면 맨
    // 위, 폴더 안이면 그 폴더 바로 아래에 한 단계 들여써서.
    const newAt = newFolder?.parentId ?? null;
    const walk = (parentId: string, depth: number) => {
      if (newFolder && parentId === '' && newAt === null) {
        out.push({ kind: 'newFolder', depth });
      }
      for (const f of foldersByParent.get(parentId) ?? []) {
        if (searching && !keepFolder(f)) continue;
        out.push({ kind: 'folder', depth, folder: f });
        if (newFolder && newAt === f.folderId) {
          out.push({ kind: 'newFolder', depth: depth + 1 });
        }
        // 검색 중에는 **맞는 것이 든 폴더를 자동으로 펼친다**
        if (searching || expanded.has(f.folderId)) walk(f.folderId, depth + 1);
      }
      for (const m of mapsByFolder.get(parentId) ?? []) {
        if (searching && !mapHit(m)) continue;
        out.push({ kind: 'map', depth, map: m });
      }
    };
    walk('', 0);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foldersByParent, mapsByFolder, expanded, searching, keepFolder, q, serverFound, newFolder]);

  const shownMaps = useMemo(
    () => rows.filter((r): r is Extract<Row, { kind: 'map' }> => r.kind === 'map').map((r) => r.map),
    [rows],
  );
  // 폴더 수량 — 합계와 기준을 맞춘다. 그냥 볼 때는 **전 폴더**(접혀
  // 있어도), 검색 중에는 **결과에 남은 폴더**.
  const folderCount = searching
    ? rows.filter((r) => r.kind === 'folder').length
    : folders.length;

  /**
   * **합계** (2026-08-06 요청) — 노드 수·문서 크기·첨부 개수·첨부 용량.
   *
   * 트리로 바뀌면서 기준도 바뀌었다. 예전에는 "지금 들어와 있는 폴더"가
   * 기준이었지만 이제 들어가는 개념이 없다 —
   *   · 그냥 볼 때  = **문서함 전체** (접혀 있어도 센다. "내 문서 전부가
   *     얼마나 쌓였나"가 궁금한 것이지, 펼친 것만 궁금한 게 아니다)
   *   · 검색 중     = **검색 결과**
   * 통계 도입 전에 저장된 맵은 값이 null 이라 합계에서 빠진다.
   */
  const totals = useMemo(() => {
    const list = searching ? shownMaps : (maps ?? []);
    const sum = (pick: (m: MapListItem) => number | null | undefined) =>
      list.reduce((acc, m) => acc + (pick(m) ?? 0), 0);
    return {
      maps: list.length,
      nodeCount: sum((m) => m.nodeCount),
      docBytes: sum((m) => m.docBytes),
      attachCount: sum((m) => m.attachCount),
      attachBytes: sum((m) => m.attachBytes),
    };
  }, [searching, shownMaps, maps]);

  const toggleFolder = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const expandAll = () => setExpanded(new Set(folders.map((f) => f.folderId)));
  const collapseAll = () => setExpanded(new Set());

  // ── 동작 ────────────────────────────────────────────────────
  const openMap = async (m: MapListItem) => {
    // 이 탭에서 이미 편집 중인 맵 — 새로 열 것이 없으니 문서함만 닫고
    // 편집 화면으로 돌아간다. (전에는 "이미 편집 중"이라며 거부만 해서,
    // 링크가 낡아 있으면 맵으로 돌아갈 길이 없었다 — 사용자 보고 #4)
    if (cloudMapId === m.mapId) {
      onClose();
      onFlash(`'${m.title}' 편집 화면으로 돌아갑니다.`);
      return;
    }
    if (canReuseThisTab()) {
      try {
        const { readOnly } = await openMapHere(m.mapId);
        onFlash(readOnly
          ? `🔒 '${m.title}' — 다른 세션(브라우저)에서 편집 중이라 읽기 전용으로 열었습니다. 변경은 이 맵에 저장되지 않으며, 필요하면 다른 이름으로 저장하세요.`
          : `☁ '${m.title}'을(를) 불러왔습니다.`);
        onOpened?.();
        onClose();
      } catch (e) {
        onFlash('⚠ ' + (e instanceof CloudError ? e.message : '불러오기 실패'));
      }
      return;
    }
    const ok = openMapInNewTab(m.mapId);
    onFlash(ok
      ? `↗ '${m.title}'을(를) 새 탭에서 열었습니다.`
      : '⚠ 팝업이 차단되어 새 탭을 열지 못했습니다. 브라우저의 팝업 차단을 해제해 주세요.');
  };

  const createFolder = async () => {
    if (!newFolder) return;
    const clean = newFolder.name.trim();
    const parentId = newFolder.parentId;
    setNewFolder(null);
    if (!clean) return;
    try {
      await cloudApi.createFolder(clean, parentId);
      onFlash(`📁 '${clean}' 폴더를 만들었습니다.`);
      // 하위 폴더를 만들었으면 그 부모를 펼쳐 둔다 — 만든 것이 바로 보인다
      if (parentId) setExpanded((p) => new Set(p).add(parentId));
      void load();
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '폴더를 만들지 못했습니다.'));
    }
  };

  const renameFolder = async (f: FolderItem) => {
    const next = window.prompt('폴더 새 이름', f.name);
    if (next == null || !next.trim() || next.trim() === f.name) return;
    try {
      await cloudApi.renameFolder(f.folderId, next.trim());
      void load();
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '이름 변경 실패'));
    }
  };

  const deleteFolder = async (f: FolderItem) => {
    if (!window.confirm(`“${f.name}” 폴더를 삭제할까요?`)) return;
    try {
      await cloudApi.deleteFolder(f.folderId);
      void load();
    } catch (e) {
      // 비어 있지 않으면 409 — 서버 메시지가 몇 개 남았는지 알려 준다
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '폴더 삭제 실패'));
    }
  };

  const renameMap = async (m: MapListItem) => {
    const next = window.prompt('맵 새 이름', m.title);
    if (next == null || !next.trim() || next.trim() === m.title) return;
    try {
      await cloudApi.updateMap(m.mapId, { title: next.trim() });
      if (cloudMapId === m.mapId) {
        useCloudStore.getState().link(m.mapId, new Date().toISOString(), { title: next.trim() });
      }
      void load();
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '이름 변경 실패'));
    }
  };

  const moveMapTo = async (m: MapListItem, folderId: string | null) => {
    setMoving(null);
    try {
      await cloudApi.updateMap(m.mapId, { folderId });
      onFlash(`📂 '${m.title}'을(를) 옮겼습니다.`);
      if (folderId) setExpanded((p) => new Set(p).add(folderId));
      void load();
    } catch (e) {
      // 옮기려는 폴더에 같은 이름이 있으면 409 — 서버 안내를 그대로
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '이동 실패'));
    }
  };

  const deleteMap = async (m: MapListItem) => {
    if (!window.confirm(`“${m.title || '제목 없음'}” 맵을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await cloudApi.deleteMap(m.mapId);
      if (cloudMapId === m.mapId) useCloudStore.getState().unlink();
      void load();
    } catch (e) {
      onFlash('⚠ ' + (e instanceof CloudError ? e.message : '삭제 실패'));
    }
  };

  // ── 스타일 ──────────────────────────────────────────────────
  // 머리글은 **그 열 값과 같은 쪽으로** 붙인다 (2026-08-05 보고: 숫자는
  // 오른쪽 정렬인데 제목만 왼쪽이라 어느 열의 제목인지 헷갈렸다).
  /**
   * 열 머리글 버튼.
   *
   * 색은 **전 열이 같다** (2026-08-09 2차 요청 — "모두 폴더/파일명 글자색과
   * 동일하게"). 예전에는 정렬 중인 열만 강조색이라, 기본 정렬인
   * `폴더/파일명` 만 또렷하고 나머지는 상대적으로 죽어 보였다.
   * 지금 정렬된 열은 **화살표로** 구분한다 — 정렬 중이면 ▲/▼, 아니면 ⇅.
   * 색까지 다르게 할 필요가 없다.
   */
  const th = (
    label: string, key: SortKey,
    align: 'left' | 'right' = 'left',
  ) => (
    <button
      data-testid={`browser-sort-${key}`}
      onClick={() => {
        if (sort === key) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
        else { setSort(key); setOrder(key === 'title' ? 'asc' : 'desc'); }
      }}
      title={`${label} 기준 정렬 (다시 누르면 오름/내림 전환)`}
      style={{
        display: 'flex', alignItems: 'center', gap: 3,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        width: align === 'right' ? '100%' : undefined,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: t.primary,
        fontSize: 11.5, fontWeight: 700, padding: 0, whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span style={{ fontSize: 9 }}>{sort === key ? (order === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </button>
  );

  /**
   * 숫자 열의 값·합계 공통 서식 (2026-08-07 요청 — "보기 좋게 정렬").
   * **오른쪽 맞춤 + 고정폭 숫자 글꼴**이라 자릿수가 세로로 딱 맞는다.
   * 머리글·합계·값이 모두 이걸 쓰므로 세 줄이 같은 오른쪽 선에 선다.
   */
  const numCell: React.CSSProperties = {
    display: 'block', textAlign: 'right',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontVariantNumeric: 'tabular-nums',
  };
  // 합계 줄의 값 — 오른쪽 맞춤·고정폭 숫자에 줄바꿈 금지.
  // (2026-08-09 3차: 머리글 위에 얹던 작은 글씨를 아래 한 줄로 내렸다)
  const totalNumCell: React.CSSProperties = { ...numCell, whiteSpace: 'nowrap' };

  const rowStyle: React.CSSProperties = {
    display: 'grid',
    // 숫자 4열은 머리글 글자('첨부 용량')가 잘리지 않을 만큼 넓힌다 —
    // 좁으면 라벨이 넘쳐 값과 어긋나 보인다 (2026-08-07 보고)
    gridTemplateColumns: '24px minmax(140px, 1fr) 76px 108px 108px 58px 76px 54px 86px 106px',
    alignItems: 'center',
    gap: 8,
    padding: '7px 10px',
    borderBottom: `1px solid ${t.divider}`,
    fontSize: 13,
    // 목록 행 공통 강조 (global.css .mm-list-row) — 마우스를 올린 줄이
    // 또렷하게 보인다 (2026-08-05 보고: 첨부 목록·뷰어 검색은 되는데
    // 문서함은 아무 표시가 없어 어느 줄을 고르는지 알기 어려웠다)
    ['--row-hover' as string]: t.primarySoft,
    ['--row-hover-bd' as string]: t.primaryBorder,
  } as React.CSSProperties;

  // 관리 버튼 — ✏/📂/🗑 이모지는 글꼴에 따라 알아볼 수 없게 작아진다
  // (2026-08-05 보고). 앱 SVG 아이콘 + 테두리로 눌리는 버튼임을 보인다.
  const iconBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 26, borderRadius: 6,
    background: t.surface, border: `1px solid ${t.border}`,
    color: t.textMuted, cursor: 'pointer', padding: 0,
  };
  // 관리 열 — 버튼 묶음을 가운데로 (머리글 '관리'도 같은 자리)
  const actionCell: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  };
  const toolBtn: React.CSSProperties = {
    height: 24, padding: '0 9px', borderRadius: 6, cursor: 'pointer',
    border: `1px solid ${t.border}`, background: t.surface, color: t.textMuted,
    fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
  };
  /** 들여쓰기 — 트리 단계마다 한 칸 (아이콘 열 다음부터 밀린다) */
  const indent = (depth: number) => ({ paddingLeft: depth * 16 });

  return (
    <div
      data-testid="map-browser"
      style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
        background: t.surface, color: t.text, overflow: 'hidden',
      }}
    >
      {/* 헤더 — 제목 + 도구.
          트리가 되면서 **경로(breadcrumb)가 사라졌다** — 폴더로 들어가지
          않으니 돌아 나올 길도 필요 없다. 대신 모두 펼치기/접기가 왔다. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px', borderBottom: `1px solid ${t.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 15, marginRight: 4 }}>내 문서</strong>
          <button
            data-testid="browser-expand-all"
            onClick={expandAll}
            title="모든 폴더 펼치기"
            style={toolBtn}
          >⊞ 모두 펼치기</button>
          <button
            data-testid="browser-collapse-all"
            onClick={collapseAll}
            title="모든 폴더 접기"
            style={toolBtn}
          >⊟ 모두 접기</button>
          <button
            data-testid="browser-new-folder"
            onClick={() => setNewFolder({ parentId: null, name: '' })}
            title="맨 위(홈)에 새 폴더 만들기 — 폴더 안에 만들려면 그 폴더 줄의 ＋ 를 누르세요"
            style={{ ...toolBtn, marginLeft: 2 }}
          >＋ 새 폴더</button>
          {/* **전체 검색** (2026-08-07 요청) — 지금 폴더가 아니라
              **문서함 전체**를 훑는다. 맞는 파일이 든 폴더는 자동으로
              펼쳐지고, 그 안에서도 맞는 파일만 남는다. */}
          <input
            data-testid="browser-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            /* Esc = 검색어 지우기 — window 핸들러가 계층으로 처리한다 */
            placeholder="🔍 이름 · 맵 내용으로 찾기"
            title={'문서함 전체(하위 폴더 포함)에서 찾습니다 — 폴더·맵 이름은 물론'
              + ' 맵 안의 노드 텍스트·노트·태그·링크·첨부 파일명까지 봅니다.'
              + ' 이름이 맞으면 글자가 강조되고, 맵 내용이 맞으면 맵(N건)으로'
              + ' 표시됩니다 (Esc 로 지움)'}
            style={{
              height: 24, width: 210, padding: '0 8px', borderRadius: 6,
              marginLeft: 4, fontSize: 11.5,
              border: `1px solid ${query ? t.primaryBorder : t.border}`,
              background: t.surfaceAlt, color: t.text, outline: 'none',
            }}
          />
          {finding && (
            <span
              data-testid="browser-search-busy"
              style={{ fontSize: 11, color: t.textMuted, marginLeft: 2 }}
            >찾는 중…</span>
          )}
          {query && (
            <button
              data-testid="browser-search-clear"
              onClick={() => setQuery('')}
              title="검색어 지우기"
              style={{ ...toolBtn, padding: '0 7px' }}
            >✕</button>
          )}
        </div>
        <button
          data-testid="browser-close"
          onClick={onClose}
          title="문서함 닫기 (Esc)"
          style={{ ...iconBtn, fontSize: 17 }}
        >✕</button>
      </div>

      {err && !searching && (
        <div
          data-testid="browser-error"
          style={{
            margin: '10px 14px 0', padding: '10px 12px', borderRadius: 8,
            background: '#d9534f11', border: '1px solid #d9534f55',
            color: '#b33', fontSize: 12.5, lineHeight: 1.65,
          }}
        >
          ⚠ {err}
        </div>
      )}
      {/* 내용 검색이 실패하면 **이름 검색으로 물러선다** — 검색창이 통째로
          먹통이 되는 것보다 낫다. 무엇이 줄었는지는 분명히 말해 준다. */}
      {findErr && (
        <div
          data-testid="browser-search-error"
          style={{
            margin: '10px 14px 0', padding: '10px 12px', borderRadius: 8,
            background: '#d9534f11', border: '1px solid #d9534f55',
            color: '#b33', fontSize: 12.5, lineHeight: 1.65,
          }}
        >
          ⚠ 내용 검색에 실패했습니다 — 지금은 <b>이름</b>으로만 찾고 있습니다. ({findErr})
        </div>
      )}

      {/* 열 머리글 — **한 줄**. 합계는 아래 별도 줄로 내렸다
          (2026-08-09 3차 요청). 예전에는 숫자 4열만 이름 위에 합계를
          얹었는데, 그 열만 두 줄이 되어 머리글 높이가 들쭉날쭉했고
          합계가 어느 열 것인지도 헷갈렸다. */}
      <div
        data-testid="browser-header"
        style={{
          ...rowStyle,
          background: t.surfaceAlt, borderBottom: `1px solid ${t.border}`,
          // 정렬 버튼이 아닌 머리글('유형'·'관리')도 같은 색을 받는다
          color: t.primary, fontWeight: 700, fontSize: 11.5,
        }}
      >
        <span />
        {th('폴더/파일명', 'title')}
        {/* 유형·생성일·수정일은 **오른쪽 맞춤** (2026-08-09 요청) —
            값(단독맵 배지·날짜)이 열 오른쪽 끝에서 끝나므로 머리글도
            같은 선에 세워야 세로줄이 맞는다. */}
        <span style={{ textAlign: 'right' }}>유형</span>
        {th('생성일', 'createdAt', 'right')}
        {th('수정일', 'updatedAt', 'right')}
        {th('노드', 'nodeCount', 'right')}
        {th('크기', 'docBytes', 'right')}
        {th('첨부', 'attachCount', 'right')}
        {th('첨부 용량', 'attachBytes', 'right')}
        <span style={{ textAlign: 'center' }}>관리</span>
      </div>

      {/* **합계 줄** — 머리글 바로 아래 고정 (2026-08-09 3차 요청).
          정렬을 어떻게 바꿔도 이 줄은 자리를 지킨다(목록의 일부가
          아니다). 각 값은 그 열 아래에 놓여 무엇의 합계인지 열 이름이
          그대로 설명한다.
          · 유형   = **폴더 수**(하위 폴더까지 전부)
          · 생성일 = **맵 수** — 폴더 줄이 '맵 N개'를 쓰는 칸이라 같은 말로
          · 수정일 = 비움 (합계가 없는 열)
          검색 중에는 **검색 결과** 기준이다(그때만 라벨에 표시). */}
      <div
        data-testid="browser-totals"
        style={{
          ...rowStyle,
          background: t.surfaceAlt,
          borderBottom: `2px solid ${t.border}`,
          color: t.text, fontWeight: 700, fontSize: 11.5,
        }}
      >
        <span />
        <span data-testid="browser-total-label" style={{ whiteSpace: 'nowrap' }}>
          합계{searching ? ' (검색 결과)' : ''}
        </span>
        <span data-testid="browser-total-folders" style={totalNumCell}
          title="폴더 수 (하위 폴더까지 전부)">
          {totalCountText(folderCount)}
        </span>
        <span data-testid="browser-total-maps" style={totalNumCell} title="맵 수">
          맵 {totalCountText(totals.maps)}
        </span>
        <span />
        <span data-testid="browser-total-nodes" style={totalNumCell} title="노드 수 합계">
          {totalCountText(totals.nodeCount)}
        </span>
        <span data-testid="browser-total-size" style={totalNumCell} title="문서 크기 합계">
          {totalBytesText(totals.docBytes)}
        </span>
        <span data-testid="browser-total-attach" style={totalNumCell} title="첨부 개수 합계">
          {totalCountText(totals.attachCount)}
        </span>
        <span data-testid="browser-total-attach-bytes" style={totalNumCell}
          title="첨부 용량 합계">
          {totalBytesText(totals.attachBytes)}
        </span>
        <span />
      </div>

      {/* 목록 (트리) — 새 폴더 이름을 입력하는 동안에는 hover 강조를
          끈다(mm-rows-editing). 커서가 다른 줄 위에 남아 그 줄이 강조되면
          "어디에 만들어지나"를 화면이 두 가지로 말하게 된다. */}
      <div className={newFolder ? 'mm-rows-editing' : undefined}
        style={{ flex: 1, overflowY: 'auto' }}>
        {maps === null ? (
          <div style={{ padding: '28px 14px', color: t.textSubtle, fontSize: 13, textAlign: 'center' }}>
            불러오는 중…
          </div>
        ) : rows.length === 0 ? (
          <div data-testid="browser-empty"
            style={{ padding: '32px 14px', color: t.textSubtle, fontSize: 13, textAlign: 'center', lineHeight: 1.7 }}>
            {err ? '목록을 표시할 수 없습니다 — 위 안내를 확인해 주세요.'
              : searching ? (
                <>‘{query}’ 가 <b>이름에도 맵 내용에도</b> 없습니다.<br />
                검색어를 지우면 전체가 다시 보입니다.</>
              ) : (
                <>아직 문서가 없습니다.<br />
                맵을 만들어 <b>☁ 저장</b>하면 여기에 쌓입니다.</>
              )}
          </div>
        ) : rows.map((r) => (r.kind === 'newFolder' ? (
          /* 새 폴더 입력 — **만들어질 자리 그대로**. 들여쓰기가 부모를
             말해 주므로 "어디에 만들어지나"를 글로 설명할 필요가 없다. */
          <div key="new-folder" data-testid="browser-new-folder-row"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderBottom: `1px solid ${t.divider}`,
              background: t.primarySoft,
            }}>
            <span style={{ fontSize: 15, paddingLeft: r.depth * 16 }}>📁</span>
            <input
              data-testid="browser-new-folder-name"
              autoFocus
              value={newFolder?.name ?? ''}
              placeholder="새 폴더 이름"
              onChange={(e) => setNewFolder((p) => (p ? { ...p, name: e.target.value } : p))}
              // Esc 는 위쪽 window 핸들러가 계층으로 처리한다 (입력 취소)
              onKeyDown={(e) => { if (e.key === 'Enter') void createFolder(); }}
              style={{
                flex: 1, maxWidth: 320, height: 28, padding: '0 9px', borderRadius: 6,
                fontSize: 12.5, border: `1px solid ${t.primaryBorder}`,
                background: t.surface, color: t.text, outline: 'none',
              }}
            />
            <button
              data-testid="browser-new-folder-create"
              onClick={() => void createFolder()}
              style={{
                height: 28, padding: '0 12px', borderRadius: 6, border: 'none',
                background: t.primary, color: '#fff', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
              }}
            >만들기</button>
            <button
              onClick={() => setNewFolder(null)}
              style={{
                height: 28, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${t.border}`, background: t.surface,
                color: t.text, fontSize: 12,
              }}
            >취소</button>
          </div>
        ) : r.kind === 'folder' ? (
          <div key={`f:${r.folder.folderId}`} data-testid="browser-folder"
            className="mm-list-row"
            // 새 폴더를 만드는 중인 **대상 폴더**는 계속 표시해 둔다 —
            // 마우스가 다른 줄로 옮겨 가 그 줄이 hover 로 강조돼도
            // 목적지가 헷갈리지 않는다 (2026-08-08 사용자 보고)
            data-target={newFolder?.parentId === r.folder.folderId ? 'new-folder' : undefined}
            style={newFolder?.parentId === r.folder.folderId
              ? { ...rowStyle, background: t.primarySoft }
              : rowStyle}>
            <span style={{ fontSize: 15, ...indent(r.depth) }}>📁</span>
            {/* 폴더 이름을 누르면 **그 자리에서 펼쳐진다** (2026-08-07) —
                예전처럼 그 폴더로 '들어가지' 않는다. 폴더 위치와 파일을
                한 화면에서 같이 보려는 것이 이 목록의 요점이다. */}
            {/* 툴팁 없음 — ▶/▼ 삼각형이 이미 상태를 말한다. 이름 버튼에
                툴팁까지 뜨면 화면만 어수선해진다 (2026-08-05 규칙) */}
            <button
              data-testid="browser-folder-toggle"
              onClick={() => toggleFolder(r.folder.folderId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                textAlign: 'left', background: 'transparent', border: 'none',
                color: t.text, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                overflow: 'hidden', padding: 0,
              }}
            >
              <span style={{ fontSize: 9, color: t.textSubtle, width: 9 }}>
                {expanded.has(r.folder.folderId) || searching ? '▼' : '▶'}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Mark text={r.folder.name} q={searching ? qRaw : ''} />
              </span>
            </button>
            {/* 유형·생성일 자리 — 머리글과 같은 오른쪽 선에 세운다
                (2026-08-09 요청) */}
            {/* 같은 줄의 **폴더 이름과 같은 색** (2026-08-09 2차 요청) */}
            <span style={{ color: t.text, fontSize: 11, textAlign: 'right' }}>폴더</span>
            {/* '맵 N개' 는 **생성일 칸 하나**만 쓴다 — 예전처럼 두 칸을
                차지하면(span 2) 오른쪽 맞춤이 수정일 선까지 밀려 머리글과
                어긋난다 (2026-08-09) */}
            <span style={{ color: t.textMuted, fontSize: 11.5, textAlign: 'right' }}>
              맵 {r.folder.mapCount}개
            </span>
            <span />
            <span /><span /><span /><span />
            <span style={actionCell}>
              <button style={iconBtn} title="이 폴더 안에 새 폴더" aria-label="하위 폴더 만들기"
                onClick={() => {
                  setNewFolder({ parentId: r.folder.folderId, name: '' });
                  // 접혀 있으면 펼친다 — 입력창 아래로 기존 하위가 함께
                  // 보여야 "여기에 만들어진다"가 분명해진다
                  setExpanded((prev) => new Set(prev).add(r.folder.folderId));
                }}
              >＋</button>
              <button style={iconBtn} title="이름 변경" aria-label="이름 변경"
                onClick={() => void renameFolder(r.folder)}><I.Pencil size={15} /></button>
              <button style={{ ...iconBtn, color: '#d9534f' }}
                title="삭제 (비어 있을 때만)" aria-label="삭제"
                onClick={() => void deleteFolder(r.folder)}><I.Trash size={15} /></button>
            </span>
          </div>
        ) : (
          <div key={`m:${r.map.mapId}`} data-testid="browser-map"
            className="mm-list-row" aria-selected={cloudMapId === r.map.mapId}
            style={rowStyle}>
            {/* 🗺 이모지는 윈도에서 흑백 지도 글리프로 깨져 보였다
                (2026-08-02 사용자 보고) — 앱 SVG 아이콘으로 통일 */}
            <span style={{ display: 'flex', color: t.primary, ...indent(r.depth) }}>
              <I.MindMap size={15} />
            </span>
            <button
              data-testid="browser-map-open"
              onClick={() => void openMap(r.map)}
              // 파일명 위에 잠시 머물면 상세 정보 카드 (2026-08-09 요청)
              onMouseEnter={(e) => showInfoSoon(r.map, e.currentTarget)}
              onMouseLeave={hideInfoSoon}
              onFocus={(e) => showInfoSoon(r.map, e.currentTarget)}
              onBlur={hideInfoSoon}
              style={{
                textAlign: 'left', background: 'transparent', border: 'none',
                color: cloudMapId === r.map.mapId ? t.primary : t.text, cursor: 'pointer',
                fontSize: 13, fontWeight: 500, padding: 0, paddingLeft: r.depth ? 14 : 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              <Mark text={r.map.title || '(제목 없음)'} q={searching ? qRaw : ''} />
              {/* 맵 **내용**에서 맞았으면 건수만 — 어느 노드·노트인지까지
                  보여 주면 목록이 감당이 안 된다. 열어서 같은 말로 다시
                  검색하면 그 안에서 하나씩 짚을 수 있다. */}
              {(r.map.matchCount ?? 0) > 0 && (
                <span
                  data-testid="browser-map-matches"
                  title={`이 맵의 내용(노드·노트·태그·링크·첨부 이름)에서 ${r.map.matchCount}건 찾았습니다`}
                  style={{
                    marginLeft: 6, padding: '0 6px', borderRadius: 8,
                    border: `1px solid ${t.primaryBorder}`, background: t.primarySoft,
                    color: t.primary, fontSize: 10.5, fontWeight: 700,
                  }}
                >맵({r.map.matchCount}건)</span>
              )}
              {cloudMapId === r.map.mapId && (
                <span style={{ fontSize: 10, marginLeft: 6, color: t.textSubtle }}>편집 중</span>
              )}
            </button>
            {/* 유형은 표시 전용 — 협업맵은 협업자를 초대해 승인·참여하는
                순간 전환된다(협업 단계 V1~V2). 여기서 바꾸는 것이 아니다. */}
            <span
              data-testid="browser-map-kind"
              title={r.map.kind === 'collab'
                ? '협업맵 — 협업자가 참여 중인 맵'
                : '단독맵 — 협업자를 초대해 승인되면 협업맵이 됩니다 (준비 중)'}
              style={{
                justifySelf: 'end',
                border: `1px solid ${t.border}`, borderRadius: 8, padding: '1px 7px',
                color: r.map.kind === 'collab' ? t.primary : t.textMuted,
                fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap',
              }}
            >
              {r.map.kind === 'collab' ? '👥 협업맵' : '👤 단독맵'}
            </span>
            <span style={{ color: t.textMuted, fontSize: 11, textAlign: 'right' }}
              title="최초 생성일">
              {fmtDate(r.map.createdAt)}
            </span>
            <span style={{ color: t.textMuted, fontSize: 11, textAlign: 'right' }}
              title="마지막 수정일">
              {fmtDate(r.map.updatedAt)}
            </span>
            <span style={{ ...numCell, color: t.textMuted, fontSize: 11 }}
              title="노드 수 ('—'는 통계 도입 전 저장분 — 다음 저장 때 채워집니다)">
              {r.map.nodeCount ?? '—'}
            </span>
            <span style={{ ...numCell, color: t.textMuted, fontSize: 11 }} title="문서 크기">
              {fmtBytes(r.map.docBytes)}
            </span>
            <span style={{ ...numCell, color: t.textMuted, fontSize: 11 }} title="첨부파일 수">
              {r.map.attachCount ?? '—'}
            </span>
            <span style={{ ...numCell, color: t.textMuted, fontSize: 11 }} title="첨부 총 용량">
              {fmtBytes(r.map.attachBytes)}
            </span>
            <span style={actionCell}>
              <button
                data-testid="browser-map-info" style={iconBtn}
                title="상세 정보 (저장한 기기·브라우저·IP 포함)" aria-label="상세 정보"
                onClick={(e) => {
                  const r2 = e.currentTarget.getBoundingClientRect();
                  if (infoTimer.current) window.clearTimeout(infoTimer.current);
                  setInfo((cur) =>
                    cur?.pinned && cur.map.mapId === r.map.mapId
                      ? null
                      : { map: r.map, x: r2.right - 300, y: r2.bottom + 6, pinned: true });
                }}
              ><I.Info size={15} /></button>
              <button style={iconBtn} title="이름 변경" aria-label="이름 변경"
                onClick={() => void renameMap(r.map)}><I.Pencil size={15} /></button>
              <button data-testid="browser-map-move" style={iconBtn}
                title="다른 폴더로 이동" aria-label="다른 폴더로 이동"
                onClick={() => setMoving(r.map)}><I.FolderMove size={15} /></button>
              <button style={{ ...iconBtn, color: '#d9534f' }} title="삭제" aria-label="삭제"
                onClick={() => void deleteMap(r.map)}><I.Trash size={15} /></button>
            </span>
          </div>
        )))}
      </div>

      {/* 상세 정보 카드 (2026-08-09 요청) — 목록의 좁은 칸에 다 담을 수
          없는 값들을 한자리에 보여 준다. 목록 위에 떠야 하므로 fixed +
          화면 밖으로 나가지 않게 좌표를 접어 넣는다.
          (겹치는 레이어 순서는 coding-conventions.md §5-1-4) */}
      {info && (
        <div
          data-testid="browser-info-card"
          onMouseEnter={() => {
            if (infoTimer.current) window.clearTimeout(infoTimer.current);
          }}
          onMouseLeave={hideInfoSoon}
          style={{
            position: 'fixed', zIndex: 230,
            left: Math.max(8, Math.min(info.x, window.innerWidth - 320)),
            top: Math.min(info.y, window.innerHeight - 250),
            width: 300, padding: '10px 12px', borderRadius: 10,
            background: t.surface, border: `1px solid ${t.borderStrong}`,
            boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
            fontSize: 11.5, color: t.text, lineHeight: 1.7,
          }}
        >
          <div style={{
            fontWeight: 700, fontSize: 12.5, marginBottom: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{info.map.title || '(제목 없음)'}</div>
          <InfoRow t={t} k="유형" v={info.map.kind === 'collab' ? '👥 협업맵' : '👤 단독맵'} />
          <InfoRow t={t} k="생성" v={fmtDate(info.map.createdAt)} />
          <InfoRow t={t} k="수정" v={fmtDate(info.map.updatedAt)} />
          <InfoRow t={t} k="노드" v={info.map.nodeCount === null || info.map.nodeCount === undefined
            ? '—' : `${info.map.nodeCount.toLocaleString()}개`} />
          <InfoRow t={t} k="문서 크기" v={fmtBytes(info.map.docBytes)} />
          <InfoRow t={t} k="첨부" v={
            info.map.attachCount === null || info.map.attachCount === undefined
              ? '—'
              : `${info.map.attachCount}개 · ${fmtBytes(info.map.attachBytes)}`} />
          {/* 마지막 저장 자리 — 접속 정보 도입(2026-08-09) 전에 저장된
              맵은 값이 없다. 없는 것을 '—' 로 늘어놓지 않고 왜 없는지
              한 줄로 알려 준다. */}
          <div style={{
            marginTop: 6, paddingTop: 6, borderTop: `1px solid ${t.divider}`,
            fontSize: 10.5, color: t.textSubtle, fontWeight: 700,
          }}>마지막 저장 자리</div>
          {info.map.lastPlatform || info.map.lastBrowser || info.map.lastIp ? (
            <div data-testid="browser-info-origin">
              <InfoRow t={t} k="기기" v={info.map.lastPlatform ?? '—'} />
              <InfoRow t={t} k="브라우저" v={info.map.lastBrowser ?? '—'} />
              <InfoRow t={t} k="IP" v={info.map.lastIp ?? '—'} mono />
              {info.map.lastSavedAt && (
                <InfoRow t={t} k="저장 시각" v={fmtDate(info.map.lastSavedAt)} />
              )}
            </div>
          ) : (
            <div style={{ fontSize: 10.5, color: t.textSubtle }}>
              아직 기록이 없습니다 — 이 기능이 생기기 전에 저장된 맵입니다.
              다음 <b>☁ 저장</b> 부터 남습니다.
            </div>
          )}
          {info.pinned && (
            <div style={{ marginTop: 6, fontSize: 10, color: t.textSubtle }}>
              Esc 또는 ⓘ 를 다시 누르면 닫힙니다.
            </div>
          )}
        </div>
      )}

      {moving && (
        <FolderPickerDialog
          t={t}
          title={`'${moving.title || '제목 없음'}' 옮기기`}
          folders={folders}
          currentFolderId={moving.folderId}
          onPick={(folderId) => void moveMapTo(moving, folderId)}
          onCancel={() => setMoving(null)}
        />
      )}

      <div style={{
        padding: '8px 14px', borderTop: `1px solid ${t.border}`,
        color: t.textSubtle, fontSize: 11, lineHeight: 1.6,
      }}>
        폴더 이름을 누르면 <b>그 자리에서 펼쳐집니다</b>. 검색은 문서함
        <b> 전체</b>에서 이름과 <b>맵 안의 내용(노드·노트·태그·링크·첨부
        이름)</b>을 함께 찾습니다 — 이름이 맞으면 <b>글자가 강조</b>되고,
        맵 내용이 맞으면 <b>맵(N건)</b>으로 알립니다. 맞는 파일이 든 폴더는
        저절로 펼쳐집니다.
        편집 중인 맵이 있으면 다른 맵은 <b>브라우저 새 탭</b>에서 열립니다.
        폴더는 <b>비어 있을 때만</b> 삭제할 수 있습니다.
      </div>
    </div>
  );
}


/** 상세 카드의 한 줄 — 이름(고정 폭) + 값 */
function InfoRow({ t, k, v, mono }: {
  t: ThemeTokens; k: string; v: string; mono?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={{ width: 62, flexShrink: 0, color: t.textSubtle }}>{k}</span>
      <span style={{
        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        // IP 는 골라서 복사하는 값이라 고정폭 글꼴이 읽기 쉽다
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        userSelect: 'text',
      }}>{v}</span>
    </div>
  );
}
