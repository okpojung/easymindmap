// 첨부 파일 → 문서에 저장할 URL.
//
// ① ≤2MB 파일은 data URL 로 읽어 **문서(맵 JSON) 안에 내장**한다 — 서버
//    저장·새로고침·재로그인 후에도 원본이 살아 있어, 내보내기 ZIP 패키징과
//    첨부 열기가 항상 동작한다. (2026-08-02 사용자 보고: 저장했다 다시 연
//    맵을 HTML 내보내기 하면 blob: 원본이 죽어 첨부 없는 html 만 만들어졌다.)
// ② 2MB 초과 파일은 **로그인 상태면 서버 첨부 저장소(B9)에 업로드**하고
//    문서에는 서버 URL 만 남긴다 — 쿼터(DB+첨부 합산, 무료 1GB) 안에서
//    어디서 다시 열어도 원본이 유지된다. 쿼터 초과·업로드 실패는
//    CloudError 로 던지므로 호출부가 안내를 띄운다.
// ③ 로그인하지 않은 상태(개발 모드 포함)의 2MB 초과 파일은 종전대로
//    blob URL — 이 세션에서만 유효하다 (내보내기가 안내 메시지로 알린다).
//
// 한도 2MB 는 내보내기 인라인 한도(INLINE_ATTACHMENT_LIMIT)와 같은 값.

import { INLINE_ATTACHMENT_LIMIT } from '@/export/mapMeta';
import { cloudApi, serverAttachmentUrl } from '@/services/cloud/apiClient';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';

export async function attachmentUrlForFile(f: File): Promise<string> {
  if (f.size <= INLINE_ATTACHMENT_LIMIT) {
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error ?? new Error('file read failed'));
      r.readAsDataURL(f);
    });
  }
  if (authEnabled && useAuthStore.getState().session) {
    const mapId = useCloudStore.getState().cloudMapId ?? undefined;
    const up = await cloudApi.uploadAttachment(f, mapId);
    return serverAttachmentUrl(up.id);
  }
  return URL.createObjectURL(f);
}
