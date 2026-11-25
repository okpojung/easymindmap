// Main canvas wheel scrolling (2026-11-25): wheel = vertical, Shift+wheel = horizontal.
// Same normalization as the minimap so mice, trackpads and line/page modes agree.
import { minimapWheelDelta, type MinimapWheelInput } from './minimapWheel';

export function canvasWheelScroll(e: MinimapWheelInput, viewW: number, viewH: number) {
  return minimapWheelDelta(e, viewW, viewH);
}
