// Main canvas wheel scrolling (2026-11-25): wheel = vertical, Shift+wheel = horizontal.
// Same normalization as the minimap so mice, trackpads and line/page modes agree.
import { minimapWheelDelta, type MinimapWheelInput } from './minimapWheel';

/** Ctrl/Cmd+wheel zoom step. A mouse notch (~120px) is about 20%; small trackpad
 *  pinch deltas stay proportional; every event is capped so one notch never jumps 3x. */
export function canvasWheelZoomFactor(e: { deltaY: number; deltaMode: number }) {
  const y = Number.isFinite(e.deltaY) ? e.deltaY : 0;
  const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
  return Math.exp(Math.max(-0.2, Math.min(0.2, -y * unit * 0.01)));
}

export function canvasWheelScroll(e: MinimapWheelInput, viewW: number, viewH: number) {
  return minimapWheelDelta(e, viewW, viewH);
}
