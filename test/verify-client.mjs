/**
 * dsh-chat-locator 浏览器半侧的纯逻辑自检。
 *
 * 定位条的样式覆盖全部由两个纯函数决定 —— discoverRail（从活动 DOM 上认出内置轨道的
 * CSS Module 类名前缀）与 railStyleText（按配置生成覆盖规则）。页面里没有浏览器控制
 * 能力时，至少这两个函数必须被真机（Node）跑过，而不是只靠肉眼审阅。
 *
 * 做法：给 client.js 一个极简的 __ModuleLoader__ 桩以取得工厂，再用假 DOM 根调用
 * plugin.diagnostics 导出的纯函数；随后用桩服务 + 桩 DOM 跑一遍 apply 的真实路径。
 * 断言失败时以非零码退出。
 *
 * 用法：node test/verify-client.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
const PERSIST_KEY = 'dsh.chat-locator.settings';

const failures = [];
const check = (name, ok, detail) => {
	if (ok) {
		console.log('  ok   ' + name);
		return;
	}
	failures.push(name);
	console.log('  FAIL ' + name + (detail === undefined ? '' : ' — ' + detail));
};
const show = (value) => JSON.stringify(value);

// ---------------------------------------------------------------------------
// 沙箱桩：React、createSnapshotStore、DOM、MutationObserver、定时器、Date
// ---------------------------------------------------------------------------
const reactStub = {
	createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
	useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
};
let sandboxLocalStorage;
/**
 * 忠实桩：按 @deepseek-ai/dsh-client-store 的真实语义来，而不是「一个能用的 store」。
 *
 * 真实实现（DSH 0.2.1-rc.2 的 dsh-web-frontend 里的 createSnapshotStore）：
 *   set(value) => setState(deepFreeze(value), true)   // 深冻结入参
 *   setState 走 zustand：Object.is(next, state) 为真就直接 return
 *   persist => 订阅变更，把订阅回调收到的 state JSON 写回 localStorage
 * 三者叠加意味着「把 getSnapshot() 拿到的 state 原地改一改再 set 回去」既不通知也不落盘。
 * 早期桩 set() 永远 flush、永不冻结，正好把这个 bug 盖住了（1.5.0 收尾时踩过）。
 */
function deepFreeze(value) {
	if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
	Object.freeze(value);
	for (const key of Object.values(value)) deepFreeze(key);
	return value;
}
function createSnapshotStoreStub(initial, options) {
	let state = initial;
	const listeners = new Set();
	const name = options?.persist?.name;
	const storage = sandboxLocalStorage;
	const setState = (next) => {
		if (Object.is(next, state)) return; // zustand 的判等短路
		const previous = state;
		state = next;
		for (const listener of [...listeners]) {
			try {
				listener(state, previous);
			} catch (error) {
				console.error('[client-store]', error);
			}
		}
	};
	const store = {
		getSnapshot: () => state,
		subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
		set: (next) => setState(deepFreeze(next)),
		update: (fn) => setState(deepFreeze(fn(state))),
	};
	if (name !== undefined && storage !== undefined) {
		try {
			const raw = storage.getItem(name);
			if (raw !== null) store.set(JSON.parse(raw));
		} catch {
			// 损坏数据当作不存在
		}
		store.subscribe((next) => {
			try {
				storage.setItem(name, JSON.stringify(next));
			} catch {
				// 配额满忽略
			}
		});
	}
	return store;
}
const requireStub = (spec) => {
	if (spec === 'react') return reactStub;
	if (spec === '@deepseek-ai/dsh-client-store') return { createSnapshotStore: createSnapshotStoreStub };
	throw new Error('verify-client: unexpected require(' + show(spec) + ')');
};

function makeStorage(seed) {
	const backing = new Map();
	if (seed !== undefined) backing.set(PERSIST_KEY, seed);
	return {
		backing,
		getItem: (name) => (backing.has(name) ? backing.get(name) : null),
		setItem: (name, value) => backing.set(name, String(value)),

	};
}
const rawPersisted = (storage) => {
	const raw = storage.backing.get(PERSIST_KEY);
	return raw === undefined ? undefined : raw;
};
const persistedOf = (storage) => {
	const raw = rawPersisted(storage);
	return raw === undefined ? {} : JSON.parse(raw);
};

/** 假 DOM：一个真的内置轨道框架（可带诱饵），样式标签落进 head。 */
const makeCandidate = (className, markPrefix) => ({
	getAttribute: (name) => (name === 'class' ? className : null),
	querySelector: (selector) => (markPrefix !== null && selector === '[class~="' + markPrefix + '_mark"]' ? {} : null),
	isConnected: true,
});
function makeDocument(railProvider) {
	const headChildren = [];
	const documentStub = {
		head: { appendChild: (node) => { node.isConnected = true; headChildren.push(node); return node; } },
		documentElement: {},
		querySelectorAll: (selector) => {
			if (selector === '[class*="_frame"]') {
				const candidate = railProvider();
				return candidate === null ? [] : [candidate];
			}
			if (selector.startsWith('style[data-plugin-css="')) {
				const id = selector.slice('style[data-plugin-css="'.length, -2);
				return headChildren.filter((node) => node.tag === 'style' && node.dataset.pluginCss === id && !node.removed);
			}
			return [];
		},
		createElement: (tag) => {
			// textContent 用访问器：统计写入次数，才能断言「同一份配置不再重写样式」。
			const node = { tag, dataset: {}, removed: false, writes: 0, value: '', remove() { node.removed = true; } };
			Object.defineProperty(node, 'textContent', {
				get: () => node.value,
				set: (next) => {
					node.writes += 1;
					node.value = next;
				},
			});
			return node;
		},
	};
	return { documentStub, headChildren };
}
const liveStyleTags = (headChildren) => headChildren.filter((node) => node.tag === 'style' && !node.removed);
const styleTextOf = (headChildren) => liveStyleTags(headChildren).map((node) => node.textContent).join('');

