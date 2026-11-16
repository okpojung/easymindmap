# Isolated Markdown Editor 1.0.7 regressions

Test-only sources. These files are not in `public/`, APP_JS, the Vite bundle, or exported editor HTML.

## Source

The following fixture functions come from `markdown-editor` commit
`620e3ed3c1375802db70e69146e4daa20bba7a10`:

- `tests/outline.browser.js`
- `tests/toolbar.browser.js`
- `tests/table-grid.browser.js`
- `tests/rendered-tail.browser.js`
- `tests/split-scroll.browser.js`
- `tests/embed-host.browser.js`
- `tests/protected-export.browser.js`

Local filenames use the `tests__` prefix. Existing upstream comments are retained.
The protected-export function is unchanged; its file appends an EMM-only adapter
for the existing `window.EmmEncryptedHtml` API. The adapter supports the original
failure-injection checks and restores all temporary globals/API methods and the
host nonce in `finally`.

`tests__emm-contract.browser.js` and `serve-fixtures.cjs` are EMM-specific. They
exercise actual merged functions, the actual parent snapshot gate, real crypto,
and synthetic local files. They do not use live tokens, EMM attachments, or maps.

## Run

From a checkout with the frontend dependencies installed:

```text
node apps/frontend/scripts/md107-browser/serve-fixtures.cjs <absolute-Core-checkout>
```

Open `http://127.0.0.1:5187/` and run the buttons one at a time. The server binds
only loopback. Each result is saved as ignored `result-<suite>.json` beside this
file. Results include the production HTML SHA-256 captured when the iframe was
served and the fixed upstream commit. The HTML receives a synthetic fixture
marker only in this local response; source files are never rewritten.

All documents are disposable. Passwords are generated in memory and never
reported. The picker is a memory writer. `nativeFileRoundtrip: false` means the
native OS picker/file persistence is not tested. The server attachment PUT,
If-Match, map version, persisted hash, and actual EMM reopen checks must be
performed separately on an owner-authorized test server.

Stop the local server after testing. Never use this harness as a deployment or
a substitute for the production approval/audit/manifest/receipt gates.
