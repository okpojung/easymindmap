// 관리자 콘솔 API 클라이언트 (2026-08-13).
//
// 일반 apiClient 와 **따로 둔다** — 관리자 표(X-Admin-Token)를 싣는 것은
// 여기뿐이고, 나중에 admin.easymindmap.org 로 분리할 때 이 파일과
// pages/admin/ 만 옮기면 되게 하기 위해서다.

import { authEnabled, getFreshAccessToken } from '@/stores/authStore';
import { CloudError } from './apiClient';
import type { LoginHistory } from '@/components/auth/LoginHistoryList';

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

/** 지금 보고 있는 것이 **누구의 데이터**인가 (2026-08-14).
 *
 *  개발과 운영에 콘솔이 하나씩 생기면서(pro-dev.mindmap.ai.kr/admin ·
 *  admin.easymindmap.org) **화면이 똑같아졌다.** 개발인 줄 알고 운영 회원의
 *  요금제를 바꾸는 실수를 막으려면 한눈에 갈려 보여야 한다.
 *
 *  판정 기준은 **프런트 주소가 아니라 API 주소**다 — 실제로 건드리는 데이터가
 *  거기 있다. 그리고 **모르면 '운영'으로 본다**: 개발을 운영으로 잘못 부르면
 *  조심하게 될 뿐이지만, 반대는 사고가 된다. */
export type ApiEnv = 'local' | 'dev' | 'prod';
export function apiEnv(base = BASE): ApiEnv {
  let h: string;
  try { h = new URL(base).hostname; } catch { return 'prod'; }
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return 'local';
  if (/(^|\.)dev\.|-dev\./.test(h)) return 'dev';
  return 'prod';
}
export const apiHost = (() => { try { return new URL(BASE).host; } catch { return BASE; } })();

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
  /** **마지막 로그인** — GoTrue 가 아는 값(저장 활동과 다르다) */
  lastSignInAt: string | null;
  /** GoTrue 기준 이메일 확인 시각 */
  emailConfirmedAt: string | null;
  bannedUntil: string | null;
}

export interface SettingItem {
  key: string; label: string; value: string | number; unit?: string;
  source: 'env' | 'db' | 'code'; where: string; note?: string;
  /** 콘솔에서 바로 고칠 수 있는 값인가 — **서버가 정한다** (2026-08-14).
   *  화면이 source 로 짐작하지 않는다: 못 고치는 DB 값이 생기면
   *  입력칸이 먼저 생기고 저장에서 터진다. */
  editable?: {
    kind: 'planQuotaMb' | 'planPriceKrw';
    plan: string; min: number; max: number;
  };
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
    req<{ users: AdminUserRow[]; loginHistoryAvailable: boolean }>('GET', `/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  /** 한 회원의 로그인 이력 (관리자) */
  userLogins: (id: string) => req<LoginHistory>('GET', `/admin/users/${id}/logins`),
  setPlan: (id: string, plan: string) =>
    req<{ plan: string; quotaBytes: number; email: string | null }>(
      'PATCH', `/admin/users/${id}/plan`, { plan }),

  // ── 설정값 ────────────────────────────────────────────────
  settings: () => req<{ groups: SettingGroup[] }>('GET', '/admin/settings'),
  /** 요금제 한도 변경 — 콘솔에서 고칠 수 있는 유일한 설정 */
  setPlanQuota: (plan: string, mb: number) =>
    req<{
      plan: string; mb: number; previousMb: number;
      /** 옛 한도를 그대로 쓰던 회원 — 새 한도로 옮겼다 */
      usersUpdated: number;
      /** 한도를 따로 올려 둔 회원(특별 계약) — 손대지 않았다 */
      usersKept: number;
    }>('PATCH', '/admin/settings/plan-quota', { plan, mb }),
  /** 요금제 구독 요금 변경 — 결제가 이 값을 청구한다 */
  setPlanPrice: (plan: string, krw: number) =>
    req<{ plan: string; krw: number }>('PATCH', '/admin/settings/plan-price', { plan, krw }),
};
