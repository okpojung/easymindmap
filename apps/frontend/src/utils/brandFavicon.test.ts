import assert from 'node:assert/strict';
import { appFaviconUrl } from './brandFavicon';
const stub = (href: string | null) => ({
  querySelector(selector: string) {
    assert.equal(selector, 'link[rel~="icon"]');
    return href === null ? null : { href };
  },
}) as unknown as Pick<Document, 'querySelector'>;
assert.equal(appFaviconUrl(null), '/apple-touch-icon.png');
assert.equal(appFaviconUrl(stub(null)), '/apple-touch-icon.png');
assert.equal(appFaviconUrl(stub('')), '/apple-touch-icon.png');
assert.equal(appFaviconUrl(stub('https://web.easymindmap.org/assets/ui-brand-favicon-reviewed.svg')), 'https://web.easymindmap.org/assets/ui-brand-favicon-reviewed.svg');
assert.equal(appFaviconUrl(stub('http://localhost:5173/src/assets/brand-favicon.svg')), 'http://localhost:5173/src/assets/brand-favicon.svg');
console.log('PASS app favicon follows the entrypoint brand without duplicate SVG imports');
