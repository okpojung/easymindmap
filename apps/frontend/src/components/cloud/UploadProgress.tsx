// UploadProgress — 큰 첨부를 올리는 동안 화면 위에 띄우는 진행 표시.
//
// 1GB 는 회선에 따라 몇 분이 걸린다. **진행 표시가 없으면 "무반응"으로
// 보인다** — 20MB 첨부가 조용히 실패해 "아무 메시지도 없다"고 보고받은
// 것과 같은 종류의 문제다 (2026-08-06).
//
//   🎬 발표영상.mp4  ▓▓▓▓▓░░░░░  52% (382MB / 734MB)  2.4MB/s · 약 2분 남음  [취소]
//
// **"멈춘 것처럼 보인다"를 없애는 것이 이 화면의 핵심이다** (2026-08-06
// 2차 보고: "16%에서 한참 있다가 다시 올라감 — 사용자는 장애인 줄 안다").
// 세 가지로 막는다.
//   ① 진행률이 **보낸 바이트 기준**이다 (chunkUpload) — 조각 수로 세면
//      8MB 조각 하나가 끝날 때까지 숫자가 그대로다.
//   ② **속도와 남은 시간**을 보여 준다 — 느린 것과 멈춘 것을 구분해 준다.
//   ③ 그래도 몇 초 동안 바이트가 안 늘면 **"전송이 느립니다"** 라고 적고,
//      막대에 흐르는 줄무늬를 켠다. 화면이 살아 있음을 눈으로 보여 준다.
import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useUploadStore } from '@/stores/uploadStore';

function fmt(bytes: number): string {
  const mb = bytes / 1024 ** 2;
  if (mb >= 1024) return `${Math.round((mb / 1024) * 10) / 10}GB`;
  if (mb >= 1) return `${Math.round(mb)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** 남은 시간 — 초 단위를 사람 말로 */
function fmtEta(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '';
  if (sec < 60) return `약 ${Math.max(1, Math.round(sec))}초 남음`;
  if (sec < 3600) return `약 ${Math.round(sec / 60)}분 남음`;
  return `약 ${Math.round(sec / 360) / 10}시간 남음`;
}

/** 바이트가 이만큼 멈춰 있으면 "느립니다"로 본다 */
const STALL_MS = 4000;

export function UploadProgress({ t }: { t: ThemeTokens }) {
  const uploads = useUploadStore((s) => s.uploads);
  if (!uploads.length) return null;

  return (
    <div
      data-testid="upload-progress"
      style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 30, width: 'min(560px, 92vw)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      {uploads.map((u) => (
        <UploadRow key={u.key} t={t} item={u} />
      ))}
    </div>
  );
}

function UploadRow({ t, item }: {
  t: ThemeTokens;
  item: { key: string; name: string; size: number; ratio: number; note?: string | null;
    abort: () => void };
}) {
  // 속도·남은 시간 — 최근 표본으로 계산한다. 순간값은 심하게 튀므로
  // **약 5초 창**의 평균을 쓴다.
  const samples = useRef<{ at: number; bytes: number }[]>([]);
  const [speed, setSpeed] = useState(0);
  const [stalled, setStalled] = useState(false);
  const loaded = item.size * item.ratio;

  useEffect(() => {
    const now = Date.now();
    const arr = samples.current;
    arr.push({ at: now, bytes: loaded });
    while (arr.length > 2 && now - arr[0].at > 5000) arr.shift();
    const first = arr[0];
    const dt = (now - first.at) / 1000;
    const db = loaded - first.bytes;
    if (dt >= 0.5) setSpeed(db > 0 ? db / dt : 0);
  }, [loaded]);

  // **막힌 것처럼 보이는 구간을 말로 알린다.** 바이트가 STALL_MS 동안
  // 안 늘면 "느립니다"로 바꾼다 (진짜 멈춘 것이 아니라는 신호).
  const lastMove = useRef({ at: Date.now(), bytes: loaded });
  useEffect(() => {
    if (loaded !== lastMove.current.bytes) {
      lastMove.current = { at: Date.now(), bytes: loaded };
      setStalled(false);
    }
    const tm = window.setInterval(() => {
      setStalled(Date.now() - lastMove.current.at > STALL_MS);
    }, 1000);
    return () => window.clearInterval(tm);
  }, [loaded]);

  const pct = Math.round(item.ratio * 100);
  const rate = [
    speed > 0 ? `${(speed / 1024 ** 2).toFixed(1)}MB/s` : '',
    speed > 0 ? fmtEta((item.size - loaded) / speed) : '',
  ].filter(Boolean).join(' · ');
  // 재시도 안내가 있으면 그것이 우선 — 가장 구체적인 설명이다
  const note = item.note
    ?? (stalled ? '전송이 느립니다 — 계속 시도 중입니다' : null);

  return (
    <div style={{
      padding: '9px 12px', borderRadius: 8,
      background: t.surface, color: t.text,
      border: `1px solid ${note ? (t.warning ?? t.border) : t.border}`,
      boxShadow: '0 6px 20px rgba(30,30,40,0.18)',
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5,
        }}>
          <span style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontWeight: 600,
          }}>{item.name}</span>
          <span style={{ color: t.textMuted, flexShrink: 0 }}>
            {pct}% · {fmt(loaded)} / {fmt(item.size)}
          </span>
        </div>
        <div style={{
          height: 6, borderRadius: 3, background: t.surfaceAlt, overflow: 'hidden',
        }}>
          <div
            data-testid="upload-progress-bar"
            data-ratio={item.ratio}
            style={{
              width: `${pct}%`, height: '100%',
              background: t.primary,
              transition: 'width 200ms linear',
              // 멈춘 듯 보일 때 **흐르는 줄무늬** — 화면이 살아 있다는 신호
              ...(note ? {
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 6px,'
                  + ' rgba(255,255,255,0) 6px 12px)',
                animation: 'mm-upload-stripe 900ms linear infinite',
              } : null),
            }} />
        </div>
        <div
          data-testid="upload-progress-note"
          style={{
            marginTop: 4, fontSize: 10.5,
            color: note ? (t.warning ?? t.textMuted) : t.textSubtle,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {note ?? (rate || '전송 준비 중…')}
        </div>
      </div>
      <button
        data-testid="upload-cancel"
        onClick={item.abort}
        title="이 업로드를 취소합니다"
        style={{
          fontSize: 11.5, padding: '5px 9px', borderRadius: 6,
          border: `1px solid ${t.border}`, background: t.surface,
          color: t.textMuted, cursor: 'pointer', flexShrink: 0,
        }}>취소</button>
    </div>
  );
}
