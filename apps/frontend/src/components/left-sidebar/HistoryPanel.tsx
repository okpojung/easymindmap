// HistoryPanel — 저장 버전 이력 (서버 저장 연결 시 제공).
//
// 되돌리기(Ctrl+Z)와 히스토리는 **별개**다 (2026-07 사용자 결정):
//   · 되돌리기 = 이 편집 세션 안에서만, 최대 99단계 (메모리 내 —
//     새로고침·세션 종료 시 사라짐. 카운터는 두 자리 -99까지)
//   · 히스토리 = 세션을 닫고 **저장할 때마다** 저장일시(날짜·시간)별
//     버전을 만들어 보관 — 서버 저장(클라우드)과 연결될 때 구현한다
//     (백엔드 문서 스냅샷 API 활용 예정, 13-version-history.md)
//   · 히스토리의 특정 시점 복귀는 현재 맵을 덮어쓰지 않고
//     **새 맵(제목_history_YYMMDD)** 으로 연다.
//
// 이 패널은 그때까지 기능 안내만 표시한다 (가짜 목록을 보여주지 않는다).

import type { ThemeTokens } from '@/components/design-tokens/theme';

export function HistoryPanel({ t }: { t: ThemeTokens }) {
  return (
    <div style={{ padding: '12px 12px 16px' }}>
      <div style={{
        fontSize: 11, color: t.textSubtle, marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600,
      }}>저장 버전 이력</div>

      <div
        data-history-placeholder
        style={{
          padding: '10px 12px', borderRadius: 8,
          background: t.surfaceAlt, border: `1px solid ${t.border}`,
          fontSize: 12, color: t.textMuted, lineHeight: 1.65,
        }}
      >
        <b style={{ color: t.text }}>서버 저장과 연결되면 제공됩니다.</b>
        <br />
        세션을 닫고 저장할 때마다 <b>저장일시(날짜·시간)별 버전</b>이
        여기에 쌓이고, 원하는 시점을 골라 <b>새 맵(제목_history_날짜)</b>
        으로 열 수 있게 됩니다 — 현재 맵은 덮어쓰지 않습니다.
      </div>

      <div style={{
        marginTop: 10, fontSize: 11, color: t.textSubtle, lineHeight: 1.6,
      }}>
        지금 편집 중인 내용을 되돌리려면 <b>되돌리기(Ctrl+Z)</b>를
        쓰세요 — 이 세션 안에서 최대 <b>99단계</b>까지, 툴바의 숫자
        (0 / -1 / -2 …)가 몇 단계 되돌렸는지 보여 줍니다.
      </div>
    </div>
  );
}
