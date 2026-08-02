// 첨부 파일 → 문서에 저장할 URL.
//
// ≤2MB 파일은 data URL 로 읽어 **문서(맵 JSON) 안에 내장**한다 — 서버
// 저장·새로고침·재로그인 후에도 원본이 살아 있어, 내보내기 ZIP 패키징과
// 첨부 열기가 항상 동작한다. (2026-08-02 사용자 보고: 저장했다 다시 연
// 맵을 HTML 내보내기 하면 blob: 원본이 죽어 첨부 없는 html 만 만들어졌다.
// blob URL 은 만든 브라우저 문서(document)가 살아있는 동안만 유효하다.)
//
// 2MB 초과 파일은 종전대로 blob URL — **이 세션에서만** 열 수 있고, 저장
// 후 다시 열면 원본이 사라진다(내보내기가 안내 메시지로 알려 준다).
// 서버 첨부 저장소(B9)가 생기면 업로드로 전환한다. 한도 2MB 는 내보내기
// 메타데이터 인라인 한도(INLINE_ATTACHMENT_LIMIT)와 같은 값이다.

import { INLINE_ATTACHMENT_LIMIT } from '@/export/mapMeta';

export async function attachmentUrlForFile(f: File): Promise<string> {
  if (f.size <= INLINE_ATTACHMENT_LIMIT) {
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error ?? new Error('file read failed'));
      r.readAsDataURL(f);
    });
  }
  return URL.createObjectURL(f);
}
