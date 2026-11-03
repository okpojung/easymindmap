/** Homepage-only player. Sources stay deferred until visibility and user preferences permit them. */
export interface HeroVideoText {
 play: string; pause: string; enableSound: string; mute: string; captions: string;
 ready: string; playing: string; paused: string; restricted: string; blocked: string; failed: string; captionFailed: string;
}
export interface HeroPlaybackState {
 homeVisible: boolean; inView: boolean; documentVisible: boolean; userPaused: boolean;
 restricted: boolean; consented: boolean; blocked: boolean; muted: boolean;
}
/** Automatic starts/resumes are always muted, even after a user previously enabled sound. */
export function canAutoPlayHero(state: HeroPlaybackState): boolean {
 return state.homeVisible && state.inView && state.documentVisible && !state.userPaused &&
  (!state.restricted || state.consented) && !state.blocked && state.muted;
}
export function heroCaptionLanguage(lang: string): string { return ['ko', 'en', 'ja', 'zh'].includes(lang) ? lang : 'en'; }

type Connection = EventTarget & { saveData?: boolean };
export function mountHeroVideo(root: HTMLElement, text: HeroVideoText, lang: string) {
 const host = root.querySelector<HTMLElement>('[data-hero-video]');
 if (!host) return { setHomeVisible: (_visible: boolean) => {}, destroy: () => {} };
 const video = host.querySelector<HTMLVideoElement>('video')!;
 const play = host.querySelector<HTMLButtonElement>('[data-hero-play]')!;
 const sound = host.querySelector<HTMLButtonElement>('[data-hero-sound]')!;
 const captions = host.querySelector<HTMLButtonElement>('[data-hero-captions]')!;
 const status = host.querySelector<HTMLElement>('[data-hero-status]')!;
 const tracks = Array.from(video.querySelectorAll<HTMLTrackElement>('[data-hero-track]'));
 const selected = heroCaptionLanguage(lang);
 const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
 const connection = (navigator as Navigator & { connection?: Connection }).connection;
 const restricted = () => motion.matches || Boolean(connection?.saveData);
 const state: HeroPlaybackState = { homeVisible: false, inView: !('IntersectionObserver' in window), documentVisible: !document.hidden,
  userPaused: false, restricted: restricted(), consented: false, blocked: false, muted: true };
 let disposed = false, loaded = false, pending = false, failed = false, captionFailed = false, captionsOn = true, attempt = 0;
 const removers: (() => void)[] = [];
 function listen(target: EventTarget, name: string, fn: EventListener) { target.addEventListener(name, fn); removers.push(() => target.removeEventListener(name, fn)); }
 function say(message: string) { if (status.textContent !== message) status.textContent = message; }
 function update() {
  const active = !video.paused && !failed;
  play.textContent = active || pending ? text.pause : text.play;
  play.setAttribute('aria-pressed', String(active || pending));
  sound.textContent = video.muted ? text.enableSound : text.mute;
  sound.setAttribute('aria-pressed', String(!video.muted));
  captions.textContent = text.captions;
  captions.setAttribute('aria-pressed', String(captionsOn));
  host!.dataset.failed = String(failed || state.blocked);
 }
 function recoverCaptions(track: HTMLTrackElement) {
  if (disposed || track.srclang !== selected || track.readyState !== 2 || !track.track.cues?.length) return;
  captionFailed = false;
  if (!failed && !state.blocked && status.textContent === text.captionFailed) say(video.paused ? text.paused : text.playing);
 }
 function applyCaptions() {
  for (const track of tracks) track.track.mode = captionsOn && track.srclang === selected ? 'showing' : 'disabled';
  const active = tracks.find(track => track.srclang === selected);
  if (active) recoverCaptions(active);
 }
 function source() {
  if (loaded) return;
  loaded = true;
  for (const track of tracks) { track.default = track.srclang === selected; track.src = track.dataset.heroTrackSrc!; }
  video.src = video.dataset.heroSrc!;
  video.load(); applyCaptions();
 }
 function stop() { ++attempt; pending = false; video.pause(); update(); }
 function eligible() { return !disposed && state.homeVisible && state.inView && !document.hidden && !state.userPaused; }
 function refreshInView() {
  // A click may follow a scroll before IntersectionObserver delivers its next entry.
  const rect = host!.getBoundingClientRect();
  const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  state.inView = rect.width > 0 && rect.height > 0 && visibleWidth * visibleHeight / (rect.width * rect.height) >= 0.15;
 }
 async function start(explicit: boolean) {
  if (explicit && !disposed) refreshInView();
  if (!eligible() || (pending && !explicit)) return;
  if (!explicit && !canAutoPlayHero(state)) return;
  state.blocked = false;
  const retry = failed; failed = false;
  source();
  if (retry) video.load();
  applyCaptions();
  const current = ++attempt; pending = true; update();
  try {
   await video.play();
   if (disposed) { video.pause(); return; }
   if (current !== attempt) return;
   pending = false;
   if (!eligible()) { stop(); return; }
   say(captionFailed ? text.captionFailed : text.playing); update();
  } catch (error) {
   if (disposed || current !== attempt) return;
   pending = false;
   const name = (error as { name?: string })?.name;
   // Policy rejection is not a claim that the media file is missing or broken.
   if (name === 'NotAllowedError') { state.blocked = true; say(text.blocked); }
   else if (name === 'AbortError') { say(text.paused); }
   else { failed = true; state.blocked = true; say(text.failed); }
   video.pause(); update();
  }
 }
 function sync() {
  state.documentVisible = !document.hidden;
  if (!eligible()) { stop(); if (!failed && !state.blocked) say(state.restricted && !state.consented ? text.restricted : text.paused); return; }
  if (state.restricted && !state.consented) { stop(); say(text.restricted); return; }
  if (video.paused && canAutoPlayHero(state)) void start(false);
  else if (video.paused && !state.blocked && !failed) say(text.paused);
 }
 // Never depend on an HTML autoplay attribute racing preference/route checks.
 video.autoplay = false; video.defaultMuted = true; video.muted = true; video.loop = true; video.playsInline = true;
 listen(play, 'click', () => {
  if (!video.paused || pending) { state.userPaused = true; stop(); say(text.paused); return; }
  state.userPaused = false; state.consented = true; state.blocked = false;
  void start(true);
 });
 listen(sound, 'click', () => {
  const enable = video.muted;
  video.muted = !enable; state.muted = video.muted;
  if (enable) {
   // Invoke play inside this user gesture, including when a muted autoplay attempt is still pending.
   state.userPaused = false; state.consented = true; state.blocked = false;
   if (video.paused || pending) void start(true);
  }
  update();
 });
 listen(captions, 'click', () => {
  captionsOn = !captionsOn;
  if (captionsOn && captionFailed && loaded) {
   captionFailed = false;
   const selectedTrack = tracks.find(track => track.srclang === selected);
   if (selectedTrack) { selectedTrack.removeAttribute('src'); selectedTrack.src = selectedTrack.dataset.heroTrackSrc!; }
  }
  applyCaptions(); update();
 });
 listen(video, 'playing', () => { if (!eligible()) { stop(); return; } pending = false; failed = false; state.blocked = false; say(captionFailed ? text.captionFailed : text.playing); update(); });
 listen(video, 'pause', () => { if (!disposed) update(); });
 listen(video, 'volumechange', () => { state.muted = video.muted; update(); });
 listen(video, 'error', () => { if (disposed || !loaded) return; failed = true; state.blocked = true; stop(); say(text.failed); });
 listen(video, 'loadedmetadata', applyCaptions);
 for (const track of tracks) {
  listen(track, 'load', () => recoverCaptions(track));
  listen(track, 'error', () => {
   if (track.srclang !== selected || !captionsOn || disposed) return;
   // A cancelled earlier request may report an error after the current native track is already usable.
   if (track.readyState === 2 && track.track.cues?.length) return;
   captionFailed = true; say(text.captionFailed);
  });
 }
 listen(document, 'visibilitychange', sync);
 const onPreference = () => { const next = restricted(); if (next && !state.restricted) state.consented = false; state.restricted = next; sync(); };
 listen(motion, 'change', onPreference);
 if (connection) listen(connection, 'change', onPreference);
 const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  const entry = entries.find(item => item.target === host); if (!entry || disposed) return;
  state.inView = entry.isIntersecting && entry.intersectionRatio >= 0.15; sync();
 }, { threshold: [0, 0.15] }) : undefined;
 observer?.observe(host);
 say(state.restricted ? text.restricted : text.ready); update();
 return {
  setHomeVisible(visible: boolean) { if (disposed) return; state.homeVisible = visible; sync(); },
  destroy() {
   disposed = true; ++attempt; observer?.disconnect(); removers.forEach(remove => remove());
   pending = false; video.pause(); video.removeAttribute('src'); tracks.forEach(track => track.removeAttribute('src')); video.load();
  },
 };
}
