/**
 * dsh-chat-locator —— 宿主半侧（0.1.7 起为最小空桩）。
 *
 * 这个文件曾经只做一件事：在 DSH 用户设置文档里注册 `chat-locator` 命名空间，
 * 让浏览器半侧的 `ctx.settingsScope.bind({ namespace: 'chat-locator' })` 有一个
 * 可读可写、可持久化的作用域。
 *
 * dsh 0.1.7 移除了客户端 `settingsScope` 服务（设置持久化改走 remote.settings
 * 体系），浏览器半侧随之改为在本地存储上自建同形作用域
 * （见 `./client.js` 的 `createLocalSettingsScope()`，键
 * `dsh.chat-locator.settings`）。宿主半侧的注册从此无人读取 —— 设置不再进
 * DSH 设置文档，`~/.dsh/settings.yaml` 里遗留的 `chat-locator:` 段会被忽略，
 * 首次升级后用户看到的是出厂值。这是可接受的行为变化，README 与设计说明
 * 都已写明。
 *
 * 文件本身**不能删**：`cordis.patch.yml` 里 `name: 'dsh-chat-locator'` 解析到
 * 本包入口（`main: ./index.js`），删掉它整行插件都会挂不上。所以这里保留一个
 * 什么都不做的桩，让 patch 行照常解析、插件照常挂载。
 *
 * 视觉与交互全部在浏览器半侧 `./client.js`：宿主半侧不注入任何工具、命令或
 * 提示词，也不注册任何设置命名空间。
 *
 * @module dsh-chat-locator
 */

/**
 * 挂载即无事可做（0.1.7 起设置不再经过宿主设置文档）。
 * @param ctx - 宿主根上下文。
 */
function apply(ctx) {
	// 刻意留空：宿主半侧在 0.1.7 起不再承担任何职责。
}

export { apply };
