// 관리자 콘솔 API 클라이언트 (2026-08-13).
//
// 일반 apiClient 와 **따로 둔다** — 관리자 표(X-Admin-Token)를 싣는 것은
// 여기뿐이고, 나중에 admin.easymindmap.org 로 분리할 때 이 파일과
// pages/admin/ 만 옮기면 되게 하기 위해서다.

import { authEnabled, getFreshAccessToken } from '@/stores/authStore';
import { CloudError } from './apiClient';

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

/** 관리자 표 — 새로고침해도 유지되게 sessionStorage 에 둔다.
 *  localStorage 가 아닌 이유: 공용 PC 에서 탭을 닫으면 끝나야 한다. */
const KEY = 'emm.adminToken';
export const adminToken = {
  get: () => sessionStorage.getItem(KEY) ?? '',
  set: (v: string) => sessionStorage.setItem(KEY, v),
  clear: () => sessionStorage.removeItem(KEY),
};

async function req<T>(
  method: string, path: string, body?: unknown,
  /** 로그인 두 경로는 GoTrue 토큰으로, 나머지는 관리자 표로 */
  auth: 'gotrue' | 'admin' = 'admin',
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth === 'admin') {
    const t = adminToken.get();
    if (!t) throw new CloudError(401, '관리자 로그인이 필요합니다.');
    headers['X-Admin-Token'] = t;
  } else if (authEnabled) {
    const t = await getFreshAccessToken();
    if (!t) throw new CloudError(401, '먼저 로그인해 주세요.');
    headers.Authorization = `Bearer ${t}`;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1${path}`, {
      method, headers, cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new CloudError(0, '서버에 연결할 수 없습니다.');
  }
  if (!res.ok) {
    let msg = `요청 실패 (${res.status})`;
    try { const j = await res.json(); msg = j.message || j.error || msg; } catch { /* 본문 없음 */ }
    throw new CloudError(res.status, msg);
  }
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  plan: string;
  quotaBytes: number;
  usedBytes: number;
  fileBytes: number;
  docBytes: number;
  maps: number;
  attachments: number;
  /** 최근 30일 **저장 횟수** — 로그인 횟수가 아니다 */
  saves30d: number;
  createdAt: string;
  emailVerifiedAt: string | null;
  lastSeenAt: string | null;
  lastPlatform: string | null;
  lastBrowser: string | null;
  lastIp: string | null;
}

export interface SettingItem {
  key: string; label: string; value: string | number; unit?: string;
  source: 'env' | 'db' | 'code'; where: string; note?: string;
}
export interface SettingGroup {
  id: string; title: string; why: string; items: SettingItem[];
}

export const adminApi = {
  // ── 2단계 로그인 ──────────────────────────────────────────
  loginStart: () =>
    req<{ sent: boolean; expiresInMin: number; devCode?: string; message?: string; email: string }>(
      'POST', '/admin/login/start', undefined, 'gotrue'),
  loginVerify: (code: string) =>
    req<{ adminToken: string; email: string; expiresAt: string }>(
      'POST', '/admin/login/verify', { code }, 'gotrue'),
  me: () => req<{ email: string }>('GET', '/admin/me'),

  // ── 회원관리 ──────────────────────────────────────────────
  summary: () => req<{
    byPlan: { plan: string; users: number; fileBytes: number }[];
    total: number; new7d: number; new30d: number;
  }>('GET', '/admin/summary'),
  users: (q: string) =>
    req<{ users: AdminUserRow[] }>('GET', `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  setPlan: (id: string, plan: string) =>
    req<{ plan: string; quotaBytes: number; email: string | null }>(
      'PATCH', `/admin/users/${id}/plan`, { plan }),

  // ── 설정값 ────────────────────────────────────────────────
  settings: () => req<{ groups: SettingGroup[] }>('GET', '/admin/settings'),
};
