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
/** 版本号，用来钉住「client.js 与 package.json 不会各说各话」。 */
const packageJson = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));

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
/** 沙箱内注入的 localStorage（由 apply 侧求值前赋值），桩的持久化走它。 */
let sandboxLocalStorage = undefined;
const requireStub = (spec) => {
	if (spec === 'react') return reactStub;
	if (spec === '@deepseek-ai/dsh-client-store') {
		return {
			/**
			 * 快照存储桩：与 dsh-client-store 的 getSnapshot/subscribe/set 同形，
			 * 并模拟 attachPersistence 的 localStorage 往返（创建时 rehydrate、
			 * set 时 JSON 写回），否则本地持久化路径测不到。
			 */
			createSnapshotStore: (initial, options) => {
				let state = initial;
				const listeners = new Set();
				const name = options?.persist?.name;
				const storage = sandboxLocalStorage;
				if (name && typeof storage !== 'undefined') {
					try {
						const raw = storage.getItem(name);
						if (raw !== null) state = JSON.parse(raw);
					} catch { /* 损坏数据当作不存在 */ }
				}
				const flush = () => {
					if (name && typeof storage !== 'undefined') {
						try { storage.setItem(name, JSON.stringify(state)); } catch { /* 配额满忽略 */ }
					}
					for (const fn of listeners) fn();
				};
				return {
					getSnapshot: () => state,
					subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
					set: (next) => {
						state = next;
						flush();
					},
				};
			},
		};
	}
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
	PLUGIN_VERSION,
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
check('空候选列表也返回 null', discoverRail({ querySelectorAll: () => [] }) === null);
// client.js 是在没有 `document` 的作用域里求值的（Node 里这个全局不存在），
// 所以无参调用真的走 `typeof document === 'undefined'` 那条分支。
check('缺少 document 时无参调用返回 null（真正走到 undefined 分支）', typeof document === 'undefined' && discoverRail() === null, `typeof document = ${typeof document}`);

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

// 刻度长度渐变：锚点是悬停（预览）那根 —— 悬停处 32，向外 21 / 14，
// 其余保持内置宽度（普通 12 / 未加载 8 / 选中 20）。邻居规则都带
// `:not(.P_markActive)`，所以活跃轮即使落在悬停处 1–2 格内也不会被改写。
// 0.1.7 起内置刻度是 _marks 容器下互为相邻兄弟的 button：选择器走相邻兄弟链，
// 且每条宽度规则同时把 transform 压回 translateY(-50%)（内置用 scaleX 量宽度）。
check('悬停（预览）刻度最长（32px）且去掉内置 scaleX', right.includes('.eGxaPq_markPreview::before{width:32px !important;transform:translateY(-50%) !important}'), right);
check('上下 1 格缩到 21px（下方相邻兄弟 + 上方 :has 反向指，且都排除活跃轮）', right.includes('.eGxaPq_markPreview + .eGxaPq_mark:not(.eGxaPq_markActive)::before,.eGxaPq_mark:not(.eGxaPq_markActive):has(+ .eGxaPq_markPreview)::before{width:21px !important;transform:translateY(-50%) !important}'), right);
// 渐变末端（悬停向外第 2 格）的规则：下方从悬停刻度链 2 个 `+ .P_mark`，
// 上方用 :has() 经 1 个中间刻度反向指回悬停刻度 —— 两侧都正好落在「距悬停处第 2 格」。
const ruleEndingWith = (css, tail) => (css.match(new RegExp('[^{}]*' + tail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))) ?? [''])[0];
const rule14 = ruleEndingWith(right, '{width:14px !important');
check('悬停向外第 2 格（渐变末端）缩到 14px：下方链 2 格、上方反向指回悬停刻度', rule14 !== '' && rule14.includes('.eGxaPq_markPreview + .eGxaPq_mark:not(.eGxaPq_markActive) + .eGxaPq_mark:not(.eGxaPq_markActive)::before') && rule14.includes('.eGxaPq_mark:not(.eGxaPq_markActive):has(+ .eGxaPq_mark:not(.eGxaPq_markActive) + .eGxaPq_markPreview)::before'), rule14);
check('框架加宽到 36px（给 32px 尖端留出裁剪盒）', right.includes('.eGxaPq_frame{width:36px !important}'), right);
check('左侧轨道同样加宽框架', left.includes('.eGxaPq_frame{width:36px !important}'));
check('关闭定位条时不加宽框架', !disabled.includes('width:36px'));
check('更远处不重写长度（沿用内置 12px）', !right.includes('width:12px !important'));
// 活跃轮保护：每条距离规则的每个选择器都要带 :not(.P_markActive)。
// 距离 1 的选择器对里各出现 1 次（共 2），距离 2 的各出现 2 次（共 4）。
const activeGuard = ':not(.eGxaPq_markActive)';
const guardCount = (text) => text.split(activeGuard).length - 1;
const neighborPair1 = ruleEndingWith(right, '{width:21px !important');
const neighborPair2 = ruleEndingWith(right, '{width:14px !important');
check('邻居选择器都排除活跃轮（:not(.P_markActive)），活跃轮宽度不再被改写', guardCount(neighborPair1) === 2 && guardCount(neighborPair2) === 4, `${guardCount(neighborPair1)} / ${guardCount(neighborPair2)}`);
check('左侧轨道同样带长度渐变', left.includes('.eGxaPq_markPreview::before{width:32px !important;transform:translateY(-50%) !important}') && left.includes('width:21px !important') && left.includes('width:14px !important'));

