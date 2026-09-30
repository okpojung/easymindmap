// [일반맵으로 되돌리기] — 대시보드맵을 다시 편집할 수 있게 한다 (2026-09-30).
// 설계: docs/04-extensions/dashboard/22-dashboard.md §4.6
//
// ★ **왜 코어에 있나.** 대시보드맵은 유료 기능이지만, 유료 모듈이 꺼진 서버에
//   대시보드맵이 **남아 있을 수** 있다(라이선스가 끝났다 등). 그때 사용자가
//   자기 맵을 다시 고칠 길이 없으면, 그건 문서를 인질로 잡는 셈이다. 서버도
//   되돌리기는 기능 여부와 상관없이 받는다(`apps/api/.../dashboard-rules.ts`).
//   유료 화면도 같은 단추를 쓴다 — 되돌리는 규칙이 두 벌이 되지 않게.

import type { CSSProperties } from 'react';
import { useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { CloudError, cloudApi } from '@/services/cloud/apiClient';
import { openMapHere } from '@/services/cloud/mapSession';
import { useCloudStore } from '@/stores/cloudStore';

export interface DashboardMapRef {
  mapId: string;
  title: string;
}

/**
 * 되돌린다 — 그 맵이 지금 에디터에 열려 있으면 **편집할 수 있게 다시 연다**
 * (읽기 전용 잠금·자동 갱신이 풀린다). 실패하면 서버 문장을 그대로 던진다.
 */
export async function revertDashboard(map: DashboardMapRef): Promise<void> {
  await cloudApi.updateMap(map.mapId, { viewMode: 'edit' });
  if (useCloudStore.getState().readOnlyInfo?.mapId === map.mapId) {
    await openMapHere(map.mapId);
  }
}

export function DashboardRevertButton({ t, map, compact, iconStyle, onChanged }: {
  t: ThemeTokens;
  map: DashboardMapRef;
  compact?: boolean;
  iconStyle?: CSSProperties;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!window.confirm(
      `“${map.title || '제목 없음'}” 을(를) 일반맵으로 되돌릴까요?\n`
      + '· 다시 편집할 수 있게 됩니다\n'
      + '· 노드의 [&변수] 는 글자로 보입니다 — 넣어 둔 값은 지우지 않습니다',
    )) return;
    setBusy(true);
    try {
      await revertDashboard(map);
      onChanged?.();
    } catch (err) {
      window.alert(err instanceof CloudError ? err.message : '되돌리지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };
  const title = '일반맵으로 되돌리기 — 다시 편집할 수 있게 됩니다 (넣어 둔 값은 남습니다)';
  if (compact && iconStyle) {
    return (
      <button
        data-testid="dashboard-revert"
        style={{ ...iconStyle, color: t.primary }}
        title={title} aria-label="일반맵으로 되돌리기"
        disabled={busy}
        onClick={() => void run()}
      >📊</button>
    );
  }
  return (
    <button
      data-testid="dashboard-revert"
      title={title}
      disabled={busy}
      onClick={() => void run()}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        height: 32, padding: '0 10px', borderRadius: 8,
        fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0,
        cursor: busy ? 'default' : 'pointer',
        background: t.surfaceAlt, color: t.text, border: `1px solid ${t.border}`,
      }}
    >📊{!compact && ' 일반맵으로 되돌리기'}</button>
  );
}