function makeObservers() {
	const observers = [];
	class MutationObserverStub {
		constructor(callback) {
			this.callback = callback;
			this.target = null;
			this.disconnected = false;
			observers.push(this);
		}
		observe(target, options) {
			this.target = target;
			this.options = options;
		}
		disconnect() {
			this.disconnected = true;
		}
	}
	return { observers, MutationObserverStub };
}
function makeTimers() {
	const handles = [];
	const setTimeoutStub = (fn, ms) => {
		const handle = { fn, ms, cleared: false };
		handles.push(handle);
		return handle;
	};
	const clearTimeoutStub = (handle) => {
		if (handle !== null && typeof handle === 'object') handle.cleared = true;
	};
	return { handles, setTimeoutStub, clearTimeoutStub };
}

/**
 * 装载一份 apply 沙箱：注入桩服务、桩 DOM、桩定时器与可控的 Date.now。
 * 每一步都返回句柄，测试结束后用 dispose() 逆序跑清理函数。
 */
function boot(options) {
	const storage = options.storage ?? makeStorage();
	sandboxLocalStorage = storage;
	const documentParts = options.documentParts ?? makeDocument(options.railProvider ?? (() => makeCandidate('eGxaPq_frame', 'eGxaPq')));
	const { documentStub, headChildren } = documentParts;
	const { observers, MutationObserverStub } = makeObservers();
	const timers = makeTimers();
	const dateStub = options.now === undefined ? Date : { now: () => options.now.value };
	const windowBoot = options.window ?? { __ModuleLoader__: { load: (loaded) => (windowBoot.loaded = loaded) } };
	const load = (windowBoot.__ModuleLoader__.load);
	new Function('window', 'document', 'localStorage', 'MutationObserver', 'setTimeout', 'clearTimeout', 'Date', source)(
		windowBoot, documentStub, storage, MutationObserverStub, timers.setTimeoutStub, timers.clearTimeoutStub, dateStub,
	);
	if (windowBoot.loaded === undefined) throw new Error('verify-client: apply 侧工厂没有被捕获');
	const pluginInstance = windowBoot.loaded.factory(requireStub);
	const ctxState = { dictionaries: [], registeredSlots: [], disposers: [] };
	const translate = (key, params) => {
		const dict = ctxState.dictionaries.at(-1)?.dicts?.zh ?? {};
		const template = dict[key] ?? key;
		if (params === undefined) return template;
		let text = template;
		for (const field of Object.keys(params)) text = text.split('{' + field + '}').join(String(params[field]));
		return text;
	};
	const ctx = {
		effect: (fn) => {
			const disposer = fn();
			ctxState.disposers.push(disposer);
			return disposer;
		},
		locale: {
			register: (ns, dicts) => {
				ctxState.dictionaries.push({ ns, dicts });
				return () => {};
			},
			bind: () => translate,
		},
		slots: {
			inject: (name, callback) => ctxState.registeredSlots.push({ name, entry: callback() }),
			register: (entryOptions, component) => ({ options: entryOptions, component }),
		},
	};
	pluginInstance.apply(ctx);
	return { plugin: pluginInstance, storage, documentStub, headChildren, observers, timers, ctxState, window: windowBoot, injected: () => ctxState.registeredSlots.at(-1).entry.options.inject() };
}
const dispose = (sandbox) => {
	for (const disposer of [...sandbox.ctxState.disposers].reverse()) if (typeof disposer === 'function') disposer();
};

// ---------------------------------------------------------------------------
// 纯逻辑：discoverRail / 渐变 / 预览度量 / 归一化 / 覆盖样式生成
// ---------------------------------------------------------------------------
let definition;
const windowStub = { __ModuleLoader__: { load: (loaded) => { definition = loaded; } } };
new Function('window', source)(windowStub);
check('client.js 通过 __ModuleLoader__ 注册工厂', definition !== undefined);
if (definition === undefined) throw new Error('verify-client: client.js did not call __ModuleLoader__.load');
check('模块 id 正确', definition.id === 'dsh-chat-locator', definition.id);

const plugin = definition.factory(requireStub);
const {
	DEFAULTS,
	FIELDS,
	GRADIENT_WIDTHS,
	PLUGIN_VERSION,
	RAIL_FRAME_WIDTH_PX,
	SETTINGS_FIELDS,
	discoverRail,
	gradientWidthAt,
	normalizeSettings,
	previewMetrics,
	railStyleText,
	sameSettings,
	tickRadius,
} = plugin.diagnostics;
check('diagnostics 每条出口都有读者（数量与预期一致）', Object.keys(plugin.diagnostics).length === 13, show(Object.keys(plugin.diagnostics)));

console.log('');
console.log('discoverRail');
const railScope = { querySelectorAll: () => [makeCandidate('eGxaPq_frame', 'eGxaPq')] };
const decoyFirst = { querySelectorAll: () => [makeCandidate('lats3W_frame', null), makeCandidate('eGxaPq_frame', 'eGxaPq')] };
const noRailScope = { querySelectorAll: () => [makeCandidate('lats3W_frame', null)] };
const multiClass = { querySelectorAll: () => [makeCandidate('candidate other eGxaPq_frame', 'eGxaPq')] };
const frameSuffixOnly = { querySelectorAll: () => [makeCandidate('eGxaPq_frameWrapper', null)] };
const unsafePrefix = { querySelectorAll: () => [makeCandidate('1abcDE_frame', '1abcDE')] };
check('发现真实轨道的类名前缀', discoverRail(railScope)?.prefix === 'eGxaPq');
check('缺少刻度时跳过诱饵框架', discoverRail(decoyFirst)?.prefix === 'eGxaPq');
check('多个 class 时也能认出 _frame 令牌', discoverRail(multiClass)?.prefix === 'eGxaPq');
check('仅仅包含 _frame 子串的类名不算框架', discoverRail(frameSuffixOnly) === null);
const tabSeparated = { querySelectorAll: () => [makeCandidate('eGxaPq_frame' + String.fromCharCode(9) + 'extra', 'eGxaPq')] };
check('class 属性用制表符/换行分隔时也能切出 _frame 令牌', discoverRail(tabSeparated)?.prefix === 'eGxaPq');
const underscorePrefix = { querySelectorAll: () => [makeCandidate('_eGx_frame', '_eGx')] };
check('下划线开头的前缀是合法 CSS 标识符，仍然接受', discoverRail(underscorePrefix)?.prefix === '_eGx');
check('字母开头以外的前缀被拒绝（它会被拼进选择器）', discoverRail(unsafePrefix) === null);
check('没有轨道时返回 null', discoverRail(noRailScope) === null);
check('空候选列表也返回 null', discoverRail({ querySelectorAll: () => [] }) === null);
check('缺少 document 时无参调用返回 null（真正走到 undefined 分支）', typeof document === 'undefined' && discoverRail() === null, 'typeof document = ' + typeof document);

