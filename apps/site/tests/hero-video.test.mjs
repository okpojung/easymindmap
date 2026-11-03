import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Use the project's existing compiler, without adding a DOM/test dependency.
const source = readFileSync(new URL('../src/redesign/hero-video.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { canAutoPlayHero, heroCaptionLanguage, mountHeroVideo } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const labels = Object.fromEntries(['play','pause','enableSound','mute','captions','ready','playing','paused','restricted','blocked','failed','captionFailed'].map(k => [k,k]));
class Element extends EventTarget {
 constructor() { super(); this.dataset={}; this.attrs={}; this.textContent=''; }
 setAttribute(k,v) { this.attrs[k]=v; }
 removeAttribute(k) { delete this.attrs[k]; if(k==='src') this.src=''; }
 click() { this.dispatchEvent(new Event('click')); }
}
function setup(options={}) {
 const originals = Object.fromEntries(['window','document','navigator','IntersectionObserver'].map(k => [k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const document = new EventTarget(); document.hidden=false;
 const motion = new EventTarget(); motion.matches=Boolean(options.reduced);
 const connection = new EventTarget(); connection.saveData=Boolean(options.saveData);
 let observer;
 class Observer {
  constructor(callback) { this.callback=callback; observer=this; }
  observe(target) { this.target=target; }
  disconnect() { this.disconnected=true; }
  intersect(visible) { this.callback([{target:this.target,isIntersecting:visible,intersectionRatio:visible?1:0}]); }
 }
 const video = new Element(); video.paused=true; video.muted=false; video.playCalls=0; video.loadCalls=0;
 video.dataset.heroSrc='/site-assets/hero-media/emm-hero-v3-ko.mp4';
 video.load=()=>{video.loadCalls++;};
 video.pause=()=>{video.paused=true; video.dispatchEvent(new Event('pause'));};
 video.play=()=>{
  video.playCalls++;
  if(options.reject) return Promise.reject(Object.assign(new Error('denied'), {name:options.reject}));
  video.paused=false; video.dispatchEvent(new Event('playing')); return Promise.resolve();
 };
 const tracks=['ko','en','ja','zh'].map(lang => Object.assign(new Element(), {srclang:lang,track:{mode:'disabled'},dataset:{heroTrackSrc:'/captions.'+lang+'.vtt'}}));
 video.querySelectorAll=()=>tracks;
 const play=new Element(), sound=new Element(), captions=new Element(), status=new Element(), host=new Element();
 host.getBoundingClientRect=()=>options.rect??{left:0,right:640,top:0,bottom:360,width:640,height:360};
 host.querySelector=selector=>({'video':video,'[data-hero-play]':play,'[data-hero-sound]':sound,'[data-hero-captions]':captions,'[data-hero-status]':status}[selector]);
 for(const [key,value] of Object.entries({window:{matchMedia:()=>motion,IntersectionObserver:Observer,innerWidth:1440,innerHeight:1000},document,navigator:{connection},IntersectionObserver:Observer})) Object.defineProperty(globalThis,key,{configurable:true,value});
 const api=mountHeroVideo({querySelector:()=>host},labels,options.lang??'en');
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 return {api,video,play,sound,captions,status,host,tracks,motion,connection,document,observer,flush,
  cleanup(){api.destroy();for(const [key,descriptor] of Object.entries(originals)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
 };
}

test('automatic playback requires every safe gate, including muted state',()=>{
 const safe={homeVisible:true,inView:true,documentVisible:true,userPaused:false,restricted:false,consented:false,blocked:false,muted:true};
 assert.equal(canAutoPlayHero(safe),true);
 for(const [key,value] of Object.entries({homeVisible:false,inView:false,documentVisible:false,userPaused:true,restricted:true,blocked:true,muted:false})) assert.equal(canAutoPlayHero({...safe,[key]:value}),false,key);
 assert.equal(canAutoPlayHero({...safe,restricted:true,consented:true}),true);
 assert.equal(canAutoPlayHero({...safe,restricted:true,consented:true,muted:false}),false);
 assert.equal(heroCaptionLanguage('xx'),'en');
 for(const lang of ['ko','en','ja','zh']) assert.equal(heroCaptionLanguage(lang),lang);
});
for(const option of ['reduced','saveData']) test(option+': no video/track source or autoplay until explicit Play',async()=>{
 const f=setup({[option]:true});try{
  f.api.setHomeVisible(true);f.observer.intersect(true);
  assert.equal(f.video.src,undefined);assert.equal(f.video.playCalls,0);assert.equal(f.video.autoplay,false);
  assert.ok(f.tracks.every(t=>t.src===undefined));assert.equal(f.status.textContent,'restricted');
  f.play.click();await f.flush();assert.equal(f.video.playCalls,1);assert.match(f.video.src,/site-assets\/hero-media/);assert.equal(f.video.muted,true);
 }finally{f.cleanup();}
});
test('guide route stays unloaded; visible home autoplays muted; captions follow site language',async()=>{
 const f=setup({lang:'ja'});try{
  f.observer.intersect(true);f.api.setHomeVisible(false);assert.equal(f.video.src,undefined);
  f.api.setHomeVisible(true);await f.flush();assert.equal(f.video.playCalls,1);assert.equal(f.video.muted,true);
  assert.deepEqual(f.tracks.map(t=>t.track.mode),['disabled','disabled','showing','disabled']);
  f.captions.click();assert.ok(f.tracks.every(t=>t.track.mode==='disabled'));assert.equal(f.captions.attrs['aria-pressed'],'false');
  f.captions.click();assert.equal(f.tracks[2].track.mode,'showing');
 }finally{f.cleanup();}
});
test('muted offscreen/background resumes safely, explicit pause survives visibility and route changes',async()=>{
 const f=setup();try{
  f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();
  f.observer.intersect(false);assert.equal(f.video.paused,true);f.observer.intersect(true);await f.flush();assert.equal(f.video.playCalls,2);
  f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));assert.equal(f.video.paused,true);
  f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));await f.flush();assert.equal(f.video.playCalls,3);
  f.play.click();assert.equal(f.play.attrs['aria-pressed'],'false');
  f.api.setHomeVisible(false);f.api.setHomeVisible(true);f.observer.intersect(false);f.observer.intersect(true);await f.flush();assert.equal(f.video.playCalls,3);
 }finally{f.cleanup();}
});
test('sound requires a user click and audible video never automatically resumes',async()=>{
 const f=setup();try{
  f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();assert.equal(f.sound.attrs['aria-pressed'],'false');
  f.sound.click();assert.equal(f.video.muted,false);assert.equal(f.sound.attrs['aria-pressed'],'true');
  f.observer.intersect(false);f.observer.intersect(true);await f.flush();assert.equal(f.video.playCalls,1);assert.equal(f.video.paused,true);
  f.play.click();await f.flush();assert.equal(f.video.playCalls,2);assert.equal(f.video.muted,false);
 }finally{f.cleanup();}
});
test('autoplay rejection retains poster and manual Play can recover without auto retries',async()=>{
 const options={reject:'NotAllowedError'};const f=setup(options);try{
  f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();assert.equal(f.status.textContent,'blocked');assert.equal(f.host.dataset.failed,'true');assert.equal(f.play.attrs['aria-pressed'],'false');
  f.observer.intersect(true);await f.flush();assert.equal(f.video.playCalls,1);
  options.reject=null;f.play.click();await f.flush();assert.equal(f.video.playCalls,2);assert.equal(f.host.dataset.failed,'false');
 }finally{f.cleanup();}
});
test('media error shows honest failure and explicit Play reloads; selected caption error is reported',async()=>{
 const f=setup();try{
  f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();
  f.video.dispatchEvent(new Event('error'));assert.equal(f.video.paused,true);assert.equal(f.host.dataset.failed,'true');assert.equal(f.status.textContent,'failed');
  const loads=f.video.loadCalls;f.play.click();await f.flush();assert.equal(f.video.loadCalls,loads+1);assert.equal(f.host.dataset.failed,'false');
  f.tracks[1].dispatchEvent(new Event('error'));assert.equal(f.status.textContent,'captionFailed');
 }finally{f.cleanup();}
});
test('changed reduced-motion preference pauses and requires a new explicit Play',async()=>{
 const f=setup();try{
  f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();
  f.motion.matches=true;f.motion.dispatchEvent(new Event('change'));assert.equal(f.video.paused,true);assert.equal(f.status.textContent,'restricted');
  f.observer.intersect(true);await f.flush();assert.equal(f.video.playCalls,1);f.play.click();await f.flush();assert.equal(f.video.playCalls,2);
 }finally{f.cleanup();}
});
test('destroy removes sources/listeners and disconnects observer',async()=>{
 const f=setup();try{
  f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();f.api.destroy();
  assert.equal(f.observer.disconnected,true);assert.equal(f.video.src,'');assert.ok(f.tracks.every(t=>t.src===''));
  const count=f.video.playCalls;f.play.click();f.document.dispatchEvent(new Event('visibilitychange'));f.observer.intersect(true);await f.flush();assert.equal(f.video.playCalls,count);
 }finally{f.cleanup();}
});
for(const lang of ['ko','en','ja','zh']) test(lang+': hero-only markup defers sources and has accessible 16:9 controls and default captions',()=>{
 const html=readFileSync(new URL('../src/redesign/template'+(lang==='ko'?'':'.'+lang)+'.html',import.meta.url),'utf8');
 const hero=html.slice(html.indexOf('class="hero-board hero-video"'),html.indexOf('</section>',html.indexOf('class="hero-board hero-video"')));
 assert.match(hero,/<video[^>]*width="1600" height="900"/);assert.match(hero,/muted loop playsinline preload="none"/);
 assert.doesNotMatch(hero,/<video[^>]*\s(?:src|autoplay)=/);assert.doesNotMatch(hero,/<track[^>]*\ssrc=/);
 assert.match(hero,new RegExp('srclang="'+lang+'"[^>]* default'));
 assert.equal((hero.match(/type="button"/g)||[]).length,3);assert.equal((hero.match(/aria-pressed=/g)||[]).length,3);
 assert.equal((hero.match(/<track /g)||[]).length,4);assert.match(hero,/role="status" aria-live="polite"/);
 assert.doesNotMatch(hero,/<svg/);
});

test('versioned hero MP4 is fast-start H264/AAC and about 30 seconds', () => {
 const b=readFileSync(new URL('../public/hero-media/v3/emm-hero-v3-ko.mp4',import.meta.url));
 const top=[];for(let p=0;p+8<=b.length;){const n=b.readUInt32BE(p),type=b.toString('ascii',p+4,p+8);assert.ok(n>=8&&p+n<=b.length);top.push({type,p,n});p+=n;}
 assert.ok(top.find(x=>x.type==='ftyp'));assert.ok(top.find(x=>x.type==='moov').p<top.find(x=>x.type==='mdat').p);
 assert.ok(b.includes(Buffer.from('avc1')));assert.ok(b.includes(Buffer.from('mp4a')));assert.ok(b.length<12*1024*1024);
 const moov=top.find(x=>x.type==='moov');let movie;for(let p=moov.p+8;p<moov.p+moov.n;){const n=b.readUInt32BE(p);if(b.toString('ascii',p+4,p+8)==='mvhd'){const version=b[p+8],base=p+12;const scale=b.readUInt32BE(base+(version===1?16:8));const duration=version===1?Number(b.readBigUInt64BE(base+20)):b.readUInt32BE(base+12);movie=duration/scale;break;}p+=n;}
 assert.ok(movie>29.5&&movie<30.5,'actual movie duration '+movie);
});
test('four native caption files have seven timed UTF-8 cues and use versioned URLs',()=>{
 for(const lang of ['ko','en','ja','zh']){const vtt=readFileSync(new URL('../public/hero-media/v3/captions.'+lang+'.vtt',import.meta.url),'utf8');assert.ok(vtt.startsWith('WEBVTT\n'));assert.equal((vtt.match(/ --> /g)||[]).length,7);const pairs=[...vtt.matchAll(/(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/g)];const sec=s=>{const [h,m,z]=s.split(':').map(Number);return h*3600+m*60+z;};let end=0;for(const p of pairs){const a=sec(p[1]),b=sec(p[2]);assert.ok(a>=end&&b>a&&b<30);end=b;}assert.ok(end>27&&end<29);assert.doesNotMatch(vtt,/\u0000|<script/i);}
 const t=readFileSync(new URL('../src/site-text.ts',import.meta.url),'utf8');assert.match(t,/hero-media\/v3\//);
});
test('hero media location explicitly serves MP4 and native VTT captions',()=>{
 const nginx=readFileSync(new URL('../nginx.conf',import.meta.url),'utf8');assert.match(nginx,/location \^~ \/site-assets\/hero-media\//);assert.match(nginx,/video\/mp4 mp4;/);assert.match(nginx,/text\/vtt vtt;/);
});

test('v3 records the approved freely usable Sarah output and does not point to the earlier narration',()=>{
 const notice=readFileSync(new URL('../public/hero-media/v3/VOICE-LICENSE.md',import.meta.url),'utf8');
 assert.match(notice,/Supertonic 3/);assert.match(notice,/Sarah/);assert.match(notice,/OpenRAIL-M/);assert.match(notice,/Licensor claims no rights in the Output/);
 const text=readFileSync(new URL('../src/site-text.ts',import.meta.url),'utf8');assert.match(text,/hero-media\/v3\/emm-hero-v3-ko\.mp4/);assert.doesNotMatch(text,/hero-media\/v2\//);
});

for(const lang of ['ko','en','ja','zh']) {
 test(lang+': selected native caption load clears a previous transient error',async()=>{
  const f=setup({lang});try{f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();
   const t=f.tracks.find(t=>t.srclang===lang);t.dispatchEvent(new Event('error'));assert.equal(f.status.textContent,'captionFailed');
   t.readyState=2;t.track.cues=[{}];t.dispatchEvent(new Event('load'));assert.equal(f.status.textContent,'playing');
  }finally{f.cleanup();}
 });
 test(lang+': late stale caption error cannot override an already loaded usable track',async()=>{
  const f=setup({lang});try{f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();
   const t=f.tracks.find(t=>t.srclang===lang);t.readyState=2;t.track.cues=[{}];t.dispatchEvent(new Event('error'));assert.equal(f.status.textContent,'playing');
   t.readyState=3;t.track.cues=null;t.dispatchEvent(new Event('error'));assert.equal(f.status.textContent,'captionFailed');
  }finally{f.cleanup();}
 });
 test(lang+': caption recovery never hides an actual media failure',async()=>{
  const f=setup({lang});try{f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();
   f.video.dispatchEvent(new Event('error'));assert.equal(f.status.textContent,'failed');
   const t=f.tracks.find(t=>t.srclang===lang);t.readyState=2;t.track.cues=[{}];t.dispatchEvent(new Event('load'));assert.equal(f.status.textContent,'failed');
  }finally{f.cleanup();}
 });
}
test('Japanese caption recovery preserves an explicit pause without playback',async()=>{
 const f=setup({lang:'ja'});try{f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();f.play.click();
  const count=f.video.playCalls,t=f.tracks[2];t.dispatchEvent(new Event('error'));assert.equal(f.status.textContent,'captionFailed');
  t.readyState=2;t.track.cues=[{}];t.dispatchEvent(new Event('load'));assert.equal(f.status.textContent,'paused');assert.equal(f.video.paused,true);assert.equal(f.video.playCalls,count);
 }finally{f.cleanup();}
});
test('Japanese caption recovery preserves a changed reduced-motion restriction',async()=>{
 const f=setup({lang:'ja'});try{f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();
  const count=f.video.playCalls,t=f.tracks[2];t.dispatchEvent(new Event('error'));f.motion.matches=true;f.motion.dispatchEvent(new Event('change'));assert.equal(f.status.textContent,'restricted');
  t.readyState=2;t.track.cues=[{}];t.dispatchEvent(new Event('load'));assert.equal(f.status.textContent,'restricted');assert.equal(f.video.paused,true);assert.equal(f.video.playCalls,count);
 }finally{f.cleanup();}
});
test('caption load and error after destroy cannot change status or resume playback',async()=>{
 const f=setup({lang:'ja'});try{f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();f.api.destroy();
  const count=f.video.playCalls,status=f.status.textContent,t=f.tracks[2];t.readyState=2;t.track.cues=[{}];t.dispatchEvent(new Event('load'));t.dispatchEvent(new Event('error'));
  assert.equal(f.status.textContent,status);assert.equal(f.video.playCalls,count);assert.equal(f.video.paused,true);
 }finally{f.cleanup();}
});

for(const lang of ['ko','en','ja','zh']) for(const preference of ['reduced','saveData']) test(lang+': one sound click loads and plays audibly with '+preference,async()=>{
 const f=setup({lang,[preference]:true});try{f.api.setHomeVisible(true);f.observer.intersect(true);
  assert.equal(f.video.src,undefined);assert.equal(f.video.playCalls,0);assert.equal(f.video.muted,true);
  f.sound.click();await f.flush();assert.equal(f.video.playCalls,1);assert.equal(f.video.paused,false);assert.equal(f.video.muted,false);assert.match(f.video.src,/site-assets\/hero-media/);assert.equal(f.status.textContent,'playing');
  assert.equal(f.tracks.find(t=>t.srclang===lang).track.mode,'showing');
 }finally{f.cleanup();}
});
test('sound click resumes an explicitly paused muted video without seeking',async()=>{
 const f=setup();try{f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();f.play.click();f.video.currentTime=12.5;
  f.sound.click();await f.flush();assert.equal(f.video.paused,false);assert.equal(f.video.muted,false);assert.equal(f.video.playCalls,2);assert.equal(f.video.currentTime,12.5);
 }finally{f.cleanup();}
});
test('sound click recovers a policy-blocked attempt in the same gesture',async()=>{
 const options={reject:'NotAllowedError'},f=setup(options);try{f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();assert.equal(f.status.textContent,'blocked');
  options.reject=null;f.sound.click();await f.flush();assert.equal(f.video.muted,false);assert.equal(f.video.paused,false);assert.equal(f.host.dataset.failed,'false');assert.equal(f.status.textContent,'playing');
 }finally{f.cleanup();}
});
test('sound click supersedes pending muted autoplay and ignores its stale rejection',async()=>{
 const f=setup();let rejectOld;try{const normalPlay=f.video.play;f.video.play=()=>{if(f.video.playCalls===0){f.video.playCalls++;return new Promise((_,reject)=>{rejectOld=reject;});}return normalPlay();};
  f.api.setHomeVisible(true);f.observer.intersect(true);assert.equal(f.video.playCalls,1);f.sound.click();await f.flush();assert.equal(f.video.playCalls,2);assert.equal(f.video.muted,false);assert.equal(f.video.paused,false);
  rejectOld(Object.assign(new Error('stale'),{name:'NotAllowedError'}));await f.flush();assert.equal(f.video.paused,false);assert.equal(f.status.textContent,'playing');assert.equal(f.host.dataset.failed,'false');
 }finally{f.cleanup();}
});
test('one-click audible playback stays paused after background and mute does not restart it',async()=>{
 const f=setup({reduced:true});try{f.api.setHomeVisible(true);f.observer.intersect(true);f.sound.click();await f.flush();
  f.document.hidden=true;f.document.dispatchEvent(new Event('visibilitychange'));f.document.hidden=false;f.document.dispatchEvent(new Event('visibilitychange'));await f.flush();assert.equal(f.video.paused,true);assert.equal(f.video.playCalls,1);
  f.sound.click();await f.flush();assert.equal(f.video.muted,true);assert.equal(f.video.paused,true);assert.equal(f.video.playCalls,1);
 }finally{f.cleanup();}
});

test('sound click retries a genuine media failure with a reload',async()=>{
 const f=setup();try{f.api.setHomeVisible(true);f.observer.intersect(true);await f.flush();f.video.dispatchEvent(new Event('error'));const loads=f.video.loadCalls;
  f.sound.click();await f.flush();assert.equal(f.video.loadCalls,loads+1);assert.equal(f.video.paused,false);assert.equal(f.video.muted,false);assert.equal(f.host.dataset.failed,'false');
 }finally{f.cleanup();}
});

test('sound click sees current viewport even when the observer still says offscreen',async()=>{
 const f=setup({reduced:true});try{f.api.setHomeVisible(true);f.observer.intersect(false);assert.equal(f.video.src,undefined);f.sound.click();await f.flush();
  assert.equal(f.video.paused,false);assert.equal(f.video.muted,false);assert.equal(f.video.playCalls,1);
 }finally{f.cleanup();}
});
test('explicit sound click does not load an actually offscreen player with a stale visible observer',async()=>{
 const f=setup({reduced:true,rect:{left:0,right:640,top:1100,bottom:1460,width:640,height:360}});try{f.api.setHomeVisible(true);f.observer.intersect(true);f.sound.click();await f.flush();
  assert.equal(f.video.src,undefined);assert.equal(f.video.playCalls,0);
 }finally{f.cleanup();}
});
test('fresh viewport geometry never bypasses hidden document or non-home route',async()=>{
 for(const gate of ['document','route']){const f=setup({reduced:true});try{f.api.setHomeVisible(gate!=='route');f.observer.intersect(false);if(gate==='document')f.document.hidden=true;f.sound.click();await f.flush();assert.equal(f.video.src,undefined);assert.equal(f.video.playCalls,0);
 }finally{f.cleanup();}}
});
