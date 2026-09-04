// aiKeysSync — AI API 키를 **계정에** 붙인다 (2026-09-04 사용자 결정).
//
// 그전까지 키는 브라우저(localStorage, aiSettingsStore)에만 있었다. 그래서
// PC·브라우저를 바꾸거나 주소(origin)가 바뀔 때마다(2026-09-02 dev → pro-dev)
// 다시 등록해야 했다 — "브라우저가 다르거나 PC 가 바뀔 때마다 등록하는
// 것은 아니다"(사용자). 이제 서버가 암호화해 보관하고(`/account/ai-keys`),
// 로그인하면 여기서 받아 온다. 호출 경로는 그대로다 — 브라우저가 각 AI
// 회사에 직접 부른다(A안).
//
// 규칙
//   · 로그인 시 pull: 서버에 있는 키가 **이긴다**(브라우저 값을 덮는다).
//     서버에 없는 회사 키가 브라우저에 있으면 두 갈래다 —
//       · 이 브라우저에서 계정과 맞춰진 적이 **없는** 키(예전부터 브라우저에만
//         있던 것) → **계정으로 올린다** (한 번에 옮기는 길)
//       · 맞춰진 적이 **있는** 키 → 다른 곳에서 지운 것이다 → 여기서도 지운다.
//         이 구분이 없으면 지운 키가 다른 PC 에서 되살아난다(e2e190 ⑦).
//   · 입력 시 push: 800ms 뒤 한 번 보낸다(빈 값 = 삭제).
//   · 서버가 못 맡으면(enabled:false — AI_KEY_SECRET 미설정·표 없음) 예전처럼
//     브라우저에만 남기고, 화면이 그 이유를 밝힌다.
//   · 로그아웃: 계정에서 받아 온 키를 브라우저에서 지운다(공용 PC).
//     보관이 꺼진 서버라면 브라우저 키가 유일한 사본이라 지우지 않는다.

import { useAiSettingsStore } from '@/stores/aiSettingsStore';
import { authEnabled, useAuthStore } from '@/stores/authStore';
import { cloudApi, CloudError } from '@/services/cloud/apiClient';
import { PROVIDERS, type AiProvider } from '@/utils/aiProviders';

const PUSH_DELAY_MS = 800;
const timers: Partial<Record<AiProvider, number>> = {};

function loggedIn(): boolean {
  return authEnabled && !!useAuthStore.getState().session;
}

/** 로그인 직후 — 계정의 키를 받아 오고, 브라우저에만 있던 키는 계정으로 올린다 */
export async function pullAiKeys(): Promise<void> {
  const st = useAiSettingsStore.getState();
  if (!loggedIn()) { st.setServer({ enabled: null, hints: {}, status: {} }); return; }
  let res: Awaited<ReturnType<typeof cloudApi.getAiKeys>>;
  try {
    res = await cloudApi.getAiKeys();
  } catch (e) {
    // 낡은 서버(엔드포인트 없음)·네트워크 — 브라우저 보관으로 조용히 둔다
    st.setServer({ enabled: false, reason: 'offline', hints: {}, status: {},
      error: e instanceof CloudError ? e.message : undefined });
    return;
  }
  if (!res.enabled) {
    st.setServer({ enabled: false, reason: res.reason ?? 'offline', hints: {}, status: {} });
    return;
  }
  const hints: Partial<Record<AiProvider, string>> = {};
  const local = useAiSettingsStore.getState().keys;
  const synced = useAiSettingsStore.getState().synced;
  const toUpload: AiProvider[] = [];
  for (const p of PROVIDERS) {
    const srv = res.keys[p];
    if (srv?.key) {
      hints[p] = srv.hint;
      if (local[p] !== srv.key) useAiSettingsStore.getState().setKey(p, srv.key);
      useAiSettingsStore.getState().setSynced(p, true);
    } else if (local[p]?.trim()) {
      if (synced[p]) {
        // 계정과 맞춰진 적이 있는데 계정에 없다 = 다른 곳에서 지웠다
        useAiSettingsStore.getState().setKey(p, '');
        useAiSettingsStore.getState().setSynced(p, false);
      } else {
        toUpload.push(p); // 예전부터 브라우저에만 있던 키 → 계정으로
      }
    }
  }
  st.setServer({ enabled: true, reason: undefined, hints, status: {}, error: undefined });
  for (const p of toUpload) await pushAiKeyNow(p, local[p]);
}