console.log('');
console.log('长度渐变的曲线');
check('渐变宽度表为 32 / 21 / 14', show(GRADIENT_WIDTHS) === show([32, 21, 14]), show(GRADIENT_WIDTHS));
const stepsFromPeak = [...GRADIENT_WIDTHS, 12].slice(1).map((width, index) => GRADIENT_WIDTHS[index] - width);
check('每格递减 11 / 7 / 2，首格掉得最多（曲线不是直线）', show(stepsFromPeak) === show([11, 7, 2]), show(stepsFromPeak));
check('递减量单调不增', stepsFromPeak.every((step, index) => index === 0 || step <= stepsFromPeak[index - 1]), show(stepsFromPeak));
check('框架宽度由峰值推出（32 + 4 = 36）', RAIL_FRAME_WIDTH_PX === 36 && RAIL_FRAME_WIDTH_PX === GRADIENT_WIDTHS[0] + 4, String(RAIL_FRAME_WIDTH_PX));
check('首格递减量落在「有弯但不陡」的 9–12px 区间（指数 2.0 的折中）', stepsFromPeak[0] >= 9 && stepsFromPeak[0] <= 12, String(stepsFromPeak[0]));
check('最长刻度不超出框架宽度（否则尖端会被 overflow 裁掉）', GRADIENT_WIDTHS[0] <= RAIL_FRAME_WIDTH_PX, GRADIENT_WIDTHS[0] + ' > ' + RAIL_FRAME_WIDTH_PX);
check('每侧影响 2 格，第 3 格起就是内置 12px', gradientWidthAt(2) === 14 && gradientWidthAt(3) === 12 && gradientWidthAt(99) === 12);
// 用字面量对照，而不是拿 FIELDS 的派生值和自己比：DEFAULTS 本来就是从 FIELDS 推出来的，
// 那样断言只能证明那一行推导没被改坏。
const FACTORY_SETTINGS = {
	enabled: true,
	gradient: true,
	thickness: 2,
	side: 'right',
	previewLines: 3,
	previewFontSize: 12,
	previewWidth: 300,
};
check('出厂值就是字面量这份配置（FIELDS 推导结果与产品定义一致）', show(DEFAULTS) === show(FACTORY_SETTINGS) && SETTINGS_FIELDS.every((field) => FIELDS[field].default === FACTORY_SETTINGS[field]), show(DEFAULTS));
check('设置页的控件与文案键也来自同一张字段表（没有第二份行清单）', SETTINGS_FIELDS.every((field) => {
	const spec = FIELDS[field];
	return typeof spec.title === 'string' && typeof spec.desc === 'string' && ['toggle', 'segment', 'stepper'].includes(spec.control);
}), show(SETTINGS_FIELDS.map((field) => FIELDS[field].control)));

console.log('');
console.log('previewMetrics（提示词行高必须计入卡片高度）');
const metricsDefault = previewMetrics({ previewFontSize: 12, previewLines: 3 });
check('默认 12px / 3 行：行高 18、提示词 13/20、卡片 100px（与内置一致）', metricsDefault.lineHeight === 18 && metricsDefault.promptSize === 13 && metricsDefault.promptLineHeight === 20 && metricsDefault.height === 100, show(metricsDefault));
check('16px / 4 行：卡片 26 + 26 + 24 × 4 = 148px（旧公式 142px 会裁掉一行）', previewMetrics({ previewFontSize: 16, previewLines: 4 }).height === 148, show(previewMetrics({ previewFontSize: 16, previewLines: 4 })));
check('18px / 6 行：提示词行高 29 也计入（26 + 29 + 27 × 6 = 217px）', previewMetrics({ previewFontSize: 18, previewLines: 6 }).height === 217, show(previewMetrics({ previewFontSize: 18, previewLines: 6 })));
check('最小字号 10px / 1 行：26 + 17 + 15 = 58px', previewMetrics({ previewFontSize: 10, previewLines: 1 }).height === 58);
check('刻度圆角随粗细变化并夹在 1–4px', tickRadius(1) === 1 && tickRadius(5) === 3 && tickRadius(8) === 4);

console.log('');
console.log('normalizeSettings / sameSettings');
check('空值回落默认', show(normalizeSettings(undefined)) === show(DEFAULTS), show(normalizeSettings(undefined)));
check('null / 数组 / 字符串等损坏存量都回落默认（不再抛错）', [null, [], 'broken', 42].every((raw) => show(normalizeSettings(raw)) === show(DEFAULTS)));
check('粗细超上限夹到 8', normalizeSettings({ thickness: 99 }).thickness === 8);
check('粗细低于下限夹到 1', normalizeSettings({ thickness: 0 }).thickness === 1);
check('非数字粗细回落默认', normalizeSettings({ thickness: 'thick' }).thickness === DEFAULTS.thickness);
check('未知轨道侧回落右侧，left 保留', normalizeSettings({ side: 'up' }).side === 'right' && normalizeSettings({ side: 'left' }).side === 'left');
check('预览行数越界夹到 6', normalizeSettings({ previewLines: 42 }).previewLines === 6);
check('预览字号越界夹到 18 / 低于下限夹到 10', normalizeSettings({ previewFontSize: 99 }).previewFontSize === 18 && normalizeSettings({ previewFontSize: 2 }).previewFontSize === 10);
check('预览宽度越界夹到 420 / 低于下限夹到 200', normalizeSettings({ previewWidth: 9999 }).previewWidth === 420 && normalizeSettings({ previewWidth: 10 }).previewWidth === 200);
check('布尔字段只有显式 false 才算关闭', normalizeSettings({ enabled: false }).enabled === false && normalizeSettings({}).enabled === true && normalizeSettings({ gradient: false }).gradient === false);
check('默认值判定（sameSettings）认得全字段', sameSettings(normalizeSettings(undefined), DEFAULTS) === true && sameSettings(normalizeSettings({ previewWidth: 320 }), DEFAULTS) === false);
check('SETTINGS_FIELDS 覆盖全部七个设置', show(SETTINGS_FIELDS) === show(['enabled', 'gradient', 'thickness', 'side', 'previewLines', 'previewFontSize', 'previewWidth']), show(SETTINGS_FIELDS));

