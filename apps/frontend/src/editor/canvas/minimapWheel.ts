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
