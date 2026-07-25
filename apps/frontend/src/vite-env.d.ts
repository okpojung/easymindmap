/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 백엔드 API 주소. 미설정 시 http://localhost:3000 */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
