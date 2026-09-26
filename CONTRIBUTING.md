# Contributing

Thanks for taking the time to improve `dsh-chat-locator`. This is a small, dependency-free
plugin, so the contribution loop is short.

## Ways to contribute

### Report a bug

1. Search the [existing issues](https://github.com/hawkongz/dsh-chat-locator/issues) first.
2. If nothing matches, open a bug report.
3. Include the `__dshChatLocator.state()` console output — it answers most triage questions
   in one paste. See the bug report template for the details.

### Request a feature

Open a feature request. Describe the user-facing symptom first, then the setting you want
(label, control type, default, range). Read
[docs/design-notes.md](docs/design-notes.md) first: the plugin can only inject CSS on top of
the built-in rail, so requests that need a re-render or a fork of
`@deepseek-ai/dsh-client-ui-chat` are out of scope by design.

### Submit code

1. Fork the repository.
2. Create a branch: `git checkout -b feature/your-feature`
3. Make the change and add tests.
4. Run the test suite: `node test/verify-client.mjs`
5. Commit with a conventional commit message.
6. Push the branch and open a pull request.

```bash
git checkout -b feature/your-feature
node test/verify-client.mjs
git commit -m "feat(gradient): add a configurable taper reach"
git push origin feature/your-feature
```

## Development environment

**There is nothing to install.** The plugin and its test suite have zero runtime and zero
development dependencies — `test/verify-client.mjs` stubs the DSH services itself. You need
Node.js 20 or newer and nothing else.

```bash
# 1. Clone
git clone https://github.com/hawkongz/dsh-chat-locator.git
cd dsh-chat-locator

# 2. Run the test suite (127 assertions, no install step)
node test/verify-client.mjs
```

To exercise the plugin against a real DSH Web instance, install your working copy into a
profile and restart the host:

```bash
# 3. Install the working copy into the `web` profile (pnpm records it as a `link:`)
dsh plugin --profile web add "$(pwd)"

# 4. Restart the host so the host half is imported
dsh web
```

On Windows (PowerShell), use the absolute path instead:

```powershell
dsh plugin --profile web add "C:\path\to\dsh-chat-locator"
dsh web
```

### The two-half reload rule

Since 1.4.0 only one half matters for development:

| Changed file | How it takes effect |
| :--- | :--- |
| `client.js` (browser half) | Automatically. The page re-hashes the client module on reload; just refresh. |
| `index.js` (host half) | Nothing to reload. It is a no-op stub kept only because the patch row resolves to it; reinstalling or removing the bundle still needs a `dsh web` restart. |

Mounting or unmounting the bundle itself always needs a `dsh web` restart — the composed plugin
tree is built at startup.

## Code conventions

* **Zero dependencies.** Do not add a runtime dependency. `@deepseek-ai/cordis` and `react` are
  optional peer dependencies resolved at runtime. (The browser half also uses
  `@deepseek-ai/dsh-client-store` at runtime — declare it in `dsh.client.inject`, not in
  dependencies; `@deepseek-ai/schemastery` was dropped in 1.4.0 along with the host-side schema.)
* **No build step.** Both halves ship as plain ESM that Node and the browser load directly.
* **Style:** 2-space indentation, single quotes, semicolons, `camelCase` for variables and
  functions, `UPPER_SNAKE_CASE` for module-level constants.
* **CSS is injected, never patched.** All override rules carry `!important` and are owned by
  the plugin, so they can be removed cleanly. Never write to the shipped DSH install.
* **Keep the diagnostics surface pure.** `diagnostics` exports in `client.js` must stay free
  of DOM and service access so the test suite can exercise them without a browser.
* **UTF-8 only.** Edit these files with a UTF-8-safe editor. Do not round-trip them through
  PowerShell text cmdlets (`Get-Content -Raw` / `Set-Content`), which mangle non-ASCII
  content and prepend a BOM.

## Bumping the settings slot

Every revision that should be observable on a live page increments the `order` field of the
`settings.section` slot registration in `client.js` by one. `order` shows up in the live slot
tree, so it doubles as a "did the page really load this revision?" probe. If you change
`order`, update the assertion in `test/verify-client.mjs` to match.

## Test and documentation parity

If your change alters user-visible numbers (the gradient width table, the preview card
height, a default, a range), update **all** of these in the same pull request:

* `test/verify-client.mjs` — add or update the assertion that pins the new value.
* `README.md` and `zh-CN/README.md` — the settings table and the gradient explanation.
* `docs/design-notes.md` and `zh-CN/docs/design-notes.md` — the tuning history and rationale.

The test suite intentionally asserts on exact numbers such as `[32, 21, 14]`. A failing
assertion after a deliberate change is expected; update the number, do not loosen the check.

## Releasing

The package is published to npm, which is what makes `dsh plugin --profile web add dsh-chat-locator` work for users. **Publishing happens in CI, not on your machine:** `.github/workflows/release.yml` publishes on every `v*` tag push through npm trusted publishing (OIDC) with `--provenance`, and it runs `node test/verify-client.mjs` first, so a tag whose assertions are not all green is never published.

1. Confirm the working tree is clean and `node test/verify-client.mjs` passes.
2. Bump `version` in `package.json` following semantic versioning, and set `PLUGIN_VERSION` in `client.js` to the same value — the test suite reads `package.json` and fails if the two drift apart.
3. Update every document that mentions the changed values (see the section above).
4. Commit, tag, and push — the tag push is what starts the publish:

```bash
git commit -am "chore: release v1.4.1"
git tag -a v1.4.1 -m "v1.4.1"
git push origin main --follow-tags
```

5. Watch the `Release` run in the Actions tab, then verify that the registry really has it:

```bash
npm view dsh-chat-locator version
```

**Fallback: publishing locally.** If CI is unavailable you can still publish from your machine. This path has no OIDC provenance attestation — npm only attaches `--provenance` when it can reach the build service — so prefer CI, and run the test suite first either way:

```bash
node test/verify-client.mjs
npm publish
npm view dsh-chat-locator version
```

`publishConfig.registry` in `package.json` pins publishing to the official npm registry, so a mirror configured locally (for example `registry.npmmirror.com`) cannot intercept the upload. There is no build step, and npm adds `LICENSE` and `README.md` to the tarball on top of the `files` list.

6. Create the GitHub release for the tag, with the changelog as the body.

A published version cannot be replaced — npm rejects republishing an existing version — so a mistake in a release needs a new patch version rather than a re-upload.

## Commit message convention

Follow [Conventional Commits](https://www.conventionalcommits.org/).

```text
feat(gradient): anchor the taper on the preview tick
fix(frame): widen the clip box so the 32px peak is not cut off
docs: add the bilingual README pair
test: pin the first gradient step to the 9-12px band
chore: bump version to 1.2.0
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
Subject line: 72 characters or fewer.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
