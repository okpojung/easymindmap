import assert from 'node:assert/strict';
import { checkFolderPath, normalizeFolderPath, readFolderPath, writeFolderPath, isRootFolderName } from './localFolderPath';

assert.equal(normalizeFolderPath(' "d:/EMM첨부/프로젝트/" '), 'D:\\EMM첨부\\프로젝트');
assert.equal(normalizeFolderPath('D:\\\\a\\\\b\\'), 'D:\\a\\b');
assert.equal(normalizeFolderPath('d:'), 'D:\\');
assert.equal(normalizeFolderPath('\\\\nas\\share\\EMM\\'), '\\\\nas\\share\\EMM');
assert.equal(normalizeFolderPath('/Users/me/EMM/'), '/Users/me/EMM');

assert.deepEqual(checkFolderPath('D:\\EMM첨부', 'EMM첨부'), { ok: true, path: 'D:\\EMM첨부' });
assert.deepEqual(checkFolderPath('d:/work/emm첨부/', 'EMM첨부'), { ok: true, path: 'D:\\work\\emm첨부' }, 'case-insensitive name, slash normalized');
assert.deepEqual(checkFolderPath('\\\\nas\\share\\EMM', 'EMM'), { ok: true, path: '\\\\nas\\share\\EMM' });
assert.deepEqual(checkFolderPath('/Users/me/EMM', 'EMM'), { ok: true, path: '/Users/me/EMM' });
assert.deepEqual(checkFolderPath('', 'EMM'), { ok: false, reason: 'empty' });
assert.deepEqual(checkFolderPath('EMM첨부', 'EMM첨부'), { ok: false, reason: 'notAbsolute' });
assert.deepEqual(checkFolderPath('D:\\다른폴더', 'EMM첨부'), { ok: false, reason: 'nameMismatch' });

assert.ok(isRootFolderName('\\') && isRootFolderName('D:\\') && isRootFolderName('/') && !isRootFolderName('EMM'));
assert.deepEqual(checkFolderPath('d:', '\\'), { ok: true, path: 'D:\\' }, 'whole drive connected');
assert.deepEqual(checkFolderPath('D:\\EMM', '\\'), { ok: false, reason: 'root' });

const mem = new Map<string, string>();
const s = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); } };
assert.equal(readFolderPath('ABC', s), null);
writeFolderPath('ABC', 'D:\\EMM', s);
assert.equal(readFolderPath('abc', s), 'D:\\EMM', 'root id is case-insensitive');
writeFolderPath('abc', null, s);
assert.equal(readFolderPath('ABC', s), null);
console.log('local folder path: normalize, drive/UNC/posix, name match, drive root, storage PASS');
