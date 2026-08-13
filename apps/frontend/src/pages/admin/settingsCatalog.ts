// 프런트엔드 쪽 설정값 목록 (2026-08-13).
//
// **값을 베껴 적지 않는다 — 실제 상수를 import 한다.** 베껴 적으면
// 원본이 바뀔 때 관리 화면이 조용히 거짓말을 한다. 서버 쪽도 같은
// 규칙으로 만들었다 (api `admin-settings.ts`).
//
// 여기 담는 것은 **정책 값**이다 — 사람이 "왜 이 값인가"를 물을 수 있는
// 것들. 레이아웃 치수(H_GAP·ROW_GAP 같은 픽셀)는 담지 않는다. 그것은
// 디자인이고 코드가 주인이며, 목록에 섞이면 정작 봐야 할 값이 묻힌다.

import type { SettingGroup } from '@/services/cloud/adminApi';
import { EMBED_TOTAL_LIMIT, CHUNK_ROUTE_MIN } from '@/utils/attachmentFile';
import { MAX_EMBED_BYTES } from '@/utils/embedImage';
import { PREFILL_MAX_LEN } from '@/utils/webAiExchange';
import { ZOOM_MIN, ZOOM_MAX } from '@/stores/viewportStore';
import { MAX_DEPTH, HISTORY_LIMIT } from '@/stores/documentStore';
import { TICK_MS, EDIT_COUNT_TRIGGER } from '@/hooks/useCloudAutosave';
import { DRAFT_MS } from '@/hooks/useLocalDraft';
import { SNAPSHOT_VERSION } from '@/services/cloud/mapSession';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';

const MB = 1024 * 1024;

export function frontendSettings(): SettingGroup[] {
  return [
    {
      id: 'fe-save',
      title: '저장 · 자동저장 (화면)',
      why: '얼마나 자주 서버·브라우저에 써 두는가. 짧으면 요청이 늘고, 길면 잃을 것이 늘어난다.',
      items: [
        {
          key: 'TICK_MS', label: '자동저장 확인 주기', value: TICK_MS / 1000, unit: '초',
          source: 'code', where: 'frontend hooks/useCloudAutosave.ts',
          note: '주기마다 "바뀐 게 있나"를 보고, 있을 때만 보낸다',
        },
        {
          key: 'EDIT_COUNT_TRIGGER', label: '편집 N회마다 저장', value: EDIT_COUNT_TRIGGER, unit: '회',
          source: 'code', where: 'frontend hooks/useCloudAutosave.ts',
        },
        {
          key: 'DRAFT_MS', label: '로컬 초안 저장 디바운스', value: DRAFT_MS / 1000, unit: '초',
          source: 'code', where: 'frontend hooks/useLocalDraft.ts',
          note: '브라우저 안(IndexedDB)에만 쓴다 — 로그아웃하면 지워진다',
        },
        {
          key: 'HISTORY_LIMIT', label: '되돌리기(Ctrl+Z) 보관 단계', value: HISTORY_LIMIT, unit: '단계',
          source: 'code', where: 'frontend stores/documentStore.ts',
          note: '세션 한정이다 — 서버 히스토리(저장 버전)와는 별개',
        },
        {
          key: 'SNAPSHOT_VERSION', label: '문서 스냅샷 형식 버전', value: SNAPSHOT_VERSION,
          source: 'code', where: 'frontend services/cloud/mapSession.ts',
        },
      ],
    },
    {
      id: 'fe-attach',
      title: '첨부 · 이미지 (화면)',
      why: '어디까지 맵 안에 넣고, 어디부터 서버로 보내는가.',
      items: [
        {
          key: 'MAX_EMBED_BYTES', label: '이미지 1개 내장 상한',
          value: Math.round(MAX_EMBED_BYTES / MB * 10) / 10, unit: 'MB',
          source: 'code', where: 'frontend utils/embedImage.ts',
          note: '넘으면 서버 첨부로 올린다',
        },
        {
          key: 'EMBED_TOTAL_LIMIT', label: '맵 1개 내장 첨부 합계 상한',
          value: EMBED_TOTAL_LIMIT / MB, unit: 'MB',
          source: 'code', where: 'frontend utils/attachmentFile.ts',
          note: 'Free 요금제 한도와 같다 — Free 계정은 이 선에 닿기 전에 쿼터가 먼저 걸린다',
        },
        {
          key: 'CHUNK_ROUTE_MIN', label: '청크 업로드로 넘기는 크기',
          value: CHUNK_ROUTE_MIN / MB, unit: 'MB',
          source: 'code', where: 'frontend utils/attachmentFile.ts',
          note: '이보다 큰 파일은 조각으로 나눠 올린다(이어받기 가능)',
        },
      ],
    },
    {
      id: 'fe-editor',
      title: '에디터 한계',
      why: '문서가 커졌을 때 화면이 감당하는 선.',
      items: [
        { key: 'MAX_DEPTH', label: '노드 최대 깊이', value: MAX_DEPTH, unit: '단계', source: 'code', where: 'frontend stores/documentStore.ts' },
        { key: 'ZOOM_MIN', label: '최소 확대', value: ZOOM_MIN, unit: '%', source: 'code', where: 'frontend stores/viewportStore.ts' },
        { key: 'ZOOM_MAX', label: '최대 확대', value: ZOOM_MAX, unit: '%', source: 'code', where: 'frontend stores/viewportStore.ts' },
        {
          key: 'PREFILL_MAX_LEN', label: 'AI 프롬프트 미리채움 최대 길이', value: PREFILL_MAX_LEN, unit: '자',
          source: 'code', where: 'frontend utils/webAiExchange.ts',
        },
      ],
    },
    {
      id: 'fe-flags',
      title: '기능 스위치',
      why: '개발 단계에 따라 켜고 끄는 값.',
      items: [
        {
          key: 'COLLAB_PRESENCE_UI', label: '협업 표시 UI',
          value: COLLAB_PRESENCE_UI ? '켜짐' : '꺼짐',
          source: 'code', where: 'frontend config/featureFlags.ts',
          note: '협업(V2) 개발 때 true 로 되돌린다 — 코드는 지우지 않고 보존한다',
        },
        {
          key: 'VITE_API_URL', label: 'API 주소',
          value: String(import.meta.env.VITE_API_URL || '(기본 localhost:3000)'),
          source: 'env', where: 'frontend **빌드** 변수 VITE_API_URL',
          note: '빌드 시점에 구워진다 — 바꾸면 재빌드가 필요하다',
        },
        {
          key: 'VITE_SUPABASE_URL', label: '인증(GoTrue) 주소',
          value: String(import.meta.env.VITE_SUPABASE_URL || '(없음 — 로그인 없이 동작)'),
          source: 'env', where: 'frontend **빌드** 변수 VITE_SUPABASE_URL',
        },
      ],
    },
  ];
}
