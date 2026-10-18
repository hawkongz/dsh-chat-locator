<div align="center">
  <h1>dsh-chat-locator</h1>
  <p>Turn-rail settings for DSH: tick thickness, rail side, and a curved length gradient anchored on the hovered tick — plus a plain-text hover preview whose line count, font size, and width you control.</p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
  ![Platform](https://img.shields.io/badge/Platform-DSH-lightgrey)
  [![Node.js](https://img.shields.io/badge/Node.js-339933)](https://nodejs.org)
  [![Stars](https://img.shields.io/github/stars/hawkongz/dsh-chat-locator)](https://github.com/hawkongz/dsh-chat-locator)
  [![npm downloads](https://img.shields.io/npm/dt/dsh-chat-locator)](https://www.npmjs.com/package/dsh-chat-locator)
  [![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com/p/hawkongz/dsh-chat-locator/)
  [![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)

  <p><strong>Language:</strong> <a href="README.md">简体中文</a> | English</p>
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

DSH draws a turn rail down the edge of every conversation: one tick per turn, so you can see where you are in a long session and jump between turns. It is a good rail with three opinions baked into it. Ticks are always 2px. The rail always sits on the right. And pointing at a tick tells you nothing about what that turn contains, so finding a specific turn in a long conversation means hovering ticks one at a time.

None of that is configurable. The rail is rendered directly by `ChatView` inside `@deepseek-ai/dsh-client-ui-chat`; the Slot system gives it no seat, and no setting for thickness or side is exposed anywhere.

`dsh-chat-locator` is a persistent DSH plugin that turns those fixed opinions into settings. It does not replace the rail — it claims the rail's styles at runtime, so the built-in jump-to-turn, unloaded-turn paging, and active-turn following all keep working exactly as before.

## ✨ Features

- **Tick thickness (横线粗细):** 1–8px instead of a fixed 2px. Only the line width changes; the 10px tick spacing stays put.
- **Rail side (轨道位置):** Left or right. The hover preview automatically opens on the opposite side, so it never covers the text you are reading.
- **Hover preview:** The built-in plain-text card showing that turn's prompt and response. The plugin does not build it and never reads the text — it only styles the card: line count, font size, width, how tall it may grow, and which side it opens to. The built-in plain-text rendering (which never includes thinking content) is left alone.
- **Preview line count (预览正文行数):** 1–6 lines. The card really grows — only the overflow is clipped.
- **Preview font size and width (预览字号 / 预览框宽度):** 10–18px and 200–420px. Font size and line height scale as a pair, so enlarging the text never crowds or clips it.
- **A curved length gradient:** The tick under the pointer grows to 32px and its neighbours taper back along a curve — `21 / 14 / 12` — so the rail reads as a hook pointing at where you are, not as a straight diagonal.

  The hovered tick is the anchor even when it is the active turn, and the neighbour rules skip the active tick, so an active turn one or two ticks away keeps its built-in width. The gradient has its own switch: off returns the ticks to their built-in lengths (12px normally, 18px on the hovered tick) and changes nothing else.
- **Restore defaults (恢复默认):** All seven settings back to factory values in one click. Only deviations from the factory values are stored, so the button is greyed out exactly when there is nothing to clear; clearing takes one write and also drops keys left behind by older versions.
- **A dedicated settings page:** Settings → Conversation locator (对话定位条 in the Chinese UI), with a live sample rail and sample preview card that redraw as you change each value.
- **No bundled dependencies, no build step.** Both halves are plain ESM loaded directly by Node and the browser; React, Cordis, and the DSH client modules come from the host, and the only dependency declarations are optional peer dependencies.

## 🚀 Quick Start

Pick one: the web UI takes a command, the desktop app takes a few clicks.

### Web UI

> What you need: a DSH install with the `dsh` command, a profile, and Node.js 20+.

**Step 1 — Open a terminal**

- macOS / Linux: open Terminal.
- Windows: press `Win + R`, type `powershell`, and press Enter.

**Step 2 — Install the bundle into your profile**

`dsh plugin` forwards its arguments to pnpm inside the profile directory, so this installs the package from npm and DSH picks up its patch automatically. Replace `web` with your own profile name if it differs.

```bash
dsh plugin --profile web add dsh-chat-locator
```

To pin an exact version instead of tracking new releases, append it: `dsh plugin --profile web add dsh-chat-locator@1.5.1`

That is the whole install. A DSH plugin bundle is four files:

| File | Role |
| :--- | :--- |
| `package.json` | Declares the bundle and the browser half |
| `index.js` | Host half — a no-op stub since 1.4.0 |
| `client.js` | Browser half — all the behaviour |
| `cordis.patch.yml` | The patch that adds the plugin row |

There is nothing to compile and no bundled dependency to install. The published package also ships this English README and the [Chinese `README.md`](README.md), `docs/design-notes.md` and its `zh-CN/docs/design-notes.md` translation, the screenshots in `docs/images/`, `CONTRIBUTING.md`, `SECURITY.md`, and `test/`.

**Step 3 — Restart the host**

```bash
dsh web
```

The host process caches imported modules, so a newly installed or removed bundle is not mounted until the host restarts once — restarting is the reliable path. Current DSH builds can hot-compose client entries, so re-enabling an already-installed bundle sometimes takes effect after a page refresh; installing a new one still needs the restart.

**Step 4 — Done.** With DSH open at `http://127.0.0.1:3080`, you are finished if:

- **Settings → Conversation locator** (对话定位条 in the Chinese UI) appears in the settings sidebar, and
- in the browser console, this returns `railFound: true` on a conversation with at least two turns:

```js
__dshChatLocator.state()
```

Open a conversation and slide the pointer up and down the rail: the tick under the pointer grows and its neighbours taper.

> To update: run `dsh plugin --profile web update dsh-chat-locator`, then restart the host. To uninstall: `dsh plugin --profile web remove dsh-chat-locator`, then restart the host.
>
> **Want the newest unreleased commit, a local copy you can edit, or an offline install?** See [Install methods](#install-methods).

### Desktop

Sidebar **Plugins** → **Add plugin**, enter `dsh-chat-locator`, click **Install**, then quit the app completely and open it again.

![Desktop "Add plugin"](https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main/docs/images/desktop-add-plugin.png)

With the **plugin market** installed, you can also search `dsh-chat-locator` under **Discover** and install it there:

![Searching for dsh-chat-locator in the plugin market](https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main/docs/images/desktop-plugin-market.png)

To uninstall: sidebar **Plugins** → **Installed plugins** → **Uninstall**, then quit and reopen.

## 📦 Installation

### Requirements

| Requirement | Version | Notes |
| :--- | :--- | :--- |
| DSH | 0.2.x (verified on 0.2.1-rc.2) | Provides the `dsh` command and the profile you install into. The rail selector contract has been stable since 0.1.7, but 1.5.0 was developed and verified against DSH 0.2.1-rc.2. The browser half needs the host-provided `@deepseek-ai/dsh-client-store` module (declared in `dsh.client`). |
| Node.js | 20 or newer | Used by the host half and the test suite. |
| A modern browser | current Chromium, Firefox, or Safari | The gradient uses `:is()` and `:has()`. Without `:has()` only the half of the taper *above* the pointer is lost — the hovered tick still lengthens and the ticks below it still taper. Everything else works. |

### Install methods

| Method | Best for |
| :--- | :--- |
| Web UI: `dsh plugin --profile web add dsh-chat-locator` | Most users. Installs the released version from npm; append `@1.5.1` to pin an exact one. |
| Desktop: **Plugins** → **Add plugin** in the app | Desktop app users. No terminal, no pnpm — see [Desktop](#desktop). |
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
- **There is no build step.** pnpm may print a note about blocked build scripts for git-hosted packages; this plugin has no `prepare` script and no bundled dependencies, so there is nothing to allow.
- **Restart the host after installing or removing.** See [How It Works](#-how-it-works) for why.
- **Installation is per profile.** `--profile web` is the profile this plugin was developed against; substitute your own.

## 📖 Usage

Everything lives on one settings page: **Settings → Conversation locator** (对话定位条 in the Chinese UI). The table below lists each control with its default and range.

![The plugin's settings page, Settings → Conversation locator](https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main/docs/images/settings-page.png)

<sub>**Settings → Conversation locator** (Chinese UI shown — the plugin ships both locales). Every row is live: the sample rail and sample card redraw as you change a value. The numbers above are one user's picks; the defaults are in the table below.</sub>

### Where settings live

Settings are stored in **this browser's local storage** (key `dsh.chat-locator.settings`), written the moment you change a value:

- They survive closing and restarting the browser, and refreshing DSH.
- They do **not** sync across browsers, profiles, or machines — each browser keeps its own copy.
- Clearing the site's data (or using a private window, or another browser) starts from factory values again.
- Since 1.4.0 the plugin no longer reads the DSH settings document, so any `chat-locator:` section left there by 1.3.0 or older is ignored. After upgrading, the first run shows factory values.

| Setting | Default | Range | What it does |
| :--- | :--- | :--- | :--- |
| Show the locator rail<br>`显示对话定位条` | On | On / Off | Hides the whole rail. Turn jumping and unloaded-turn paging are unaffected. |
| Length gradient<br>`长度渐变` | On | On / Off | The curved taper that lengthens the hovered tick and its neighbours. Off returns the ticks to their built-in lengths (12px normally, 18px on the hovered tick); the rail, jumping, paging, and the preview are untouched. |
| Tick thickness<br>`横线粗细` | 2px | 1–8px | The line width of each turn's tick. Tick spacing stays at 10px, so 8px is the practical ceiling. |
| Rail side<br>`轨道位置` | Right | Left / Right | Which edge of the conversation area the rail hugs. The hover preview opens on the opposite side automatically. |
| Preview line count<br>`预览正文行数` | 3 | 1–6 | How many lines of the response to show. The card grows with the content; only the overflow is clipped. |
| Preview font size<br>`预览字号` | 12px | 10–18px | The card's font size. Line height scales with it at 1.5×, and the card height counts both the prompt and body line heights — 100px at 12px / 3 lines, 148px at 16px / 4 lines, 217px at 18px / 6 lines — so larger text is never clipped. |
| Preview card width<br>`预览框宽度` | 300px | 200–420px | The card's width. It keeps the built-in container clamp, so it shrinks automatically in a narrow window. |
| Restore defaults<br>`恢复默认` | — | — | Back to factory values. Only deviations are ever stored, so the button is greyed out exactly when there is nothing to clear; clearing is one write and also drops keys left by older versions. |

### The length gradient

The tick you point at is the longest, and the ticks around it taper away along a curve:

| Distance from the hovered tick | 0 | ±1 | ±2 | ≥3 |
| :--- | :--- | :--- | :--- | :--- |
| Width | **32px** | 21px | 14px | 12px |
| Drop per step | — | 11px | 7px | 2px |

![The rail with the pointer on a tick: the hovered tick at full length, its neighbours tapering](https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main/docs/images/rail-gradient.png)

<sub>The rail with the pointer on a tick: the white anchor is at its 32px peak, the two ticks either side step back to 21px and 14px, and the rest keep the built-in width.</sub>

The adjacent tick gives up the most width, then progressively less, flattening out as it rejoins the rail. The table is generated from `12 + 20 * (1 - d/3)^2`; `docs/design-notes.md` records how the exponent was tuned (2.5 read as a cliff, 1.5 left the neighbours too long, 2.0 is the compromise in use).

Two details worth knowing:

- **The active turn can anchor the taper.** The rule is `:is(.<prefix>_markPreview, .<prefix>_mark:hover)`, and the built-in rail marks a tick as either *active* or *previewed*, never both — so without the `:hover` half the taper vanished whenever you pointed at the turn you were on.
- **The active turn is never resized as a neighbour.** Every neighbour selector carries `:not(.P_markActive)`, so an active tick one or two places from the pointer keeps its built-in width.

The taper disappears the moment the pointer leaves. Unlike the hover preview — which has no switch, because a rail you cannot preview is not a rail — the gradient is decorative and gets its own settings row; switching it off also drops the frame widening, since there is no 32px peak to make room for.

### Troubleshooting

The plugin ships one debug hook. Run it in the browser console:

```js
__dshChatLocator.state()
// {
//   railPrefix: 'xpvNua', railFound: true, rules: '…',
//   config: { … }
// }
```

The prefix is the CSS Module hash of your DSH build — `xpvNua` is what DSH 0.2.1-rc.2 uses — and nothing depends on the value. The hook reports `railPrefix: null` whenever the rail is unmounted.

| What you see | What it means |
| :--- | :--- |
| `railPrefix: null` | The rail is not rendered in this view — fewer than two turns, or a non-conversation view. Nothing is broken. |
| Settings do not survive a browser restart | They are kept in this browser's local storage. Another browser, a private window, or cleared site data starts from factory values — there is no cross-device sync. |
| Installed on the desktop app but there is no settings page | Quit the app completely and reopen (closing the window is not enough), then check sidebar **Plugins** → **Installed plugins**. |
| Values you set in 1.3.0 or older are gone | Since 1.4.0 settings live in the browser only; the `chat-locator:` section of the DSH settings document is no longer read. Set them once more on the settings page. |

## 🧠 How It Works

Three constraints shaped the implementation, and each one is documented in full — with the experiments behind it — in **[docs/design-notes.md](docs/design-notes.md)**.

1. **The rail is claimed, not redrawn.** It sits in no Slot, so a replacement would have to re-implement turn jumping, unloaded-turn paging, and active-turn following. Instead the plugin finds the rail's CSS Module prefix in the live DOM and injects one owned stylesheet of `!important` overrides. If upstream renames those classes, the plugin goes quiet rather than breaking the rail.

   How the prefix is found: look for a whitespace-separated class token ending in `_frame` whose prefix is a safe CSS identifier, then require a `<prefix>_mark` child. Nothing depends on the literal value.

2. **Settings live in the browser, not in a host half.** Up to 1.3.0 the host half registered a `chat-locator` namespace in the DSH settings document and the browser half bound to it. DSH 0.1.7 removed the client `settingsScope` service, so since 1.4.0 the browser half builds its own store on `createSnapshotStore` from `@deepseek-ai/dsh-client-store`, persisted under the local storage key `dsh.chat-locator.settings`.

   The trade-off is deliberate: settings survive browser restarts but no longer sync across browsers or machines, and anything older versions wrote into the DSH settings document is ignored. `index.js` stays as a no-op stub because the patch row resolves to it — see [docs/design-notes.md](docs/design-notes.md).

3. **The preview stays plain text.** The card is the built-in one, built from the built-in turn outline and only from text blocks, so thinking content cannot reach it and whitespace runs are collapsed.

   The plugin does not read or rewrite that text. Its CSS only decides how many lines are shown, the font size, the width, the height, and which side the card opens to.

Known boundaries — the upstream class-name contract, the 900px container cutoff, the 8px interaction strip the widened clip box adds — are listed in the same document.

## 📌 Topics

[`dsh`](https://github.com/topics/dsh) [`dsh-plugin`](https://github.com/topics/dsh-plugin) [`deepseek-harness`](https://github.com/topics/deepseek-harness) [`cordis`](https://github.com/topics/cordis) [`cordis-plugin`](https://github.com/topics/cordis-plugin) [`web-ui`](https://github.com/topics/web-ui) [`conversation-navigation`](https://github.com/topics/conversation-navigation) [`css-injection`](https://github.com/topics/css-injection)

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). There is nothing to install: clone the repository and run `node test/verify-client.mjs` to get all 151 assertions, or `npm test` to syntax-check both halves first.

Bug reports and feature requests are welcome — the templates ask for the `__dshChatLocator.state()` output, which answers most triage questions in one paste.

This plugin is listed on the community-curated **Awesome DSH Plugin** list: [hawkongz/dsh-chat-locator](https://awesome-dsh-plugin.com/p/hawkongz/dsh-chat-locator/) (list source [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin), entry file `data/plugins/hawkongz__dsh-chat-locator.yml`).

## 📄 License

[MIT](LICENSE)