console.log('');
console.log('railStyleText');
const base = { ...DEFAULTS, thickness: 5 };
const right = railStyleText('eGxaPq', base);
const left = railStyleText('eGxaPq', { ...base, side: 'left' });
const disabled = railStyleText('eGxaPq', { ...base, enabled: false });
const noGradient = railStyleText('eGxaPq', { ...base, gradient: false });
const ruleOf = (css, needle) => {
	const at = css.indexOf(needle);
	if (at === -1) return '';
	const start = css.lastIndexOf('}', at - 1) + 1;
	return css.slice(start, css.indexOf('}', at) + 1);
};
const guardCount = (css) => css.split(':not(.eGxaPq_markActive)').length - 1;
check('刻度粗细写入 height 与圆角', right.includes('.eGxaPq_mark::before{height:5px !important;border-radius:3px !important}'), right);
check('右侧不改框架左右定位', !right.includes('_frame{right:auto'));
check('关闭定位条时只隐藏轨道', disabled === '.eGxaPq_slot{display:none !important}', disabled);
check('关闭定位条时不生成渐变与预览规则', !disabled.includes('markPreview') && !disabled.includes('turn-preview-height'));

check('左侧：框架镜像到 left:12px（不再减 composer-side-clearance）', left.includes('.eGxaPq_frame{right:auto !important;left:12px !important}') && !left.includes('composer-side-clearance'), left);
check('左侧：刻度贴左且 transform-origin 一起镜像（否则普通刻度缩进 8px）', left.includes('.eGxaPq_mark::before{right:auto !important;left:0 !important;transform-origin:0 50% !important}'), left);
check('左侧：不再把刻度按钮压成 0 宽', !left.includes('.eGxaPq_mark{inset:'));
check('左侧：键盘焦点环镜像到左端', left.includes('.eGxaPq_mark:focus-visible::after{inset:0 auto 0 0 !important}'));
check('左侧：预览改到轨道右侧展开', left.includes('.eGxaPq_preview{right:auto !important;left:calc(100% + 10px) !important}'));
check('左侧：进场动画镜像（自有 keyframes 名，不依赖样式注入顺序）', left.includes('@keyframes eGxaPq_dsh-chat-locator-preview-enter{0%{opacity:0;transform:translate(-4px)}') && left.includes('.eGxaPq_preview{animation:.12s ease-out eGxaPq_dsh-chat-locator-preview-enter !important}'));
check('左侧：reduced-motion 下进场动画仍被关掉', left.includes('@media (prefers-reduced-motion:reduce){.eGxaPq_preview{animation:none !important}}'));

check('悬停锚点同时接受预览类与 :hover（活跃轮悬停也有渐变）', right.includes(':is(.eGxaPq_markPreview,.eGxaPq_mark:hover)::before{width:32px !important;transform:translateY(-50%) !important}'), right);
check('悬停（预览）刻度最长且去掉内置 scaleX', right.includes(':is(.eGxaPq_markPreview,.eGxaPq_mark:hover)::before{width:32px'));
const rule21 = ruleOf(right, '{width:21px');
const rule14 = ruleOf(right, '{width:14px');
check('上下 1 格缩到 21px（相邻兄弟链 + :has 反向指）', rule21.includes('.eGxaPq_mark:not(.eGxaPq_markActive)::before') && rule21.includes(':has(+ :is(.eGxaPq_markPreview,.eGxaPq_mark:hover))'), rule21);
check('悬停向外第 2 格缩到 14px（链 2 格 / 反指回锚点）', rule14.includes('+ .eGxaPq_mark:not(.eGxaPq_markActive) + .eGxaPq_mark:not(.eGxaPq_markActive)::before') && rule14.includes(':has(+ .eGxaPq_mark:not(.eGxaPq_markActive) + :is(.eGxaPq_markPreview,.eGxaPq_mark:hover))'), rule14);
check('邻居选择器都排除活跃轮（距离 1 各 2 次、距离 2 各 4 次）', guardCount(rule21) === 2 && guardCount(rule14) === 4, guardCount(rule21) + ' / ' + guardCount(rule14));
check('框架加宽到 36px（给 32px 尖端留出裁剪盒）', right.includes('.eGxaPq_frame{width:36px !important}') && left.includes('.eGxaPq_frame{width:36px !important}'));
check('更远处不重写长度（沿用内置 12px）', !right.includes('width:12px !important'));
check('关闭渐变时不写悬停峰值与距离链、也不加宽框架', !noGradient.includes(':is(') && !noGradient.includes(':has(') && !noGradient.includes('_frame{width:36px'));
check('关闭渐变时刻度粗细与预览规则仍在', noGradient.includes('height:5px') && noGradient.includes('--turn-preview-height:100px') && noGradient.includes('width:min(300px, 100cqw - 120px)'));

