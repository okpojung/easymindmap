// DocsToolbar — **문서함 화면의 상단 막대** (2026-09-07 사용자 요청).
//
// 전에는 편집 화면의 툴바(TopToolbar)가 문서함 위에도 그대로 떠 있었다 —
// 되돌리기·저장 배지·AI 생성·공유·퍼블리싱·저장·맵 닫기·내보내기가 전부
// 보였는데, 문서함에서는 그 버튼들이 "어느 맵" 을 말하는지 알 수 없고
// 대부분 눌러도 뜻이 없다. 그래서 **둘을 나눴다**:
//   · 문서함  → 이 막대. 로고 · '내 문서' · 다크 토글 · 계정 메뉴만.
//              맵마다 할 일(공유·퍼블리싱·이름·이동·삭제)은 **행의 관리 칸**에 있다.
//   · 편집    → TopToolbar. 편집에 관한 것만.
// 공통인 것(다크 토글·계정 메뉴·토스트)은 여기도 같은 부품을 쓴다.

import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { UserMenu } from './UserMenu';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudStore } from '@/stores/cloudStore';

export function DocsToolbar({ t }: { t: ThemeTokens }) {
  const themeName = useEditorUiStore((s) => s.themeName);
  const setThemeName = useEditorUiStore((s) => s.setThemeName);

  // 우측 상단 토스트 — 편집 툴바와 같은 모양. 계정 메뉴(로그아웃 등)와
  // cloudStore 의 소식(notice)이 여기로 온다.
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast((cur) => (cur === m ? null : cur)), 3500);
  };
  const cloudNotice = useCloudStore((s) => s.notice);
  useEffect(() => {
    if (!cloudNotice) return;
    flash(cloudNotice);
    useCloudStore.getState().setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudNotice]);

  return (
    <div
      data-testid="docs-toolbar"
      style={{
        height: 52,
        background: t.surface,
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: 10,
        position: 'relative',
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div
          style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="EasyMindMap"
        >
          <I.Logo size={30} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{ fontSize: 11, color: t.textSubtle, fontWeight: 500 }}>EasyMindMap</span>
          <span data-testid="docs-title" style={{ fontSize: 14, color: t.text, fontWeight: 600 }}>내 문서</span>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* 다크 모드 토글 — 편집 툴바와 같은 버튼 */}
      <button
        title={themeName === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        data-testid="theme-toggle"
        onClick={() => setThemeName(themeName === 'dark' ? 'light' : 'dark')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 32, borderRadius: 8,
          background: t.surfaceAlt, color: t.text,
          border: `1px solid ${t.border}`, cursor: 'pointer', fontSize: 15,
        }}
      >
        {themeName === 'dark' ? '☀' : '🌙'}
      </button>

      {/* 계정 메뉴 — 개인 설정·계정·AI 커넥터·로그아웃 (편집 화면과 같은 메뉴) */}
      <UserMenu t={t} onFlash={flash} />

      {toast && (
        <div
          data-testid="cloud-toast"
          style={{
            position: 'absolute', top: 46, right: 14, zIndex: 80, whiteSpace: 'nowrap',
            background: t.text, color: t.surface, padding: '6px 12px', borderRadius: 8,
            fontSize: 12, boxShadow: '0 6px 18px rgba(0,0,0,0.22)',
            pointerEvents: 'none',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
