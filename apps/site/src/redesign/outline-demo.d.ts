/** Isolated, browser-memory-only homepage demo. */
export interface OutlineDemoController {
  choosePreset(key: string): void;
  reset(toDefault?: boolean): void;
  destroy(): void;
}
export function mountOutlineDemo(root: HTMLElement, presets: Record<string, string>): OutlineDemoController;
