// 관리자 > 코드블럭 언어관리 (2026-10-28 사용자 요청).
//
// 코드블럭 편집 창의 언어 고르기 목록을 정한다 — 등록 · 이름/표기 수정 · 삭제 · **끌어서 순서 바꾸기**.
// 고친 것은 [저장] 을 눌러야 반영된다(목록 전체를 순서째 보낸다). 처음 목록은 알파벳 순 기본값.
// 서버 규칙: apps/api/src/admin/code-languages.ts. 관리자 화면은 한국어만 쓴다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { adminApi, type CodeLanguageList } from '@/services/cloud/adminApi';
import { forgetCodeLanguages } from '@/services/cloud/codeLanguages';

type Item = { name: string; code: string; key: string };
let seq = 0;
const withKeys = (xs: { name: string; code: string }[]): Item[] => xs.map((x) => ({ ...x, key: `k${++seq}` }));
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ko-KR') : '—');
const CODE_RE = /^[a-z0-9][a-z0-9+#._-]{0,29}$/;

export function CodeLanguagesPanel({ t }: { t: ThemeTokens }) {
  const [server, setServer] = useState<CodeLanguageList | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [q, setQ] = useState('');
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = await adminApi.codeLanguages(); setServer(r); setItems(withKeys(r.items)); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => !!server && JSON.stringify(items.map(({ name: n, code: c }) => ({ name: n, code: c })))
    !== JSON.stringify(server.items), [items, server]);

  const add = () => {
    const n = name.trim(); const c = code.trim().toLowerCase();
    if (!n || !CODE_RE.test(c)) { setMsg({ ok: false, text: '이름과 표기(영문 소문자·숫자·+#._-, 30자까지)를 넣어 주세요.' }); return; }
    if (items.some((x) => x.code === c)) { setMsg({ ok: false, text: `표기 '${c}' 는 이미 있습니다.` }); return; }
    setItems((xs) => [...xs, ...withKeys([{ name: n, code: c }])]);
    setName(''); setCode(''); setMsg({ ok: true, text: '목록 끝에 넣었습니다 — [저장] 을 눌러야 반영됩니다.' });
  };
  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const remove = (key: string) => setItems((xs) => xs.filter((x) => x.key !== key));
  const move = (from: string, to: string) => setItems((xs) => {
    const a = xs.findIndex((x) => x.key === from); const b = xs.findIndex((x) => x.key === to);
    if (a < 0 || b < 0 || a === b) return xs;
    const next = xs.slice(); const [it] = next.splice(a, 1); next.splice(b, 0, it); return next;
  });
  const sortAlpha = () => setItems((xs) => xs.slice().sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })));
  const save = async (list: Item[]) => {
    setBusy(true); setMsg(null);
    try {
      const r = await adminApi.saveCodeLanguages(list.map(({ name: n, code: c }) => ({ name: n.trim(), code: c.trim().toLowerCase() })));
      setServer(r); setItems(withKeys(r.items)); forgetCodeLanguages();
      setMsg({ ok: true, text: list.length ? '저장했습니다. 편집 창을 새로 열면 바뀐 목록이 보입니다.' : '기본 목록으로 되돌렸습니다.' });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const shown = q.trim() ? items.filter((x) => (x.name + ' ' + x.code).toLowerCase().includes(q.trim().toLowerCase())) : items;
  const input = { height: 30, padding: '0 9px', borderRadius: 7, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 13 } as const;
  const btn = (primary = false) => ({
    height: 30, padding: '0 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${primary ? t.primary : t.border}`, background: primary ? t.primary : t.surface, color: primary ? '#fff' : t.text,
  } as const);

  return (
    <div data-testid="admin-code-languages" style={{ maxWidth: 820 }}>
      <h2 style={{ fontSize: 17, margin: '0 0 6px' }}>코드블럭 언어관리</h2>
      <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.7, margin: '0 0 12px' }}>
        코드블럭 편집 창에서 언어를 칠 때 보이는 목록입니다(예: <b>j</b> → Java, JavaScript, JSON).
        <b> 이름</b>은 목록에 보이는 글, <b>표기</b>는 코드블럭 첫 줄 <code>```</code> 뒤에 들어가는 값입니다.
        줄 왼쪽 <b>⠿</b> 를 끌어 순서를 바꾸고, 다 고친 뒤 <b>[저장]</b> 을 누르세요.
      </p>
      <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 10 }}>
        {server ? (server.stored ? `저장된 목록 · ${items.length}개 · 마지막 저장 ${when(server.updatedAt)} (${server.updatedBy ?? '—'})` : `기본 목록(알파벳 순) · ${items.length}개 — 아직 저장한 적이 없습니다`) : '불러오는 중…'}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input data-testid="codelang-new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="이름 (예: JavaScript)" maxLength={40} style={{ ...input, width: 190 }} />
        <input data-testid="codelang-new-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="표기 (예: javascript)" maxLength={30}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }} style={{ ...input, width: 170, fontFamily: 'ui-monospace, Consolas, monospace' }} />
        <button type="button" data-testid="codelang-add" onClick={add} style={btn()}>＋ 등록</button>
        <span style={{ flex: 1 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="찾기" style={{ ...input, width: 140 }} />
      </div>

      <div style={{ border: `1px solid ${t.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '34px 44px 1fr 1fr 64px', gap: 6, padding: '7px 10px', background: t.surfaceAlt, fontSize: 12, fontWeight: 700, color: t.textMuted }}>
          <span /> <span>순서</span> <span>이름</span> <span>표기</span> <span>삭제</span>
        </div>
        <div style={{ maxHeight: '56vh', overflowY: 'auto' }}>
          {shown.map((x) => {
            const idx = items.indexOf(x);
            return (
              <div key={x.key} data-testid="codelang-row"
                draggable={!q.trim()}
                onDragStart={(e) => { setDragKey(x.key); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.key); }}
                onDragOver={(e) => { if (dragKey) { e.preventDefault(); setOverKey(x.key); } }}
                onDragLeave={() => setOverKey((k) => (k === x.key ? null : k))}
                onDrop={(e) => { e.preventDefault(); if (dragKey) move(dragKey, x.key); setDragKey(null); setOverKey(null); }}
                onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                style={{
                  display: 'grid', gridTemplateColumns: '34px 44px 1fr 1fr 64px', gap: 6, alignItems: 'center',
                  padding: '4px 10px', borderTop: `1px solid ${t.divider}`,
                  background: overKey === x.key ? t.primarySoft : dragKey === x.key ? t.surfaceAlt : t.surface,
                  boxShadow: overKey === x.key ? `inset 0 2px 0 ${t.primary}` : undefined,
                  opacity: dragKey === x.key ? 0.5 : 1,
                }}>
                <span title={q.trim() ? '찾는 중에는 순서를 바꿀 수 없습니다' : '끌어서 순서 바꾸기'}
                  style={{ cursor: q.trim() ? 'default' : 'grab', color: t.textMuted, fontSize: 16, textAlign: 'center', userSelect: 'none' }}>⠿</span>
                <span style={{ fontSize: 12, color: t.textMuted }}>{idx + 1}</span>
                <input value={x.name} maxLength={40} onChange={(e) => patch(x.key, { name: e.target.value })} style={{ ...input, height: 28 }} />
                <input value={x.code} maxLength={30} onChange={(e) => patch(x.key, { code: e.target.value })}
                  style={{ ...input, height: 28, fontFamily: 'ui-monospace, Consolas, monospace', borderColor: CODE_RE.test(x.code.trim().toLowerCase()) ? t.border : '#DC2626' }} />
                <button type="button" data-testid="codelang-delete" onClick={() => remove(x.key)} title="삭제"
                  style={{ ...btn(), height: 28, padding: '0 8px', color: '#B91C1C' }}>삭제</button>
              </div>
            );
          })}
          {shown.length === 0 && <div style={{ padding: 14, fontSize: 13, color: t.textMuted }}>맞는 언어가 없습니다.</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" data-testid="codelang-save" disabled={!dirty || busy} onClick={() => void save(items)}
          style={{ ...btn(true), opacity: !dirty || busy ? 0.5 : 1, cursor: !dirty || busy ? 'default' : 'pointer' }}>저장</button>
        <button type="button" disabled={!dirty || busy} onClick={() => server && setItems(withKeys(server.items))} style={{ ...btn(), opacity: !dirty ? 0.5 : 1 }}>고친 것 버리기</button>
        <button type="button" onClick={sortAlpha} style={btn()}>알파벳 순으로 정렬</button>
        <span style={{ flex: 1 }} />
        <button type="button" disabled={busy || !server?.stored}
          onClick={() => { if (window.confirm('저장한 목록을 지우고 기본 목록(알파벳 순)으로 되돌릴까요?')) void save([]); }}
          style={{ ...btn(), opacity: !server?.stored ? 0.5 : 1 }}>기본 목록으로 되돌리기</button>
      </div>
      {msg && <div role="status" style={{ marginTop: 10, fontSize: 13, color: msg.ok ? '#15803D' : '#B91C1C' }}>{msg.text}</div>}
    </div>
  );
}
