/**
 * **유튜브 영상 → 맵** 의 읽기 부분 (2026-10-14) — `get_youtube_transcript`.
 * 설계: docs/04-extensions/ai/mcp-connector.md §9.16
 *
 * 사용자가 "이 유튜브 영상을 맵으로 만들어 줘" 라고 하면 AI 가
 *   ① `get_youtube_transcript(url)` 로 제목·채널·길이·챕터·시각 붙은 자막을 받고
 *   ② 그것을 **스스로 요약해** `create_map` 을 부른다.
 * 요약은 대화 중인 AI 의 몫이다 — 서버는 AI 를 부르지 않는다(API 키·과금 없음,
 * "도구는 얇게" §2). 이 도구는 읽기만 한다(맵을 바꾸지 않는다).
 *
 * **가져오는 길** (2026-10-14 실측 — 쿠키 없이 된다):
 *   1. `https://www.youtube.com/watch?v=ID` 에서 `INNERTUBE_API_KEY` (없으면 공개 기본값)
 *   2. `POST /youtubei/v1/player` (ANDROID 클라이언트) → 제목·채널·길이·설명·자막 트랙 목록
 *   3. 고른 트랙의 `baseUrl` (fmt 빼고) → `<text start dur>` XML
 * 데이터센터 IP 는 YouTube 가 "로봇이 아닌지 확인" 으로 막을 수 있다(`LOGIN_REQUIRED`) —
 * 그때는 이유를 말하고, 사용자가 자막(스크립트)을 붙여 넣으면 그것으로 요약하라고 안내한다.
 *
 * 이 파일은 DB 를 모른다. 시험에서는 `fetchImpl` 을 바꿔 끼운다(네트워크 없이).
 */

export class YoutubeError extends Error {}
/** 이 클라이언트가 영상을 거절함(ERROR·UNPLAYABLE 등) — 다른 클라이언트로 다시 해 본다 */
export class YoutubeRefusedError extends YoutubeError {}

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: unknown }) => Promise<{
  ok: boolean; status: number; url?: string; text(): Promise<string>;
}>;

// ── 주소 해석 ─────────────────────────────────────────────────────────

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * 영상 id — watch·youtu.be·shorts·embed·live·v 주소, 모바일·music 하위 도메인, id 그대로.
 * 재생 목록만 있는 주소(`list=` 만)는 거절한다(영상 하나를 고르게).
 */
