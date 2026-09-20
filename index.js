/**
 * dsh-chat-locator —— 宿主半侧。
 *
 * 只做一件事：在 DSH 用户设置文档里注册 `chat-locator` 命名空间，
 * 让浏览器半侧的 `ctx.settingsScope.bind({ namespace: 'chat-locator' })`
 * 有一个可读可写、可持久化的作用域（schema 校验 + 默认值）。
 *
 * 之所以要有宿主半侧：客户端设置作用域只能派生自宿主已注册的命名空间，
 * 未注册的命名空间在 `describe()` 里没有视图，读写都会落空。
 * 这与 `@deepseek-ai/dsh-client-ui-chat` 注册 `ui-chat` 命名空间是同一写法。
 *
 * 与那份写法唯一的差别是**依赖取法**：这里没有裸导入
 * `import z from '@deepseek-ai/schemastery'`。用 `plugin_manager` 从工作区目录
 * 安装时，pnpm 记录的是 `link:<工作区目录>`，Node 会按包的真实路径解析依赖，
 * 于是裸导入找不到 profile 的 `node_modules`（实测 ERR_MODULE_NOT_FOUND，
 * 且整行插件都挂不上）。改为从「配置树基址」——也就是 profile 目录——按 Node
 * 自己的查找顺序解析 schemastery：link: 安装与普通拷贝安装都成立。
 *
 * 解析不到时插件照常挂载，只是设置段不注册：浏览器半侧会显示「设置文档不可用」
 * 的提示，刻度粗细 / 轨道侧 / 悬停预览仍可当场调整，只是不能持久化。
 *
 * 视觉与交互全部在浏览器半侧 `./client.js`：宿主半侧不注入任何工具、命令或提示词。
 *
 * @module dsh-chat-locator
 */
import { createRequire } from 'node:module';

/** 设置命名空间：写入 DSH 设置文档的 `chat-locator` 段。 */
const SETTINGS_NAMESPACE = 'chat-locator';

/** 提供 schema 的包名。 */
const SCHEMA_PACKAGE = '@deepseek-ai/schemastery';

/** 与浏览器半侧共享的默认值（schema 默认值就是这里的唯一真源）。 */
const DEFAULT_LOCATOR_SETTINGS = Object.freeze({
	/** 是否显示对话定位条。 */
	enabled: true,
	/** 刻度横线粗细（px）。 */
	thickness: 2,
	/** 轨道贴在对话区的哪一侧。 */
	side: 'right',
	/** 是否显示悬停预览。 */
	preview: true,
	/** 预览正文最多显示多少行。 */
	previewLines: 3,
	/** 预览卡里文字的字号（px）。 */
	previewFontSize: 12,
	/** 预览卡的宽度（px）。 */
	previewWidth: 300,
});

/** 刻度粗细的合法区间（px）。上限对齐刻度行高 10px，避免相邻刻度互相压住。 */
const THICKNESS_RANGE = Object.freeze([1, 8]);

/** 预览正文行数区间。 */
const PREVIEW_LINES_RANGE = Object.freeze([1, 6]);

/** 预览正文字号区间（px）。 */
const PREVIEW_FONT_RANGE = Object.freeze([10, 18]);

/** 预览卡宽度区间（px）；内置宽度是 300px。 */
const PREVIEW_WIDTH_RANGE = Object.freeze([200, 420]);

/** 轨道侧枚举。 */
const SIDES = Object.freeze(['right', 'left']);

/**
 * 按 profile 的 Node 查找顺序解析 schemastery。
 * @param ctx - 插件上下文；`baseUrl` 是配置树（profile 目录）的文件 URL。
 * @returns schemastery 模块，或解析不到时的 undefined。
 */
function loadSchemastery(ctx) {
	const anchors = [];
	for (const base of [ctx?.baseUrl, ctx?.root?.baseUrl]) {
		if (typeof base === 'string' && base !== '') anchors.push(base, base + 'package.json');
	}
	// 末位兜底：本包被真实拷贝进 profile/node_modules 时，按包自身位置向上查找即可命中。
	anchors.push(import.meta.url);
	for (const anchor of anchors) {
		try {
			const loaded = createRequire(anchor)(SCHEMA_PACKAGE);
			if (loaded !== undefined && loaded !== null) return loaded;
		} catch {
			// 换下一个锚点，全部失败才算解析不到。
		}
	}
	return undefined;
}

/**
 * 由 schemastery 构造持久化 schema；同时是浏览器作用域校验用的线格式。
 * @param z - schemastery 模块。
 * @returns 设置段的 schema。
 */
function locatorSettingsSchema(z) {
	return z.object({
		enabled: z.boolean().default(DEFAULT_LOCATOR_SETTINGS.enabled),
		thickness: z.natural().min(THICKNESS_RANGE[0]).max(THICKNESS_RANGE[1]).default(DEFAULT_LOCATOR_SETTINGS.thickness),
		side: z.union([...SIDES]).default(DEFAULT_LOCATOR_SETTINGS.side),
		preview: z.boolean().default(DEFAULT_LOCATOR_SETTINGS.preview),
		previewLines: z.natural().min(PREVIEW_LINES_RANGE[0]).max(PREVIEW_LINES_RANGE[1]).default(DEFAULT_LOCATOR_SETTINGS.previewLines),
		previewFontSize: z.natural().min(PREVIEW_FONT_RANGE[0]).max(PREVIEW_FONT_RANGE[1]).default(DEFAULT_LOCATOR_SETTINGS.previewFontSize),
		previewWidth: z.natural().min(PREVIEW_WIDTH_RANGE[0]).max(PREVIEW_WIDTH_RANGE[1]).default(DEFAULT_LOCATOR_SETTINGS.previewWidth),
	});
}

/**
 * 注册持久设置段；设置提供者缺席时保持挂起，不做任何事。
 * @param ctx - 宿主根上下文。
 */
function apply(ctx) {
	ctx.inject(['settings'], (settingsCtx) => {
		const z = loadSchemastery(ctx);
		if (z === undefined) {
			ctx.logger?.warn?.(`dsh-chat-locator: 无法解析 ${SCHEMA_PACKAGE}，设置命名空间 ${SETTINGS_NAMESPACE} 未注册（配置将无法持久化）`);
			return;
		}
		settingsCtx.settings.register(SETTINGS_NAMESPACE, locatorSettingsSchema(z));
	});
}

export {
	DEFAULT_LOCATOR_SETTINGS,
	PREVIEW_FONT_RANGE,
	PREVIEW_LINES_RANGE,
	PREVIEW_WIDTH_RANGE,
	SCHEMA_PACKAGE,
	SETTINGS_NAMESPACE,
	SIDES,
	THICKNESS_RANGE,
	apply,
	loadSchemastery,
	locatorSettingsSchema,
};
