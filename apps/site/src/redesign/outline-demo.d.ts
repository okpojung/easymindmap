/** Isolated, browser-memory-only homepage demo. */
export interface OutlineDemoController {
  choosePreset(key: string): void;
  reset(toDefault?: boolean): void;
  destroy(): void;
}
export function mountOutlineDemo(root: HTMLElement, presets: Record<string, string>): OutlineDemoController;
export const MAP_MIN_FIT: number;
export function fitMapScale(layout: { width: number; height: number } | null, width: number, height: number, min?: number): number;