check('默认 3 行时高度仍是内置的 100px', right.includes('--turn-preview-height:100px !important'), right);
check('预览行数写入 line-clamp', right.includes('-webkit-line-clamp:3 !important'));
check('默认宽度与内置一致（300px，并保留容器夹取）', right.includes('.eGxaPq_preview{width:min(300px, 100cqw - 120px) !important}'));
check('默认提示词字号仍是内置的 13px / 20px', right.includes('.eGxaPq_previewPrompt{font-size:13px !important;line-height:20px !important}'));
check('默认正文字号仍是内置的 12px / 18px', right.includes('.eGxaPq_previewResponse{font-size:12px !important;line-height:18px !important;-webkit-line-clamp:3 !important}'));
check('预览正文归一空白并自动换行', right.includes('white-space:normal !important') && right.includes('overflow-wrap:anywhere !important'));
check('6 行 / 18px 的字号行高一起放大（高度 26 + 29 + 27 × 6 = 217px）', railStyleText('eGxaPq', { ...base, previewLines: 6, previewFontSize: 18 }).includes('--turn-preview-height:217px !important'));
for (const label of ['right', 'left']) {
	const css = label === 'right' ? right : left;
	check(label + ' 规则花括号配平', css.split('{').length === css.split('}').length, String(css.split('{').length) + '/' + String(css.split('}').length));
	check(label + ' 规则不含 undefined/NaN', !css.includes('undefined') && !css.includes('NaN'), css);
}

// ---------------------------------------------------------------------------
// apply 端到端：字典、设置策略、样式挂载、设置页、排障钩子与清理
// ---------------------------------------------------------------------------
console.log('');
console.log('apply（桩服务）');
const main = boot({ storage: makeStorage(JSON.stringify({ enabled: true, thickness: 4, side: 'left', previewLines: 3 })) });
const mainInjected = main.injected();
check('注册了 chat-locator 字典（zh/en）', main.ctxState.dictionaries.length === 1 && main.ctxState.dictionaries[0].ns === 'chat-locator' && typeof main.ctxState.dictionaries[0].dicts?.zh?.nav === 'string' && typeof main.ctxState.dictionaries[0].dicts?.en?.nav === 'string');
check('inject 只有 slots / locale（设置持久化全在浏览器侧）', show(main.plugin.inject) === show(['slots', 'locale']), show(main.plugin.inject));
const slotEntry = main.ctxState.registeredSlots[0];
check('设置页注册在 settings.section 的 chat-locator 格', slotEntry.name === 'settings.section' && slotEntry.entry.options.id === 'chat-locator' && slotEntry.entry.options.order === 41);
check('设置页导航名走本地化', slotEntry.entry.options.label() === '对话定位条', slotEntry.entry.options.label());
check('设置页注入面只有 store / update / reset / t', show(Object.keys(mainInjected).sort()) === show(['reset', 'store', 't', 'update']), show(Object.keys(mainInjected).sort()));
check('配置从本地持久化采纳（thickness=4 / side=left）', mainInjected.store.getSnapshot().thickness === 4 && mainInjected.store.getSnapshot().side === 'left', show(mainInjected.store.getSnapshot()));
check('缺失的本地字段落到默认值（字号 12 / 宽度 300）', mainInjected.store.getSnapshot().previewFontSize === 12 && mainInjected.store.getSnapshot().previewWidth === 300);

const liveTags = liveStyleTags(main.headChildren);
check('挂载了自有覆盖样式标签（且只有一份）', liveTags.length === 1 && liveTags[0].dataset.pluginCss === 'chat-locator/rail.css', show(liveTags.map((node) => node.dataset)));
check('样式标签带插件来源标记（与内置样式标签同构，便于排障）', liveTags[0].dataset.plugin === 'dsh-chat-locator', show(liveTags[0].dataset));
check('样式只在首次挂载时写一次', liveTags[0].writes === 1, String(liveTags[0].writes));
check('MutationObserver 观察 documentElement 的子树变更', main.observers.length === 1 && main.observers[0].target === main.documentStub.documentElement && main.observers[0].options?.childList === true && main.observers[0].options?.subtree === true, show(main.observers.map((observer) => observer.target !== undefined)));
check('覆盖样式按发现的前缀与配置生成', styleTextOf(main.headChildren).includes('.eGxaPq_mark::before{height:4px') && styleTextOf(main.headChildren).includes('_frame{right:auto !important;left:12px'), styleTextOf(main.headChildren));
check('覆盖样式带上曲线渐变的四档长度', [32, 21, 14].every((width) => styleTextOf(main.headChildren).includes('width:' + width + 'px !important')));

const debug = main.window.__dshChatLocator;
check('排障钩子暴露版本与状态', debug?.version === PLUGIN_VERSION && debug.state().railPrefix === 'eGxaPq' && debug.state().railFound === true, show(debug?.version));
check('client.js 的 PLUGIN_VERSION 与 package.json 的 version 一致', PLUGIN_VERSION === packageJson.version, 'client.js=' + PLUGIN_VERSION + ' package.json=' + packageJson.version);
check('排障钩子带上生效配置', debug.state().config.thickness === 4 && debug.state().config.side === 'left');
check('排障钩子的状态只有轨道字段', show(Object.keys(debug.state()).sort()) === show(['config', 'railFound', 'railPrefix', 'rules']), show(Object.keys(debug.state()).sort()));

// store 契约自查：桩必须和真实 createSnapshotStore 一样会冻结、会按引用判等短路。
// 这两条不是在测插件，而是在保护套件本身 —— 桩一旦退化成「永远 flush 的宽松 store」，
// 「原地改 state 再 set 回去」这个 bug 就会重新隐身（1.5.0 收尾时正是这样漏掉的）。
{
	const contractStore = createSnapshotStoreStub({}, { persist: { name: 'contract-probe' } });
	let notified = 0;
	contractStore.subscribe(() => { notified += 1; });
	contractStore.set({ a: 1 });
	check('桩 store 的 state 一经 set 就被冻结（真实实现：set 前深冻结入参）', Object.isFrozen(contractStore.getSnapshot()), 'not frozen');
	const sameRefState = contractStore.getSnapshot();
	contractStore.set(sameRefState);
	check('桩 store 对同一个引用重复 set 会短路（zustand Object.is）', notified === 1, 'notified=' + String(notified));
	contractStore.set({ ...contractStore.getSnapshot(), b: 2 });
	check('桩 store 对新引用 set 会通知并落盘', notified === 2, 'notified=' + String(notified));
}