/** 키 입력 — 잠시 뒤 한 번 보낸다. 로그인 전이거나 보관이 꺼져 있으면 아무것도 안 한다 */
export function pushAiKey(provider: AiProvider, key: string): void {
  const srv = useAiSettingsStore.getState().server;
  if (!loggedIn() || srv.enabled === false) return;
  window.clearTimeout(timers[provider]);
  timers[provider] = window.setTimeout(() => { void pushAiKeyNow(provider, key); }, PUSH_DELAY_MS);
}

async function pushAiKeyNow(provider: AiProvider, key: string): Promise<void> {
  const st = useAiSettingsStore.getState();
  st.setServer({ status: { ...st.server.status, [provider]: 'saving' } });
  try {
    const r = await cloudApi.saveAiKey(provider, key.trim());
    const cur = useAiSettingsStore.getState().server;
    const hints = { ...cur.hints };
    if (r.saved && r.hint) hints[provider] = r.hint; else delete hints[provider];
    useAiSettingsStore.getState().setSynced(provider, r.saved);
    useAiSettingsStore.getState().setServer({
      enabled: true, hints, error: undefined,
      status: { ...cur.status, [provider]: 'saved' },
    });
  } catch (e) {
    const cur = useAiSettingsStore.getState().server;
    const msg = e instanceof CloudError ? e.message : '계정에 저장하지 못했습니다.';
    // 503 = 서버가 못 맡는다(비밀 미설정·표 없음) — 브라우저 보관으로 되돌린다
    const off = e instanceof CloudError && e.status === 503;
    useAiSettingsStore.getState().setServer({
      ...(off ? { enabled: false, reason: /AI_KEY_SECRET/.test(msg) ? 'secret' : 'schema' } : {}),
      status: { ...cur.status, [provider]: 'error' }, error: msg,
    });
  }
}

/** 로그아웃 — 계정에서 받아 온 키를 이 브라우저에서 지운다 (공용 PC) */
export function clearAiKeysOnLogout(): void {
  const st = useAiSettingsStore.getState();
  if (st.server.enabled !== true) return; // 브라우저 키가 유일한 사본이면 둔다
  for (const p of PROVIDERS) {
    window.clearTimeout(timers[p]);
    if (st.keys[p]) st.setKey(p, '');
    st.setSynced(p, false);
  }
  st.setServer({ enabled: null, hints: {}, status: {}, error: undefined });
}

/** 화면 안내 한 줄 — 키가 지금 어디에 보관되는가 */
export function aiKeyStorageNotice(): string {
  const srv = useAiSettingsStore.getState().server;
  if (!loggedIn() || srv.enabled === null) {
    return '키는 이 브라우저(localStorage)에만 저장되며, 질문할 때 해당 AI 사에만 전달됩니다. 로그인하면 계정에 암호화되어 보관되어 다른 PC·브라우저에서도 따라옵니다.';
  }
  if (srv.enabled) {
    return '키는 계정에 암호화되어 보관되고(서버) 이 브라우저에도 남습니다 — 다른 PC·브라우저에서 로그인해도 따라옵니다. 질문할 때 해당 AI 사에만 전달됩니다.';
  }
  const why = srv.reason === 'secret'
    ? '서버에 AI_KEY_SECRET 이 설정되지 않아'
    : srv.reason === 'schema' ? '서버 스키마(user_ai_keys 표)가 아직 적용되지 않아'
      : '서버가 키 보관에 응답하지 않아';
  return `${why} 지금은 이 브라우저(localStorage)에만 저장됩니다. 질문할 때 해당 AI 사에만 전달됩니다.`;
}
