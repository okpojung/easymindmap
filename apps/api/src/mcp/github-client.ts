/**
 * GitHub REST 호출 — `import_github_docs` · `update_map_from_github` 가 쓴다 (2026-09-21).
 * 설계: docs/04-extensions/ai/mcp-connector.md §9.14
 *
 * 부르는 것은 넷뿐이다: 저장소 정보(기본 브랜치) · 트리(재귀) · 파일의 마지막
 * 커밋 · 파일 원문(raw). 인증은 **선택**이다 — API 서버 환경변수 `GITHUB_TOKEN`
 * 이 있으면 붙인다(비공개 저장소·시간당 5,000회). 없으면 익명(시간당 60회)이라
 * 문서 수십 개까지만 된다 — 그 한계는 도구가 문장으로 알린다.
 *
 * 실패는 전부 `GithubError` 로 — 사람이 읽는 문장(AI 가 사용자에게 전한다).
 * 시험에서는 `fetchImpl` 을 바꿔 끼운다(네트워크 없이).
 */
import type { FileCommit } from './github-docs';

export class GithubError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

export interface TreeEntry { path: string; type: 'blob' | 'tree' | 'commit'; sha: string }

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean; status: number; headers: { get(name: string): string | null };
  json(): Promise<unknown>; text(): Promise<string>;
}>;

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

export class GithubClient {
  constructor(
    private readonly token: string | undefined = process.env.GITHUB_TOKEN?.trim() || undefined,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {}

  get authenticated(): boolean { return Boolean(this.token); }

  private headers(accept = 'application/vnd.github+json'): Record<string, string> {
    return {
      Accept: accept,
      'User-Agent': 'EasyMindMap-MCP',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private async request(url: string, what: string, accept?: string): Promise<{ status: number; body: unknown; text: string }> {
    let res;
    try {
      res = await this.fetchImpl(url, { headers: this.headers(accept) });
    } catch (err) {
      throw new GithubError(`GitHub 에 연결하지 못했습니다 (${what}): ${(err as Error).message}`);
    }
    if (res.ok) {
      const text = await res.text();
      let body: unknown = text;
      if (!accept || accept.includes('json')) { try { body = JSON.parse(text); } catch { body = text; } }
      return { status: res.status, body, text };
    }
    if (res.status === 401) throw new GithubError('GitHub 토큰이 거절됐습니다 — API 서버의 GITHUB_TOKEN 이 만료됐거나 잘못됐습니다.', 401);
    if (res.status === 403 || res.status === 429) {
      const remaining = res.headers.get('x-ratelimit-remaining');
      const reset = res.headers.get('x-ratelimit-reset');
      if (remaining === '0' || res.status === 429) {
        const when = reset ? new Date(Number(reset) * 1000).toISOString() : '(알 수 없음)';
        throw new GithubError(
          `GitHub API 호출 한도에 걸렸습니다 (${this.token ? '토큰 있음' : '익명은 시간당 60회'}). ${when} 뒤에 다시 시도하거나, ` +
          'API 서버에 GITHUB_TOKEN 을 넣어 주세요(시간당 5,000회). 문서가 많은 저장소는 `path` 로 폴더를 좁히거나 `max_files` 를 줄여도 됩니다.',
          res.status,
        );
      }
      throw new GithubError(`GitHub 가 거절했습니다 (${what}, 403) — 비공개 저장소면 GITHUB_TOKEN 이 필요합니다.`, 403);
    }
    if (res.status === 404) throw new GithubError(`GitHub 에서 찾지 못했습니다 (${what}) — 저장소·브랜치·경로를 확인해 주세요. 비공개 저장소면 GITHUB_TOKEN 이 필요합니다.`, 404);
    throw new GithubError(`GitHub 응답 오류 (${what}, HTTP ${res.status}).`, res.status);
  }

  /** 기본 브랜치 */
  async defaultBranch(owner: string, repo: string): Promise<string> {
    const { body } = await this.request(`${API}/repos/${owner}/${repo}`, `저장소 ${owner}/${repo}`);
    const b = (body as { default_branch?: string }).default_branch;
    if (!b) throw new GithubError(`저장소 ${owner}/${repo} 의 기본 브랜치를 읽지 못했습니다.`);
    return b;
  }

  /** 트리 전체(재귀). `truncated` 면 GitHub 이 목록을 잘랐다(아주 큰 저장소) */
  async tree(owner: string, repo: string, ref: string): Promise<{ entries: TreeEntry[]; truncated: boolean }> {
    const { body } = await this.request(
      `${API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, `트리 ${owner}/${repo}@${ref}`,
    );
    const b = body as { tree?: TreeEntry[]; truncated?: boolean };
    if (!Array.isArray(b.tree)) throw new GithubError(`저장소 ${owner}/${repo}@${ref} 의 트리를 읽지 못했습니다.`);
    return { entries: b.tree.map((e) => ({ path: e.path, type: e.type, sha: e.sha })), truncated: Boolean(b.truncated) };
  }

  /** 파일의 마지막 커밋 — 없으면(기록이 없는 파일) null */
  async lastCommit(owner: string, repo: string, ref: string, path: string): Promise<FileCommit | null> {
    const url = `${API}/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(ref)}&path=${encodeURIComponent(path)}&per_page=1`;
    const { body } = await this.request(url, `커밋 ${path}`);
    const arr = body as { sha: string; commit: { committer?: { date?: string }; author?: { date?: string } } }[];
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const c = arr[0];
    const date = c.commit?.committer?.date ?? c.commit?.author?.date;
    if (!date) return null;
    return { sha: c.sha, date: new Date(date).toISOString() };
  }

  /** 파일 원문 — raw 주소는 API 한도를 쓰지 않는다 */
  async raw(owner: string, repo: string, ref: string, path: string): Promise<string> {
    const url = `${RAW}/${owner}/${repo}/${encodeURIComponent(ref)}/${path.split('/').map(encodeURIComponent).join('/')}`;
    const { text } = await this.request(url, `원문 ${path}`, 'text/plain');
    return text;
  }
}

/** 동시에 n 개까지 — 수백 파일을 하나씩 기다리면 도구가 너무 오래 걸린다 */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
