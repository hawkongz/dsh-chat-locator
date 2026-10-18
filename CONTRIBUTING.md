# Contributing

Thanks for taking the time to improve `dsh-chat-locator`. This is a small plugin with no
bundled dependencies, so the contribution loop is short.

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

**Nothing to install.** Node.js 20+ and a clone — `test/verify-client.mjs` stubs the DSH services
itself, and there is no build step.

```bash
git clone https://github.com/hawkongz/dsh-chat-locator.git
cd dsh-chat-locator
node test/verify-client.mjs     # 151 assertions
```

To try it against a real DSH instance, install the working copy into a profile and restart the
host:

```bash
dsh plugin --profile web add "$(pwd)"   # pnpm records it as a link:
dsh web
```

On Windows, pass the absolute path instead: `dsh plugin --profile web add "C:\path\to\dsh-chat-locator"`.

### Which half to reload

| Changed | Effect |
| :--- | :--- |
| `client.js` | Takes effect on page refresh — the page re-hashes the module. |
| `index.js` | Nothing to reload; it is a no-op stub kept only so the patch row resolves. |

Installing or removing a bundle needs a `dsh web` restart — the plugin tree is composed at startup.
Current DSH builds can hot-compose client entries, so re-enabling an already-installed bundle may
take effect without one, but a restart is the reliable path.

## Code conventions

* **No bundled dependencies.** React and Cordis are optional peer dependencies resolved from the
  host. The browser half uses the host-provided `@deepseek-ai/dsh-client-store` (plus `ui-slots`,
  `ui-settings`, `locale`) — name those in `dsh.client.inject`, never in `dependencies`.
* **No build step.** Both halves are plain ESM that Node and the browser load directly.
* **Style:** 2-space indent, single quotes, semicolons, `camelCase` functions and variables,
  `UPPER_SNAKE_CASE` module constants.
* **CSS is injected, never patched.** Every override carries `!important` and is owned by the
  plugin so it can be removed cleanly. Never write to the shipped DSH install.
* **Keep `diagnostics` pure.** No DOM or service access, so the suite can exercise it without a
  browser.
* **UTF-8 only.** Do not round-trip these files through PowerShell text cmdlets
  (`Get-Content -Raw` / `Set-Content`); they mangle non-ASCII content and add a BOM.

## Bumping the settings slot

The `order` field of the `settings.section` slot registration in `client.js` shows up in the live
slot tree, so it doubles as a "did the page really load this revision?" probe. Earlier revisions
bumped it by one each release; it is `41` and has not changed since 1.3.0, so bumping it is
optional — do it only when you need the probe to distinguish a new revision. If you change
`order`, update the assertion in `test/verify-client.mjs` to match.

## Test and documentation parity

If your change alters user-visible numbers (the gradient width table, the preview card
height, a default, a range), update **all** of these in the same pull request:

* `test/verify-client.mjs` — add or update the assertion that pins the new value.
* `README.md` (Chinese, the default view) and `README.en.md` (English) — the settings table and
  the gradient explanation.
* `docs/design-notes.md` and `zh-CN/docs/design-notes.md` — the tuning history and rationale.

The test suite intentionally asserts on exact numbers such as `[32, 21, 14]`. A failing
assertion after a deliberate change is expected; update the number, do not loosen the check.

## Releasing

**Publishing happens in CI, not on your machine.** Push a `v*` tag and
`.github/workflows/release.yml` does the rest: it publishes through npm trusted publishing (OIDC)
with `--provenance`, then creates the GitHub release for the tag. Before publishing it runs the
syntax check and the test suite, refuses a tag that does not match `package.json`'s version, and
skips a version that is already on the registry. There is no manual publish path.

1. Working tree clean, `npm test` green.
2. Bump `version` in `package.json` and set `PLUGIN_VERSION` in `client.js` to the same value —
   the suite fails if the two drift apart.
3. Update every doc that mentions the changed values (see [parity](#test-and-documentation-parity)).
4. Write `release-notes/v1.5.0.md`: the first line is `# <release title>`, then the body in
   the shape of the earlier releases (English first, then 简体中文). CI turns that file into the
   GitHub release for the tag; without it you get GitHub's generated notes instead.
5. Commit, tag, push:

   ```bash
   git commit -am "chore: release v1.5.0"
   git tag -a v1.5.0 -m "v1.5.0"
   git push origin main --follow-tags
   ```

6. Watch the `Release` run: it publishes to npm, then creates the GitHub release for the tag (an
   existing release is left alone). Confirm both — `npm view dsh-chat-locator version` and the
   [releases page](https://github.com/hawkongz/dsh-chat-locator/releases).

A published version cannot be replaced — npm rejects republishing an existing version — so a
mistake needs a new patch release, not a re-upload.

**Fallback:** if CI is unavailable, `npm test && npm publish` from your machine works, minus the
OIDC provenance attestation. `publishConfig.registry` pins the official registry in either case,
so a locally configured mirror cannot intercept the upload.

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
