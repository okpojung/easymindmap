/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 백엔드 API 주소. 미설정 시 http://localhost:3000 */
  readonly VITE_API_URL?: string;
  /** Supabase(GoTrue) 주소 — 설정되면 로그인 UI가 활성화된다 (Phase 3) */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon key — 클라이언트 노출 허용 키 (RLS 로 보호) */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
