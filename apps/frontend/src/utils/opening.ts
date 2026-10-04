// "맵을 여는 중…" 안내와 함께 무거운 일을 한다 (2026-09-30 사용자 요청).
//
// 수천 노드 맵을 loadMap 하면 React 가 한 번에 그리느라 메인 스레드가 몇 초~
// 수십 초 막힌다. 그 동안 아무 안내가 없으면 멈춘 것처럼 보인다. 안내는
// 무거운 일이 **시작되기 전에 화면에 그려져야** 하므로 한 프레임을 기다린 뒤
// 일을 시작하고, 일이 끝나 그 결과가 **그려진 뒤**(다음 프레임)에 지운다.
// 무거운 렌더 중에는 rAF 가 돌 수 없으므로 "다음 프레임" 이 곧 "렌더가 끝난 뒤" 다.

import { useEditorUiStore } from '@/stores/editorUiStore';
import { tr, currentLocale } from '@/i18n';

/** 브라우저가 한 번 그린 뒤 이어서 — 안내를 화면에 올리거나, 렌더가 끝났음을 안다 */
export function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') { setTimeout(resolve, 0); return; }
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

/** 노드 수를 넣은 안내 문구 */
export function openingLabelFor(what: string, nodeCount?: number): string {
  return nodeCount && nodeCount >= 300
    ? tr('cloud.opening.drawing', { what, n: nodeCount.toLocaleString(currentLocale()) })
    : `${what}…`;
}

/**
 * `label` 을 띄우고 한 프레임 뒤에 `run` 을 실행한다. 끝나면(예외여도) 다음 프레임에
 * 안내를 지운다. 안에서 또 부르면 바깥 안내를 그대로 둔다.
 */
export async function withOpening<T>(label: string, run: () => Promise<T> | T): Promise<T> {
  const ui = useEditorUiStore.getState();
  const nested = ui.openingLabel !== null;
  if (!nested) {
    ui.setOpeningLabel(label);
    await afterPaint();
  }
  try {
    return await run();
  } finally {
    if (!nested) {
      await afterPaint();
      useEditorUiStore.getState().setOpeningLabel(null);
    }
  }
}
