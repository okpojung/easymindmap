// Store embedded resource bytes in the existing restoration JSON only.
// The viewer uses bounded references into that JSON, not a second Base64 copy.
// Keeping the restoration JSON unchanged also preserves old EMM importers.
import { rewriteNoteHtmlImages } from '@emm/note-images';

const PREFIX = 'emm-shared-asset:';
const DATA_URL = /^data:[^,\s"'<>\\]*;base64,[A-Za-z0-9+/]*={0,2}$/;

export function shareViewerAssets<T>(data: T, metaJson: string): { data: T; sharedCount: number } {
  const urls = new Map<string, string>();
  // One pass, not one full-metadata search per resource. All offsets are JS
  // UTF-16 offsets, matching script.textContent and String.slice in the viewer.
  for (const match of metaJson.matchAll(/data:[^,\s"'<>\\]*;base64,[A-Za-z0-9+/]*={0,2}/g)) {
    const url = match[0];
    if (!urls.has(url)) urls.set(url, `${PREFIX}${match.index}:${url.length}`);
  }
  if (!urls.size) return { data, sharedCount: 0 };
  let sharedCount = 0;
  const resolve = (url: string): string | undefined => {
    const ref = urls.get(url);
    if (ref) sharedCount += 1;
    return ref;
  };
  const walk = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string') {
      if ((key === 'href' || key === 'src') && DATA_URL.test(value)) return resolve(value) ?? value;
      if (key === 'html') return rewriteNoteHtmlImages(value, resolve);
      return value;
    }
    if (Array.isArray(value)) return value.map(item => walk(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    }
    return value;
  };
  return { data: walk(data) as T, sharedCount };
}

// Literal source, deliberately independent of minifier/function.toString.
// Runs immediately after __MINDMAP__ is assigned, before Blob attachment setup
// and before any native viewer/list/outline initialization.
export const SHARED_VIEWER_ASSET_BOOTSTRAP = String.raw`
(function(){
  var prefix='emm-shared-asset:';
  var slot=document.getElementById('easymindmap-map');
  if(!slot)throw new Error('공유 첨부 원본을 찾지 못했습니다.');
  var meta=slot.textContent||'';
  var cache=Object.create(null);
  function resolve(value){
    if(typeof value!=='string'||value.indexOf(prefix)!==0)return value;
    if(Object.prototype.hasOwnProperty.call(cache,value))return cache[value];
    var match=/^emm-shared-asset:(\d+):(\d+)$/.exec(value);
    if(!match)throw new Error('공유 첨부 참조가 손상되었습니다.');
    var start=Number(match[1]),length=Number(match[2]);
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<1||start+length>meta.length)throw new Error('공유 첨부 참조가 손상되었습니다.');
    var url=meta.slice(start,start+length);
    if(!/^data:[^,\s"'<>\\]*;base64,[A-Za-z0-9+/]*={0,2}$/.test(url))throw new Error('공유 첨부 원본이 손상되었습니다.');
    cache[value]=url;return url;
  }
  function html(value){
    if(value.indexOf(prefix)<0)return value;
    var box=document.createElement('template');box.innerHTML=value;
    var images=box.content.querySelectorAll('img[src]');
    for(var i=0;i<images.length;i++){
      var src=images[i].getAttribute('src');
      if(src&&src.indexOf(prefix)===0)images[i].setAttribute('src',resolve(src));
    }
    return box.innerHTML;
  }
  function walk(value){
    if(!value||typeof value!=='object')return;
    Object.keys(value).forEach(function(key){
      var item=value[key];
      if((key==='href'||key==='src')&&typeof item==='string')value[key]=resolve(item);
      else if(key==='html'&&typeof item==='string')value[key]=html(item);
      else if(item&&typeof item==='object')walk(item);
    });
  }
  walk(window.__MINDMAP__);
})();`;
