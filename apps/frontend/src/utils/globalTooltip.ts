// globalTooltip — 앱 전역 커스텀 툴팁.
//
// 브라우저 네이티브 title 툴팁은 마우스 커서 "아래"에 떠서 커서가 설명
// 텍스트를 가린다. 이 헬퍼는 title 속성(HTML)과 <title> 자식(SVG)을
// 가진 모든 요소에 대해 요소 "위쪽 중앙"에 커스텀 툴팁을 즉시 띄운다
// — 개별 컴포넌트 수정 없이 전수 적용된다.
//
// 동작:
//  · mouseover: 가장 가까운 [title] 요소(또는 <title> 자식을 가진 SVG
//    요소)를 찾아 텍스트를 읽고, 네이티브 툴팁이 겹치지 않게 title을
//    잠시 떼어낸 뒤 요소 위에 표시
//  · mouseout / pointerdown: title 원복 + 툴팁 숨김 (pointerdown 원복은
//    클릭 시점에 DOM이 원래 상태가 되도록 — 테스트·접근성 안전)
//
// HTML 내보내기 뷰어에도 같은 로직이 인라인으로 들어간다 (exportHtml).

let installed = false;

export function installGlobalTooltip(): void {
  if (installed) return;
  installed = true;

  const tip = document.createElement('div');
  tip.setAttribute('data-testid', 'global-tooltip');
  Object.assign(tip.style, {
    position: 'fixed',
    zIndex: '99999',
    pointerEvents: 'none',
    background: 'rgba(32, 30, 26, 0.95)',
    color: '#FFF',
    fontSize: '11px',
    lineHeight: '1.45',
    padding: '4px 8px',
    borderRadius: '5px',
    maxWidth: '280px',
    whiteSpace: 'pre-line',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    display: 'none',
  } as CSSStyleDeclaration);
  document.body.appendChild(tip);

  // 떼어낸 네이티브 툴팁 — 원복용
  let savedAttr: { el: Element; title: string } | null = null;
  let savedSvg: { parent: Element; node: Element } | null = null;

  const restore = () => {
    if (savedAttr) {
      if (!savedAttr.el.getAttribute('title')) {
        savedAttr.el.setAttribute('title', savedAttr.title);
      }
      savedAttr = null;
    }
    if (savedSvg) {
      if (savedSvg.node.parentNode !== savedSvg.parent) {
        savedSvg.parent.insertBefore(savedSvg.node, savedSvg.parent.firstChild);
      }
      savedSvg = null;
    }
    tip.style.display = 'none';
  };

  const show = (anchor: Element, text: string, cursorY = 0) => {
    tip.textContent = text;
    tip.style.display = 'block';
    const r = anchor.getBoundingClientRect();
    // 먼저 그려서 크기를 잰 뒤 위쪽 중앙에 배치 (위 공간이 없으면 아래)
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(4, Math.min(window.innerWidth - tw - 4, left));
    let top = r.top - th - 8;
    // 아래 폴백 시에는 마우스 커서 그림(핫스팟 아래로 ~22px)보다 더
    // 아래에 — 최상단 버튼에서 커서가 설명을 가리지 않게
    if (top < 4) top = Math.max(r.bottom + 8, cursorY + 24);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  document.addEventListener('mouseover', (e) => {
    const target = e.target as Element | null;
    if (!target || !(target instanceof Element)) return;
    restore();

    // ① HTML title 속성
    const host = target.closest('[title]');
    if (host) {
      const text = host.getAttribute('title') || '';
      if (text.trim()) {
        host.removeAttribute('title');
        savedAttr = { el: host, title: text };
        show(host, text, e.clientY);
        return;
      }
    }
    // ② SVG <title> 자식 (인디케이터·접기 토글 등)
    let n: Element | null = target;
    while (n && n.tagName.toLowerCase() !== 'svg' && n.tagName.toLowerCase() !== 'body') {
      const t = n.querySelector(':scope > title');
      if (t && (t.textContent || '').trim()) {
        savedSvg = { parent: n, node: t };
        const svgText = t.textContent || '';
        t.remove();
        show(n, svgText, e.clientY);
        return;
      }
      n = n.parentElement;
    }
  });

  document.addEventListener('mouseout', (e) => {
    const anchor = savedAttr?.el ?? savedSvg?.parent;
    if (!anchor) return;
    const to = (e as MouseEvent).relatedTarget as Node | null;
    if (to && anchor.contains(to)) return; // 아직 요소 안
    restore();
  });
  // 클릭 순간에는 항상 원래 DOM (title 원복) — 이후 재호버 시 다시 표시
  document.addEventListener('pointerdown', restore, true);
  window.addEventListener('blur', restore);
}
