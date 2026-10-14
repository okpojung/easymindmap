// `get_youtube_transcript` 단위 테스트 (2026-10-14).
//
//   npm run build && npm run test:mcp
//
// 왜 시험하나: 사용자는 "이 영상 맵으로 만들어 줘" 한마디만 한다. 주소를 잘못 읽으면 엉뚱한
// 영상이, 챕터를 잘못 읽으면 엉뚱한 가지가, 자막 트랙을 잘못 고르면 다른 언어가, 막힌 이유를
// 숨기면 AI 가 지어낸 맵이 나온다. 네트워크 없이: ① 주소 해석 ② 시각 ③ 챕터 ④ 자막 XML
// ⑤ 트랙 고르기 ⑥ 문단 묶기·쪽 나누기 ⑦ 클라이언트(가짜 fetch — 키·player·자막·막힘) ⑧ 결과 문장.
//
// 설계: docs/04-extensions/ai/mcp-connector.md §9.16

import {
  YoutubeClient, YoutubeError, DEFAULT_INNERTUBE_KEY, buildTranscript, decodeEntities, formatTime, formatTranscriptResult,
  isNoise, parseChapters, parseStartParam, parseTime, parseTimedText, parseVideoId, pickTrack, watchUrl,
} from '../dist/mcp/youtube.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
function throws(name, fn, wantMsgPart) {
  let msg = null;
  try { fn(); } catch (e) { msg = e instanceof YoutubeError ? e.message : `다른 오류: ${e}`; }
  const ok = msg !== null && msg.includes(wantMsgPart);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${msg}\n      기대 …${wantMsgPart}…`}`);
}
async function rejects(name, p, wantMsgPart) {
  let msg = null;
  try { await p; } catch (e) { msg = e instanceof YoutubeError ? e.message : `다른 오류: ${e}`; }
  const ok = msg !== null && msg.includes(wantMsgPart);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${msg}\n      기대 …${wantMsgPart}…`}`);
}

console.log('── ① 주소 해석');
const ID = '3dEzMRL5VMk';
check('watch', parseVideoId(`https://www.youtube.com/watch?v=${ID}&t=30s`), ID);
check('youtu.be', parseVideoId(`https://youtu.be/${ID}?si=abc`), ID);
check('shorts', parseVideoId(`https://youtube.com/shorts/${ID}`), ID);
check('live', parseVideoId(`https://www.youtube.com/live/${ID}?feature=share`), ID);
check('embed · nocookie', parseVideoId(`https://www.youtube-nocookie.com/embed/${ID}`), ID);
check('모바일 · music', [parseVideoId(`m.youtube.com/watch?v=${ID}`), parseVideoId(`https://music.youtube.com/watch?v=${ID}&list=RD`)], [ID, ID]);
check('id 그대로', parseVideoId(ID), ID);
throws('빈 값', () => parseVideoId(''), '비어');
throws('다른 사이트', () => parseVideoId('https://vimeo.com/123'), '유튜브 주소가 아닙니다');
throws('재생 목록만', () => parseVideoId('https://www.youtube.com/playlist?list=PL123'), '재생 목록');
throws('id 모양이 아님', () => parseVideoId('https://www.youtube.com/watch?v=short'), '영상 id');
check('t= 초', parseStartParam(`https://youtu.be/${ID}?t=90`), 90);
check('t= 1m30s · 1h2m3s', [parseStartParam('...?t=1m30s'), parseStartParam('...&t=1h2m3s')], [90, 3723]);
check('t= 없음', parseStartParam(`https://youtu.be/${ID}`), 0);

console.log('── ② 시각');
check('m:ss · h:mm:ss', [formatTime(5), formatTime(754), formatTime(3723)], ['0:05', '12:34', '1:02:03']);
check('되읽기', [parseTime('12:34'), parseTime('1:02:03'), parseTime('0:00:00')], [754, 3723, 0]);
check('시각 링크', [watchUrl(ID), watchUrl(ID, 754.9)], [`https://www.youtube.com/watch?v=${ID}`, `https://www.youtube.com/watch?v=${ID}&t=754s`]);

