/**
 * dsh-chat-locator 浏览器半侧的纯逻辑自检。
 *
 * 为什么需要它：定位条的样式覆盖全部由两个纯函数决定 ——
 * `discoverRail`（从活动 DOM 上认出内置轨道的 CSS Module 类名前缀）与
 * `railStyleText`（按配置生成覆盖规则）。页面里没有浏览器控制能力时，
 * 至少这两个函数必须被真机（Node）跑过，而不是只靠肉眼审阅。
 *
 * 做法：给 client.js 一个极简的 `window.__ModuleLoader__` 桩以取得工厂，
 * 再用一个假 DOM 根调 `plugin.diagnostics` 导出的纯函数。
 * 断言失败时以非零码退出。
 *
 * 用法：node test/verify-client.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');

/** 极简 React 桩：工厂只声明组件，不在装载期调用它们。 */
const reactStub = {
	createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
	memo: (component) => component,
	useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
	useEffect: () => {},
	useRef: (initial) => ({ current: initial }),
	useId: () => 'stub-id',
	useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
};
const requireStub = (spec) => {
	if (spec === 'react') return reactStub;
	throw new Error(`verify-client: unexpected require(${JSON.stringify(spec)})`);
};

let definition;
const windowStub = {
	__ModuleLoader__: {
		load: (loaded) => {
			definition = loaded;
		},
	},
};

// 在函数作用域里执行源码：那里有 `window` 与工厂参数 `require`。
new Function('window', source)(windowStub);
if (definition === undefined) throw new Error('verify-client: client.js did not call window.__ModuleLoader__.load');
if (definition.id !== 'dsh-chat-locator') throw new Error(`verify-client: unexpected module id ${definition.id}`);

const plugin = definition.factory(requireStub);
const { diagnostics } = plugin;
const {
	DEFAULTS,
	GRADIENT_WIDTHS,
	PREVIEW_FONT_MAX,
	PREVIEW_FONT_MIN,
	PREVIEW_WIDTH_MAX,
	PREVIEW_WIDTH_MIN,
	RAIL_FRAME_WIDTH_PX,
	SETTINGS_FIELDS,
	discoverRail,
	gradientWidthAt,
	normalizeSettings,
	previewMetrics,
	railStyleText,
	sameSettings,
} = diagnostics;

const failures = [];
const check = (name, ok, detail) => {
	if (ok) {
		console.log(`  ok   ${name}`);
		return;
	}
	failures.push(name);
	console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${detail}`}`);
};

/** 假 DOM：一个真的内置轨道框架，外加一个应该被跳过的诱饵。 */
const makeCandidate = (className, markPrefix) => ({
	getAttribute: (name) => (name === 'class' ? className : null),
	querySelector: (selector) => (markPrefix !== null && selector === `.${markPrefix}_mark` ? {} : null),
	isConnected: true,
});
const railScope = { querySelectorAll: () => [makeCandidate('eGxaPq_frame', 'eGxaPq')] };
const decoyWithRailSecond = { querySelectorAll: () => [makeCandidate('lats3W_frame', null), makeCandidate('eGxaPq_frame', 'eGxaPq')] };
const noRailScope = { querySelectorAll: () => [makeCandidate('lats3W_frame', null)] };

console.log('discoverRail');
const found = discoverRail(railScope);
check('发现真实轨道的类名前缀', found !== null && found.prefix === 'eGxaPq', JSON.stringify(found?.prefix));
check('缺少刻度时跳过诱饵框架', discoverRail(decoyWithRailSecond)?.prefix === 'eGxaPq');
check('没有轨道时返回 null', discoverRail(noRailScope) === null);
check('没有 document 时返回 null', discoverRail({ querySelectorAll: () => [] }) === null);

