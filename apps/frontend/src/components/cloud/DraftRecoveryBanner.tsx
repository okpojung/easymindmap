// DraftRecoveryBanner — "저장되지 않은 맵이 있습니다 — 복구할까요?"
//
// 앱을 열 때 브라우저(IndexedDB)에 남아 있는 초안을 확인해 알린다.
// 초안은 구조 변경 즉시 · 타이핑 1초 뒤 · 화면을 벗어나는 순간에 적히므로
// (useLocalDraft), 크래시·전원 차단·오프라인·편집권 상실로 서버에 못 간
// 편집도 여기서 되살릴 수 있다 (감사 R1·R2·R3).
//
// 초안이 여러 건이면 **한 건씩 차례로** 묻는다 — 예전에는 가장 최근 1건만
// 보여 주고 나머지는 영영 남아 있었다.
import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import {
  listDrafts, deleteDraft, isDraftStorageAvailable,
  UNSAVED_DRAFT_KEY, type LocalDraft,
} from '@/utils/localDraft';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import { applySnapshotEditor, detachFromServer } from '@/services/cloud/mapSession';
import { writeLocalDraftNow } from '@/hooks/useLocalDraft';

/** 화면 위쪽 가운데 알림 띠 — 복구 안내와 보관 불가 안내가 함께 쓴다 */
function bannerStyle(t: ThemeTokens) {
  return {
    position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
    zIndex: 30, maxWidth: 640, padding: '10px 14px', borderRadius: 8,
    background: t.surface, color: t.text,
    border: `1px solid ${t.warning}`, borderLeft: `4px solid ${t.warning}`,
    boxShadow: '0 6px 20px rgba(60,45,15,0.22)',
    display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5,
  } as const;
}

export function DraftRecoveryBanner({ t }: { t: ThemeTokens }) {
  const [queue, setQueue] = useState<LocalDraft[]>([]);
  /** IndexedDB 를 못 쓰는 브라우저·모드 — 크래시 대비 보관이 통째로 없다 */
  const [storageOff, setStorageOff] = useState(false);
  const draftWriteFailed = useAutosaveStore((s) => s.draftWriteFailed);
  const loadMap = useDocumentStore((s) => s.loadMap);
  const setBrowserOpen = useEditorUiStore((s) => s.setBrowserOpen);

  useEffect(() => {
    let alive = true;
    void isDraftStorageAvailable().then((ok) => {
      if (!alive) return;
      if (!ok) { setStorageOff(true); return; }
      void listDrafts().then((all) => { if (alive) setQueue(all); });
    });
    return () => { alive = false; };
  }, []);

  const draft = queue[0];

  // **초안 쓰기가 실패했다** — 저장소가 꽉 찼거나 도중에 막혔다.
  // 시작 시 검사(storageOff)는 통과하는 경우라 따로 알려야 한다.
  if (draftWriteFailed) {
    return (
      <div data-testid="draft-write-failed"
           style={{ ...bannerStyle(t), borderColor: t.danger ?? t.warning }}>
        <span style={{ display: 'flex', color: t.danger ?? t.warning }}><I.History size={16} /></span>
        <div style={{ flex: 1, lineHeight: 1.5 }}>
          <b>브라우저 임시 보관에 실패했습니다</b>
          <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2 }}>
            저장 공간이 부족한 것 같습니다 — <b>지금 편집은 이 브라우저에도
            남지 않습니다.</b> ☁ 저장을 눌러 서버에 올려 주세요.
          </div>
        </div>
        <button
          data-testid="draft-write-failed-ok"
          onClick={() => useAutosaveStore.getState().setDraftWriteFailed(false)}
          style={{
            fontSize: 12, padding: '6px 10px', borderRadius: 6,
            border: `1px solid ${t.border}`, background: t.surface,
            color: t.textMuted, cursor: 'pointer',
          }}>알겠습니다</button>
      </div>
    );
  }

  if (storageOff) {
    return (
      <div data-testid="draft-storage-off" style={{ ...bannerStyle(t), borderColor: t.danger ?? t.warning }}>
        <span style={{ display: 'flex', color: t.warning }}><I.History size={16} /></span>
        <div style={{ flex: 1, lineHeight: 1.5 }}>
          <b>이 브라우저에서는 임시 보관을 쓸 수 없습니다</b>
          <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2 }}>
            사생활 보호(시크릿) 모드이거나 저장소가 막혀 있습니다 — 크래시·전원
            차단에 대비한 자동 보관이 동작하지 않습니다. ☁ 저장을 자주 눌러 주세요.
          </div>
        </div>
        <button
          data-testid="draft-storage-off-ok"
          onClick={() => setStorageOff(false)}
          style={{
            fontSize: 12, padding: '6px 10px', borderRadius: 6,
            border: `1px solid ${t.border}`, background: t.surface,
            color: t.textMuted, cursor: 'pointer',
          }}>알겠습니다</button>
      </div>
    );
  }

  if (!draft) return null;

  const when = (() => {
    try {
      return new Date(draft.savedAt).toLocaleString('ko-KR', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return draft.savedAt; }
  })();

  const next = () => setQueue((q) => q.slice(1));

  const restore = () => {
    const snap = draft.snapshot as { map?: unknown };
    if (snap?.map) {
      // 복구한 문서는 **서버와 연결하지 않는다** — 어느 맵에 넣을지는
      // 사용자가 ☁ 저장에서 정한다 (엉뚱한 맵을 덮어쓰지 않도록).
      // detach 를 먼저 불러 열려 있던 맵과의 연결을 확실히 끊는다.
      detachFromServer();
      loadMap(snap.map as never, { resetHistory: true });
      applySnapshotEditor(draft.snapshot);
      setBrowserOpen(false);
      // **복구한 내용은 아직 어디에도 저장돼 있지 않다.** 배지를 사실대로
      // 세우고(‘저장 안 됨’), 초안을 지우기 전에 지금 상태로 다시 적어
      // 둔다 — 복구 직후 창을 닫아도 잃지 않는다.
      useAutosaveStore.getState().setSaveState('unsaved');
      void writeLocalDraftNow().then(() => {
        if (draft.key !== UNSAVED_DRAFT_KEY) void deleteDraft(draft.key);
      });
    } else {
      void deleteDraft(draft.key);
    }
    next();
  };

  const discard = () => {
    void deleteDraft(draft.key);
    next();
  };

  return (
    <div
      data-testid="draft-recovery"
      style={bannerStyle(t)}
    >
      <span style={{ display: 'flex', color: t.warning }}><I.History size={16} /></span>
      <div style={{ flex: 1, lineHeight: 1.5 }}>
        <b>저장되지 않은 맵이 있습니다 — 복구할까요?</b>
        <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2 }}>
          {`'${draft.title}' · ${draft.nodeCount}개 노드 · ${when}에 이 브라우저에 보관됨`}
          {queue.length > 1 && ` · 외 ${queue.length - 1}건`}
        </div>
      </div>
      <button
        data-testid="draft-restore"
        onClick={restore}
        style={{
          fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 6,
          border: `1px solid ${t.primaryBorder}`, background: t.primary,
          color: '#fff', cursor: 'pointer',
        }}>복구</button>
      <button
        data-testid="draft-discard"
        onClick={discard}
        title="이 초안을 지웁니다 (되돌릴 수 없습니다)"
        style={{
          fontSize: 12, padding: '6px 10px', borderRadius: 6,
          border: `1px solid ${t.border}`, background: t.surface,
          color: t.textMuted, cursor: 'pointer',
        }}>버리기</button>
    </div>
  );
}