console.log('── ③ 챕터 (설명란)');
const DESC = `C 언어 강의입니다.

0:00:00 소개
0:03:09 환경설정
(0:07:58) 경찰서 조서 쓰기
0:10:19 - 정수형 변수
마무리 1:02:03

#C언어 #코딩`;
check('앞·괄호·대시·끝 시각 모두', parseChapters(DESC, 4000), [
  { start: 0, title: '소개' }, { start: 189, title: '환경설정' }, { start: 478, title: '경찰서 조서 쓰기' },
  { start: 619, title: '정수형 변수' }, { start: 3723, title: '마무리' }]);
check('영상 길이 넘는 챕터는 뺀다', parseChapters(DESC, 1000).length, 4);
check('0:00 으로 시작하지 않으면 챕터 아님', parseChapters('1:00 a\n2:00 b\n3:00 c'), []);
check('셋 미만이면 챕터 아님', parseChapters('0:00 a\n1:00 b'), []);
check('거꾸로 가면 챕터 아님', parseChapters('0:00 a\n5:00 b\n3:00 c'), []);
check('본문 속 시각만 있으면 없음', parseChapters('3:00 에 시작합니다. 자세한 건 영상에서'), []);

console.log('── ④ 자막 XML');
const XML = `<?xml version="1.0" encoding="utf-8" ?><transcript><text start="0" dur="4.38">네 이번 영상에서는</text><text start="1.8" dur="3.78">라이즈 랭귀지 모델이라는 거를</text><text start="5.58" dur="6.059">[음악]</text><text start="10.08" dur="4.1">I&amp;#39;m &lt;b&gt;LLM&lt;/b&gt; &amp;amp; GPT</text><text start="14.2"></text></transcript>`;
check('조각 · 빈 조각 버림', parseTimedText(XML).map((s) => [s.start, s.text]), [[0, '네 이번 영상에서는'], [1.8, '라이즈 랭귀지 모델이라는 거를'], [5.58, '[음악]'], [10.08, "I'm LLM & GPT"]]);
check('srv3 (<p t d>) 도', parseTimedText('<timedtext><body><p t="1500" d="2000">안녕<s>하세요</s></p></body></timedtext>'), [{ start: 1.5, dur: 2, text: '안녕하세요' }]);
check('엔티티 두 겹', decodeEntities('&amp;quot;A&amp;quot; &#x41; &#66;'), '"A" A B');
check('소리 표시', ['[음악]', '[Music]', '(박수)', '♪♪', '[음악] 시작합니다', '그건 [중요]'].map(isNoise), [true, true, true, true, false, false]);

console.log('── ⑤ 트랙 고르기');
const T = (languageCode, kind) => ({ languageCode, ...(kind ? { kind } : {}), name: languageCode, baseUrl: `https://x/${languageCode}${kind ? '-' + kind : ''}` });
const tracks = [T('en', 'asr'), T('ko', 'asr'), T('ko'), T('ja')];
check('기본: 사람이 만든 한국어', pickTrack(tracks).baseUrl, 'https://x/ko');
check('기본: 한국어 없으면 영어', pickTrack([T('ja'), T('en', 'asr')]).baseUrl, 'https://x/en-asr');
check('기본: 둘 다 없으면 사람이 만든 것', pickTrack([T('de', 'asr'), T('fr')]).baseUrl, 'https://x/fr');
check('lang 지정', pickTrack(tracks, 'ja').baseUrl, 'https://x/ja');
check('lang 앞부분 (en ↔ en-US)', pickTrack([T('en-US', 'asr'), T('ko', 'asr')], 'en').baseUrl, 'https://x/en-US-asr');
check('lang 없으면 기본 규칙', pickTrack(tracks, 'zh').baseUrl, 'https://x/ko');
check('트랙 없음', pickTrack([]), null);