export function parseVideoId(input: string): string {
  const s = String(input ?? '').trim();
  if (!s) throw new YoutubeError('`url` 이 비어 있습니다 — 유튜브 영상 주소를 넣어 주세요.');
  if (ID_RE.test(s)) return s;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch {
    throw new YoutubeError(`유튜브 주소를 알아보지 못했습니다: "${s}"`);
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v');
    if (!id) {
      const m = /^\/(?:shorts|embed|live|v|e)\/([^/?#]+)/.exec(u.pathname);
      if (m) id = m[1];
    }
  } else {
    throw new YoutubeError(`유튜브 주소가 아닙니다: "${s}" — youtube.com 또는 youtu.be 주소를 넣어 주세요.`);
  }
  if (!id || !ID_RE.test(id)) {
    throw new YoutubeError(u.searchParams.get('list')
      ? '재생 목록 주소입니다 — 맵으로 만들 영상 하나의 주소를 넣어 주세요.'
      : `주소에서 영상 id 를 찾지 못했습니다: "${s}"`);
  }
  return id;
}

/** 주소의 `t=` (90 · 1m30s · 1h2m3s) → 초. 없으면 0 */
export function parseStartParam(input: string): number {
  const m = /[?&#]t=([0-9hms]+)/.exec(String(input ?? ''));
  if (!m) return 0;
  const v = m[1];
  if (/^\d+$/.test(v)) return Number(v);
  const h = /(\d+)h/.exec(v)?.[1], mi = /(\d+)m/.exec(v)?.[1], se = /(\d+)s/.exec(v)?.[1];
  return Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Number(se ?? 0);
}

// ── 시각 ──────────────────────────────────────────────────────────────

/** 초 → `m:ss` 또는 `h:mm:ss` */
export function formatTime(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** `h:mm:ss` · `m:ss` → 초 */
export function parseTime(t: string): number {
  return t.split(':').map(Number).reduce((acc, n) => acc * 60 + n, 0);
}

export function watchUrl(id: string, sec = 0): string {
  return `https://www.youtube.com/watch?v=${id}${sec > 0 ? `&t=${Math.floor(sec)}s` : ''}`;
}

// ── 챕터 (설명란의 시각 목록) ────────────────────────────────────────

export interface Chapter { start: number; title: string }

const TS = '((?:\\d{1,2}:)?\\d{1,2}:\\d{2})';
const LEAD_RE = new RegExp(`^\\s*[-*•·]?\\s*[\\(\\[]?${TS}[\\)\\]]?\\s*[-–—:|.)]?\\s*(.+?)\\s*$`);
const TAIL_RE = new RegExp(`^\\s*[-*•·]?\\s*(.+?)\\s*[-–—:|]?\\s*[\\(\\[]?${TS}[\\)\\]]?\\s*$`);

/**
 * YouTube 의 챕터 규칙대로 — 설명란에 시각 줄이 3개 이상, 첫 시각이 0:00, 시각이 늘어나야
 * 챕터다. 시각은 줄 앞(`0:00 소개`·`(0:00) 소개`·`0:00 - 소개`) 또는 줄 끝(`소개 0:00`).
 * 규칙에 맞지 않으면 빈 배열(그냥 본문 속 시각일 수 있다).
 */
export function parseChapters(description: string, lengthSec = Infinity): Chapter[] {
  const out: Chapter[] = [];
  for (const raw of String(description ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m = LEAD_RE.exec(line);
    let time: string | null = null, title = '';
    if (m) { time = m[1]; title = m[2]; } else if ((m = TAIL_RE.exec(line))) { time = m[2]; title = m[1]; }
    if (!time) continue;
    title = title.replace(/^[-–—:|.)\s]+|[-–—:|\s]+$/g, '').trim();
    if (!title) continue;
    out.push({ start: parseTime(time), title });
  }
  if (out.length < 3 || out[0].start !== 0) return [];
  for (let i = 1; i < out.length; i++) {
    if (out[i].start <= out[i - 1].start) return [];
  }
  return out.filter((c) => c.start < lengthSec);
}

// ── 자막 ──────────────────────────────────────────────────────────────

export interface Segment { start: number; dur: number; text: string }

export function decodeEntities(s: string): string {
  const once = (x: string) => x
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  // 수동 자막은 `&amp;#39;` 처럼 두 번 감싼 것이 있다
  const a = once(s);
  return /&(#\d+|#x[0-9a-f]+|quot|apos|lt|gt|amp|nbsp);/i.test(a) ? once(a) : a;
}

function cleanCaption(s: string): string {
  // 태그가 엔티티로 감싸여 오기도 한다(`&lt;b&gt;`) — 풀고 나서 한 번 더 걷는다
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/<\/?[a-z][^>]*>/gi, '').replace(/\s+/g, ' ').trim();
}

/** timedtext XML — `<text start dur>` (기본) 과 `<p t d>` (srv3, ms) 둘 다 */
export function parseTimedText(xml: string): Segment[] {
  const out: Segment[] = [];
  const src = String(xml ?? '');
  let m: RegExpExecArray | null;
  const a = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  while ((m = a.exec(src))) {
    const start = Number(/\bstart="([\d.]+)"/.exec(m[1])?.[1] ?? NaN);
    const dur = Number(/\bdur="([\d.]+)"/.exec(m[1])?.[1] ?? 0);
    const text = cleanCaption(m[2]);
    if (Number.isFinite(start) && text) out.push({ start, dur, text });
  }
  if (out.length) return out;
  const p = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  while ((m = p.exec(src))) {
    const t = Number(/\bt="(\d+)"/.exec(m[1])?.[1] ?? NaN);
    const d = Number(/\bd="(\d+)"/.exec(m[1])?.[1] ?? 0);
    const text = cleanCaption(m[2]);
    if (Number.isFinite(t) && text) out.push({ start: t / 1000, dur: d / 1000, text });
  }
  return out;
}

/** 음악·박수 같은 소리 표시만 있는 자막은 뺀다 (`[음악]` · `[Music]` · `(박수)`) */
export function isNoise(text: string): boolean {
  return /^(?:\s*(?:[\[(（【][^\])）】]{0,15}[\])）】]|[♪♫]+))+\s*$/.test(text);
}

export interface CaptionTrack { languageCode: string; kind?: string; name: string; baseUrl: string }

/**
 * 트랙 고르기 — 사람이 만든 자막이 자동 생성(asr)보다 앞선다. `lang` 을 주면 그 언어
 * (정확히 → 앞부분 `ko` ↔ `ko-KR`), 없으면 한국어 → 영어 → 아무거나.
 */
export function pickTrack(tracks: CaptionTrack[], lang?: string): CaptionTrack | null {
  if (!tracks.length) return null;
  const rank = (t: CaptionTrack) => (t.kind === 'asr' ? 1 : 0);
  const byLang = (code: string) => {
    const c = code.toLowerCase();
    const exact = tracks.filter((t) => t.languageCode.toLowerCase() === c);
    const pref = tracks.filter((t) => t.languageCode.toLowerCase().split('-')[0] === c.split('-')[0]);
    const list = exact.length ? exact : pref;
    return [...list].sort((x, y) => rank(x) - rank(y))[0] ?? null;
  };
  if (lang && lang.trim()) {
    const hit = byLang(lang.trim());
    if (hit) return hit;
  }
  return byLang('ko') ?? byLang('en') ?? [...tracks].sort((x, y) => rank(x) - rank(y))[0];
}

export interface TranscriptPage {
  /** `[m:ss] 문단` 줄들 — 챕터 경계에서는 `## 챕터` 머리가 끼어든다 */
  text: string;
  from: number;
  /** 이 쪽의 마지막 문단 시작 시각 */
  to: number;
  /** 잘렸으면 다음 쪽을 읽을 `start_at` (초), 끝까지 읽었으면 null */
  nextStart: number | null;
  paragraphs: number;
}

/**
 * 자막 조각을 **문단**으로 묶는다 — 약 `paraSec` 초마다, 챕터가 바뀌면 끊는다. 소리 표시는
 * 뺀다. `startAt` 부터 `maxChars` 까지만(넘치면 다음 쪽 시각을 준다).
 */
export function buildTranscript(
  segments: Segment[], chapters: Chapter[], startAt = 0, maxChars = 30000, paraSec = 45,
): TranscriptPage {
  const segs = segments.filter((s) => s.start + Math.max(s.dur, 0.01) > startAt && !isNoise(s.text));
  const chapterAt = (t: number) => {
    let idx = -1;
    chapters.forEach((c, i) => { if (c.start <= t) idx = i; });
    return idx;
  };
  const paras: { start: number; chapter: number; text: string }[] = [];
  for (const s of segs) {
    const ch = chapterAt(s.start);
    const last = paras[paras.length - 1];
    if (last && last.chapter === ch && s.start - last.start < paraSec) {
      // 자동 자막의 겹침(앞 조각 끝 = 이 조각 앞) 한 번 걸러 낸다
      if (!last.text.endsWith(s.text)) last.text += ' ' + s.text;
    } else {
      paras.push({ start: s.start, chapter: ch, text: s.text });
    }
  }
  const lines: string[] = [];
  let used = 0, to = startAt, nextStart: number | null = null, count = 0, lastChapter = -2;
  for (const p of paras) {
    const head = p.chapter !== lastChapter && p.chapter >= 0 ? `\n## ${formatTime(chapters[p.chapter].start)} ${chapters[p.chapter].title}\n` : '';
    const line = `${head}[${formatTime(p.start)}] ${p.text}`;
    if (used + line.length > maxChars && count > 0) { nextStart = Math.floor(p.start); break; }
    lines.push(line);
    used += line.length + 1;
    to = p.start;
    count++;
    lastChapter = p.chapter;
  }
  return { text: lines.join('\n').trim(), from: startAt, to, nextStart, paragraphs: count };
}

// ── 가져오기 ──────────────────────────────────────────────────────────

/** watch 페이지에서 키를 못 찾을 때 쓰는 공개 웹 키 (YouTube 웹 클라이언트에 박혀 있는 값) */
export const DEFAULT_INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
/**
 * innertube 클라이언트 — 차례로 시도한다. 2026-10-14 실측: ANDROID·IOS 는 쿠키 없이 자막 트랙을 주고,
 * WEB·MWEB 은 `UNPLAYABLE`, TV 임베드는 지원 종료. 한 클라이언트가 거절하면 다음 것으로.
 */
export const PLAYER_CLIENTS: Record<string, unknown>[] = [
  { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30 },
  { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82' },
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export interface VideoInfo {
  id: string;
  title: string;
  author: string;
  lengthSec: number;
  viewCount?: number;
  description: string;
  isLive: boolean;
  tracks: CaptionTrack[];
}

export class YoutubeClient {
  constructor(
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly timeoutMs = 15000,
  ) {}

  private async call(url: string, what: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ status: number; text: string; url?: string }> {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), this.timeoutMs) : null;
    try {
      const res = await this.fetchImpl(url, { ...init, headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8', ...(init.headers ?? {}) }, ...(ctl ? { signal: ctl.signal } : {}) });
      const text = await res.text();
      if (res.status === 429) throw new YoutubeError(`YouTube 가 요청을 너무 많다며 막았습니다 (${what}, 429) — 잠시 뒤 다시 시도해 주세요.`);
      if (!res.ok) throw new YoutubeError(`YouTube 응답 오류 (${what}, HTTP ${res.status}).`);
      return { status: res.status, text, url: res.url };
    } catch (err) {
      if (err instanceof YoutubeError) throw err;
      throw new YoutubeError(`YouTube 에 연결하지 못했습니다 (${what}): ${(err as Error).message}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** watch 페이지의 innertube 키 — 못 찾으면 공개 기본값 */
  async apiKey(id: string): Promise<string> {
    try {
      const r = await this.call(`https://www.youtube.com/watch?v=${id}&hl=ko`, '영상 페이지', { headers: { Cookie: 'CONSENT=YES+cb; SOCS=CAI' } });
      return /"INNERTUBE_API_KEY":"([^"]+)"/.exec(r.text)?.[1] ?? DEFAULT_INNERTUBE_KEY;
    } catch {
      return DEFAULT_INNERTUBE_KEY;
    }
  }

  /** 영상 정보 + 자막 트랙 목록 — 클라이언트가 거절하면 다음 클라이언트로, 다 거절하면 첫 거절 이유로 */
  async video(id: string): Promise<VideoInfo> {
    const key = await this.apiKey(id);
    let firstErr: YoutubeError | null = null;
    for (const client of PLAYER_CLIENTS) {
      try {
        return await this.videoWith(id, key, client);
      } catch (err) {
        // 막힘(로그인·로봇 확인)·연결 실패는 다른 클라이언트로 해도 같다 — 바로 알린다
        if (!(err instanceof YoutubeRefusedError)) throw err;
        firstErr = firstErr ?? err;
      }
    }
    throw firstErr ?? new YoutubeError('YouTube 영상 정보를 읽지 못했습니다.');
  }

  private async videoWith(id: string, key: string, client: Record<string, unknown>): Promise<VideoInfo> {
    const r = await this.call(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(key)}&prettyPrint=false`, '영상 정보', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { client: { ...client, hl: 'ko', gl: 'KR' } }, videoId: id }),
    });
    let j: {
      playabilityStatus?: { status?: string; reason?: string };
      videoDetails?: { title?: string; author?: string; lengthSeconds?: string; viewCount?: string; shortDescription?: string; isLiveContent?: boolean };
      captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: { languageCode?: string; kind?: string; baseUrl?: string; name?: { simpleText?: string; runs?: { text?: string }[] } }[] } };
    };
    try { j = JSON.parse(r.text); } catch { throw new YoutubeError('YouTube 영상 정보를 읽지 못했습니다(응답이 JSON 이 아님).'); }
    const st = j.playabilityStatus?.status ?? '';
    if (st === 'LOGIN_REQUIRED') {
      throw new YoutubeError(
        `YouTube 가 이 서버의 요청을 막았습니다("${j.playabilityStatus?.reason ?? '로그인 필요'}") — 연령 제한·비공개 영상이거나, 서버 IP 를 로봇으로 의심한 것입니다. ` +
        '사용자에게 영상의 자막(스크립트)을 붙여 넣어 달라고 하거나, 자막을 직접 구할 수 있으면 그것으로 요약해 create_map 을 부르세요.',
      );
    }
    if (st && st !== 'OK') {
      throw new YoutubeRefusedError(`이 영상을 읽을 수 없습니다 (${st}${j.playabilityStatus?.reason ? `: ${j.playabilityStatus.reason}` : ''}) — 주소를 확인해 주세요.`);
    }
    const d = j.videoDetails ?? {};
    const tracks: CaptionTrack[] = (j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [])
      .filter((t) => t.baseUrl && t.languageCode)
      .map((t) => ({
        languageCode: String(t.languageCode),
        ...(t.kind ? { kind: t.kind } : {}),
        name: t.name?.simpleText ?? t.name?.runs?.map((x) => x.text ?? '').join('') ?? String(t.languageCode),
        baseUrl: String(t.baseUrl),
      }));
    return {
      id,
      title: d.title ?? '(제목 없음)',
      author: d.author ?? '',
      lengthSec: Number(d.lengthSeconds ?? 0),
      ...(d.viewCount ? { viewCount: Number(d.viewCount) } : {}),
      description: d.shortDescription ?? '',
      isLive: Boolean(d.isLiveContent),
      tracks,
    };
  }

  /** 자막 조각들 */
  async captions(track: CaptionTrack): Promise<Segment[]> {
    const url = track.baseUrl.replace(/&fmt=[^&]*/g, '');
    const r = await this.call(url, '자막');
    return parseTimedText(r.text);
  }
}

// ── 결과 문장 ─────────────────────────────────────────────────────────

export interface TranscriptResultInput {
  info: VideoInfo;
  track: CaptionTrack;
  chapters: Chapter[];
  page: TranscriptPage;
  /** 고르지 않은 다른 자막 트랙 */
  others: CaptionTrack[];
}

function trackLabel(t: CaptionTrack): string {
  return `${t.name || t.languageCode} (${t.languageCode}${t.kind === 'asr' ? ', 자동 생성' : ''})`;
}

/** 도구가 돌려주는 글 — 정보 · 챕터 · 자막 쪽 · 맵 만들기 안내 */
export function formatTranscriptResult(p: TranscriptResultInput): string {
  const { info, track, chapters, page } = p;
  // `t=` 나 start_at 으로 중간부터 읽었으면, 그 앞에서 끝난 챕터에는 자막이 없다 — 가지를 지어내지 않게 짚는다
  const before = chapters.filter((c, i) => (i + 1 < chapters.length ? chapters[i + 1].start : info.lengthSec) <= page.from);
  const out: string[] = [];
  out.push(`유튜브 영상: ${info.title}`);
  out.push(`채널: ${info.author || '(알 수 없음)'} · 길이 ${formatTime(info.lengthSec)}${info.viewCount !== undefined ? ` · 조회수 ${info.viewCount.toLocaleString('en-US')}회` : ''}${info.isLive ? ' · 라이브' : ''}`);
  out.push(`주소: ${watchUrl(info.id)}`);
  out.push(`자막: ${trackLabel(track)}${p.others.length ? ` — 다른 자막: ${p.others.map((t) => `${t.languageCode}${t.kind === 'asr' ? '(자동)' : ''}`).join(', ')} (lang 으로 고름)` : ''}`);
  if (chapters.length) {
    out.push(`\n챕터 ${chapters.length}개 (설명란):`);
    chapters.forEach((c) => out.push(`  ${formatTime(c.start)} ${c.title}`));
  }
  const desc = info.description.replace(/\s+\n/g, '\n').trim();
  if (desc) out.push(`\n설명(앞부분):\n${desc.length > 600 ? desc.slice(0, 599) + '…' : desc}`);
  out.push(`\n자막 ${formatTime(page.from)} ~ ${formatTime(page.to)} (전체 ${formatTime(info.lengthSec)}, 문단 ${page.paragraphs}개):`);
  out.push(page.text || '(이 구간에는 말소리 자막이 없습니다)');
  if (page.nextStart !== null) {
    out.push(`\n(자막이 길어 여기까지 보냈습니다 — 나머지는 같은 url 에 start_at:${page.nextStart} 로 다시 부르세요. 다 읽은 뒤 한 번에 맵을 만드세요.)`);
  }
  out.push(
    '\n맵 만들기 안내: 위 자막을 **요약해서** create_map 을 부르세요(자막을 그대로 옮기지 말 것). ' +
    `\`# ${info.title}\` 를 중심으로, 중심 아래 첫 줄에 영상 주소·채널·길이를 적고, ` +
    (chapters.length ? '챕터마다 `##` 가지를 만드세요. ' : '내용 흐름대로 4~8개 주제로 나눠 `##` 가지를 만드세요. ') +
    (before.length
      ? `이번 자막은 ${formatTime(page.from)} 부터라 그 앞에서 끝나는 챕터(${before.map((c) => c.title).join(' · ')})는 읽지 않았습니다 — ` +
        '앞서 이어 받은 쪽에서 읽지 않았다면 그 챕터는 가지로 만들지 마세요. '
      : '') +
    '가지 아래에는 핵심 내용·용어·숫자·예시를 `###`·목록으로 간결하게, 가지마다 그 부분의 시작 시각 링크를 ' +
    `\`[▶ 12:34](${watchUrl(info.id, 754)})\` 꼴로 붙이세요. 마지막에 \`## 핵심 정리\`(3~5줄)를 두면 좋습니다. ` +
    '자막에 없는 내용을 지어내지 마세요.' +
    (track.kind === 'asr' ? ' 자동 생성 자막이라 받아쓰기 오류(고유명사·전문용어)가 있을 수 있으니 문맥으로 바로잡으세요.' : '') +
    ' 사용자가 템플릿을 말하지 않으면 template 은 비웁니다.',
  );
  return out.join('\n');
}