mainInjected.update('thickness', 6);
check('改动先落本地快照', mainInjected.store.getSnapshot().thickness === 6);
check('改动写回本地持久化', persistedOf(main.storage).thickness === 6, show(persistedOf(main.storage)));
check('改动即时反映到覆盖样式', styleTextOf(main.headChildren).includes('height:6px'));
check('配置变更只重写一次样式', liveTags[0].writes === 2, String(liveTags[0].writes));
main.observers[0].callback();
check('同一份配置下的 DOM 变更不会重写样式（记忆化 + 文本相等短路）', liveTags[0].writes === 2, String(liveTags[0].writes));
mainInjected.update('previewWidth', 360);
check('新字段首次改动也即时持久化', persistedOf(main.storage).previewWidth === 360, show(persistedOf(main.storage)));
check('改动即时反映到预览宽度', styleTextOf(main.headChildren).includes('.eGxaPq_preview{width:min(360px, 100cqw - 120px) !important}'));

// 把某项调回出厂值时，用户层里那个键要被删掉而不是留一个「等于出厂值的显式覆盖」——
// 否则「恢复默认」按值判定的置灰会永远点不动，那个键也永远清不掉。
mainInjected.update('thickness', 2);
check('调回出厂值后本地不再保留该键', persistedOf(main.storage).thickness === undefined, show(persistedOf(main.storage)));
check('调回出厂值后其余用户改动仍在', persistedOf(main.storage).previewWidth === 360, show(persistedOf(main.storage)));

// 本地存储里残留历史字段（1.3.0 的 preview 开关）或未知字段时，恢复默认要一并清掉。
main.storage.backing.set(PERSIST_KEY, JSON.stringify({ thickness: 4, preview: false }));
mainInjected.reset();
check('恢复默认一次清空本地持久化（含历史/未知字段）', rawPersisted(main.storage) === '{}', rawPersisted(main.storage));
check('恢复默认把本地快照拉回出厂值', sameSettings(mainInjected.store.getSnapshot(), DEFAULTS) === true, show(mainInjected.store.getSnapshot()));
check('恢复默认后覆盖样式回到内置高度 100px', styleTextOf(main.headChildren).includes('--turn-preview-height:100px !important'));

console.log('');
console.log('设置页渲染（直接调用组件 + 极简 React 桩）');
const Section = slotEntry.entry.component;
const flatten = (element) => {
	const nodes = [];
	const expand = (node) => {
		if (node === null || typeof node !== 'object') return;
		if (typeof node.type === 'function') {
			expand(node.type(node.props ?? {}));
			return;
		}
		nodes.push(node);
		const children = Array.isArray(node.children) ? node.children.flat(Infinity) : [];
		for (const child of children) expand(child);
	};
	expand(element);
	return nodes;
};
const containerOf = (nodes) => nodes.find((node) => node?.props?.style?.position === 'relative' && node.props.style.width === '100%');
const ticksOf = (nodes) => nodes
	.filter((node) => node?.type === 'span' && typeof node?.props?.style?.top === 'string' && (node.props.style.left === '10px' || node.props.style.right === '10px'))
	.sort((leftNode, rightNode) => parseFloat(leftNode.props.style.top) - parseFloat(rightNode.props.style.top));
const cardOf = (nodes) => nodes.find((node) => node?.props?.style?.boxSizing === 'border-box' && node?.props?.style?.borderRadius === '10px');
const responseOf = (nodes) => nodes.find((node) => node?.props?.style?.WebkitLineClamp !== undefined);
const resetButtonOf = (nodes) => nodes.find((node) => node?.type === 'button' && node?.props?.['aria-label'] === '恢复默认');
/** 取某个步进器（按行名）的减 / 加按钮。 */
const stepperButtonsOf = (nodes, rowLabel) => nodes.filter((node) => node?.type === 'button'
	&& (node?.props?.['aria-label'] === rowLabel + ' 减小' || node?.props?.['aria-label'] === rowLabel + ' 增大'));
const titlesOf = (nodes) => nodes
	.filter((node) => Array.isArray(node?.children) && node.children.length === 1 && typeof node.children[0] === 'string')
	.map((node) => node.children[0]);
