// MapActions — 상단 툴바의 "현재 맵" 동작: 저장 · 맵 닫기.
//
// 저장 규칙 (2026-08-02 사용자 확정)
//   · 이미 서버에 있는 맵  → 묻지 않고 **열었던 그 이름 그대로** 덮어쓴다
//   · 아직 저장한 적 없는 맵 → **폴더·이름·유형을 묻는다**(SaveMapDialog).
//     같은 폴더에 같은 이름이 있으면 서버가 막고, 대화상자가 안내한다.
//
// 닫기 규칙
//   · 저장된 맵   → 마지막 내용을 저장한 뒤 닫는다(저장 실패 시 닫지 않음)
//   · 미저장 맵   → **"저장되지 않았습니다" 경고** 후 사용자가 고른다
//     (저장하고 닫기 / 저장 없이 닫기 / 취소)
// 닫은 뒤에는 편집 영역에 문서함(MapBrowser)을 연다.

import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { useCloudStore } from '@/stores/cloudStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudAutosave } from '@/hooks/useCloudAutosave';
import { useLocalDraft, clearLocalDraft } from '@/hooks/useLocalDraft';
import { CloudError } from '@/services/cloud/apiClient';
import { SaveMapDialog } from '@/components/cloud/SaveMapDialog';
import {
  clearCurrentMap, isCurrentMapEmpty, isUnsavedMap, needLogin,
  saveAndCloseMap, saveCurrentMap,
} from '@/services/cloud/mapSession';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { ProCollabSession } from '@pro';

/** 저장 대화상자를 띄운 이유 — 저장만인지, 닫기까지 이어갈지 */
type SaveIntent = null | 'save' | 'close' | 'saveAs';