// 长度渐变开关：关掉后整族宽度规则（悬停峰值 + 距离链）与框架加宽一起消失，
// 回到内置外观；粗细、轨道侧与预览卡的规则一条不受影响。
const noGradient = railStyleText('eGxaPq', { ...base, gradient: false });
check('关闭渐变时不写悬停峰值与距离链', !noGradient.includes('markPreview::before{width') && !noGradient.includes(':has('), noGradient);
check('关闭渐变时框架不加宽（保持内置 28px，不白添交互带）', !noGradient.includes('width:36px'), noGradient);
check('关闭渐变时刻度粗细仍然生效', noGradient.includes('.eGxaPq_mark::before{height:5px !important;border-radius:3px !important}'));
check('关闭渐变时预览卡规则仍在', noGradient.includes('.eGxaPq_preview{width:min(300px, 100cqw - 120px) !important}') && noGradient.includes('--turn-preview-height:100px !important'));
check('关闭渐变且左侧时仍镜像轨道', railStyleText('eGxaPq', { ...base, side: 'left', gradient: false }).includes('_frame{right:auto !important'));

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
check('渐变可显式关闭', normalizeSettings({ gradient: false }).gradient === false && normalizeSettings({}).gradient === true);
check('默认值判定（sameSettings）认得全字段', sameSettings(normalizeSettings(undefined), DEFAULTS) === true && sameSettings(normalizeSettings({ previewWidth: 320 }), DEFAULTS) === false && sameSettings(normalizeSettings({ gradient: false }), DEFAULTS) === false);
check('恢复默认覆盖全部可持久化字段', JSON.stringify(SETTINGS_FIELDS) === JSON.stringify(['enabled', 'gradient', 'thickness', 'side', 'previewLines', 'previewFontSize', 'previewWidth']), JSON.stringify(SETTINGS_FIELDS));

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

const dictionaries = [];
const registeredSlots = [];
const disposers = [];
const t = (key, params) => {
	const dict = dictionaries.at(-1)?.dicts?.zh ?? {};
	const template = dict[key] ?? key;
	return params === undefined ? template : template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
};
// 本地持久化桩：0.1.7 起 settingsScope 服务被移除，插件的设置改落浏览器
// localStorage（键 dsh.chat-locator.settings）。这里预置一份存量配置，
// 覆盖「采纳已存设置」与「改动即时写回」两条路径。
const PERSIST_KEY = 'dsh.chat-locator.settings';
const localStorageStub = {
	backing: new Map([[
		PERSIST_KEY,
		JSON.stringify({ enabled: true, thickness: 4, side: 'left', previewLines: 3 }),
	]]),
	getItem: (name) => (localStorageStub.backing.has(name) ? localStorageStub.backing.get(name) : null),
	setItem: (name, value) => localStorageStub.backing.set(name, String(value)),
	removeItem: (name) => localStorageStub.backing.delete(name),
};
const persistedOf = () => {
	const raw = localStorageStub.backing.get(PERSIST_KEY);
	return raw === undefined ? {} : JSON.parse(raw);
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
	slots: {
		inject: (name, callback) => {
			registeredSlots.push({ name, entry: callback() });
		},
		register: (options, component) => ({ options, component }),
	},
};

