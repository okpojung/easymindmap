import assert from 'node:assert/strict';
import { cloudApi } from './apiClient';
import { openMapHere, clearCurrentMap, detachFromServer } from './mapSession';
import { useCloudStore } from '@/stores/cloudStore';
import { useDocumentStore, isViewerLocked, findNodeInMap } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import type { SampleMap } from '@/editor/__samples__/types';
const sample = (): SampleMap => ({ title:'snapshot title', root:{id:'root',text:'Root',colorKey:'root'}, branches:[{id:'a',text:'A',colorKey:'l1A',side:'right',children:[{id:'aa',text:'AA'}]},{id:'b',text:'B',colorKey:'l1B',side:'right',children:[]}] });
const originalGet=cloudApi.getDocument;
const originalRelease=cloudApi.editRelease;
const previousWindow=(globalThis as any).window;
const sessionValues=new Map<string,string>();
(globalThis as any).window={ setTimeout,clearTimeout,setInterval,clearInterval,crypto:globalThis.crypto, location:{href:'http://test.local/',search:''},history:{replaceState(){}},sessionStorage:{getItem:(k:string)=>sessionValues.get(k)??null,setItem:(k:string,v:string)=>sessionValues.set(k,v)} };
cloudApi.editRelease=async()=>({ok:true});
let response: any;
cloudApi.getDocument = async () => response;
const answer = (extra: object) => ({ doc:{v:2,map:sample(),editor:{layoutType:'tree-right',spacingX:100,spacingY:100}}, updatedAt:'2026-11-15T00:00:00Z',title:'Server title',folderId:null,kind:'solo',role:'owner',editLock:'acquired',...extra });
try {
  for (const extra of [{editLock:'busy'}, {role:'viewer'}, {published:true}, {dashboard:true}]) {
    clearCurrentMap(); response=answer(extra);
    const result=await openMapHere('test-readonly');
    assert.equal(result.readOnly,true); assert.equal(isViewerLocked(),true);
    assert.equal(useCloudStore.getState().cloudMapId,null);
    assert.equal(useCloudStore.getState().readOnlyInfo?.mapId,'test-readonly');
    assert.equal(useAutosaveStore.getState().saveState,'readonly');
    assert.equal(useDocumentStore.getState().map.title,'Server title');
    const before=JSON.stringify(useDocumentStore.getState().map);
    const epoch=useDocumentStore.getState().docEpoch;
    const st=useDocumentStore.getState();
    st.updateNodeText('a','must not change'); st.addChildNode('a'); st.deleteNode('b');
    st.moveNodeRelative('b','a','child'); st.addNodeAttachment('a',{name:'blocked.md',url:'data:text/markdown,x',kind:'file'});
    st.undo(); st.redo();
    assert.equal(JSON.stringify(useDocumentStore.getState().map),before);
    assert.equal(useDocumentStore.getState().docEpoch,epoch);
    st.collapseAll(); assert.equal(findNodeInMap(useDocumentStore.getState().map,'a')?.collapsed,true);
    st.expandAll(); assert.equal(findNodeInMap(useDocumentStore.getState().map,'a')?.collapsed,undefined);
  }
  response=answer({}); const result=await openMapHere('test-editable');
  assert.equal(result.readOnly,false); assert.equal(isViewerLocked(),false);
  assert.equal(useCloudStore.getState().cloudMapId,'test-editable');
  assert.equal(useCloudStore.getState().readOnlyInfo,null);
  useDocumentStore.getState().updateNodeText('a','editable again');
  assert.equal(findNodeInMap(useDocumentStore.getState().map,'a')?.text,'editable again');
  detachFromServer(); assert.equal(isViewerLocked(),false);
  console.log('PASS busy/viewer/published/dashboard sessions block data edits while preserving view folds, server title, document epoch and next-map editing');
} finally { cloudApi.getDocument=originalGet; clearCurrentMap(); cloudApi.editRelease=originalRelease; useEditorUiStore.getState().setOpeningLabel(null); if(previousWindow===undefined)delete (globalThis as any).window;else (globalThis as any).window=previousWindow; }
