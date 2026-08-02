// MapActions — 상단 툴바의 "현재 맵" 동작: 저장 · 맵 닫기 (2026-08-02).
//
// 이전에는 이 자리에 ☁ 클라우드 드롭다운(저장 / 클라우드에서 열기 /
// 로그인 / 로그아웃)이 있었다. 사용자 지시로 정리했다:
//   · **열기**는 좌측 '새 맵 > ☁ 서버 맵 불러오기' 하나로 일원화(중복 제거)
//   · **로그인/로그아웃**은 로그인 화면과 우상단 아바타 메뉴로 이동
//   · 이 자리는 **맵 닫기(✕)** — 편집 중인 맵을 무조건 저장한 뒤 닫는다
// 저장 버튼은 남겼다. 자동저장과 달리 **히스토리 버전을 남기는** 시점이
// 사용자에게 필요하기 때문이다 (B8 — 자동저장은 버전을 남기지 않는다).

import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { useCloudStore } from '@/stores/cloudStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useCloudAutosave } from '@/hooks/useCloudAutosave';
import { CloudError } from '@/services/cloud/apiClient';
import { MapListModal } from '@/components/cloud/MapListModal';
import {
  isCurrentMapEmpty, needLogin, saveAndCloseMap, saveCurrentMap,
} from '@/services/cloud/mapSession';

export function MapActions({ t, flash }: { t: ThemeTokens; flash: (m: string) => void }) {
  const cloudMapId = useCloudStore((s) => s.cloudMapId);
  const lastSavedAt = useCloudStore((s) => s.lastSavedAt);
  const busy = useCloudStore((s) => s.busy);
  const mapTitle = useDocumentStore((s) => s.map.title);
  // 맵 닫기 직후 — 빈 화면에 남겨 두지 않고 내 문서 목록을 띄운다
  const [listOpen, setListOpen] = useState(false);

  // 문서가 서버 맵에 연결돼 있으면 편집 후 자동 저장(디바운스)
  useCloudAutosave();

  const savedHint = lastSavedAt
    ? `저장됨 · ${new Date(lastSavedAt).toLocaleString()}`
    : '아직 서버에 저장하지 않음';

  const handleSave = async () => {
    if (needLogin()) { flash('⚠ 로그인해야 서버에 저장할 수 있습니다.'); return; }
    try {
      await saveCurrentMap({ keepVersion: true });
      flash('☁ 저장했습니다 (이 시점이 히스토리에 남습니다).');
    } catch (err) {
      const m = err instanceof CloudError ? err.message : '저장 중 오류가 발생했습니다.';
      useCloudStore.getState().setError(m);
      flash('⚠ ' + m);
    }
  };

  const handleClose = async () => {
    const closed = await saveAndCloseMap(flash);
    if (!closed) return;
    flash('맵을 저장하고 닫았습니다.');
    setListOpen(true);
  };

  const btn = {
    display: 'flex', alignItems: 'center', gap: 5,
    height: 32, padding: '0 10px', borderRadius: 8,
    cursor: busy === 'idle' ? 'pointer' : 'default',
    fontSize: 12.5, fontWeight: 600,
  } as const;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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

      <button
        data-testid="map-close"
        title={isCurrentMapEmpty()
          ? '열려 있는 맵이 없습니다'
          : `'${mapTitle}' 맵 닫기 — 저장한 뒤 닫고 내 문서 목록을 엽니다`}
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

      {listOpen && (
        <MapListModal
          t={t}
          title="내 문서"
          emptyHint={needLogin()
            ? '로그인하면 저장한 맵이 여기에 표시됩니다.'
            : '저장된 맵이 없습니다. 새 맵을 만들어 저장해 보세요.'}
          onClose={() => setListOpen(false)}
          onFlash={flash}
        />
      )}
    </div>
  );
}