new Function('window', 'document', 'localStorage', source)(windowApplyStub, documentStub, localStorageStub);
sandboxLocalStorage = localStorageStub;
if (applyDefinition === undefined) throw new Error('verify-client: apply 侧的工厂没有被捕获');
const applyPlugin = applyDefinition.factory(requireStub);
applyPlugin.apply(ctxStub);

console.log('');
console.log('apply（桩服务）');
check('注册了 chat-locator 字典（zh/en）', dictionaries.length === 1 && dictionaries[0].ns === 'chat-locator' && typeof dictionaries[0].dicts?.zh?.nav === 'string' && typeof dictionaries[0].dicts?.en?.nav === 'string');
check('0.1.7 起不再依赖 settingsScope（inject 仅 slots/locale）', JSON.stringify(applyPlugin.inject) === JSON.stringify(['slots', 'locale']), JSON.stringify(applyPlugin.inject));
check('设置页注册在 settings.section 的 chat-locator 格', registeredSlots[0].name === 'settings.section' && registeredSlots[0].entry.options.id === 'chat-locator' && registeredSlots[0].entry.options.order === 41);
check('设置页导航名走本地化', registeredSlots[0].entry.options.label() === '对话定位条', registeredSlots[0].entry.options.label());
check('设置页拿到 store / update / reset / t', typeof registeredSlots[0].entry.options.inject().store?.getSnapshot === 'function' && typeof registeredSlots[0].entry.options.inject().update === 'function' && typeof registeredSlots[0].entry.options.inject().reset === 'function' && registeredSlots[0].entry.options.inject().t === t);
const injected = registeredSlots[0].entry.options.inject();
check('配置从本地持久化采纳（thickness=4 / side=left）', injected.store.getSnapshot().thickness === 4 && injected.store.getSnapshot().side === 'left', JSON.stringify(injected.store.getSnapshot()));
check('缺失的本地字段落到默认值（字号 12 / 宽度 300）', injected.store.getSnapshot().previewFontSize === DEFAULTS.previewFontSize && injected.store.getSnapshot().previewWidth === DEFAULTS.previewWidth, JSON.stringify(injected.store.getSnapshot()));

const styleTag = styleTagOf();
check('挂载了自有覆盖样式标签', styleTag !== undefined && styleTag.dataset.pluginCss === 'chat-locator/rail.css');
check('覆盖样式按发现的前缀与配置生成', styleTag.textContent.includes('.eGxaPq_mark::before{height:4px') && styleTag.textContent.includes('.eGxaPq_frame{right:auto'), styleTag.textContent);
check('覆盖样式带上曲线渐变的四档长度', [32, 21, 14].every((width) => styleTag.textContent.includes(`width:${width}px !important`)), styleTag.textContent);

const debug = windowApplyStub.__dshChatLocator;
check('排障钩子暴露版本与状态', debug?.version === PLUGIN_VERSION && debug.state().railPrefix === 'eGxaPq' && debug.state().railFound === true, JSON.stringify(debug?.version));
// 版本号写在 client.js 与 package.json 两处，漂了就发错版本的包 —— 所以直接从
// package.json 读，两边对不上就红（不再靠测试里硬编码的版本字符串）。
check('client.js 的 PLUGIN_VERSION 与 package.json 的 version 一致', PLUGIN_VERSION === packageJson.version, `client.js=${PLUGIN_VERSION} package.json=${packageJson.version}`);
check('排障钩子带上生效配置（本地持久化值 + 缺省补默认）', debug.state().config.thickness === 4 && debug.state().config.side === 'left' && debug.state().config.previewFontSize === DEFAULTS.previewFontSize && debug.state().config.previewWidth === DEFAULTS.previewWidth, JSON.stringify(debug.state().config));
// 状态面只有轨道字段：会话暂存链路移除后，settingsStatus 之类的东西不该回来。
check('排障钩子的状态只报告轨道字段（已无会话暂存状态）', JSON.stringify(Object.keys(debug.state()).sort()) === JSON.stringify(['config', 'railFound', 'railPrefix', 'rules']), JSON.stringify(Object.keys(debug.state()).sort()));

