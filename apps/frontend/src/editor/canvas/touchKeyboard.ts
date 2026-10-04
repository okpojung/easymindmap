// touchKeyboard — 손가락으로 편집을 열 때 화면 키보드를 띄우는 마중물 (모바일 웹, 2026-10-05).
//
// iOS Safari 는 **사용자 조작(톡) 처리 안에서 동기로** focus() 한 입력칸에만 키보드를
// 띄운다. 노드 편집창(textarea)은 편집 상태가 바뀐 **뒤에** 생기고 setTimeout 으로
// 포커스를 받으므로, 그대로는 키보드가 안 뜬다. 그래서 톡 처리 안에서 숨은 입력칸에
// 먼저 포커스를 주고(키보드가 뜬다), 곧이어 편집창이 포커스를 가져가게 한다 —
// iOS 는 포커스가 입력칸에서 입력칸으로 옮겨 가면 키보드를 그대로 둔다.
// 편집창이 끝내 안 생기면 잠시 뒤 숨은 칸을 놓아 키보드를 거둔다.

let proxy: HTMLInputElement | null = null;

export function primeTouchKeyboard(): void {
  if (typeof document === 'undefined') return;
  if (!proxy || !proxy.isConnected) {
    proxy = document.createElement('input');
    proxy.type = 'text';
    proxy.setAttribute('aria-hidden', 'true');
    proxy.tabIndex = -1;
    proxy.setAttribute('data-testid', 'm-edit-keyboard-proxy');
    // 16px — iOS 는 16px 보다 작은 글자의 입력칸에 포커스하면 화면을 확대한다
    Object.assign(proxy.style, {
      position: 'fixed', left: '0', top: '30%', width: '1px', height: '1px',
      opacity: '0', border: '0', padding: '0', fontSize: '16px',
      pointerEvents: 'none', zIndex: '-1',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(proxy);
  }
  try { proxy.focus({ preventScroll: true }); } catch { proxy.focus(); }
  const p = proxy;
  window.setTimeout(() => { if (document.activeElement === p) p.blur(); }, 1200);
}
