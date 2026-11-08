// 간트 차트 테마 (2026-11-08 사용자 요청: "테마 몇 개, 기본도 색을 입혀 멋지게").
// 막대는 **1레벨 가지마다 다른 색**(palette 를 돌려 쓴다) — 진척은 진한 색, 남은 기간은 같은 색을 옅게.
// 배경·글자는 앱 테마(밝게/어둡게)를 따르고, 여기서는 강조색만 정한다(어두운 화면에서도 읽히게).
export type GanttThemeKey = 'vivid' | 'ocean' | 'forest' | 'sunset' | 'pastel' | 'grey';

export interface GanttTheme {
  palette: string[];
  /** 머리글 띠·월 글자 */
  accent: string;
  /** 오늘 선·오늘 칸 */
  today: string;
  /** 요약 막대(하위 일정 범위) */
  summary: string;
  /** 주말 음영 */
  weekend: string;
}

export const GANTT_THEMES: Record<GanttThemeKey, GanttTheme> = {
  vivid: { palette: ['#4C6EF5', '#F76707', '#12B886', '#E64980', '#7950F2', '#1C7ED6', '#F59F00', '#2F9E44'], accent: '#4C6EF5', today: '#E03131', summary: '#495057', weekend: 'rgba(76,110,245,0.07)' },
  ocean: { palette: ['#1971C2', '#0B7285', '#3B5BDB', '#1098AD', '#4263EB', '#15AABF'], accent: '#1971C2', today: '#F03E3E', summary: '#364FC7', weekend: 'rgba(25,113,194,0.07)' },
  forest: { palette: ['#2B8A3E', '#087F5B', '#5C940D', '#0CA678', '#37B24D', '#74B816'], accent: '#2B8A3E', today: '#E8590C', summary: '#2B8A3E', weekend: 'rgba(43,138,62,0.07)' },
  sunset: { palette: ['#E8590C', '#C2255C', '#F08C00', '#D6336C', '#FD7E14', '#AE3EC9'], accent: '#E8590C', today: '#7048E8', summary: '#862E9C', weekend: 'rgba(232,89,12,0.07)' },
  pastel: { palette: ['#748FFC', '#FF8787', '#63E6BE', '#FFD43B', '#B197FC', '#66D9E8'], accent: '#748FFC', today: '#FA5252', summary: '#868E96', weekend: 'rgba(116,143,252,0.08)' },
  grey: { palette: ['#495057', '#868E96', '#343A40', '#ADB5BD'], accent: '#495057', today: '#E03131', summary: '#212529', weekend: 'rgba(73,80,87,0.06)' },
};
export const GANTT_THEME_KEYS = Object.keys(GANTT_THEMES) as GanttThemeKey[];

/** #RRGGBB + 투명도(0~1) → rgba() */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