injected.update('thickness', 6);
check('改动先落本地快照', injected.store.getSnapshot().thickness === 6);
check('改动写回本地持久化', persistedOf().thickness === 6, JSON.stringify(persistedOf()));
check('改动即时反映到覆盖样式', styleTag.textContent.includes('height:6px'), styleTag.textContent);

// 本地持久化没有「旧 schema 不认字段」的问题：任何字段的首次改动都直接落盘，
// 界面的「仅本次会话生效」提示永远不该出现。
injected.update('previewWidth', 360);
check('新字段首次改动也即时持久化', persistedOf().previewWidth === 360, JSON.stringify(persistedOf()));
check('改动仍即时生效', injected.store.getSnapshot().previewWidth === 360 && styleTag.textContent.includes('.eGxaPq_preview{width:min(360px, 100cqw - 120px) !important}'), styleTag.textContent);
check('0.1.7 起设置页注入面不再带 statusStore（宿主链路已移除）', injected.statusStore === undefined && Object.keys(injected).sort().join() === 'reset,store,t,update', JSON.stringify(Object.keys(injected).sort()));

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
// 步进器的可达名：每个 +/- 都要带所在行的名字，否则八个按钮全叫「减小」/「增大」。
const stepLabels = sectionNodes
	.filter((node) => node?.type === 'button' && typeof node?.props?.['aria-label'] === 'string' && / (减小|增大)$/.test(node.props['aria-label']))
	.map((node) => node.props['aria-label']);
check('四个步进器的 +/- 都带所在行的名字', JSON.stringify(stepLabels) === JSON.stringify([
	'横线粗细 减小', '横线粗细 增大',
	'预览正文行数 减小', '预览正文行数 增大',
	'预览字号 减小', '预览字号 增大',
	'预览框宽度 减小', '预览框宽度 增大',
]), JSON.stringify(stepLabels));
// 设置页只该渲染字典里的文案：任何字典之外的硬编码提示（例如旧版「仅本次会话生效」
// 那类会话暂存提示）都会让这条断言变红 —— 而不是去 grep 一个早就删掉的字符串。
const zhDict = dictionaries.at(-1).dicts.zh;
const dictionaryPatterns = Object.values(zhDict)
	.filter((value) => typeof value === 'string')
	.map((value) => new RegExp('^' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{value\\\}/g, '\\d+') + '$'));
const textChildrenOf = (nodes) => nodes.flatMap((node) => (Array.isArray(node?.children) ? node.children.filter((child) => typeof child === 'string') : []));
const isDictionaryCopy = (text) => /^[0-9−+]+$/.test(text) || dictionaryPatterns.some((pattern) => pattern.test(text));
const strayCopy = textChildrenOf(sectionNodes).filter((text) => !isDictionaryCopy(text));
check('设置页只渲染字典里的文案（旧版的会话暂存提示不会偷偷回来）', strayCopy.length === 0, JSON.stringify(strayCopy));

injected.update('previewLines', 6);
sectionNodes = flatten(Section(injected));
check('行数改到 6 后小样继续长高（154+44=198px）', containerOf(sectionNodes)?.props?.style?.height === '198px', JSON.stringify(containerOf(sectionNodes)?.props?.style?.height));
check('小样预览卡行数跟随配置', responseOf(sectionNodes)?.props?.style?.WebkitLineClamp === 6, JSON.stringify(responseOf(sectionNodes)?.props?.style?.WebkitLineClamp));
check('行数 6 也写进真实轨道的覆盖样式', styleTag.textContent.includes('--turn-preview-height:154px !important'), styleTag.textContent);
check('行数 6 同步写进本地持久化', persistedOf().previewLines === 6, JSON.stringify(persistedOf()));

injected.update('previewFontSize', 18);
sectionNodes = flatten(Section(injected));
check('字号改到 18 后小样再长高（208+44=252px）', containerOf(sectionNodes)?.props?.style?.height === '252px', JSON.stringify(containerOf(sectionNodes)?.props?.style?.height));
check('字号 18 也写进真实轨道的覆盖样式', styleTag.textContent.includes('--turn-preview-height:208px !important') && styleTag.textContent.includes('font-size:18px !important'), styleTag.textContent);
check('字号改后小样预览卡字号跟随', responseOf(sectionNodes)?.props?.style?.fontSize === '18px' && responseOf(sectionNodes)?.props?.style?.lineHeight === '27px');
check('字号 18 同步写进本地持久化', persistedOf().previewFontSize === 18, JSON.stringify(persistedOf()));

