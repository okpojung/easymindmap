// avatarImage — 프로필 사진을 **작게 줄여** data URL 로 (2026-09-08).
//
// 원본을 그대로 올리면 수 MB 다. 아바타는 30px 로 보이므로 96×96 이면 넉넉하고,
// JPEG 0.85 로 대개 5~10KB 다. 64KB 를 넘으면 품질을 낮춰 다시 만든다 —
// 서버(SaveProfileDto)가 90KB 문자열까지만 받는다.

export const AVATAR_SIZE = 96;
export const AVATAR_MAX_BYTES = 64 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했습니다.')); };
    img.src = url;
  });
}

/** 가운데를 정사각형으로 잘라 96×96 JPEG data URL 로 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|bmp)$/i.test(file.type)) {
    throw new Error('사진 파일(PNG·JPEG·WebP)만 넣을 수 있습니다.');
  }
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error('사진 크기를 읽지 못했습니다.');
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 사진을 줄일 수 없습니다.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length * 0.75 <= AVATAR_MAX_BYTES) return url;
  }
  throw new Error('사진을 충분히 줄이지 못했습니다 — 다른 사진을 골라 주세요.');
}
