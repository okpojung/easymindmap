import assert from 'node:assert/strict';
import { layoutStatus, LAYOUT_STATUS_LABEL } from './layoutStatus';
import { countMapNodes } from '@/export/mapMeta';
import type { SampleMap } from '@/editor/__samples__/types';
const map = { title: 'status', root: {id:'root',text:'root',layoutType:'process-tree-right'}, branches:[
  {id:'a',text:'A',layoutType:'radial-left',collapsed:true,children:[{id:'a1',text:'inherited',children:[]}]},
  {id:'b',text:'B',children:[]},
],centers:[{root:{id:'c2',text:'second',layoutType:'tree-down'},branches:[{id:'c21',text:'child',children:[]}]}] } as SampleMap;
assert.deepEqual(layoutStatus(map,'process-tree-right',null),{count:0,layout:'process-tree-right',mixed:false});
assert.equal(layoutStatus(map,'process-tree-right','a').layout,'radial-left');
assert.equal(layoutStatus(map,'process-tree-right','a1').layout,'radial-left');
assert.equal(layoutStatus(map,'process-tree-right','b').layout,'process-tree-right');
assert.equal(layoutStatus(map,'process-tree-right','c2').layout,'tree-down');
assert.equal(layoutStatus(map,'process-tree-right','c21').layout,'tree-down');
assert.equal(layoutStatus(map,'process-tree-right','missing').count,0);
assert.equal(layoutStatus(map,'kanban','a').layout,'kanban');
assert.equal(layoutStatus({...map,canvasMode:'freeform'},'process-tree-right','a').layout,'freeform');
assert.equal(layoutStatus(map,'process-tree-right','a',['a','b']).mixed,true);
assert.equal(layoutStatus(map,'process-tree-right','a',['a','a1']).mixed,false);
assert.equal(layoutStatus(map,'process-tree-right','a',['a','a1','a']).count,2);
assert.equal(layoutStatus({...map,root:{...map.root,layoutType:undefined}},'progress-tree','b').layout,'process-tree-right');
assert.equal(countMapNodes(map),6); // root, a, a1, b, c2, c21 (including collapsed children)
assert.ok(LAYOUT_STATUS_LABEL['process-tree-right']);
console.log('PASS map/selected/inherited/secondary center, mixed selection, canvas modes and total including hidden nodes');
