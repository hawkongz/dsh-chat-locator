/**
 * dsh-chat-locator —— 宿主半侧（空桩）。
 *
 * cordis.patch.yml 的插件行按包入口（package.json 的 main）解析，删掉这个文件，
 * 整行插件都挂不上，所以它必须存在。但 1.4.0 起宿主侧没有任何职责：设置持久化
 * 全部在浏览器半侧（client.js 的 createSettingsPolicy），宿主不注册设置命名空间、
 * 不注入工具 / 命令 / 提示词。
 *
 * 视觉与交互全部在 ./client.js。
 *
 * @module dsh-chat-locator
 */

/**
 * 挂载即无事可做。
 * @param ctx - 宿主根上下文。
 */
function apply(ctx) {
	// 刻意留空：宿主半侧不承担任何职责。
}

export { apply };
