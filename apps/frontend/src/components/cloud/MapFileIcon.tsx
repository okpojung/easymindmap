// 문서함의 맵 아이콘 (2026-10-25 사용자 요청: "맵 아이콘이 마음에 안 든다, 이쁘게 다시").
//
// 폴더(📁)와 같은 무게로 보이도록 **색을 채운 둥근 타일** 위에 흰색 작은 마인드맵
// (가운데 노드 하나 + 굵고 넓게 펼친 오른쪽 가지 셋)을 그린다. 타일 색으로 맵의 종류를 가른다.
//   단독맵 네이비(노란 폴더와 갈리게, 주황→네이비)
//   협업맵·공유받은 맵: 같은 네이비 타일에 **가지와 끝 원을 R·G·B** (여러 사람이 함께 쓰는 맵)
//     — 16px 에서 원만 색칠하면 구분이 안 돼서 가지까지 칠한다 (2026-10-25 사용자 지시)
//   퍼블리싱 초록 · 대시보드 보라
// 글자 배지(단독맵·협업맵…)는 그대로 두고, 아이콘은 그 배지를 거들 뿐이다.
import { useId } from 'react';

export type MapTone = 'solo' | 'collab' | 'published' | 'dashboard' | 'shared';

const NAVY: [string, string] = ['#1E3A5F', '#3E6A99'];
const RGB: [string, string, string] = ['#FF4D4D', '#3DDC6B', '#4FA3FF'];
const WHITE: [string, string, string] = ['#fff', '#fff', '#fff'];

const TONES: Record<MapTone, { tile: [string, string]; branch: [string, string, string] }> = {
  solo: { tile: NAVY, branch: WHITE },
  collab: { tile: NAVY, branch: RGB },
  shared: { tile: NAVY, branch: RGB },
  published: { tile: ['#15803D', '#4ADE80'], branch: WHITE },
  dashboard: { tile: ['#6D28D9', '#A78BFA'], branch: WHITE },
};

/** 맵 목록 항목 → 아이콘 종류 (mapType() 의 배지와 같은 순서로 판정) */
export function mapTone(m: { shared?: boolean; publishId?: string | null; viewMode?: string | null; kind?: string | null }): MapTone {
  if (m.shared) return 'shared';
  if (m.viewMode === 'dashboard') return 'dashboard';
  if (m.publishId) return 'published';
  return m.kind === 'collab' ? 'collab' : 'solo';
}

// 가지 셋 — 위·가운데·아래 (Mindmap Markdown 로고처럼 굵고 넓게, 2026-10-25 2차)
const BRANCHES = [
  'M8.6 10 C 11.4 10, 11.2 4.6, 14.1 4.6',
  'M8.6 10 H 14.1',
  'M8.6 10 C 11.4 10, 11.2 15.4, 14.1 15.4',
];
const LEAF_Y = [4.6, 10, 15.4];

export function MapFileIcon({ tone = 'solo', size = 16 }: { tone?: MapTone; size?: number }) {
  const id = `mfi${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const { tile: [c, c2], branch } = TONES[tone];
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" data-tone={tone} style={{ flexShrink: 0, display: 'block' }}>
      <defs>
        <linearGradient id={id} x1="2" y1="1" x2="18" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={c2} />
          <stop offset="1" stopColor={c} />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="19" height="19" rx="5.2" fill={`url(#${id})`} />
      {BRANCHES.map((d, i) => (
        <path key={d} d={d} stroke={branch[i]} strokeWidth="2" strokeLinecap="round" />
      ))}
      <rect x="3.4" y="7.8" width="6.2" height="4.4" rx="2.2" fill="#fff" />
      {LEAF_Y.map((y, i) => <circle key={y} cx="15" cy={y} r="1.75" fill={branch[i]} />)}
    </svg>
  );
}
