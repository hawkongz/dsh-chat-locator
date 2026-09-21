<div align="center">
  <h1>dsh-chat-locator · 对话定位条</h1>
  <p>DSH Web 轮次轨道的配置插件：刻度粗细、轨道左右侧、锚在悬停那根的曲线长度渐变，以及行数 / 字号 / 宽度都可调的纯文本悬停预览。</p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
  ![Platform](https://img.shields.io/badge/Platform-DSH%20Web-lightgrey)
  [![Node.js](https://img.shields.io/badge/Node.js-339933)](https://nodejs.org)
  [![Stars](https://img.shields.io/github/stars/hawkongz/dsh-chat-locator)](https://github.com/hawkongz/dsh-chat-locator)

  <p><strong>语言：</strong> <a href="../README.md">English</a> | <a href="README.md">简体中文</a></p>
</div>

---

## 📋 目录

- [功能特性](#-功能特性)
- [快速开始](#-快速开始)
- [安装](#-安装)
- [使用方法](#-使用方法)
- [实现要点](#-实现要点)
- [标签](#-标签)
- [贡献指南](#-贡献指南)
- [许可证](#-许可证)

---

DSH Web 会沿对话区边缘画一条轮次轨道：每轮对话一枚刻度，让你在长会话里看得见位置、跳得动轮次。这条轨道做得不错，但它把三个主张钉死在代码里 —— 刻度永远是 2px；轨道永远在右侧；把指针搁在刻度上，它不会告诉你那一轮讲了什么。于是想在一次长对话里找回某一轮，只能一根一根地悬停过去。

这三件事都没有开关。轨道由 `@deepseek-ai/dsh-client-ui-chat` 的 `ChatView` 直接渲染，Slot 系统没有给它留座位，界面上也没有任何地方暴露粗细与轨道侧的设置。

`dsh-chat-locator` 是一个持久插件，把这些钉死的主张变成设置项。它**不替换**轨道 —— 而是在运行时认领轨道的样式，所以内置的跳转轮次、未加载轮分页与活跃轮跟随全都照旧工作。

## ✨ 功能特性

- **横线粗细：** 1–8px，不再是固定的 2px。只改线宽，10px 的刻度间距原样不动。
- **轨道位置：** 左侧或右侧。悬停预览会自动改到另一侧展开，所以永远不会遮住你正在读的正文。
- **悬停预览：** 一张纯文本卡片，显示该轮的提示词与回复。思考内容进不去；空白串被折叠，所以不可能出现空白行；长文本按预算加省略号截断。
- **预览正文行数：** 1–6 行。卡片真的会跟着变高 —— 只有超出的部分被裁掉。
- **预览字号与预览框宽度：** 10–18px 与 200–420px。字号与行高成对放大，所以放大文字既不会挤在一起，也不会被裁掉。
- **曲线长度渐变：** 指针下那根长到 32px，两侧沿曲线收回 —— `21 / 14 / 12` —— 整条轨道读起来是一个指向你所在位置的弯钩，而不是一截直斜线。
- **恢复默认：** 六项一键回到出厂值，走的是逐字段 `unset`，而不是把默认值再写一遍。
- **独立设置页：** 设置 → 对话定位条，页内带一条实时小样轨道与示例预览卡，改哪一项它就变哪一项。
- **零依赖、无构建步骤。** 两个半侧都是纯 ESM，由 Node 与浏览器直接加载。

## 🚀 快速开始

> **前置条件：** 一份可用的 DSH 安装（有 `dsh` 命令）和一个 profile，外加 Node.js 20 或更新版本。插件本身没有依赖需要安装。

**第一步 — 打开终端**

- macOS / Linux：打开终端（Terminal）。
- Windows：按 `Win + R`，输入 `powershell`，回车。

**第二步 — 把 bundle 装进你的 profile**

`dsh plugin` 会把参数转发给 profile 目录里的 pnpm，于是这个包会从 npm 装上，DSH 自动读到它的 patch。如果你的 profile 不叫 `web`，换成你自己的名字。

```bash
dsh plugin --profile web add dsh-chat-locator
```

想锁死某个版本、不跟新版本走，就带上版本号：`dsh plugin --profile web add dsh-chat-locator@1.2.0`

装完就完了。这个包就是一个 DSH 插件 bundle 需要的四个文件 —— `package.json`（声明 bundle 与浏览器半侧）、`index.js`（宿主半侧）、`client.js`（浏览器半侧）、`cordis.patch.yml`（把插件行插进配置树的 patch）—— 没有东西要编译，也没有依赖要装。

**第三步 — 重启宿主**

```bash
dsh web
```

宿主进程会缓存已导入的模块，所以新装的 bundle 要等宿主重启一次才会挂载。

**第四步 — 完成。** 打开 DSH Web（`http://127.0.0.1:3080`），满足下面两条就算装好了：

- 设置侧栏里出现了 **对话定位条**；
- 在一个至少两轮的对话里，浏览器控制台执行下面这行返回 `railFound: true`：

```js
__dshChatLocator.state()
```

打开任意对话，把指针沿轨道上下滑一次：指针下那根会变长，两侧依次收回。

> 以后想更新：执行 `dsh plugin --profile web update dsh-chat-locator`，再重启宿主。卸载：`dsh plugin --profile web remove dsh-chat-locator`，然后重启宿主。
>
> **想跟仓库最新代码、要一份能自己改的本地副本，或者要离线安装？** 见[安装方式](#安装方式)。

## 📦 安装

### 环境要求

| 项目 | 版本 | 说明 |
| :--- | :--- | :--- |
| DSH | 11.x | 提供 `dsh` 命令，以及你要装进去的那个 profile。 |
| Node.js | 20 或更新 | 宿主半侧与测试套件用它。 |
| 支持 `:has()` 的浏览器 | Chromium 105+ | 不支持时只是长度渐变不生效，其余功能照常。 |

### 安装方式

| 方式 | 适合谁 |
| :--- | :--- |
| `dsh plugin --profile web add dsh-chat-locator` | 大多数人。从 npm 装已发布的版本；带 `@1.2.0` 可以锁死具体版本。 |
| `dsh plugin --profile web add github:hawkongz/dsh-chat-locator` | 想直接跟 `main` 上最新提交、又不想手动 clone。锁的是 commit，不是版本号。 |
| [用 git clone 安装](#用-git-clone-安装) | 要改这个插件本身。 |
| [下载四个文件后安装](#不用-git-安装) | 访问不到 npm 或 GitHub，或者要离线安装。 |

### 用 git clone 安装

如果你想用 `git pull` 更新，而不是每次重下文件，走这条路。

```bash
git clone https://github.com/hawkongz/dsh-chat-locator.git
cd dsh-chat-locator
dsh plugin --profile web add "$(pwd)"
dsh web
```

### 不用 git 安装

一个 bundle 就是四个文件。把它们下到一个文件夹里、装这个文件夹、重启宿主，除此之外没有别的步骤。

macOS / Linux：

```bash
mkdir -p ~/.dsh/plugin-src/dsh-chat-locator
cd ~/.dsh/plugin-src/dsh-chat-locator
curl -fsSLO https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main/package.json
curl -fsSLO https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main/index.js
curl -fsSLO https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main/client.js
curl -fsSLO https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main/cordis.patch.yml
dsh plugin --profile web add ~/.dsh/plugin-src/dsh-chat-locator
```

Windows（PowerShell）：

```powershell
$dir  = "$env:USERPROFILE\.dsh\plugin-src\dsh-chat-locator"
$base = "https://raw.githubusercontent.com/hawkongz/dsh-chat-locator/main"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($file in "package.json", "index.js", "client.js", "cordis.patch.yml") {
  Invoke-WebRequest -Uri "$base/$file" -OutFile "$dir\$file"
}
dsh plugin --profile web add "$dir"
```

然后重启宿主：

```bash
dsh web
```

### 安装说明

- **DSH 会自动登记 bundle。** 声明了 `dsh.bundle.patch` 的包会被写进 profile 的 `dsh.profile.bundles` 列表，所以 `dsh plugin add` 就是全部步骤。
- **没有构建步骤。** 从 git 托管地址安装时 pnpm 可能提示构建脚本被拦；本插件既没有 `prepare` 脚本也没有依赖，所以没有任何需要放行的东西。
- **安装与卸载之后都要重启宿主。** 原因见[实现要点](#-实现要点)。
- **安装是按 profile 生效的。** `--profile web` 是这个插件开发时用的 profile，换成你自己的即可。

## 📖 使用方法

所有配置都在一个页面里：**设置 → 对话定位条**。下表列出每个控件、默认值与可选范围。

| 配置项 | 默认 | 范围 | 作用 |
| :--- | :--- | :--- | :--- |
| 显示对话定位条 | 开 | 开 / 关 | 隐藏整条轨道。跳转轮次与未加载轮分页不受影响。 |
| 横线粗细 | 2px | 1–8px | 每轮那根刻度的线宽。刻度间距固定 10px，所以 8px 是实际上限。 |
| 轨道位置 | 右侧 | 左侧 / 右侧 | 轨道贴对话区哪一侧。悬停预览会自动改到另一侧展开。 |
| 预览正文行数 | 3 | 1–6 | 回复预览最多显示几行。卡片跟着内容变高，只有超出的部分被裁掉。 |
| 预览字号 | 12px | 10–18px | 卡片文字的字号。行高按 1.5 倍同步放大，卡片高度也用同一套行高算，所以放大不会被裁掉。 |
| 预览框宽度 | 300px | 200–420px | 卡片宽度。沿用内置的容器夹取，窗口窄时自动收缩。 |
| 恢复默认 | — | — | 把上面各项一键恢复出厂值。已经是默认值时按钮置灰。 |

### 长度渐变

你指向的那根最长，两侧沿曲线依次收回：

| 距悬停处 | 0 | ±1 | ±2 | ≥3 |
| :--- | :--- | :--- | :--- | :--- |
| 宽度 | **32px** | 21px | 14px | 12px |
| 每格递减 | — | 11px | 7px | 2px |

紧挨悬停那格掉得最多，之后越来越缓，最后贴着轨道收尾。宽度表由 `12 + 20 * (1 - d/3)^2` 算出，幂次是怎么调出来的记在 [设计说明](docs/design-notes.md)里（2.5 像断崖，1.5 邻居偏长，2.0 是现在用的折中）。渐变锚在悬停那根 —— 当前轮的刻度宽度不被改写 —— 指针移开即恢复。

### 排障

插件只带一个排障钩子，在浏览器控制台执行：

```js
__dshChatLocator.state()
// {
//   railPrefix: 'eGxaPq', railFound: true, rules: '…',
//   config: { … },
//   settingsStatus: { status: 'ready', writable: true, unsupported: [] }
// }
```

| 看到什么 | 说明 |
| :--- | :--- |
| `railPrefix: null` | 当前视图还没渲染轨道 —— 不足两轮、容器窄于 900px，或不是会话视图。没有出错。 |
| `settingsStatus.status !== 'ready'` | 宿主设置命名空间没读上。检查宿主半侧是否加载。 |
| `settingsStatus.unsupported` 非空 | 运行中的宿主进程还没注册这些字段，它们只在本次会话生效。重启 `dsh web` 后插件会自动补写。 |

## 🧠 实现要点

三条约束决定了实现方式，每一条的完整推演 —— 连同背后的实验 —— 都记在 **[设计说明](docs/design-notes.md)** 里。

1. **认领轨道，而不是重画。** 它不在任何 Slot 里，重画一条就得重新实现跳转轮次、未加载轮分页与活跃轮跟随。所以插件在运行时发现 CSS Module 前缀（找含 `<前缀>_mark` 的 `<前缀>_frame`），只注入一张属于自己的 `!important` 覆盖样式表。上游若改掉这些类名，插件会安静失效，而不是把轨道弄坏。
2. **配置需要宿主半侧，而那个半侧有模块缓存。** 宿主注册 `chat-locator` 设置命名空间，浏览器半侧绑定上去。改 `index.js` 必须重启 `dsh web` 才生效，所以插件把「宿主还不认识的字段」留在本次会话、在设置页如实提示，等宿主补上字段后自动补写。
3. **预览保持纯文本。** 正文来自内置轮次大纲且只取文本块，所以思考内容进不去；空白串被折叠，所以不可能出现空白行。

已知边界 —— 与上游的类名约定、900px 的容器门槛、加宽裁剪盒带来的 8px 隐形交互带 —— 也都列在同一份文档里。

## 📌 标签

[`dsh`](https://github.com/topics/dsh) [`dsh-plugin`](https://github.com/topics/dsh-plugin) [`deepseek-harness`](https://github.com/topics/deepseek-harness) [`cordis`](https://github.com/topics/cordis) [`cordis-plugin`](https://github.com/topics/cordis-plugin) [`web-ui`](https://github.com/topics/web-ui) [`conversation-navigation`](https://github.com/topics/conversation-navigation) [`css-injection`](https://github.com/topics/css-injection)

## 🤝 贡献指南

见 [CONTRIBUTING.md](../CONTRIBUTING.md)。**没有任何东西需要安装**：克隆仓库后直接跑 `node test/verify-client.mjs`，就能拿到全部 115 项断言。

欢迎提 Bug 与需求 —— 模板里会要 `__dshChatLocator.state()` 的输出，一次粘贴就能回答大部分排查问题。

## 📄 许可证

本项目基于 [MIT](../LICENSE) 协议开源。
