// DraftRecoveryBanner — "저장되지 않은 맵이 있습니다 — 복구할까요?"
//
// 앱을 열 때 브라우저(IndexedDB)에 남아 있는 초안을 확인해 알린다.
// 초안은 편집 1초 뒤마다 적히므로(useLocalDraft), 크래시·전원 차단·
// 오프라인으로 서버에 못 간 편집도 여기서 되살릴 수 있다 (감사 R1·R2).
import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { listDrafts, deleteDraft, type LocalDraft } from '@/utils/localDraft';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { applySnapshotEditor } from '@/services/cloud/mapSession';

export function DraftRecoveryBanner({ t }: { t: ThemeTokens }) {
  const [draft, setDraft] = useState<LocalDraft | null>(null);
  const loadMap = useDocumentStore((s) => s.loadMap);
  const setBrowserOpen = useEditorUiStore((s) => s.setBrowserOpen);

  useEffect(() => {
    let alive = true;
    void listDrafts().then((all) => {
      if (alive && all.length) setDraft(all[0]); // 가장 최근 1건
    });
    return () => { alive = false; };
  }, []);

  if (!draft) return null;

  const when = (() => {
    try {
      return new Date(draft.savedAt).toLocaleString('ko-KR', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return draft.savedAt; }
  })();

  const restore = () => {
    const snap = draft.snapshot as { map?: unknown };
    if (snap?.map) {
      // 복구한 문서는 **서버와 연결하지 않는다** — 어느 맵에 넣을지는
      // 사용자가 ☁ 저장에서 정한다 (엉뚱한 맵을 덮어쓰지 않도록)
      loadMap(snap.map as never, { resetHistory: true });
      applySnapshotEditor(draft.snapshot);
      setBrowserOpen(false);
    }
    void deleteDraft(draft.key);
    setDraft(null);
  };

  const discard = () => {
    void deleteDraft(draft.key);
    setDraft(null);
  };

  return (
    <div
      data-testid="draft-recovery"
      style={{
        position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
        zIndex: 30, maxWidth: 640, padding: '10px 14px', borderRadius: 8,
        background: t.surface, color: t.text,
        border: `1px solid ${t.warning}`, borderLeft: `4px solid ${t.warning}`,
        boxShadow: '0 6px 20px rgba(60,45,15,0.22)',
        display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5,
      }}
    >
      <span style={{ display: 'flex', color: t.warning }}><I.History size={16} /></span>
      <div style={{ flex: 1, lineHeight: 1.5 }}>
        <b>저장되지 않은 맵이 있습니다 — 복구할까요?</b>
        <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2 }}>
          {`'${draft.title}' · ${draft.nodeCount}개 노드 · ${when}에 이 브라우저에 보관됨`}
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