let sectionNodes = flatten(Section(mainInjected));
check('小样容器随字号与行数长高（12px / 3 行 → 100 + 44 = 144px）', containerOf(sectionNodes)?.props?.style?.height === '144px', show(containerOf(sectionNodes)?.props?.style?.height));
const sampleWidths = ticksOf(sectionNodes).map((node) => node.props.style.width);
check('小样刻度共 7 根：12/14/21/32/21/14/12', show(sampleWidths) === show(['12px', '14px', '21px', '32px', '21px', '14px', '12px']), show(sampleWidths));
const sampleTops = ticksOf(sectionNodes).map((node) => parseFloat(node.props.style.top));
check('小样刻度与内置轨道同用 10px 行距', sampleTops.every((top, index) => index === 0 || top - sampleTops[index - 1] === 10), show(sampleTops));
check('小样预览卡让开最长刻度（32 + 16 = 48px）', (cardOf(sectionNodes)?.props?.style?.right ?? cardOf(sectionNodes)?.props?.style?.left) === '48px');
check('小样刻度按当前轨道侧贴边（恢复默认后是右侧：right:10px）', ticksOf(sectionNodes).every((node) => node.props.style.right === '10px' && node.props.style.left === undefined));
check('小样预览卡用当前字号与行高', responseOf(sectionNodes)?.props?.style?.fontSize === '12px' && responseOf(sectionNodes)?.props?.style?.lineHeight === '18px');
// 步进器的区间 / 步进来自 FIELDS：下限处「−」置灰、上限处「+」置灰，宽度按 20 步进。
const thumbButtons = stepperButtonsOf(sectionNodes, '横线粗细');
check('粗细步进器在出厂值 2px 时两个方向都可用', thumbButtons.length === 2 && thumbButtons.every((node) => node.props.disabled === false), show(thumbButtons.map((node) => node.props.disabled)));
mainInjected.update('thickness', 8);
sectionNodes = flatten(Section(mainInjected));
check('粗细到上限 8px 后「+」置灰、「−」可用', show(stepperButtonsOf(sectionNodes, '横线粗细').map((node) => node.props.disabled)) === show([false, true]), show(stepperButtonsOf(sectionNodes, '横线粗细').map((node) => node.props.disabled)));
mainInjected.update('thickness', 1);
sectionNodes = flatten(Section(mainInjected));
check('粗细到下限 1px 后「−」置灰、「+」可用', show(stepperButtonsOf(sectionNodes, '横线粗细').map((node) => node.props.disabled)) === show([true, false]));
mainInjected.update('thickness', 2);
sectionNodes = flatten(Section(mainInjected));
const widthPlus = stepperButtonsOf(sectionNodes, '预览框宽度').find((node) => node.props['aria-label'].endsWith(' 增大'));
widthPlus.props.onClick();
check('宽度「+」一次步进 20px（FIELDS 里的 stepSize 真的接上了）', mainInjected.store.getSnapshot().previewWidth === 320, String(mainInjected.store.getSnapshot().previewWidth));
mainInjected.update('previewWidth', 300);
// 字号与宽度的边界是 10/18 与 200/420（不是 1），它们才能钉住「区间来自 FIELDS」。
mainInjected.update('previewFontSize', 10);
mainInjected.update('previewWidth', 420);
sectionNodes = flatten(Section(mainInjected));
check('字号到下限 10 后「−」置灰', show(stepperButtonsOf(sectionNodes, '预览字号').map((node) => node.props.disabled)) === show([true, false]), show(stepperButtonsOf(sectionNodes, '预览字号').map((node) => node.props.disabled)));
check('宽度到上限 420 后「+」置灰', show(stepperButtonsOf(sectionNodes, '预览框宽度').map((node) => node.props.disabled)) === show([false, true]), show(stepperButtonsOf(sectionNodes, '预览框宽度').map((node) => node.props.disabled)));
mainInjected.update('previewFontSize', 12);
mainInjected.update('previewWidth', 300);
sectionNodes = flatten(Section(mainInjected));
check('四组步进器的 +/- 都带所在行名字', show(sectionNodes
	.filter((node) => node?.type === 'button' && typeof node?.props?.['aria-label'] === 'string' && (node.props['aria-label'].endsWith(' 减小') || node.props['aria-label'].endsWith(' 增大')))
	.map((node) => node.props['aria-label'])) === show(['横线粗细 减小', '横线粗细 增大', '预览正文行数 减小', '预览正文行数 增大', '预览字号 减小', '预览字号 增大', '预览框宽度 减小', '预览框宽度 增大']));
const zhDict = main.ctxState.dictionaries.at(-1).dicts.zh;
const dictionaryValues = Object.values(zhDict).filter((value) => typeof value === 'string');
const matchesTemplate = (text, template) => {
	if (!template.includes('{value}')) return text === template;
	const parts = template.split('{value}');
	if (!text.startsWith(parts[0]) || !text.endsWith(parts[1])) return false;
	const middle = text.slice(parts[0].length, text.length - parts[1].length);
	return middle.length > 0 && [...middle].every((char) => '0123456789'.includes(char));
};
const textChildrenOf = (nodes) => nodes.flatMap((node) => (Array.isArray(node?.children) ? node.children.filter((child) => typeof child === 'string') : []));
const isDictionaryCopy = (text) => /^[0-9−+]+$/.test(text) || dictionaryValues.some((template) => matchesTemplate(text, template));
const strayCopy = textChildrenOf(sectionNodes).filter((text) => !isDictionaryCopy(text));
check('设置页只渲染字典里的文案', strayCopy.length === 0, show(strayCopy));
const titles = titlesOf(sectionNodes);
check('设置页有「长度渐变」开关行、没有「悬停预览」开关行', titles.includes('长度渐变') && !titles.includes('悬停预览'), show(titles));
const settingTitleOrder = ['显示对话定位条', '长度渐变', '横线粗细', '轨道位置', '预览正文行数', '预览字号', '预览框宽度', '恢复默认'];
const renderedOrder = [...new Set(titles.filter((title) => settingTitleOrder.includes(title)))];
check('设置行的顺序与字段顺序一致（七项设置 + 恢复默认）', show(renderedOrder) === show(settingTitleOrder), show(renderedOrder));
check('行数 / 字号 / 宽度三行仍在', ['预览正文行数', '预览字号', '预览框宽度'].every((title) => titles.includes(title)));

mainInjected.update('previewLines', 6);
sectionNodes = flatten(Section(mainInjected));
check('行数改到 6 后小样继续长高（154 + 44 = 198px）', containerOf(sectionNodes)?.props?.style?.height === '198px');
check('行数 6 也写进真实轨道的覆盖样式', styleTextOf(main.headChildren).includes('--turn-preview-height:154px !important'));
mainInjected.update('previewFontSize', 18);
sectionNodes = flatten(Section(mainInjected));
check('字号改到 18 后小样再长高（217 + 44 = 261px）', containerOf(sectionNodes)?.props?.style?.height === '261px', show(containerOf(sectionNodes)?.props?.style?.height));
check('字号 18 也写进真实轨道的覆盖样式', styleTextOf(main.headChildren).includes('--turn-preview-height:217px !important') && styleTextOf(main.headChildren).includes('font-size:18px !important'));
check('字号改后小样预览卡字号跟随', responseOf(sectionNodes)?.props?.style?.fontSize === '18px' && responseOf(sectionNodes)?.props?.style?.lineHeight === '27px');
mainInjected.update('previewWidth', 360);
sectionNodes = flatten(Section(mainInjected));
check('宽度改后小样预览卡宽度跟随', cardOf(sectionNodes)?.props?.style?.width === '360px');
check('改动过配置时「恢复默认」可用', resetButtonOf(sectionNodes)?.props?.disabled === false);
mainInjected.reset();
sectionNodes = flatten(Section(mainInjected));
check('恢复默认后「恢复默认」置灰、小样回到 144px', resetButtonOf(sectionNodes)?.props?.disabled === true && containerOf(sectionNodes)?.props?.style?.height === '144px');
mainInjected.update('gradient', false);
sectionNodes = flatten(Section(mainInjected));
// 关掉渐变回到的是「内置外观」，不是「一律 12px」：内置悬停刻度是 20px × scaleX(.9) = 18px。
check('关闭渐变后普通刻度回到内置 12px', ticksOf(sectionNodes).filter((node) => node.props.style.width !== '18px').every((node) => node.props.style.width === '12px'), show(ticksOf(sectionNodes).map((node) => node.props.style.width)));
check('关闭渐变后悬停那根回到内置悬停宽度 18px', ticksOf(sectionNodes).filter((node) => node.props.style.width === '18px').length === 1, show(ticksOf(sectionNodes).map((node) => node.props.style.width)));
check('关闭渐变后小样预览卡贴边量收窄到 18 + 16 = 34px', (cardOf(sectionNodes)?.props?.style?.right ?? cardOf(sectionNodes)?.props?.style?.left) === '34px', show(cardOf(sectionNodes)?.props?.style));
check('关闭渐变后小样注脚换成关闭说明', sectionNodes.some((node) => Array.isArray(node?.children) && node.children.some((child) => typeof child === 'string' && child.startsWith('小样：长度渐变已关闭'))));
check('关闭渐变时真实轨道覆盖样式不带宽度渐变', !styleTextOf(main.headChildren).includes(':is(.eGxaPq_markPreview'));

