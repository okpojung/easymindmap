// UploadProgress — 큰 첨부를 올리는 동안 화면 위에 띄우는 진행 표시.
//
// 1GB 는 회선에 따라 몇 분이 걸린다. **진행 표시가 없으면 "무반응"으로
// 보인다** — 20MB 첨부가 조용히 실패해 "아무 메시지도 없다"고 보고받은
// 것과 같은 종류의 문제다 (2026-08-06).
//
//   🎬 발표영상.mp4  ▓▓▓▓▓░░░░░  52% (382MB / 734MB)  [취소]
//
// 여러 개를 동시에 올릴 수 있으므로 목록으로 그린다.
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useUploadStore } from '@/stores/uploadStore';

function fmt(bytes: number): string {
  const mb = bytes / 1024 ** 2;
  if (mb >= 1024) return `${Math.round((mb / 1024) * 10) / 10}GB`;
  if (mb >= 1) return `${Math.round(mb)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

export function UploadProgress({ t }: { t: ThemeTokens }) {
  const uploads = useUploadStore((s) => s.uploads);
  if (!uploads.length) return null;

  return (
    <div
      data-testid="upload-progress"
      style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 30, width: 'min(520px, 90vw)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      {uploads.map((u) => (
        <div key={u.key} style={{
          padding: '9px 12px', borderRadius: 8,
          background: t.surface, color: t.text,
          border: `1px solid ${t.border}`,
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
              }}>{u.name}</span>
              <span style={{ color: t.textMuted, flexShrink: 0 }}>
                {Math.round(u.ratio * 100)}% · {fmt(u.size * u.ratio)} / {fmt(u.size)}
              </span>
            </div>
            <div style={{
              height: 6, borderRadius: 3, background: t.surfaceAlt, overflow: 'hidden',
            }}>
              <div
                data-testid="upload-progress-bar"
                data-ratio={u.ratio}
                style={{
                  width: `${Math.round(u.ratio * 100)}%`, height: '100%',
                  background: t.primary, transition: 'width 120ms linear',
                }} />
            </div>
          </div>
          <button
            data-testid="upload-cancel"
            onClick={u.abort}
            title="이 업로드를 취소합니다"
            style={{
              fontSize: 11.5, padding: '5px 9px', borderRadius: 6,
              border: `1px solid ${t.border}`, background: t.surface,
              color: t.textMuted, cursor: 'pointer', flexShrink: 0,
            }}>취소</button>
        </div>
      ))}
    </div>
  );
}
