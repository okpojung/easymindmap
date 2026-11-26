// Normalize DOM wheel events. Some browsers/devices already convert Shift+wheel to deltaX.
export interface MinimapWheelInput { deltaX: number; deltaY: number; shiftKey: boolean; deltaMode: number }
export function minimapWheelDelta(e: MinimapWheelInput, panelW: number, panelH: number) {
  const x = Number.isFinite(e.deltaX) ? e.deltaX : 0;
  const y = Number.isFinite(e.deltaY) ? e.deltaY : 0;
  const unitX = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? panelW : 1;
  const unitY = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? panelH : 1;
  // Do not add both axes: some devices duplicate the same Shift step on each axis.
  const horizontal = Math.abs(x) >= Math.abs(y) ? x : y;
  return e.shiftKey ? { dx: horizontal * unitX, dy: 0 } : { dx: x * unitX, dy: y * unitY };
}

/** 2026-11-26: a wheel over the minimap drives the main canvas exactly like a wheel on the
 *  canvas (wheel = vertical, Shift = horizontal, Ctrl/Cmd = zoom). The forwarded event keeps
 *  deltas and modifiers but is aimed at the canvas centre, so zoom pivots on the visible
 *  centre instead of the map spot hidden behind the minimap panel. */
export interface ForwardRect { left: number; top: number; width: number; height: number }
export function minimapForwardWheelInit(
  e: MinimapWheelInput & { ctrlKey: boolean; metaKey: boolean; altKey: boolean },
  rect: ForwardRect,
): WheelEventInit {
  const num = (v: number) => (Number.isFinite(v) ? v : 0);
  return {
    deltaX: num(e.deltaX), deltaY: num(e.deltaY), deltaMode: e.deltaMode,
    shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
    clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
    bubbles: false, cancelable: true,
  };
}