console.log('长度渐变的曲线');
// 档数：悬停那根 + 每侧 2 格；幂曲线的分母跟着变，所以中间档位全部重算。
check('渐变宽度表为 32 / 21 / 14', JSON.stringify(GRADIENT_WIDTHS) === JSON.stringify([32, 21, 14]), JSON.stringify(GRADIENT_WIDTHS));
const stepsFromPeak = [...GRADIENT_WIDTHS, 12].slice(1).map((width, index) => GRADIENT_WIDTHS[index] - width);
check('每格递减量是一条凸向轨道的曲线（11 / 7 / 2），首格掉得最多且全程递减', JSON.stringify(stepsFromPeak) === JSON.stringify([11, 7, 2]), JSON.stringify(stepsFromPeak));
check('递减量单调不增（曲线不是直线）', stepsFromPeak.every((step, index) => index === 0 || step <= stepsFromPeak[index - 1]), JSON.stringify(stepsFromPeak));
// 幂次 2.5 掉 15px（断崖）→ 1.5 掉 9px（邻居偏长）→ 2.0 掉 11px：钉在「有弯但不陡」的区间里。
check('首格递减量仍在「有弯但不陡」的区间（9–12px）', stepsFromPeak[0] >= 9 && stepsFromPeak[0] <= 12, String(stepsFromPeak[0]));
check('1、2 两格按指令再降（21 / 14，比上一版的 23 / 16 更低）', GRADIENT_WIDTHS[1] === 21 && GRADIENT_WIDTHS[2] === 14, JSON.stringify(GRADIENT_WIDTHS));
check('0 位保持 32px', GRADIENT_WIDTHS[0] === 32, String(GRADIENT_WIDTHS[0]));
// 关键：框架是刻度的 overflow 容器（内置 28px），最长刻度必须落在框架宽度内，否则尖端会被裁掉。
check('最长刻度不会超出框架宽度（否则尖端被 overflow 裁掉）', GRADIENT_WIDTHS[0] <= RAIL_FRAME_WIDTH_PX, `${GRADIENT_WIDTHS[0]} > ${RAIL_FRAME_WIDTH_PX}`);
check('框架宽度由峰值推出（最长刻度 + 4px 余量）', RAIL_FRAME_WIDTH_PX === GRADIENT_WIDTHS[0] + 4, String(RAIL_FRAME_WIDTH_PX));
check('渐变每侧影响 2 格，第 3 格起就是内置宽度', gradientWidthAt(2) === 14 && gradientWidthAt(3) === 12, `${gradientWidthAt(2)} / ${gradientWidthAt(3)}`);
check('渐变的档数（含悬停那根）为 3', diagnosticReach() === 3, String(diagnosticReach()));
function diagnosticReach() {
	let reach = 0;
	while (gradientWidthAt(reach) !== 12) {
		reach += 1;
		if (reach > 20) break;
	}
	return reach;
}
check('超出渐变范围就是内置普通刻度宽度', gradientWidthAt(3) === 12 && gradientWidthAt(99) === 12);
check('悬停那根比内置的 18px 预览宽度更长', GRADIENT_WIDTHS[0] === 32);

console.log('railStyleText');
const base = { ...DEFAULTS, thickness: 5, side: 'right', previewLines: 3, previewFontSize: 12, previewWidth: 300 };
const right = railStyleText('eGxaPq', base);
check('刻度粗细写入 height', right.includes('.eGxaPq_mark::before{height:5px !important;border-radius:3px !important}'), right);
check('默认右侧不改框架左右定位', !right.includes('_frame{right:auto'));

const left = railStyleText('eGxaPq', { ...base, side: 'left' });
check('左侧：框架翻到左边', left.includes('.eGxaPq_frame{right:auto !important;left:calc(12px - (var(--dsh-composer-side-clearance) + 16px)) !important}'));
check('左侧：刻度改左对齐', left.includes('.eGxaPq_mark{inset:0 auto 0 0 !important}') && left.includes('.eGxaPq_mark::before{right:auto !important;left:0 !important}'));
check('左侧：预览改到轨道右侧', left.includes('.eGxaPq_preview{right:auto !important;left:calc(100% + 10px) !important}'));
check('左侧：进场动画镜像', left.includes('@keyframes eGxaPq_dsh-turn-preview-enter{0%{opacity:0;transform:translate(-4px)}'));

