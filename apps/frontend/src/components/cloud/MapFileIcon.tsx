// 문서함의 맵 아이콘 (2026-10-25 사용자 요청: "맵 아이콘이 마음에 안 든다, 이쁘게 다시").
//
// 폴더(📁)와 같은 무게로 보이도록 **색을 채운 둥근 타일** 위에 흰색 작은 마인드맵
// (가운데 노드 하나 + 오른쪽 가지 셋)을 그린다. 타일 색으로 맵의 종류를 한눈에 가른다.
//   단독맵 주황 · 협업맵 파랑 · 퍼블리싱 초록 · 대시보드 보라 · 공유받은 맵 청록
// 글자 배지(단독맵·협업맵…)는 그대로 두고, 아이콘은 그 배지를 거들 뿐이다.
import { useId } from 'react';

export type MapTone = 'solo' | 'collab' | 'published' | 'dashboard' | 'shared';

const TONES: Record<MapTone, [string, string]> = {
  solo: ['#E0701A', '#F9A65A'],
  collab: ['#2563EB', '#60A5FA'],
  published: ['#15803D', '#4ADE80'],
  dashboard: ['#6D28D9', '#A78BFA'],
  shared: ['#0F766E', '#2DD4BF'],
};

/** 맵 목록 항목 → 아이콘 색 (mapType() 의 배지와 같은 순서로 판정) */
export function mapTone(m: { shared?: boolean; publishId?: string | null; viewMode?: string | null; kind?: string | null }): MapTone {
  if (m.shared) return 'shared';
  if (m.viewMode === 'dashboard') return 'dashboard';
  if (m.publishId) return 'published';
  return m.kind === 'collab' ? 'collab' : 'solo';
}

export function MapFileIcon({ tone = 'solo', size = 16 }: { tone?: MapTone; size?: number }) {
  const id = `mfi${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [c, c2] = TONES[tone];
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" data-tone={tone} style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="2" y1="1" x2="18" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={c2} />
          <stop offset="1" stopColor={c} />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="19" height="19" rx="5.2" fill={`url(#${id})`} />
      <path d="M9 10 C 11.2 10, 11.5 5.8, 14.2 5.8 M9 10 H 14.2 M9 10 C 11.2 10, 11.5 14.2, 14.2 14.2"
        stroke="#fff" strokeWidth="1.35" strokeLinecap="round" strokeOpacity="0.95" />
      <rect x="3.6" y="7.9" width="6.4" height="4.2" rx="2.1" fill="#fff" />
      <circle cx="15.2" cy="5.8" r="1.55" fill="#fff" />
      <circle cx="15.2" cy="10" r="1.55" fill="#fff" />
      <circle cx="15.2" cy="14.2" r="1.55" fill="#fff" />
    </svg>
  );
}
