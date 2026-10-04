import type { SampleMap } from './types';
import { tr } from '@/i18n';

// "2026 제품 로드맵" — radial-bidirectional default
// Each branch chooses a side ('left' or 'right') for radial layout splitting.
// 글은 **만드는 순간의 언어**로 (2026-10-05 i18n) — 모듈 상수로 두면 처음 언어로 굳는다.
export function sampleRoadmap(): SampleMap {
  const s = (k: string) => tr(`editor.sample.${k}`);
  return {
    title: s('title'),
    root: { id: 'root', text: s('root'), colorKey: 'root', side: 'center' },
    branches: [
      {
        id: 'b1', text: s('b1'), colorKey: 'l1B', side: 'right', icon: '🧱',
        children: [
          {
            id: 'b1-1', text: s('b1_1'), tags: ['MVP', 'Auth'],
            children: [
              { id: 'b1-1-1', text: s('b1_1_1') },
              { id: 'b1-1-2', text: s('b1_1_2') },
            ],
          },
          {
            id: 'b1-2', text: s('b1_2'), tags: ['MVP', 'Core'], note: true,
            children: [
              { id: 'b1-2-1', text: s('b1_2_1') },
              {
                id: 'b1-2-2', text: s('b1_2_2'),
                children: [
                  { id: 'b1-2-2-1', text: s('b1_2_2_1') },
                ],
              },
            ],
          },
          { id: 'b1-3', text: s('b1_3') },
        ],
      },
      {
        id: 'b2', text: s('b2'), colorKey: 'l1A', side: 'right', icon: '✨',
        children: [
          {
            id: 'b2-1', text: s('b2_1'), tags: ['AI', 'MVP'], locked: true,
            children: [
              { id: 'b2-1-1', text: s('b2_1_1') },
              { id: 'b2-1-2', text: s('b2_1_2') },
            ],
          },
          { id: 'b2-2', text: s('b2_2') },
          { id: 'b2-3', text: s('b2_3') },
        ],
      },
      {
        id: 'b3', text: s('b3'), colorKey: 'l1E', side: 'right', icon: '👥',
        children: [
          { id: 'b3-1', text: s('b3_1') },
          { id: 'b3-2', text: s('b3_2') },
        ],
      },
      {
        id: 'b4', text: s('b4'), colorKey: 'l1C', side: 'left', icon: '🚀',
        children: [
          { id: 'b4-1', text: s('b4_1') },
          { id: 'b4-2', text: 'Markdown / HTML Export', tags: ['Export', 'MVP'] },
          { id: 'b4-3', text: s('b4_3') },
        ],
      },
      {
        id: 'b5', text: s('b5'), colorKey: 'l1D', side: 'left', icon: '📊',
        children: [
          { id: 'b5-1', text: 'MAU 10,000' },
          { id: 'b5-2', text: 'Retention D30 ≥ 35%' },
          { id: 'b5-3', text: s('b5_3') },
        ],
      },
      {
        id: 'b6', text: s('b6'), colorKey: 'l1A', side: 'left', icon: '⚠️',
        children: [
          { id: 'b6-1', text: s('b6_1') },
          { id: 'b6-2', text: s('b6_2') },
        ],
      },
    ],
  };
}