const disabled = railStyleText('eGxaPq', { ...base, enabled: false });
check('关闭定位条时只隐藏轨道', disabled === '.eGxaPq_slot{display:none !important}', disabled);
check('关闭定位条时不再生成渐变规则', !disabled.includes('markPreview::before'));

// 预览卡：行数 / 字号 / 宽度三者都要真的写进覆盖样式，否则内置的
// max-height:100px 与 width:min(300px,…) 会把它们吃掉。
check('默认 3 行时高度仍是内置的 100px', right.includes('--turn-preview-height:100px !important'), right);
check('预览正文归一空白与自动换行', right.includes('white-space:normal !important'));
check('预览行数写入 line-clamp', right.includes('-webkit-line-clamp:3 !important'));
check('默认宽度与内置一致（300px，并保留容器夹取）', right.includes('.eGxaPq_preview{width:min(300px, 100cqw - 120px) !important}'), right);
check('默认提示词字号仍是内置的 13px', right.includes('.eGxaPq_previewPrompt{font-size:13px !important;line-height:20px !important}'), right);
check('默认正文字号仍是内置的 12px', right.includes('.eGxaPq_previewResponse{font-size:12px !important;line-height:18px !important;-webkit-line-clamp:3 !important}'), right);

const lines = railStyleText('eGxaPq', { ...base, previewLines: 6 });
check('6 行时高度改写到 154px（46 + 18 × 6）', lines.includes('--turn-preview-height:154px !important'), lines);
check('1 行时高度收窄', railStyleText('eGxaPq', { ...base, previewLines: 1 }).includes('--turn-preview-height:64px !important'));

const bigger = railStyleText('eGxaPq', { ...base, previewLines: 4, previewFontSize: 16, previewWidth: 380 });
check('字号放大时行高与卡片高度一起放大', bigger.includes('--turn-preview-height:142px !important') && bigger.includes('line-height:24px !important'), bigger);
check('字号放大时正文与提示词都跟着放大', bigger.includes('.eGxaPq_previewResponse{font-size:16px !important') && bigger.includes('.eGxaPq_previewPrompt{font-size:17px !important;line-height:26px !important}'));
check('宽度按配置写入并保留容器夹取', bigger.includes('.eGxaPq_preview{width:min(380px, 100cqw - 120px) !important}'));

console.log('previewMetrics');
const metricsDefault = previewMetrics({ previewFontSize: 12, previewLines: 3 });
check('默认 12px / 3 行 → 行高 18、卡片 100px', metricsDefault.lineHeight === 18 && metricsDefault.height === 100, JSON.stringify(metricsDefault));
check('18px / 6 行 → 行高 27、卡片 208px', JSON.stringify(previewMetrics({ previewFontSize: 18, previewLines: 6 })) === JSON.stringify({ lineHeight: 27, promptSize: 19, promptLineHeight: 29, height: 208 }), JSON.stringify(previewMetrics({ previewFontSize: 18, previewLines: 6 })));

