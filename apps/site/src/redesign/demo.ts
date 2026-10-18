/** Homepage-only deterministic outline demo. No network or AI calls. */
export interface DemoGroup { title: string; items: string[] }
export interface DemoMap { root: string; groups: DemoGroup[]; skipped: number }
export const PRESETS: Record<string, string> = {
  "questions": "# 우리 팀에 AI가 필요할까?\n## 무엇을 해결하려는가?\n- 지금 가장 불편한 일은?\n- 바꾸고 싶은 결과는?\n## 어떤 근거가 있는가?\n- 실제로 확인한 사실은?\n- 아직 검증하지 않은 것은?\n## 다른 관점은 없는가?\n- 쓰지 않아도 되는 일은?\n- 비용과 위험은 무엇일까?",
  "meeting": "# 다음 주 팀 회의\n## 이야기할 것\n- 새 홈페이지 방향\n- 사용자 피드백\n## 결정할 것\n- 먼저 할 일\n- 담당자 정하기\n## 남길 것\n- 결정 내용\n- 다음 회의 일정",
  "study": "# 오늘 읽은 책\n## 핵심 개념\n- 저자의 주장\n- 기억할 사례\n## 나의 질문\n- 왜 그럴까?\n- 다른 관점은?\n## 적용할 것\n- 오늘의 작은 실천\n- 다시 읽을 부분",
  "travel": "# 주말 여행\n## 준비할 것\n- 충전기\n- 편한 신발\n## 하고 싶은 것\n- 바다 산책\n- 맛집 탐방\n## 가고 싶은 곳\n- 강릉\n- 속초"
};
export function parseMemo(text: string): DemoMap {
 let root = '나의 생각 지도'; const groups: DemoGroup[] = []; let current: DemoGroup | null = null;
 for (const raw of text.split(/\r?\n/)) { const line = raw.trim(); if (!line) continue;
  if (/^#\s+/.test(line)) { root = line.replace(/^#\s+/, ''); continue; }
  if (/^##\s+/.test(line)) { current = { title: line.replace(/^##\s+/, ''), items: [] }; groups.push(current); continue; }
  if (!current) { current = { title: '떠오른 생각', items: [] }; groups.push(current); }
  current.items.push(line.replace(/^[-*+]\s+/, ''));
 }
 let skipped = 0; groups.forEach((group, index) => { skipped += index < 3 ? Math.max(0, group.items.length - 2) : 1 + group.items.length; });
 return { root, groups: groups.slice(0, 3), skipped };
}
export function fitLabel(text: string, available: number, font: number): string {
 let width = 0; let result = '';
 for (const char of text) { const step = (char.codePointAt(0) ?? 0) < 128 ? font * .57 : font;
  if (width + step > available - font) return result + '…'; result += char; width += step; }
 return result;
}
