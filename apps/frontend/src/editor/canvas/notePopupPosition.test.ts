import assert from 'node:assert/strict';
import { placeNotePopup, type Box } from './notePopupPosition';
import { shouldDismissBackdrop } from '@/components/ui/useBackdropDismiss';
const intersects = (a: Box, b: Box) => a.left < b.left+b.width && a.left+a.width > b.left && a.top < b.top+b.height && a.top+a.height > b.top;
for (const node of [
 { left: 800, top: 320, width: 160, height: 50 },
 { left: 1400, top: 300, width: 150, height: 90 },
 { left: 300, top: 720, width: 180, height: 80 },
 { left: 700, top: 240, width: 150, height: 50 },
]) {
 const bounds = {left:300,top:90,width:1300,height:800}; const p=placeNotePopup(node,bounds);
 assert.equal(intersects(node,p),false);
 assert.ok(p.left>=bounds.left && p.top>=bounds.top);
 assert.ok(p.left+p.width<=bounds.left+bounds.width && p.top+p.height<=bounds.top+bounds.height);
}
const narrow = placeNotePopup({left:700,top:300,width:100,height:50}, {left:600,top:100,width:500,height:700});
assert.equal(intersects(narrow,{left:700,top:300,width:100,height:50}),false);
assert.equal(shouldDismissBackdrop(null,{x:100,y:200},true),false,'selection began inside');
assert.equal(shouldDismissBackdrop({x:10,y:10},{x:110,y:200},true),false,'dragging on backdrop');
assert.equal(shouldDismissBackdrop({x:10,y:10},{x:11,y:11},false),false,'ends inside');
assert.equal(shouldDismissBackdrop({x:10,y:10},{x:11,y:11},true),true,'intentional outside click');
console.log('PASS node avoidance, viewport bounds, split pane, outside release vs intentional click');