// 刻度长度渐变：锚点是悬停（预览）那根 —— 悬停处 30，向外 23 / 18 / 14 / 13，
// 其余保持内置宽度（普通 12 / 未加载 8 / 选中 20）。渐变不碰选中轮。
check('悬停（预览）刻度最长（32px）', right.includes('.eGxaPq_markPreview::before{width:32px !important}'), right);
check('上下 1 格缩到 21px', right.includes('.eGxaPq_markPosition:has(.eGxaPq_markPreview) + .eGxaPq_markPosition .eGxaPq_mark::before,.eGxaPq_markPosition:has(+ .eGxaPq_markPosition .eGxaPq_markPreview) .eGxaPq_mark::before{width:21px !important}'));
// 渐变末端（悬停向外第 2 格）的规则：两侧各要链满 2 个相邻兄弟 `+`，才正好指向「距悬停处第 2 格」。
const ruleEndingWith = (css, tail) => (css.match(new RegExp('[^{}]*' + tail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) ?? [''])[0];
const rule14 = ruleEndingWith(right, '{width:14px !important}');
check('悬停向外第 2 格（渐变末端）缩到 14px，且两侧各链 2 个相邻兄弟', rule14 !== '' && (rule14.match(/\+ \.eGxaPq_markPosition/g) ?? []).length === 4, rule14);
check('框架加宽到 36px（给 32px 尖端留出裁剪盒）', right.includes('.eGxaPq_frame{width:36px !important}'), right);
check('左侧轨道同样加宽框架', left.includes('.eGxaPq_frame{width:36px !important}'));
check('关闭定位条时不加宽框架', !disabled.includes('width:36px'));
check('更远处不重写长度（沿用内置 12px）', !right.includes('width:12px !important'));
check('渐变不锚定选中轮（markActive 宽度不被改写）', !right.includes('markActive::before{width'), right);
check('左侧轨道同样带长度渐变', left.includes('.eGxaPq_markPreview::before{width:32px !important}') && left.includes('width:21px !important') && left.includes('width:14px !important'));

for (const [label, css] of [['right', right], ['left', left]]) {
	const balanced = (css.match(/\{/g) ?? []).length === (css.match(/\}/g) ?? []).length;
	check(`${label} 规则花括号配平`, balanced);
	check(`${label} 规则不含 undefined/NaN`, !css.includes('undefined') && !css.includes('NaN'), css);
}

console.log('normalizeSettings');
check('空值回落默认', JSON.stringify(normalizeSettings(undefined)) === JSON.stringify(DEFAULTS), JSON.stringify(normalizeSettings(undefined)));
check('粗细超上限夹到 8', normalizeSettings({ thickness: 99 }).thickness === 8);
check('粗细低于下限夹到 1', normalizeSettings({ thickness: 0 }).thickness === 1);
check('非数字粗细回落默认', normalizeSettings({ thickness: 'thick' }).thickness === DEFAULTS.thickness);
check('未知轨道侧回落右侧', normalizeSettings({ side: 'up' }).side === 'right');
check('左侧保留', normalizeSettings({ side: 'left' }).side === 'left');
check('预览行数越界夹到 6', normalizeSettings({ previewLines: 42 }).previewLines === 6);
check(`预览字号越界夹到 ${PREVIEW_FONT_MAX}`, normalizeSettings({ previewFontSize: 99 }).previewFontSize === PREVIEW_FONT_MAX);
check(`预览字号低于下限夹到 ${PREVIEW_FONT_MIN}`, normalizeSettings({ previewFontSize: 2 }).previewFontSize === PREVIEW_FONT_MIN);
check('非数字字号回落默认', normalizeSettings({ previewFontSize: 'big' }).previewFontSize === DEFAULTS.previewFontSize);
check(`预览宽度越界夹到 ${PREVIEW_WIDTH_MAX}`, normalizeSettings({ previewWidth: 9999 }).previewWidth === PREVIEW_WIDTH_MAX);
check(`预览宽度低于下限夹到 ${PREVIEW_WIDTH_MIN}`, normalizeSettings({ previewWidth: 10 }).previewWidth === PREVIEW_WIDTH_MIN);
check('显式 false 保留', normalizeSettings({ enabled: false }).enabled === false && normalizeSettings({}).enabled === true);
check('默认值判定（sameSettings）认得全字段', sameSettings(normalizeSettings(undefined), DEFAULTS) === true && sameSettings(normalizeSettings({ previewWidth: 320 }), DEFAULTS) === false);
check('恢复默认覆盖全部可持久化字段', JSON.stringify(SETTINGS_FIELDS) === JSON.stringify(['enabled', 'thickness', 'side', 'previewLines', 'previewFontSize', 'previewWidth']), JSON.stringify(SETTINGS_FIELDS));

// ---------------------------------------------------------------------------
// apply 端到端（桩服务 + 桩 DOM）：覆盖装载期真正跑的那条路径 ——
// 字典注册、设置作用域绑定、覆盖样式挂载、设置页注册、排障钩子与清理。
// ---------------------------------------------------------------------------

/** 桩 DOM：只有一个内置轨道框架，样式标签落进 head。 */
const railFrame = makeCandidate('eGxaPq_frame', 'eGxaPq');
const createdNodes = [];
const documentStub = {
	head: { appendChild: (node) => createdNodes.push(node) },
	documentElement: {},
	querySelectorAll: (selector) => (selector === '[class*="_frame"]' ? [railFrame] : []),
	createElement: (tag) => ({ tag, dataset: {}, textContent: '', removed: false, remove() { this.removed = true; } }),
	querySelector: () => null,
};

const styleTagOf = () => createdNodes.find((node) => node.tag === 'style');

const windowApplyStub = { __ModuleLoader__: { load: (loaded) => { applyDefinition = loaded; } } };
let applyDefinition;
new Function('window', 'document', source)(windowApplyStub, documentStub);
if (applyDefinition === undefined) throw new Error('verify-client: apply 侧的工厂没有被捕获');

const dictionaries = [];
const registeredSlots = [];
const scopeWrites = [];
const scopeUnsets = [];
const disposers = [];
const t = (key, params) => {
	const dict = dictionaries.at(-1)?.dicts?.zh ?? {};
	const template = dict[key] ?? key;
	return params === undefined ? template : template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
};
// 桩作用域做成会广播的小 store：既覆盖「写回宿主」的回执路径，
// 也覆盖「宿主重新注册出字段后自动补写」的自愈路径。
// 初始 value 是**旧版宿主半侧**的完整解（v1.1.0 只有这 5 个字段，没有字号/宽度）。
const hostState = { status: 'ready', value: { enabled: true, thickness: 4, side: 'left', previewLines: 3 }, writable: true, revision: 1 };
const scopeListeners = new Set();
const notifyScope = () => {
	for (const listener of [...scopeListeners]) listener();
};
const scope = {
	getSnapshot: () => ({ ...hostState, value: { ...hostState.value } }),
	subscribe: (listener) => {
		scopeListeners.add(listener);
		return () => scopeListeners.delete(listener);
	},
	set: (field, value) => {
		scopeWrites.push([field, value]);
		hostState.value = { ...hostState.value, [field]: value };
		notifyScope();
		return Promise.resolve();
	},
	unset: (field) => {
		scopeUnsets.push(field);
		const { [field]: _dropped, ...rest } = hostState.value;
		hostState.value = rest;
		notifyScope();
		return Promise.resolve();
	},
};
const ctxStub = {
	effect: (fn) => {
		const disposer = fn();
		disposers.push(disposer);
		return disposer;
	},
	locale: {
		register: (ns, dicts) => {
			dictionaries.push({ ns, dicts });
			return () => {};
		},
		bind: () => t,
	},
	settingsScope: { bind: (spec) => ({ spec, ...scope }) },
	slots: {
		inject: (name, callback) => {
			registeredSlots.push({ name, entry: callback() });
		},
		register: (options, component) => ({ options, component }),
	},
};

const applyPlugin = applyDefinition.factory(requireStub);
applyPlugin.apply(ctxStub);

console.log('');
console.log('apply（桩服务）');
check('注册了 chat-locator 字典（zh/en）', dictionaries.length === 1 && dictionaries[0].ns === 'chat-locator' && typeof dictionaries[0].dicts?.zh?.nav === 'string' && typeof dictionaries[0].dicts?.en?.nav === 'string');
check('设置作用域绑定到同名命名空间', ctxStub.settingsScope !== undefined && registeredSlots.length === 1);
check('设置页注册在 settings.section 的 chat-locator 格', registeredSlots[0].name === 'settings.section' && registeredSlots[0].entry.options.id === 'chat-locator' && registeredSlots[0].entry.options.order === 41);
check('设置页导航名走本地化', registeredSlots[0].entry.options.label() === '对话定位条', registeredSlots[0].entry.options.label());
check('设置页拿到 store / update / reset / t', typeof registeredSlots[0].entry.options.inject().store?.getSnapshot === 'function' && typeof registeredSlots[0].entry.options.inject().update === 'function' && typeof registeredSlots[0].entry.options.inject().reset === 'function' && registeredSlots[0].entry.options.inject().t === t);
const injected = registeredSlots[0].entry.options.inject();
check('配置从宿主设置段采纳（thickness=4 / side=left）', injected.store.getSnapshot().thickness === 4 && injected.store.getSnapshot().side === 'left', JSON.stringify(injected.store.getSnapshot()));
check('缺失的宿主字段落到默认值（字号 12 / 宽度 300）', injected.store.getSnapshot().previewFontSize === DEFAULTS.previewFontSize && injected.store.getSnapshot().previewWidth === DEFAULTS.previewWidth, JSON.stringify(injected.store.getSnapshot()));

const styleTag = styleTagOf();
check('挂载了自有覆盖样式标签', styleTag !== undefined && styleTag.dataset.pluginCss === 'chat-locator/rail.css');
check('覆盖样式按发现的前缀与配置生成', styleTag.textContent.includes('.eGxaPq_mark::before{height:4px') && styleTag.textContent.includes('.eGxaPq_frame{right:auto'), styleTag.textContent);
check('覆盖样式带上曲线渐变的四档长度', [32, 21, 14].every((width) => styleTag.textContent.includes(`width:${width}px !important`)), styleTag.textContent);

const debug = windowApplyStub.__dshChatLocator;
check('排障钩子暴露版本与状态', debug?.version === '1.3.0' && debug.state().railPrefix === 'eGxaPq' && debug.state().railFound === true, JSON.stringify(debug?.version));
check('排障钩子带上宿主设置状态', debug.state().settingsStatus.status === 'ready' && debug.state().settingsStatus.writable === true);

injected.update('thickness', 6);
check('改动先落本地快照', injected.store.getSnapshot().thickness === 6);
check('改动写回宿主设置段', scopeWrites.length === 1 && scopeWrites[0][0] === 'thickness' && scopeWrites[0][1] === 6, JSON.stringify(scopeWrites));
check('改动即时反映到覆盖样式', styleTag.textContent.includes('height:6px'), styleTag.textContent);

// 宿主半侧还是旧 schema 时的模拟：设置段里没有 previewWidth，
// 这次选择先留在会话里，而不是交给旧 schema 丢掉。
const writesBeforeWidth = scopeWrites.length;
injected.update('previewWidth', 360);
check('宿主还不认的字段先不写（避免被旧 schema 丢掉）', scopeWrites.length === writesBeforeWidth, JSON.stringify(scopeWrites.slice(writesBeforeWidth)));
check('宿主还不认的字段仍即时生效', injected.store.getSnapshot().previewWidth === 360 && styleTag.textContent.includes('.eGxaPq_preview{width:min(360px, 100cqw - 120px) !important}'), styleTag.textContent);
check('会话内暂存的字段记进状态（界面据此提示）', JSON.stringify(debug.state().settingsStatus.unsupported) === JSON.stringify(['previewWidth']), JSON.stringify(debug.state().settingsStatus.unsupported));

// ---------------------------------------------------------------------------
// 设置页渲染（直接调用组件 + 极简 React 桩）：小样的曲线渐变与随字号/行数长高的框。
// 桩不是渲染器，所以这里自己展开函数组件（它们都没有 hooks；根组件由测试直接调用）。
// ---------------------------------------------------------------------------
const Section = registeredSlots[0].entry.component;
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

let sectionNodes = flatten(Section(injected));
const containerOf = (nodes) => nodes.find((node) => node?.props?.style?.position === 'relative' && node.props.style.width === '100%');
const ticksOf = (nodes) => nodes
	.filter((node) => node?.type === 'span'
		&& typeof node?.props?.style?.top === 'string'
		// 刻度的贴边量固定 10px，用它把开关滑块（left 2px / 22px）之类排除掉。
		&& (node.props.style.left === '10px' || node.props.style.right === '10px'))
	.sort((left, right) => parseFloat(left.props.style.top) - parseFloat(right.props.style.top));
const resetButtonOf = (nodes) => nodes.find((node) => node?.type === 'button' && node?.props?.['aria-label'] === '恢复默认');
const cardOf = (nodes) => nodes.find((node) => node?.props?.style?.boxSizing === 'border-box' && node?.props?.style?.borderRadius === '10px');
const responseOf = (nodes) => nodes.find((node) => node?.props?.style?.WebkitLineClamp !== undefined);

check('小样容器随字号与行数长高（12px / 3 行 → 100+44=144px）', containerOf(sectionNodes)?.props?.style?.height === '144px', JSON.stringify(containerOf(sectionNodes)?.props?.style?.height));
let widths = ticksOf(sectionNodes).map((node) => node.props.style.width);
check('小样刻度共 7 根（悬停 + 每侧 2 格 + 各自一格过渡）', widths.length === 7, JSON.stringify(widths));
check('小样刻度长度 4 档且左右对称：12/14/21/32/21/14/12', JSON.stringify(widths) === JSON.stringify(['12px', '14px', '21px', '32px', '21px', '14px', '12px']), JSON.stringify(widths));
check('小样预览卡让开最长刻度（32+16=48px）', (cardOf(sectionNodes)?.props?.style?.right ?? cardOf(sectionNodes)?.props?.style?.left) === '48px', JSON.stringify(cardOf(sectionNodes)?.props?.style));
check('小样每根刻度都用当前粗细', ticksOf(sectionNodes).every((node) => node.props.style.height === '6px'));
check('小样刻度按当前轨道侧贴边', ticksOf(sectionNodes).every((node) => node.props.style.left === '10px' && node.props.style.right === undefined));
check('小样预览卡用当前字号与行高', responseOf(sectionNodes)?.props?.style?.fontSize === '12px' && responseOf(sectionNodes)?.props?.style?.lineHeight === '18px', JSON.stringify(responseOf(sectionNodes)?.props?.style?.fontSize));
check('小样预览卡用当前宽度', cardOf(sectionNodes)?.props?.style?.width === '360px', JSON.stringify(cardOf(sectionNodes)?.props?.style?.width));
const legacyNotices = (nodes) => nodes
	.map((node) => (typeof node?.children?.[0] === 'string' ? node.children[0] : ''))
	.filter((text) => text.includes('重启一次 DSH 宿主'));
check('宿主半侧是旧结构时界面如实提示（不谎称已存住）', legacyNotices(sectionNodes).length === 1 && legacyNotices(sectionNodes)[0].includes('预览框宽度'), JSON.stringify(legacyNotices(sectionNodes)));

injected.update('previewLines', 6);
sectionNodes = flatten(Section(injected));
check('行数改到 6 后小样继续长高（154+44=198px）', containerOf(sectionNodes)?.props?.style?.height === '198px', JSON.stringify(containerOf(sectionNodes)?.props?.style?.height));
check('小样预览卡行数跟随配置', responseOf(sectionNodes)?.props?.style?.WebkitLineClamp === 6, JSON.stringify(responseOf(sectionNodes)?.props?.style?.WebkitLineClamp));
check('行数 6 也写进真实轨道的覆盖样式', styleTag.textContent.includes('--turn-preview-height:154px !important'), styleTag.textContent);

injected.update('previewFontSize', 18);
sectionNodes = flatten(Section(injected));
check('字号改到 18 后小样再长高（208+44=252px）', containerOf(sectionNodes)?.props?.style?.height === '252px', JSON.stringify(containerOf(sectionNodes)?.props?.style?.height));
check('字号 18 也写进真实轨道的覆盖样式', styleTag.textContent.includes('--turn-preview-height:208px !important') && styleTag.textContent.includes('font-size:18px !important'), styleTag.textContent);
check('字号改后小样预览卡字号跟随', responseOf(sectionNodes)?.props?.style?.fontSize === '18px' && responseOf(sectionNodes)?.props?.style?.lineHeight === '27px');

// 宿主重启后重新注册出这两个字段：会话里攒下的选择自动补写，提示随之消失。
hostState.value = { ...hostState.value, previewFontSize: 12, previewWidth: 300 };
notifyScope();
check('宿主重新认得字段后自动补写字号', scopeWrites.some(([field, value]) => field === 'previewFontSize' && value === 18), JSON.stringify(scopeWrites));
check('宿主重新认得字段后自动补写宽度', scopeWrites.some(([field, value]) => field === 'previewWidth' && value === 360), JSON.stringify(scopeWrites));
check('补写后会话暂存清空', JSON.stringify(debug.state().settingsStatus.unsupported) === '[]', JSON.stringify(debug.state().settingsStatus.unsupported));
check('补写后本地快照仍是用户选的值', injected.store.getSnapshot().previewFontSize === 18 && injected.store.getSnapshot().previewWidth === 360, JSON.stringify(injected.store.getSnapshot()));
sectionNodes = flatten(Section(injected));
check('补写后提示消失', legacyNotices(sectionNodes).length === 0, JSON.stringify(legacyNotices(sectionNodes)));

// 「恢复默认」：逐项清空用户层（unset），字段于是退回宿主 schema 默认值。
check('改动过配置时「恢复默认」可用', resetButtonOf(sectionNodes)?.props?.disabled === false);
const writesBeforeReset = scopeWrites.length;
injected.reset();
check(`恢复默认逐项清空全部 ${SETTINGS_FIELDS.length} 个字段`, scopeUnsets.length === SETTINGS_FIELDS.length && JSON.stringify(scopeUnsets) === JSON.stringify([...SETTINGS_FIELDS]), JSON.stringify(scopeUnsets));
check('恢复默认把本地快照拉回出厂值', sameSettings(injected.store.getSnapshot(), DEFAULTS) === true, JSON.stringify(injected.store.getSnapshot()));
check('恢复默认只 unset、不把默认值再写一遍', scopeWrites.length === writesBeforeReset, JSON.stringify(scopeWrites));
sectionNodes = flatten(Section(injected));
check('已是默认值时「恢复默认」置灰', resetButtonOf(sectionNodes)?.props?.disabled === true);
check('已是默认值时小样高度也回到 144px', containerOf(sectionNodes)?.props?.style?.height === '144px');

// 悬停预览不再有开关：定位条本身就是用来浏览的，所以设置页不该再出现这一行，
// 小样也恒定渲染预览卡与渐变注脚。
const titleOf = (nodes) => nodes
	.filter((node) => Array.isArray(node?.children) && node.children.length === 1 && typeof node.children[0] === 'string')
	.map((node) => node.children[0]);
const titles = titleOf(sectionNodes);
check('设置页不再有「悬停预览」开关行', !titles.includes('悬停预览'), JSON.stringify(titles));
check('预览的行数 / 字号 / 宽度三行仍在', ['预览正文行数', '预览字号', '预览框宽度'].every((title) => titles.includes(title)), JSON.stringify(titles));
check('小样恒定渲染预览卡', sectionNodes.some((node) => Array.isArray(node?.children) && node.children.includes('把这段说明改写成三条要点')));
check('小样注脚恒定是渐变说明', sectionNodes.some((node) => Array.isArray(node?.children) && node.children.some((child) => typeof child === 'string' && child.startsWith('小样：'))));

for (const disposer of [...disposers].reverse()) if (typeof disposer === 'function') disposer();
check('清理后移除样式标签', styleTag.removed === true);
check('清理后移除排障钩子', windowApplyStub.__dshChatLocator === undefined);

console.log('');
if (failures.length > 0) {
	console.error(`verify-client: ${failures.length} 项失败`);
	process.exit(1);
}
console.log('verify-client: 全部通过');
