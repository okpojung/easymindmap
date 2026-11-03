import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const source = read('src/redesign/hero-video.ts');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { HERO_YOUTUBE_ID, heroYouTubeEmbedUrl, mountHeroVideo } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
function setup(options = {}) {
 const attrs = new Map(); let writes = 0;
 const frame = { dataset: options.missingSource ? {} : { heroYoutubeSrc: heroYouTubeEmbedUrl('ko') },
  getAttribute: k => attrs.get(k) ?? null,
  setAttribute: (k, v) => { attrs.set(k, v); writes++; },
  removeAttribute: k => attrs.delete(k) };
 const api = mountHeroVideo({ querySelector: selector => { assert.equal(selector, '[data-hero-youtube]'); return options.missingFrame ? null : frame; } });
 return { api, frame, attrs, writes: () => writes };
}
for (const lang of ['ko', 'en', 'ja', 'zh']) test(lang + ': exact video, privacy-enhanced inline player, no autoplay or mute override', () => {
 const url = new URL(heroYouTubeEmbedUrl(lang));
 assert.equal(HERO_YOUTUBE_ID, 'DXDej-QOD0k');
 assert.equal(url.origin, 'https://www.youtube-nocookie.com');
 assert.equal(url.pathname, '/embed/DXDej-QOD0k');
 assert.equal(url.searchParams.get('hl'), lang);
 assert.equal(url.searchParams.get('playsinline'), '1');
 assert.equal(url.searchParams.get('rel'), '0');
 for (const key of ['autoplay', 'mute', 'loop', 'controls', 'enablejsapi']) assert.equal(url.searchParams.has(key), false);
});
test('unknown language falls back to English without URL injection', () => {
 assert.equal(new URL(heroYouTubeEmbedUrl('xx&autoplay=1')).searchParams.get('hl'), 'en');
});
test('mounting and initial non-home route do not load a YouTube frame', () => {
 const f = setup(); assert.equal(f.attrs.has('src'), false); f.api.setHomeVisible(false); assert.equal(f.writes(), 0);
});
test('home shows native player; repeat home/hash navigation does not reload it', () => {
 const f = setup(); f.api.setHomeVisible(true); assert.equal(f.attrs.get('src'), heroYouTubeEmbedUrl('ko'));
 f.api.setHomeVisible(true); assert.equal(f.writes(), 1);
});
test('guide navigation unloads hidden audio; returning home restores without autoplay', () => {
 const f = setup(); f.api.setHomeVisible(true); f.api.setHomeVisible(false); assert.equal(f.attrs.has('src'), false);
 f.api.setHomeVisible(false); f.api.setHomeVisible(true); assert.equal(f.writes(), 2);
 assert.equal(new URL(f.attrs.get('src')).searchParams.has('autoplay'), false);
});
test('destroy unloads and permanently disables the frame', () => {
 const f = setup(); f.api.setHomeVisible(true); f.api.destroy(); assert.equal(f.attrs.has('src'), false);
 f.api.setHomeVisible(true); assert.equal(f.writes(), 1); f.api.destroy();
});
test('missing optional frame or source is safe', () => {
 for (const options of [{missingFrame:true}, {missingSource:true}]) {
  const f = setup(options); f.api.setHomeVisible(true); f.api.setHomeVisible(false); f.api.destroy(); assert.equal(f.writes(), 0);
 }
});
for (const [lang, file] of [['ko','template.html'],['en','template.en.html'],['ja','template.ja.html'],['zh','template.zh.html']]) test(lang + ': accessible native YouTube embed and always-visible safe external fallback', () => {
 const html = read('src/redesign/' + file);
 const hero = html.match(/<div class="hero-board hero-video"[\s\S]*?<\/p><\/div>/)?.[0]; assert.ok(hero);
 assert.equal((hero.match(/<iframe /g) || []).length, 1);
 assert.ok(hero.includes('data-hero-youtube-src="__HERO_YOUTUBE_' + lang.toUpperCase() + '__"'));
 assert.match(hero, /title="[^"]+YouTube[^"]*"/);
 assert.match(hero, /loading="lazy"/); assert.match(hero, /referrerpolicy="strict-origin-when-cross-origin"/);
 assert.match(hero, /allowfullscreen/); assert.match(hero, /picture-in-picture/);
 assert.match(hero, /href="https:\/\/youtu.be\/DXDej-QOD0k" target="_blank" rel="noopener noreferrer"/);
 assert.match(hero, /aria-describedby="hero-video-note"/); assert.match(hero, /id="hero-video-note"/);
 assert.doesNotMatch(hero, /<video|<track|data-hero-play|data-hero-sound|data-hero-captions|data-hero-status/);
 assert.doesNotMatch(hero, /autoplay=1|mute=1|loop=1/);
});
test('responsive 16:9 iframe replaces obsolete native-video controls', () => {
 const css = read('src/redesign/redesign.css');
 assert.match(css, /aspect-ratio:16\/9/); assert.match(css, /hero-video-stage iframe\{[^}]*width:100%;height:100%;border:0/);
 assert.doesNotMatch(css, /hero-video-controls|video::cue|hero-video-poster/);
});
test('templates use central URL builder; controller keeps route and teardown lifecycle', () => {
 const text = read('src/site-text.ts'), controller = read('src/redesign/controller.ts');
 assert.match(text, /heroYouTubeEmbedUrl/); assert.doesNotMatch(text, /HERO_CAPTIONS|HERO_VIDEO_SRC|HERO_VIDEO_POSTER|HeroVideoText/);
 assert.match(controller, /mountHeroVideo\(root\)/); assert.match(controller, /heroVideo.setHomeVisible\(!content\)/); assert.match(controller, /heroVideo.destroy\(\)/);
});
test('archived downloadable MP4 and voice provenance remain available', () => {
 const movie = readFileSync(new URL('../public/hero-media/v3/emm-hero-v3-ko.mp4', import.meta.url));
 assert.equal(movie.subarray(4, 8).toString(), 'ftyp'); assert.ok(movie.length > 2_000_000);
 const license = read('public/hero-media/v3/VOICE-LICENSE.md'); assert.match(license, /Sarah/); assert.match(license, /Supertonic/);
 for (const lang of ['ko','en','ja','zh']) assert.match(read('public/hero-media/v3/captions.' + lang + '.vtt'), /^WEBVTT/);
});