console.log('── ⑥ 문단 묶기 · 쪽 나누기');
const segs = [];
for (let t = 0; t < 600; t += 5) segs.push({ start: t, dur: 5, text: `말${t}` });
segs.splice(3, 0, { start: 15, dur: 2, text: '[음악]' });
const chs = [{ start: 0, title: '소개' }, { start: 100, title: '본론' }, { start: 400, title: '정리' }];
const pg = buildTranscript(segs, chs, 0, 100000, 45);
check('챕터 머리', pg.text.split('\n').filter((l) => l.startsWith('## ')), ['## 0:00 소개', '## 1:40 본론', '## 6:40 정리']);
check('문단은 45초 안팎, 챕터에서 끊김', pg.text.split('\n').filter((l) => l.startsWith('[')).map((l) => l.slice(0, l.indexOf(']') + 1)).slice(0, 5), ['[0:00]', '[0:45]', '[1:30]', '[1:40]', '[2:25]']);
check('소리 표시는 빠진다', pg.text.includes('[음악]'), false);
check('끝까지 → nextStart 없음', pg.nextStart, null);
const pg2 = buildTranscript(segs, [], 0, 300, 45);
check('글자 수 넘으면 다음 쪽 시각', [pg2.nextStart !== null, pg2.nextStart > 0, pg2.paragraphs >= 1], [true, true, true]);
const pg3 = buildTranscript(segs, [], pg2.nextStart, 100000, 45);
check('이어 읽기는 그 시각부터', pg3.text.startsWith(`[${formatTime(pg2.nextStart)}]`), true);
check('겹친 자동 자막 한 번 걸러 냄', buildTranscript([{ start: 0, dur: 2, text: '안녕하세요' }, { start: 1, dur: 2, text: '안녕하세요' }], []).text, '[0:00] 안녕하세요');