export function MapActions({ t, flash }: { t: ThemeTokens; flash: (m: string) => void }) {
  const cloudMapId = useCloudStore((s) => s.cloudMapId);
  // 협업맵인가 — 세션 자리에 그대로 넘긴다(판정은 서버가 내린 kind 다)
  const cloudKind = useCloudStore((s) => s.cloudKind);
  // 읽기 전용으로 연 맵 (단일 세션 편집 잠금 — 2026-08-04)
  const readOnlyInfo = useCloudStore((s) => s.readOnlyInfo);
  const cloudTitle = useCloudStore((s) => s.cloudTitle);
  const lastSavedAt = useCloudStore((s) => s.lastSavedAt);
  const busy = useCloudStore((s) => s.busy);
  const mapTitle = useDocumentStore((s) => s.map.title);
  const setBrowserOpen = useEditorUiStore((s) => s.setBrowserOpen);

  const [saveIntent, setSaveIntent] = useState<SaveIntent>(null);
  // 미저장 맵 닫기 경고 (규칙 4)
  const [warnUnsaved, setWarnUnsaved] = useState(false);

  // 문서가 서버 맵에 연결돼 있으면 편집 후 자동 저장(디바운스)
  useCloudAutosave();
  // 편집을 1초마다 브라우저(IndexedDB)에도 적어 둔다 — 크래시·오프라인
  // 으로 서버에 못 간 편집을 다음 실행에서 되살리기 위해 (감사 R1·R2)
  useLocalDraft();

  const savedHint = lastSavedAt
    ? `저장됨 · ${new Date(lastSavedAt).toLocaleString()}`
    : '아직 서버에 저장하지 않음';

  const handleSave = async () => {
    // 열려 있는 맵이 없으면 저장할 것도 없다 (맵 닫기와 같은 안내 —
    // 2026-08-02 사용자 보고: 빈 상태에서 저장 대화상자가 떴다)
    if (isCurrentMapEmpty()) { flash('열려 있는 맵이 없습니다.'); return; }
    // Guest 체험 (2026-08-04) — 서버 저장 없음, 내보내기로 안내
    if (authEnabled && useAuthStore.getState().guest) {
      flash('Guest 체험 중 — 서버 저장은 가입 후 가능합니다. 내보내기(MD·HTML)로 파일 보관은 됩니다.');
      return;
    }
    if (needLogin()) { flash('⚠ 로그인해야 서버에 저장할 수 있습니다.'); return; }
    if (isUnsavedMap()) { setSaveIntent('save'); return; } // 폴더·이름 묻기
    try {
      const r = await saveCurrentMap({ keepVersion: true });
      flash(r.unchanged
        ? `☁ '${cloudTitle ?? mapTitle}' — 변경된 내용이 없어 그대로 두었습니다.`
        : `☁ '${cloudTitle ?? mapTitle}' 저장 완료 (이 시점이 히스토리에 남습니다).`);
    } catch (err) {
      const m = err instanceof CloudError ? err.message : '저장 중 오류가 발생했습니다.';
      useCloudStore.getState().setError(m);
      flash('⚠ ' + m);
    }
  };

  const handleClose = async () => {
    // 읽기 전용으로 보던 맵은 저장 없이 닫힌다 — 안내 문구 구분
    const wasReadOnly = !!useCloudStore.getState().readOnlyInfo;
    const r = await saveAndCloseMap(flash);
    if (r === 'unsaved') { setWarnUnsaved(true); return; }
    if (r !== 'closed') return;
    flash(wasReadOnly ? '읽기 전용으로 보던 맵을 닫았습니다.' : '맵을 저장하고 닫았습니다.');
    setBrowserOpen(true);
  };

  const btn = {
    display: 'flex', alignItems: 'center', gap: 5,
    height: 32, padding: '0 10px', borderRadius: 8,
    cursor: busy === 'idle' ? 'pointer' : 'default',
    fontSize: 12.5, fontWeight: 600,
  } as const;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* 협업 세션 — 공개판에서는 아무것도 그리지 않는다(정상 동작).
          자동저장 훅과 **같은 자리**에 둔다: 맵이 열려 있는 동안만 살아
          있어야 하고, 자동저장과 서로 비켜 줘야 하기 때문이다. */}
      <ProCollabSession mapId={cloudMapId} kind={cloudKind} />
      {/* 읽기 전용 배너 — 다른 세션이 편집 중인 맵을 보는 상태임을
          화면에 상시 표시 (2026-08-04 사용자 요청) */}
      {readOnlyInfo && (
        <span
          data-testid="readonly-badge"
          title="다른 세션(브라우저)에서 편집 중인 맵입니다. 여기서의 변경은 이 맵에 저장되지 않으며, ☁ 저장을 누르면 다른 이름의 새 맵으로 저장할 수 있습니다."
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', borderRadius: 7,
            background: '#FEF3C7', border: '1px solid #F59E0B',
            color: '#92400E', fontSize: 11.5, fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >🔒 읽기 전용 — 다른 세션에서 편집 중</span>
      )}
      <button
        data-testid="map-save"
        title={`${savedHint} — 지금 저장하면 이 시점이 히스토리 버전으로 남습니다`}
        disabled={busy !== 'idle'}
        onClick={() => void handleSave()}
        style={{
          ...btn,
          background: t.surfaceAlt, color: t.text,
          border: `1px solid ${cloudMapId ? t.primaryBorder + '66' : t.border}`,
        }}
      >
        <I.Cloud size={15} /> 저장
      </button>

      {/* 다른 이름으로 저장 (2026-08-03 요청) — 서버 맵과 연결된 상태에서만.
          현재 내용을 새 폴더·이름의 **새 맵**으로 저장하고, 이 탭은 그
          새 맵 편집으로 전환된다. 같은 폴더 같은 이름이면 409 안내. */}
      {cloudMapId && (
        <button
          data-testid="map-save-as"
          title="다른 이름으로 저장 — 현재 내용을 새 폴더·이름의 새 맵으로 저장합니다"
          disabled={busy !== 'idle'}
          onClick={() => setSaveIntent('saveAs')}
          style={{
            ...btn, padding: '0 7px',
            background: t.surfaceAlt, color: t.textMuted,
            border: `1px solid ${t.border}`,
          }}
        >
          <I.Copy size={14} />
        </button>
      )}

      <button
        data-testid="map-close"
        title={isCurrentMapEmpty()
          ? '열려 있는 맵이 없습니다'
          : `'${cloudTitle ?? mapTitle}' 맵 닫기 — 저장한 뒤 닫고 문서함을 엽니다`}
        disabled={busy !== 'idle'}
        onClick={() => void handleClose()}
        style={{
          ...btn,
          background: t.surface, color: t.text,
          border: `1px solid ${t.border}`,
        }}
      >
        <I.X size={15} /> 맵 닫기
      </button>

      {/* 미저장 맵 닫기 경고 (규칙 4) */}
      {warnUnsaved && (
        <div
          onClick={() => setWarnUnsaved(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            data-testid="unsaved-warning"
            style={{
              width: 'min(420px, 92vw)', background: t.surface, color: t.text,
              border: `1px solid ${t.border}`, borderRadius: 12, padding: 20,
              boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 6 }}>
              ⚠ 맵이 저장되지 않았습니다
            </div>
            <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.7, marginBottom: 16 }}>
              “{mapTitle}”은(는) 아직 서버에 저장한 적이 없습니다.
              그냥 닫으면 내용이 사라집니다(Ctrl+Z로는 되돌릴 수 있습니다).
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <button
                data-testid="unsaved-save-close"
                onClick={() => { setWarnUnsaved(false); setSaveIntent('close'); }}
                style={{
                  height: 36, borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: t.primary, color: '#fff', fontSize: 13, fontWeight: 700,
                }}
              >저장하고 닫기</button>
              <button
                data-testid="unsaved-close-anyway"
                onClick={() => {
                  setWarnUnsaved(false);
                  // **버리기로 한 문서의 로컬 초안도 버린다** (2026-08-07).
                  // 안 지우면 다음에 앱을 열 때 "저장되지 않은 맵이
                  // 있습니다 — 복구할까요?" 가 계속 뜬다 — 방금 사용자가
                  // "저장하지 않는다"고 답한 그 문서를 두고 묻는 셈이다.
                  void clearLocalDraft(useCloudStore.getState().cloudMapId);
                  clearCurrentMap();
                  flash('저장하지 않고 닫았습니다.');
                  setBrowserOpen(true);
                }}
                style={{
                  height: 34, borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${t.border}`, background: t.surfaceAlt,
                  color: t.text, fontSize: 12.5, fontWeight: 600,
                }}
              >저장 없이 닫기</button>
              <button
                data-testid="unsaved-cancel"
                onClick={() => setWarnUnsaved(false)}
                style={{
                  height: 32, borderRadius: 7, cursor: 'pointer',
                  border: 'none', background: 'transparent',
                  color: t.textSubtle, fontSize: 12.5,
                }}
              >취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 첫 저장 — 폴더·이름·유형 (규칙 3) */}
      {saveIntent && (
        <SaveMapDialog
          t={t}
          defaultTitle={saveIntent === 'saveAs'
            ? `${cloudTitle ?? mapTitle} 사본`
            : mapTitle && mapTitle !== '새 맵' ? mapTitle : '새 맵'}
          note={saveIntent === 'close'
            ? '닫기 전에 저장합니다. 저장할 폴더와 맵 이름을 정해 주세요.'
            : saveIntent === 'saveAs'
              ? `'${cloudTitle ?? mapTitle}'의 현재 내용을 새 맵으로 저장합니다. 저장 후 이 탭은 새 맵을 편집합니다.`
              : undefined}
          onCancel={() => setSaveIntent(null)}
          onSaved={({ title }) => {
            const intent = saveIntent;
            setSaveIntent(null);
            flash(`☁ '${title}' 저장 완료.`);
            if (intent === 'close') {
              clearCurrentMap();
              setBrowserOpen(true);
            }
          }}
        />
      )}
    </div>
  );
}
