// textMeasure — 캔버스 2D measureText로 "실제 글꼴 폭"을 잰다.
//
// 인라인 강조 구간(tspan)의 x 좌표를 근사 폭(measureTextApprox)으로 계산하면
// 실제 렌더링 폭과 어긋나 인접 구간의 글자가 겹치거나 벌어진다 — 표시용
// 좌표는 반드시 이 실측을 쓴다. (노드 크기 계산은 여전히 근사 폭 —
// 레이아웃 결정을 폰트 로딩 시점과 분리하기 위함이며, 근사가 실측보다
// 넉넉해 잘림은 없다.)

const APP_FONT =
  "'Pretendard Variable','Pretendard','Inter',-apple-system,BlinkMacSystemFont,system-ui,sans-serif";

let ctx: CanvasRenderingContext2D | null = null;

export interface MeasureOpts {
  bold?: boolean;
  italic?: boolean;
  weight?: number; // bold보다 우선 (예: 600)
  family?: string; // 'inherit'이면 앱 기본 글꼴
}

export function measureTextPx(text: string, fontSize: number, opts: MeasureOpts = {}): number {
  if (!ctx) {
    ctx = document.createElement('canvas').getContext('2d');
  }
  if (!ctx) return text.length * fontSize * 0.6; // 캔버스 불가 환경 폴백

  const family = opts.family && opts.family !== 'inherit' ? opts.family : APP_FONT;
  const weight = opts.weight ?? (opts.bold ? 700 : 500);
  ctx.font = `${opts.italic ? 'italic ' : ''}${weight} ${fontSize}px ${family}`;
  return ctx.measureText(text).width;
}
