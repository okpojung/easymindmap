/** Homepage YouTube embed. YouTube owns playback; there is no automatic start. */
export const HERO_YOUTUBE_ID = 'DXDej-QOD0k';
export function heroYouTubeEmbedUrl(lang: string): string {
 const selected = ['ko', 'en', 'ja', 'zh'].includes(lang) ? lang : 'en';
 return 'https://www.youtube-nocookie.com/embed/' + HERO_YOUTUBE_ID + '?rel=0&playsinline=1&hl=' + selected;
}

export function mountHeroVideo(root: HTMLElement) {
 const frame = root.querySelector<HTMLIFrameElement>('[data-hero-youtube]');
 let disposed = false;
 return {
  setHomeVisible(visible: boolean) {
   if (disposed || !frame) return;
   const source = frame.dataset.heroYoutubeSrc;
   if (visible && source) {
    // Hash navigation on the home page must not restart a user's video.
    if (frame.getAttribute('src') !== source) frame.setAttribute('src', source);
   } else {
    // Unload the player on guide routes so hidden audio cannot keep playing.
    frame.removeAttribute('src');
   }
  },
  destroy() { disposed = true; frame?.removeAttribute('src'); },
 };
}
