// Offline single-source generation for both protected HTML runtimes.
// Run after changing encryptedHtml.ts. --check never writes.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cryptoPath = path.join(root, 'src/export/encryptedHtml.ts');
const mdPath = path.join(root, 'public/md-editor/index.html');
const check = process.argv.includes('--check');
// Generated source must be identical on Windows and Linux checkouts.
const readCanonical = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
let source = readCanonical(cryptoPath);
const parsed = ts.createSourceFile('encryptedHtml.ts', source, ts.ScriptTarget.Latest, true);
const factory = parsed.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'createHtmlCrypto');
if (!factory) throw Error('Missing crypto factory');
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, newLine: ts.NewLineKind.LineFeed };
const factoryJs = ts.transpileModule(factory.getText(parsed).replace(/^export\s+/, ''), { compilerOptions: options }).outputText.trim();
new Function('return (' + factoryJs + ');');
const sourceRegion = /\/\* EMM_CRYPTO_FACTORY_SOURCE_START \*\/[\s\S]*?\/\* EMM_CRYPTO_FACTORY_SOURCE_END \*\//;
if (!sourceRegion.test(source)) throw Error('Missing crypto generation markers');
source = source.replace(sourceRegion, () => '/* EMM_CRYPTO_FACTORY_SOURCE_START */\nconst CRYPTO_FACTORY_SOURCE = ' + JSON.stringify(factoryJs) + ';\n/* EMM_CRYPTO_FACTORY_SOURCE_END */');
const js = ts.transpileModule(source, { compilerOptions: options }).outputText.replace(/^export\s+/gm, '');
const api = '\nwindow.EmmEncryptedHtml = { createHtmlCrypto, encryptStandaloneHtml, decryptStandaloneHtml, isEncryptedHtml, passwordValidationError };\n';
new Function(js + api);
const safe = (js + api).replace(/<\/(script)/gi, '<\\/$1').replace(new RegExp('<' + '!--', 'g'), '<\\!--');
let md = readCanonical(mdPath);
const mdRegion = /\/\* EMM_ENCRYPTED_HTML_SHARED_RUNTIME_START \*\/[\s\S]*?\/\* EMM_ENCRYPTED_HTML_SHARED_RUNTIME_END \*\//;
if (!mdRegion.test(md)) throw Error('Missing Markdown generation markers');
md = md.replace(mdRegion, () => '/* EMM_ENCRYPTED_HTML_SHARED_RUNTIME_START */\n' + safe + '/* EMM_ENCRYPTED_HTML_SHARED_RUNTIME_END */');
const targets = [[cryptoPath, source], [mdPath, md]];
let stale = false;
for (const [file, text] of targets) {
  if (readCanonical(file) === text) continue;
  if (check) { stale = true; console.error('Stale generated crypto runtime: ' + path.relative(root, file)); }
  else fs.writeFileSync(file, text);
}
if (stale) process.exitCode = 1;
else console.log(check ? 'PASS generated encrypted HTML runtimes are synchronized' : 'Generated encrypted HTML runtimes synchronized');
