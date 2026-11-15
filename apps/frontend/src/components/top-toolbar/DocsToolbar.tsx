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
import { UserMenu } from './UserMenu';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useTr } from '@/i18n';
import { useCoarse } from '@/hooks/useViewport';
import { appFaviconUrl } from '@/utils/brandFavicon';
import { setDocsHeaderHost, useDocsCompactHeader } from '@/components/cloud/docsHeaderHost';


export function DocsToolbar({ t }: { t: ThemeTokens }) {
  const tr = useTr();
  const themeName = useEditorUiStore((s) => s.themeName);
  const setThemeName = useEditorUiStore((s) => s.setThemeName);
  // 폰 — 노치(safe-area)만큼 띄우고, 손가락 입력이면 단추를 40px 로
  const phone = useDocsCompactHeader();
  const coarse = useCoarse();

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
        // 데스크톱: 로고·제목·문서함 도구·테마·계정이 **한 줄**. 폰: 이 줄 + MapBrowser 의 검색 줄 = 두 줄.
        minHeight: phone ? 'calc(48px + env(safe-area-inset-top, 0px))' : 'calc(52px + env(safe-area-inset-top, 0px))',
        boxSizing: 'border-box',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: phone ? 0 : 4,
        paddingLeft: `max(${phone ? 8 : 14}px, env(safe-area-inset-left, 0px))`,
        paddingRight: `max(${phone ? 8 : 14}px, env(safe-area-inset-right, 0px))`,
        flexShrink: 0,
        background: t.surface,
        borderBottom: `1px solid ${t.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: phone ? 6 : 10,
        position: 'relative',
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexShrink: phone ? 1 : 0 }}>
        <img
          src={appFaviconUrl()}
          alt="EasyMindMap"
          title="EasyMindMap"
          data-testid="docs-brand-favicon"
          width={28}
          height={28}
          style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, display: 'block' }}
        />
        <span data-testid="docs-title" style={{
          fontSize: 15, color: t.text, fontWeight: 700, whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
        }}>{tr('shell.toolbar.crumb')}</span>
      </div>

      {/* 문서함 도구 자리 — MapBrowser 가 포탈로 검색·새 맵·폴더 도구를 그린다 (폰에서는 자리 없음) */}
      <div ref={setDocsHeaderHost} className="docs-hdr-slot" data-testid="docs-header-slot"
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }} />

      {/* 다크 모드 토글 — 편집 툴바와 같은 버튼 */}
      <button
        title={themeName === 'dark' ? tr('shell.toolbar.toLight') : tr('shell.toolbar.toDark')}
        data-testid="theme-toggle"
        onClick={() => setThemeName(themeName === 'dark' ? 'light' : 'dark')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: coarse ? 40 : 34, height: coarse ? 40 : 32, borderRadius: 8, flexShrink: 0,
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
            position: 'absolute', top: 'calc(46px + env(safe-area-inset-top, 0px))',
            right: phone ? 8 : 14, zIndex: 80,
            maxWidth: 'calc(100vw - 16px)', whiteSpace: phone ? 'normal' : 'nowrap', lineHeight: 1.45,
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