// 「恢复默认」：逐项 unset 清掉本地存储里的用户值，字段经 getSnapshot
// 回退到内置默认值；本地存储不再留任何用户覆盖。
check('改动过配置时「恢复默认」可用', resetButtonOf(sectionNodes)?.props?.disabled === false);
injected.reset();
check('恢复默认清空本地存储里的全部用户覆盖', Object.keys(persistedOf()).length === 0, JSON.stringify(persistedOf()));
check('恢复默认把本地快照拉回出厂值', sameSettings(injected.store.getSnapshot(), DEFAULTS) === true, JSON.stringify(injected.store.getSnapshot()));
sectionNodes = flatten(Section(injected));
check('已是默认值时「恢复默认」置灰', resetButtonOf(sectionNodes)?.props?.disabled === true);
check('已是默认值时小样高度也回到 144px', containerOf(sectionNodes)?.props?.style?.height === '144px');

// 悬停预览没有开关（定位条本身就是用来浏览的），但长度渐变有：关掉它只是回到
// 内置外观，预览、跳转与分页都不受影响。设置页因此多一行「长度渐变」开关。
const titleOf = (nodes) => nodes
	.filter((node) => Array.isArray(node?.children) && node.children.length === 1 && typeof node.children[0] === 'string')
	.map((node) => node.children[0]);
const titles = titleOf(sectionNodes);
check('设置页没有「悬停预览」开关行', !titles.includes('悬停预览'), JSON.stringify(titles));
check('设置页有「长度渐变」开关行', titles.includes('长度渐变'), JSON.stringify(titles));
check('预览的行数 / 字号 / 宽度三行仍在', ['预览正文行数', '预览字号', '预览框宽度'].every((title) => titles.includes(title)), JSON.stringify(titles));
check('小样恒定渲染预览卡', sectionNodes.some((node) => Array.isArray(node?.children) && node.children.includes('把这段说明改写成三条要点')));
check('渐变开着时小样注脚是渐变说明', sectionNodes.some((node) => Array.isArray(node?.children) && node.children.some((child) => typeof child === 'string' && child.startsWith('小样：悬停的那根最长'))));

// 关掉长度渐变：小样所有刻度回到内置 12px、卡片贴边量跟着收窄、注脚换成关闭说明；
// 真实轨道的覆盖样式同帧去掉整族宽度规则（CSS 层断言见 railStyleText 段）。
injected.update('gradient', false);
check('关闭渐变写进本地持久化', persistedOf().gradient === false, JSON.stringify(persistedOf()));
sectionNodes = flatten(Section(injected));
check('关闭渐变后小样刻度全部回到内置 12px', ticksOf(sectionNodes).every((node) => node.props.style.width === '12px'), JSON.stringify(ticksOf(sectionNodes).map((node) => node.props.style.width)));
check('关闭渐变后小样预览卡贴边量收窄到 12+16px', (cardOf(sectionNodes)?.props?.style?.right ?? cardOf(sectionNodes)?.props?.style?.left) === '28px', JSON.stringify(cardOf(sectionNodes)?.props?.style));
check('关闭渐变后小样注脚换成关闭说明', sectionNodes.some((node) => Array.isArray(node?.children) && node.children.some((child) => typeof child === 'string' && child.startsWith('小样：长度渐变已关闭'))));
check('关闭渐变时真实轨道覆盖样式不带任何宽度渐变', !styleTag.textContent.includes('markPreview::before{width') && !styleTag.textContent.includes('_frame{width:36px'), styleTag.textContent);
injected.update('gradient', true);
sectionNodes = flatten(Section(injected));
check('重新打开渐变后小样恢复 4 档长度', JSON.stringify(ticksOf(sectionNodes).map((node) => node.props.style.width)) === JSON.stringify(['12px', '14px', '21px', '32px', '21px', '14px', '12px']));

for (const disposer of [...disposers].reverse()) if (typeof disposer === 'function') disposer();
check('清理后移除样式标签', styleTag.removed === true);
check('清理后移除排障钩子', windowApplyStub.__dshChatLocator === undefined);

console.log('');
if (failures.length > 0) {
	console.error(`verify-client: ${failures.length} 项失败`);
	process.exit(1);
}
console.log('verify-client: 全部通过');
