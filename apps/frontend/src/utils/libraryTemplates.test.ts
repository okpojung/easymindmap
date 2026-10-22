// Run with the frontend TypeScript test runner; no package script changes.
import { createNewMap, libraryTemplates } from './libraryTemplates';
import { useLangStore } from '@/i18n';

let failed = 0;
function check(name: string, ok: boolean) {
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
}

const diagram = createNewMap('Empty diagram', 'freeform');
check('freeform is a canvas mode with a normal hierarchy', diagram.canvasMode === 'freeform' && diagram.root.layoutType === 'radial-right');
check('root position starts at origin', diagram.rootPos?.dx === 0 && diagram.rootPos?.dy === 0);
check('no first-center branches', diagram.branches.length === 0);
check('no leftover centers', diagram.centers?.length === 0);
check('no leftover connectors', !diagram.connectors?.length);
check('normal editable titled root', diagram.root.id === 'root' && diagram.root.text === 'Empty diagram');
const next = createNewMap('Next', 'freeform');
check('fresh map/root/arrays/position', next !== diagram && next.root !== diagram.root && next.branches !== diagram.branches && next.centers !== diagram.centers && next.rootPos !== diagram.rootPos);
const normal = createNewMap('Normal');
check('default is radial-right mindmap', normal.canvasMode === 'mindmap' && normal.root.layoutType === 'radial-right');
check('default gets requested title', normal.title === 'Normal' && normal.root.text === 'Normal');

const prevLang = useLangStore.getState().lang;
useLangStore.getState().setLang('ko');
const templates = libraryTemplates();
const meeting = templates.find((tpl) => tpl.id === 'lib-meeting');
const freeform = templates.find((tpl) => tpl.id === 'lib-freeform');
check('stable meeting id displays exact requested name', meeting?.name === '방사형-오른쪽');
check('radial template has real editor layout', meeting?.editor.layoutType === 'radial-right');
check('chooser includes freeform diagram', freeform?.name === '자유배치 (diagram)' && freeform.map.canvasMode === 'freeform');
check('freeform editor hierarchy stays radial-right', freeform?.editor.layoutType === 'radial-right');
check('help covers centers, connectors, per-center layouts', !!freeform?.desc.includes('중심 주제') && !!freeform?.desc.includes('연결선') && !!freeform?.desc.includes('일반 레이아웃'));
check('library factory does not share diagram root', libraryTemplates().find((tpl) => tpl.id === 'lib-freeform')?.map.root !== freeform?.map.root);
useLangStore.getState().setLang(prevLang);
if (failed) throw new Error(String(failed) + ' new-map checks failed');
