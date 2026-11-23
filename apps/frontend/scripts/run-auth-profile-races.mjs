// Offline regression mode only. Never uses a real auth endpoint or credentials.
import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, ['scripts/run-vite-test.mjs', 'src/stores/authProfileRaces.test.ts'], {
  cwd: process.cwd(), stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: 'https://auth.invalid' },
});
if (r.error) throw r.error;
process.exit(r.status ?? 1);
