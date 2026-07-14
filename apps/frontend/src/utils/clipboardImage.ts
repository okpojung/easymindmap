// clipboardImage — 클립보드에서 사진을 꺼내 NodeImage로 만든다.
// 캔버스(노드 선택 후 Ctrl+V)와 노드 텍스트 편집창 붙여넣기가 공유한다.
//
//   ① 이미지 파일 (스크린샷·복사한 그림) → data URL
//   ② text/html 속 첫 <img> (웹에서 복사)   → 원본 URL
//
// 원본 크기를 알기 위해 Image()로 로드해 보고, 로드가 실패해도(핫링크
// 차단 등) 기본 크기(400×300)로 일단 첨부한다 — 표시가 깨지면 노드의
// ✕ 버튼으로 제거할 수 있다.

import type { NodeImage } from '@/editor/__samples__/types';

function probeAndApply(src: string, apply: (img: NodeImage) => void): void {
  const probe = new Image();
  probe.onload = () => {
    apply({ src, w: probe.naturalWidth || 400, h: probe.naturalHeight || 300 });
  };
  probe.onerror = () => {
    // 크기를 못 재도 첨부는 한다 (기본 비율) — 렌더링이 되면 그 크기로 표시
    apply({ src, w: 400, h: 300 });
  };
  probe.src = src;
}

// 클립보드에 사진이 있으면 apply를 호출하고 그 종류를 반환한다.
//   'file' = 이미지 파일이 소비됨 (호출부에서 preventDefault 권장)
//   'html' = 웹 이미지 URL만 추출 (텍스트 붙여넣기는 그대로 진행해도 됨)
//   null   = 사진 없음
export function extractClipboardImage(
  dt: DataTransfer | null,
  apply: (img: NodeImage) => void,
): 'file' | 'html' | null {
  if (!dt) return null;

  for (const f of Array.from(dt.files ?? [])) {
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => probeAndApply(String(reader.result), apply);
      reader.readAsDataURL(f);
      return 'file';
    }
  }

  const html = dt.getData('text/html');
  if (html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const img = doc.querySelector('img[src^="http"], img[src^="data:image/"]');
    const src = img?.getAttribute('src');
    if (src) {
      probeAndApply(src, apply);
      return 'html';
    }
  }
  return null;
}
