// 관리자 > 2단계 인증 IP관리 (2026-10-24 사용자 지시).
//
// 여기 등록한 내부망 IP(하나) 또는 C클래스 망(끝자리 0)에서 관리자 로그인하면 인증번호
// 단계를 건너뛴다. 비밀번호 로그인과 관리자 명단 검사는 그대로다. 서버 규칙:
// apps/api/src/admin/trusted-networks.ts. 관리자 화면은 한국어만 쓴다.
import { useCallback, useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { adminApi, type TrustedNetworkList } from '@/services/cloud/adminApi';

const when = (iso: string) => (iso ? new Date(iso).toLocaleString('ko-KR') : '—');

export function TrustedNetworksPanel({ t }: { t: ThemeTokens }) {
  const [data, setData] = useState<TrustedNetworkList | null>(null);
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editAddress, setEditAddress] = useState('');
  const [editLabel, setEditLabel] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await adminApi.trustedNetworks()); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<TrustedNetworkList>, done: string) => {
    setBusy(true); setMsg(null);
    try { setData(await fn()); setMsg({ ok: true, text: done }); return true; }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); return false; }
    finally { setBusy(false); }
  };

  const add = async () => {
    if (await run(() => adminApi.addTrustedNetwork(address.trim(), label.trim()), '등록했습니다.')) { setAddress(''); setLabel(''); }
  };
  const save = async (id: string) => {
    if (await run(() => adminApi.updateTrustedNetwork(id, { address: editAddress.trim(), label: editLabel.trim() }), '수정했습니다.')) setEditing(null);
  };
  const remove = async (id: string, range: string) => {
    if (!confirm(`${range} 을(를) 지울까요? 지우면 그 주소에서도 인증번호를 받아야 합니다.`)) return;
    await run(() => adminApi.removeTrustedNetwork(id), '삭제했습니다.');
  };

  const box = { border: `1px solid ${t.border}`, borderRadius: 10, padding: 16, background: t.surface, marginBottom: 14 };
  const inp = { height: 34, padding: '0 10px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text, fontSize: 13.5 };
  const btn = { height: 34, padding: '0 14px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.text, fontSize: 13, cursor: 'pointer' };
  const primary = { ...btn, border: 'none', background: t.primary, color: '#FFF', fontWeight: 700 };
  const preview = (() => {
    const v = address.trim();
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
    if (!m) return null;
    return m[4] === '0' ? `C클래스 망: ${m[1]}.${m[2]}.${m[3]}.0 ~ ${m[1]}.${m[2]}.${m[3]}.255` : `IP 하나: ${v}`;
  })();

  return (
    <section aria-label="2단계 인증 IP관리" style={{ maxWidth: 860 }}>
      <div style={box}>
        <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>2단계 인증 IP관리</div>
        <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6 }}>
          여기 등록한 주소에서 관리자 로그인하면 <b>메일 인증번호 단계를 건너뜁니다.</b> 이메일·비밀번호 확인과 관리자 명단 검사는 그대로입니다.<br />
          내부망(사설) 주소만 등록할 수 있습니다 — 10.x, 172.16~31.x, 192.168.x. 끝자리를 <b>0</b>으로 적으면 C클래스 망 전체(예: 192.168.94.0 → 192.168.94.0~255)입니다.
        </div>
        {data && (
          <div style={{ marginTop: 10, fontSize: 13, padding: '8px 10px', borderRadius: 7, background: data.clientMatches ? '#ECFDF5' : '#FFF7ED', color: data.clientMatches ? '#065F46' : '#9A3412' }}>
            서버가 보는 지금 접속 IP: <b>{data.clientIp ?? '알 수 없음'}</b> — {data.clientMatches ? '등록된 주소입니다. 다음 로그인부터 인증번호를 건너뜁니다.' : '등록되지 않은 주소입니다.'}
            <div style={{ fontSize: 12, marginTop: 3, opacity: 0.85 }}>내부망에서는 공유기를 거쳐 들어와 192.168.94.1 처럼 공유기 주소로 보일 수 있습니다. 그럴 때는 C클래스 망(끝자리 0)으로 등록하세요.</div>
          </div>
        )}
      </div>

      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>새로 등록</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input aria-label="IP 주소" data-testid="trusted-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.94.100 또는 192.168.94.0" style={{ ...inp, width: 240 }} />
          <input aria-label="설명" data-testid="trusted-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="설명 (예: 사무실 내부망)" style={{ ...inp, flex: 1, minWidth: 200 }} />
          <button type="button" data-testid="trusted-add" disabled={busy || !address.trim()} onClick={() => void add()} style={primary}>등록</button>
          {data?.clientIp && (
            <button type="button" style={btn} onClick={() => setAddress(data.clientIp ?? '')}>지금 접속 IP 넣기</button>
          )}
        </div>
        {preview && <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 6 }}>{preview}</div>}
        {msg && <div role="status" style={{ fontSize: 13, marginTop: 8, color: msg.ok ? '#047857' : '#DC2626' }}>{msg.text}</div>}
      </div>

      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>등록된 주소 {data ? `${data.items.length}/${data.max}` : ''}</div>
        {!data && <div style={{ color: t.textMuted, fontSize: 13 }}>불러오는 중…</div>}
        {data && !data.items.length && <div style={{ color: t.textMuted, fontSize: 13 }}>아직 없습니다 — 모든 관리자 로그인에서 인증번호를 받습니다.</div>}
        {data && data.items.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: t.textMuted, borderBottom: `1px solid ${t.border}` }}>
                <th style={{ padding: '6px 4px' }}>주소</th><th>범위</th><th>설명</th><th>수정</th><th style={{ width: 150 }} />
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} data-testid="trusted-row" style={{ borderBottom: `1px solid ${t.border}`, background: data.clientMatches === e.id ? '#F0FDF4' : undefined }}>
                  {editing === e.id ? (
                    <>
                      <td style={{ padding: '6px 4px' }}><input aria-label="IP 주소 수정" value={editAddress} onChange={(v) => setEditAddress(v.target.value)} style={{ ...inp, width: 170 }} /></td>
                      <td style={{ color: t.textMuted }}>—</td>
                      <td><input aria-label="설명 수정" value={editLabel} maxLength={60} onChange={(v) => setEditLabel(v.target.value)} style={{ ...inp, width: '95%' }} /></td>
                      <td style={{ color: t.textMuted, fontSize: 12 }}>{when(e.updatedAt)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" disabled={busy} onClick={() => void save(e.id)} style={{ ...primary, height: 28 }}>저장</button>{' '}
                        <button type="button" onClick={() => setEditing(null)} style={{ ...btn, height: 28 }}>취소</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ padding: '8px 4px', fontFamily: 'ui-monospace, monospace' }}>{e.cidr.replace(/\/(24|32)$/, '')}</td>
                      <td>{e.kind === 'network' ? `C클래스 ${e.range}` : 'IP 하나'}</td>
                      <td>{e.label || <span style={{ color: t.textMuted }}>—</span>}{data.clientMatches === e.id && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#047857' }}>지금 접속</span>}</td>
                      <td style={{ color: t.textMuted, fontSize: 12 }}>{when(e.updatedAt)}<br />{e.updatedBy}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" onClick={() => { setEditing(e.id); setEditAddress(e.cidr.replace(/\/(24|32)$/, '')); setEditLabel(e.label); }} style={{ ...btn, height: 28 }}>수정</button>{' '}
                        <button type="button" disabled={busy} onClick={() => void remove(e.id, e.range)} style={{ ...btn, height: 28, color: '#B91C1C' }}>삭제</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