console.log('');
console.log('损坏的本地存储不影响启动');
for (const seed of ['null', '[]', '"broken"']) {
	const sandbox = boot({ storage: makeStorage(seed) });
	check('损坏存量 ' + seed + ' 回落出厂值且不抛错', sameSettings(sandbox.injected().store.getSnapshot(), DEFAULTS));
	dispose(sandbox);
}
// 存量损坏成数组时，写回也不能把数组下标当成字段带进本地存储。
// 这里必须用非空数组：空的 [] 展开后本来就取不到下标，断言会变成恒真。
const corruptWrite = boot({ storage: makeStorage('["stale"]') });
corruptWrite.injected().update('thickness', 5);
check('损坏存量写回后只保留真实字段（不带数组下标）', show(Object.keys(JSON.parse(rawPersisted(corruptWrite.storage)))) === show(['thickness']), rawPersisted(corruptWrite.storage));
dispose(corruptWrite);

console.log('');
console.log('重新挂载与重扫');
const remount = boot({ storage: main.storage, documentParts: { documentStub: main.documentStub, headChildren: main.headChildren }, window: main.window });
check('重新挂载不会叠加第二份覆盖样式（旧标签被替换）', liveStyleTags(main.headChildren).length === 1 && liveTags[0].removed === true, show(liveStyleTags(main.headChildren).length));
// 标签被第三方摘掉后要能自愈：否则本实例会静默失去覆盖样式，
// 而 render() 只在文本变化时写 textContent，自己发现不了。
{
	const selfHeal = boot({ storage: makeStorage() });
	const ownTag = liveStyleTags(selfHeal.headChildren)[0];
	// 模拟「节点被从 head 里摘掉但对象仍在」：isConnected=false，没有调 remove()。
	const appendedBefore = selfHeal.headChildren.length;
	ownTag.isConnected = false;
	selfHeal.observers[0].callback();
	check('样式标签被摘掉后，下一次渲染会把它重新挂回 head', selfHeal.headChildren.length === appendedBefore + 1 && selfHeal.headChildren.at(-1) === ownTag, show(selfHeal.headChildren.length));
	dispose(selfHeal);
}
check('重新挂载后样式用新实例的配置重建', styleTextOf(main.headChildren).includes('height:2px'));
check('排障钩子指向最新实例', main.window.__dshChatLocator === remount.window.__dshChatLocator && remount.window.__dshChatLocator !== debug);

const rescanRail = makeCandidate('eGxaPq_frame', 'eGxaPq');
const railVisible = { value: false };
const now = { value: 1000 };
const rescan = boot({ railProvider: () => (railVisible.value ? rescanRail : null), now });
check('轨道未出现时不写样式', styleTextOf(rescan.headChildren) === '');
rescan.observers[0].callback();
rescan.observers[0].callback();
check('重扫门限内的 DOM 变更只排一次补扫（同一轮多个变更批次不重复计时）', rescan.timers.handles.length === 1 && rescan.timers.handles[0].cleared === false, show(rescan.timers.handles.length));
railVisible.value = true;
now.value = 1500;
rescan.timers.handles[0].fn();
check('补扫在门限过后发现轨道并写入样式', styleTextOf(rescan.headChildren).includes('.eGxaPq_mark::before{height:2px'), styleTextOf(rescan.headChildren));
rescanRail.isConnected = false;
railVisible.value = false;
now.value = 1600;
rescan.observers[0].callback();
check('轨道断开后再变更会再排一次补扫', rescan.timers.handles.length === 2);
const staleState = rescan.window.__dshChatLocator.state();
check('轨道断开后排障钩子不再报告过期前缀', staleState.railPrefix === null && staleState.railFound === false, show(staleState.railPrefix));
dispose(rescan);
check('清理会取消未执行的重扫定时器', rescan.timers.handles[1].cleared === true);

const writesBeforeDispose = liveTags[0].writes;
dispose(main);
check('清理会断开 MutationObserver', main.observers[0].disconnected === true);
mainInjected.update('thickness', 5);
check('清理后设置变更不再写样式（订阅已退订）', liveTags[0].writes === writesBeforeDispose, String(liveTags[0].writes - writesBeforeDispose));
check('清理旧实例不会移除新实例的样式', liveStyleTags(main.headChildren).length === 1);
dispose(remount);
check('清理后移除样式标签', liveStyleTags(main.headChildren).length === 0);
check('清理后移除排障钩子', main.window.__dshChatLocator === undefined);

console.log('');
if (failures.length > 0) {
	console.error('verify-client: ' + failures.length + ' 项失败');
	process.exit(1);
}
console.log('verify-client: 全部通过');
