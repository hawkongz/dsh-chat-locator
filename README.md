<div align="center">
  <h1>dsh-chat-locator</h1>
  <p>Turn-rail settings for DSH Web: tick thickness, rail side, and a curved length gradient anchored on the hovered tick — plus a plain-text hover preview whose line count, font size, and width you control.</p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
  ![Platform](https://img.shields.io/badge/Platform-DSH%20Web-lightgrey)
  [![Node.js](https://img.shields.io/badge/Node.js-339933)](https://nodejs.org)
  [![Stars](https://img.shields.io/github/stars/hawkongz/dsh-chat-locator)](https://github.com/hawkongz/dsh-chat-locator)

  <p><strong>Language:</strong> <a href="README.md">English</a> | <a href="zh-CN/README.md">简体中文</a></p>
</div>

---

## 📋 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Installation](#-installation)
- [Usage](#-usage)
- [How It Works](#-how-it-works)
- [Topics](#-topics)
- [Contributing](#-contributing)
- [License](#-license)

---

DSH Web draws a turn rail down the edge of every conversation: one tick per turn, so you can see where you are in a long session and jump between turns. It is a good rail with three opinions baked into it. Ticks are always 2px. The rail always sits on the right. And pointing at a tick tells you nothing about what that turn contains, so finding a specific turn in a long conversation means hovering ticks one at a time.

None of that is configurable. The rail is rendered directly by `ChatView` inside `@deepseek-ai/dsh-client-ui-chat`; the Slot system gives it no seat, and no setting for thickness or side is exposed anywhere.

`dsh-chat-locator` is a persistent DSH plugin that turns those fixed opinions into settings. It does not replace the rail — it claims the rail's styles at runtime, so the built-in jump-to-turn, unloaded-turn paging, and active-turn following all keep working exactly as before.

## ✨ Features

- **Tick thickness (横线粗细):** 1–8px instead of a fixed 2px. Only the line width changes; the 10px tick spacing stays put.
- **Rail side (轨道位置):** Left or right. The hover preview automatically opens on the opposite side, so it never covers the text you are reading.
- **Hover preview:** The built-in plain-text card showing that turn's prompt and response. The plugin does not build it — it only styles how many lines it shows, its font size, and its width, and the built-in plain-text rendering (which never includes thinking content) is left alone.
- **Preview line count (预览正文行数):** 1–6 lines. The card really grows — only the overflow is clipped.
- **Preview font size and width (预览字号 / 预览框宽度):** 10–18px and 200–420px. Font size and line height scale as a pair, so enlarging the text never crowds or clips it.
- **A curved length gradient:** The tick under the pointer grows to 32px and its neighbours taper back along a curve — `21 / 14 / 12` — so the rail reads as a hook pointing at where you are, not as a straight diagonal. It has its own on/off switch; with it off every tick keeps its built-in width and nothing else changes.
- **Restore defaults (恢复默认):** All seven settings back to factory values in one click, via per-field `unset` rather than rewriting the defaults.
- **A dedicated settings page:** Settings → 对话定位条, with a live sample rail and sample preview card that redraw as you change each value.
- **Zero dependencies, no build step.** Both halves are plain ESM loaded directly by Node and the browser.

## 🚀 Quick Start

> **What you need:** a working DSH installation (the `dsh` command) with a profile, plus Node.js 20 or newer. The plugin itself has no dependencies to install.

**Step 1 — Open a terminal**

- macOS / Linux: open Terminal.
- Windows: press `Win + R`, type `powershell`, and press Enter.

**Step 2 — Install the bundle into your profile**

`dsh plugin` forwards its arguments to pnpm inside the profile directory, so this installs the package from npm and DSH picks up its patch automatically. Replace `web` with your own profile name if it differs.

```bash
dsh plugin --profile web add dsh-chat-locator
```

To pin an exact version instead of tracking new releases, append it: `dsh plugin --profile web add dsh-chat-locator@1.4.1`

That is the whole install. The bundle itself is the four files a DSH plugin bundle needs — `package.json` (which declares the bundle and the browser half), `index.js` (the host half — a no-op stub since 1.4.0), `client.js` (the browser half), and `cordis.patch.yml` (the patch that adds the plugin row) — and there is nothing to compile and no dependency to install. Alongside those, the published package also ships this README and its `zh-CN/` translation, `docs/design-notes.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `test/`.

**Step 3 — Restart the host**

```bash
dsh web
```

The host process caches imported modules, so a newly added bundle is not mounted until the host restarts once.

**Step 4 — Done.** With DSH Web open at `http://127.0.0.1:3080`, you are finished if:

- **Settings → 对话定位条** appears in the settings sidebar, and
- in the browser console, this returns `railFound: true` on a conversation with at least two turns:

```js
__dshChatLocator.state()
```

Open a conversation and slide the pointer up and down the rail: the tick under the pointer grows and its neighbours taper.

> To update: run `dsh plugin --profile web update dsh-chat-locator`, then restart the host. To uninstall: `dsh plugin --profile web remove dsh-chat-locator`, then restart the host.
>
> **Want the newest unreleased commit, a local copy you can edit, or an offline install?** See [Install methods](#install-methods).

## 📦 Installation

### Requirements

| Requirement | Version | Notes |
| :--- | :--- | :--- |
| DSH | 0.1.7 or newer | Provides the `dsh` command and the profile you install into. The browser half persists settings through `@deepseek-ai/dsh-client-store`, which earlier versions do not ship. |
| Node.js | 20 or newer | Used by the host half and the test suite. |
| A browser with `:has()` support | Chromium 105+ | Without it the length gradient does not apply; everything else still works. |

### Install methods

| Method | Best for |
| :--- | :--- |
| `dsh plugin --profile web add dsh-chat-locator` | Most users. Installs the released version from npm; append `@1.4.1` to pin an exact one. |
| `dsh plugin --profile web add github:hawkongz/dsh-chat-locator` | The newest commit on `main`, without cloning by hand. Locks a commit rather than a version. |
| [From a git clone](#install-from-a-git-clone) | Working on the plugin itself. |
| [From four downloaded files](#install-without-git) | No network access to npm or GitHub, or an offline machine. |

### Install from a git clone

Use this if you would rather update with `git pull` than by re-downloading files.

```bash
git clone https://github.com/hawkongz/dsh-chat-locator.git
cd dsh-chat-locator
dsh plugin --profile web add "$(pwd)"
dsh web
```

### Install without git

A bundle is four files. Download them into a folder, install the folder, and restart the host — nothing else is needed.

macOS / Linux:

```bash
mkdir -p ~/.dsh/plugin-src/dsh-chat-locator
cd ~/.dsh/plugin-src/dsh-chat-locator
curl -fsSLO https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main/package.json
curl -fsSLO https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main/index.js
curl -fsSLO https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main/client.js
curl -fsSLO https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main/cordis.patch.yml
dsh plugin --profile web add ~/.dsh/plugin-src/dsh-chat-locator
```

Windows (PowerShell):

```powershell
$dir  = "$env:USERPROFILE\.dsh\plugin-src\dsh-chat-locator"
$base = "https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($file in "package.json", "index.js", "client.js", "cordis.patch.yml") {
  Invoke-WebRequest -Uri "$base/$file" -OutFile "$dir\$file"
}
dsh plugin --profile web add "$dir"
```

Then restart the host:

```bash
dsh web
```

### Notes on installation

- **DSH registers the bundle for you.** A package that declares `dsh.bundle.patch` is added to your profile's `dsh.profile.bundles` list automatically, so `dsh plugin add` is the only step.
- **There is no build step.** pnpm may print a note about blocked build scripts for git-hosted packages; this plugin has no `prepare` script and no dependencies, so there is nothing to allow.
- **Restart the host after installing or removing.** See [How It Works](#-how-it-works) for why.
- **Installation is per profile.** `--profile web` is the profile this plugin was developed against; substitute your own.

## 📖 Usage

Everything lives on one settings page: **Settings → 对话定位条**. The table below lists each control with its default and range.

### Where settings live

Settings are stored in **this browser's local storage** (key `dsh.chat-locator.settings`), written the moment you change a value:

- They survive closing and restarting the browser, and refreshing DSH Web.
- They do **not** sync across browsers, profiles, or machines — each browser keeps its own copy.
- Clearing the site's data (or using a private window, or another browser) starts from factory values again.
- Since 1.4.0 the plugin no longer reads the DSH settings document, so any `chat-locator:` section left there by 1.3.0 or older is ignored. After upgrading, the first run shows factory values.

| Setting | Default | Range | What it does |
| :--- | :--- | :--- | :--- |
| Show the locator rail<br>`显示对话定位条` | On | On / Off | Hides the whole rail. Turn jumping and unloaded-turn paging are unaffected. |
| Length gradient<br>`长度渐变` | On | On / Off | The curved taper that lengthens the hovered tick and its neighbours. Off returns every tick to its built-in width — the rail, jumping, paging, and the preview are untouched. |
| Tick thickness<br>`横线粗细` | 2px | 1–8px | The line width of each turn's tick. Tick spacing stays at 10px, so 8px is the practical ceiling. |
| Rail side<br>`轨道位置` | Right | Left / Right | Which edge of the conversation area the rail hugs. The hover preview opens on the opposite side automatically. |
| Preview line count<br>`预览正文行数` | 3 | 1–6 | How many lines of the response to show. The card grows with the content; only the overflow is clipped. |
| Preview font size<br>`预览字号` | 12px | 10–18px | The card's font size. Line height scales with it at 1.5x, and the card height is computed from the same line height, so larger text is never clipped. |
| Preview card width<br>`预览框宽度` | 300px | 200–420px | The card's width. It keeps the built-in container clamp, so it shrinks automatically in a narrow window. |
| Restore defaults<br>`恢复默认` | — | — | Resets all seven settings to their factory values. Disabled when everything is already at its default. |

### The length gradient

The tick you point at is the longest, and the ticks around it taper away along a curve:

| Distance from the hovered tick | 0 | ±1 | ±2 | ≥3 |
| :--- | :--- | :--- | :--- | :--- |
| Width | **32px** | 21px | 14px | 12px |
| Drop per step | — | 11px | 7px | 2px |

The adjacent tick gives up the most width, then progressively less, flattening out as it rejoins the rail. The width table is generated from `12 + 20 * (1 - d/3)^2`, and `docs/design-notes.md` records how the exponent was tuned (2.5 was a cliff, 1.5 left the neighbours too long, 2.0 is the compromise in use). The gradient anchors on the hovered tick, and the neighbour rules carry `:not(.P_markActive)` so the active turn's tick keeps its built-in width even when it sits one or two ticks from the pointer; the whole taper disappears the moment the pointer leaves. Unlike the hover preview (which has no switch, because a rail you cannot preview is not a rail), the gradient is decorative and has its own settings row; switching it off also drops the frame widening, since there is no 32px peak to make room for.

### Troubleshooting

The plugin ships one debug hook. Run it in the browser console:

```js
__dshChatLocator.state()
// {
//   railPrefix: 'eGxaPq', railFound: true, rules: '…',
//   config: { … }
// }
```

| What you see | What it means |
| :--- | :--- |
| `railPrefix: null` | The rail is not rendered in this view — fewer than two turns, or a non-conversation view. Nothing is broken. |
| Settings do not survive a browser restart | They are kept in this browser's local storage. Another browser, a private window, or cleared site data starts from factory values — there is no cross-device sync. |
| Values you set in 1.3.0 or older are gone | Since 1.4.0 settings live in the browser only; the `chat-locator:` section of the DSH settings document is no longer read. Set them once more on the settings page. |

## 🧠 How It Works

Three constraints shaped the implementation, and each one is documented in full — with the experiments behind it — in **[docs/design-notes.md](docs/design-notes.md)**.

1. **The rail is claimed, not redrawn.** It sits in no Slot, so a replacement would have to re-implement turn jumping, unloaded-turn paging, and active-turn following. Instead the plugin discovers the CSS Module prefix at runtime (looking for a `<prefix>_frame` that contains a `<prefix>_mark`) and injects one owned stylesheet of `!important` overrides. If upstream renames those classes, the plugin goes quiet rather than breaking the rail.
2. **Settings live in the browser, not in a host half.** Up to 1.3.0 the host half registered a `chat-locator` namespace in the DSH settings document and the browser half bound to it. dsh 0.1.7 removed the client `settingsScope` service, so since 1.4.0 the browser half builds its own scope on `createSnapshotStore` from `@deepseek-ai/dsh-client-store`, persisted to local storage under `dsh.chat-locator.settings`. The trade-off is deliberate: settings survive browser restarts but no longer sync across browsers or machines, and anything stored in the DSH settings document by older versions is ignored. `index.js` remains as a no-op stub because the patch row resolves to it — see [docs/design-notes.md](docs/design-notes.md).
3. **The preview stays plain text.** The card is the built-in one, built from the built-in turn outline and only from text blocks, so thinking content cannot reach it and whitespace runs are collapsed. The plugin does not read or rewrite that text; its CSS only decides how many lines are shown, the font size, the width, and which side the card opens to.

Known boundaries — the upstream class-name contract, the 900px container cutoff, the 8px interaction strip the widened clip box adds — are listed in the same document.

## 📌 Topics

[`dsh`](https://github.com/topics/dsh) [`dsh-plugin`](https://github.com/topics/dsh-plugin) [`deepseek-harness`](https://github.com/topics/deepseek-harness) [`cordis`](https://github.com/topics/cordis) [`cordis-plugin`](https://github.com/topics/cordis-plugin) [`web-ui`](https://github.com/topics/web-ui) [`conversation-navigation`](https://github.com/topics/conversation-navigation) [`css-injection`](https://github.com/topics/css-injection)

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). There is nothing to install: clone the repository and run `node test/verify-client.mjs` to get all 127 assertions.

Bug reports and feature requests are welcome — the templates ask for the `__dshChatLocator.state()` output, which answers most triage questions in one paste.

## 📄 License

[MIT](LICENSE)