console.log('── ⑦ 클라이언트 (가짜 fetch)');
const calls = [];
const PLAYER = (over = {}) => JSON.stringify({
  playabilityStatus: { status: 'OK' },
  videoDetails: { videoId: ID, title: "ChatGPT의 핵심개념인 '생성형 AI'", author: '메타코드M', lengthSeconds: '426', viewCount: '12345', shortDescription: '0:00 소개\n1:00 LLM\n3:00 정리' },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=x&lang=ko&fmt=srv3', languageCode: 'ko', kind: 'asr', name: { runs: [{ text: '한국어 (자동 생성됨)' }] } }] } },
  ...over,
});
const fake = (routes) => async (url, init) => {
  calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
  for (const [re, res] of routes) if (re.test(url)) return { ok: res.status < 300, status: res.status, text: async () => res.body };
  return { ok: false, status: 404, text: async () => '' };
};
const okRoutes = [
  [/\/watch\?v=/, { status: 200, body: '<script>ytcfg.set({"INNERTUBE_API_KEY":"KEY123"})</script>' }],
  [/\/youtubei\/v1\/player/, { status: 200, body: PLAYER() }],
  [/\/api\/timedtext/, { status: 200, body: XML }],
];
const yt = new YoutubeClient(fake(okRoutes));
const info = await yt.video(ID);
check('정보', [info.title, info.author, info.lengthSec, info.viewCount, info.tracks.length], ["ChatGPT의 핵심개념인 '생성형 AI'", '메타코드M', 426, 12345, 1]);
check('트랙 이름(runs)', info.tracks[0].name, '한국어 (자동 생성됨)');
const pc = calls.find((c) => /player/.test(c.url));
check('player — watch 페이지의 키 · ANDROID · videoId', [pc.url.includes('key=KEY123'), pc.method, JSON.parse(pc.body).context.client.clientName, JSON.parse(pc.body).videoId], [true, 'POST', 'ANDROID', ID]);
const segsLive = await yt.captions(info.tracks[0]);
check('자막 — fmt 를 빼고 받는다', [calls[calls.length - 1].url.includes('fmt='), segsLive.length], [false, 4]);
calls.length = 0;
await new YoutubeClient(fake([[/\/watch\?v=/, { status: 200, body: '<html>no key</html>' }], ...okRoutes.slice(1)])).video(ID);
check('키를 못 찾으면 공개 기본값', calls.find((c) => /player/.test(c.url)).url.includes(`key=${DEFAULT_INNERTUBE_KEY}`), true);
await rejects('LOGIN_REQUIRED → 막힘 + 스크립트 안내', new YoutubeClient(fake([okRoutes[0], [/player/, { status: 200, body: PLAYER({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' } }) }]])).video(ID), '스크립트');
await rejects('ERROR → 이유', new YoutubeClient(fake([okRoutes[0], [/player/, { status: 200, body: PLAYER({ playabilityStatus: { status: 'ERROR', reason: '이 동영상은 볼 수 없습니다.' } }) }]])).video(ID), '볼 수 없습니다');
await rejects('429 → 잠시 뒤', new YoutubeClient(fake([okRoutes[0], [/player/, { status: 429, body: '' }]])).video(ID), '429');
await rejects('JSON 아님', new YoutubeClient(fake([okRoutes[0], [/player/, { status: 200, body: '<html>' }]])).video(ID), 'JSON');
calls.length = 0;
let nth = 0;
const flaky = new YoutubeClient(async (url, init) => {
  calls.push({ url, method: init?.method ?? 'GET', body: init?.body });
  if (/watch/.test(url)) return { ok: true, status: 200, text: async () => '"INNERTUBE_API_KEY":"K"' };
  nth++;
  return { ok: true, status: 200, text: async () => (nth === 1 ? PLAYER({ playabilityStatus: { status: 'ERROR', reason: '일시 거절' } }) : PLAYER()) };
});
const viaIos = await flaky.video(ID);
check('ANDROID 가 거절하면 IOS 로', [viaIos.title.length > 0, calls.filter((c) => /player/.test(c.url)).map((c) => JSON.parse(c.body).context.client.clientName)], [true, ['ANDROID', 'IOS']]);
calls.length = 0;
await rejects('막힘(LOGIN_REQUIRED)은 다른 클라이언트로 다시 하지 않는다', new YoutubeClient(fake([okRoutes[0], [/player/, { status: 200, body: PLAYER({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'bot' } }) }]])).video(ID), '막았습니다');
check('…player 는 한 번만', calls.filter((c) => /player/.test(c.url)).length, 1);
calls.length = 0;
await rejects('둘 다 거절하면 첫 이유', new YoutubeClient(fake([okRoutes[0], [/player/, { status: 200, body: PLAYER({ playabilityStatus: { status: 'ERROR', reason: '이 동영상은 볼 수 없습니다.' } }) }]])).video(ID), '볼 수 없습니다');
check('…두 클라이언트 모두 시도', calls.filter((c) => /player/.test(c.url)).length, 2);
const noCap = await new YoutubeClient(fake([okRoutes[0], [/player/, { status: 200, body: PLAYER({ captions: undefined }) }]])).video(ID);
check('자막 없는 영상 → 트랙 0', noCap.tracks.length, 0);

console.log('── ⑧ 결과 문장');
const chapters = parseChapters(info.description, info.lengthSec);
const page = buildTranscript(segsLive, chapters, 0, 30000);
const out = formatTranscriptResult({ info, track: info.tracks[0], chapters, page, others: [] });
check('머리 — 제목 · 채널 · 길이 · 주소 · 자막', [
  out.includes("유튜브 영상: ChatGPT의 핵심개념인 '생성형 AI'"), out.includes('채널: 메타코드M · 길이 7:06 · 조회수 12,345회'),
  out.includes(`주소: https://www.youtube.com/watch?v=${ID}`), out.includes('자막: 한국어 (자동 생성됨) (ko, 자동 생성)')], [true, true, true, true]);
check('챕터 목록', out.includes('챕터 3개 (설명란):\n  0:00 소개\n  1:00 LLM\n  3:00 정리'), true);
check('맵 만들기 안내 — 요약 · 챕터 가지 · 시각 링크 · 지어내지 말 것 · 자동 자막 오류', [
  out.includes('요약해서'), out.includes('챕터마다 `##` 가지'), out.includes('&t=754s'), out.includes('지어내지 마세요'), out.includes('받아쓰기 오류')], [true, true, true, true, true]);
const outLong = formatTranscriptResult({ info, track: info.tracks[0], chapters: [], page: { ...page, nextStart: 300 }, others: [{ languageCode: 'en', kind: 'asr', name: 'English', baseUrl: '' }] });
check('잘렸으면 start_at 안내 · 챕터 없으면 주제 4~8개 · 다른 자막', [outLong.includes('start_at:300'), outLong.includes('4~8개 주제'), outLong.includes('다른 자막: en(자동)')], [true, true, true]);

const outMid = formatTranscriptResult({ info, track: info.tracks[0], chapters, page: buildTranscript(segsLive, chapters, 200, 30000), others: [] });
check('중간부터(t=200) — 앞에서 끝난 챕터는 읽지 않았다고 짚는다 (#641 Codex)', [outMid.includes('3:20 부터라'), outMid.includes('(소개 · LLM)'), outMid.includes('가지로 만들지 마세요')], [true, true, true]);
check('처음부터 읽었으면 그런 말이 없다', out.includes('가지로 만들지 마세요'), false);
console.log(failed ? `\n실패 ${failed}개` : '\n전부 통과');
if (failed) process.exit(1);
