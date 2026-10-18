/**
 * dsh-chat-locator —— 浏览器半侧（DSH 页面）。
 *
 * 目标：把对话页右侧那条「对话定位条」（每轮一枚刻度的轮次轨道）变成可配置、
 * 可持久化的插件能力，并在设置面板里给出「对话定位条」配置页：
 * 横线粗细、轨道左右侧、悬停预览的行数 / 字号 / 宽度、悬停处沿轨道收拢的
 * 刻度长度渐变，以及一键「恢复默认」。
 *
 * 三条实现约束，决定了这里的做法：
 *
 * 1. 定位条不在任何 Slot 里。它由 @deepseek-ai/dsh-client-ui-chat 的 ChatView
 *    直接渲染（TurnNavigator），Slot 系统没有给它留座位，也没有对外暴露
 *    「刻度粗细 / 轨道侧」这类配置项。因此本插件不重画一条轨道（那会丢掉内置的
 *    跳转、分页、活跃轮跟随），而是 `在运行时认领它的样式`：从活动 DOM 上发现
 *    CSS Module 的真实类名前缀（`<hash>_frame` / `<hash>_mark`），再按用户配置生成一层
 *    覆盖样式。前缀是运行时发现的，所以打包哈希变化、插件升级后依然成立。
 * 2. 配置全部存在浏览器本地（createSnapshotStore 的 persist，键
 *    `dsh.chat-locator.settings`，重启浏览器后仍在）；「恢复默认」清空用户层，
 *    让字段退回出厂默认，而不是把默认值再写一遍。宿主半侧（`./index.js`）不再
 *    承担任何职责，只是让 patch 行能解析到包入口。
 * 3. 悬停预览保持**纯文本**：那是内置实现的事 —— 预览正文来自内置的轮次大纲，
 *    由它只取文本块、折叠空白、按预算截断，所以不含思考内容、没有空白行、
 *    超长自动省略。本插件不读也不改写那份正文，只决定它的行数、字号、宽度
 *    与展开方向。
 *
 * @module dsh-chat-locator/client
 */
window.__ModuleLoader__.load({
	id: 'dsh-chat-locator',
	factory(require) {
		const React = require('react');
		const { createSnapshotStore } = require('@deepseek-ai/dsh-client-store');

		/** 本地化命名空间，同时用作本地存储键的后缀。 */
		const NAMESPACE = 'chat-locator';
		/** 覆盖样式标签的标识：重新挂载时据此替换旧标签，避免叠加两份样式。 */
		const STYLE_TAG_ID = 'chat-locator/rail.css';

		/** 版本，随排障钩子一起暴露；与 package.json 的 version 由自检钉住。 */
		const PLUGIN_VERSION = '1.5.1';

		/** 轨道未出现时的重扫间隔（毫秒）；避免在流式渲染期间反复遍历 DOM。 */
		const RESCAN_INTERVAL_MS = 400;

		/** 内置轨道的贴边量（右侧是 right:12px），左侧镜像用同一个值。 */
		const RAIL_INSET_PX = 12;
		/** 渐变档数：悬停那根 + 每侧 2 格。 */
		const GRADIENT_REACH = 3;
		/** 悬停（预览）那根的宽度。 */
		const GRADIENT_PEAK_PX = 32;
		/** 内置普通刻度的宽度（20px × scaleX(.6)），也是渐变的落点。 */
		const GRADIENT_BASE_PX = 12;
		/** 内置「悬停」刻度自身的宽度（20px × scaleX(.9)）：渐变关掉时它仍是这么长。 */
		const BUILTIN_HOVER_PX = 18;
		/**
		 * 曲线幂次。1 = 直线；越大越「先陡后平」。调参过程记在这里：
		 * 2.5 的首格掉 15px，观感陡得像断崖；1.5 平缓但邻居偏长（23 / 16），0 位不够跳；
		 * 2.0 是折中：邻居收到 21 / 14，首格 11px。
		 */
		const GRADIENT_CURVE_EXPONENT = 2;
		/**
		 * 轨道框架的宽度：比最长刻度多留 4px。
		 *
		 * 内置是 28px，而框架里的滚动容器带 overflow-y:auto，于是横轴的 visible 按规范
		 * 折算成 auto —— 框架就是刻度的裁剪盒，画到 28px 以上，多出来的尖端会被直接裁掉。
		 * 刻度贴着轨道外侧对齐，所以普通刻度位置不变，多出来的 4px 只是尖端一侧的裁剪余量。
		 * 代价：框架本身就是轨道的悬停/点击面，加宽 8px 意味着外侧多出 8px 的裁剪余量，
		 * 也一并成为交互面；关掉长度渐变时不加宽，因为那时没有尖端要画。
		 */
		const RAIL_FRAME_WIDTH_PX = GRADIENT_PEAK_PX + 4;

		/** 正文行高倍数：内置是 12px 正文配 18px 行高。 */
		const PREVIEW_LINE_RATIO = 1.5;
		/** 预览卡上下内边距（内置 10px + 10px）。 */
		const PREVIEW_PADDING_Y_PX = 10;
		/** 提示词与正文之间的间距（内置 4px）。 */
		const PREVIEW_PROMPT_MARGIN_PX = 4;
		/** 多留 2px：让 12px / 3 行的出厂值正好等于内置的 100px。 */
		const PREVIEW_SPARE_PX = 2;
		/** 预览卡正文以外的固定高度：内边距 + 间距 + 余量。 */
		const PREVIEW_CHROME_PX = PREVIEW_PADDING_Y_PX * 2 + PREVIEW_PROMPT_MARGIN_PX + PREVIEW_SPARE_PX;
		/** 小样里预览卡离容器顶部的距离（px）。 */
		const SAMPLE_CARD_TOP_PX = 32;
		/** 小样里预览卡比最长刻度再外推的距离（px）：真实轨道里卡片开在轨道内侧。 */
		const SAMPLE_CARD_PEAK_MARGIN_PX = 16;

		/** 数值字段：默认值、区间、步进与归一化在同一处定义。 */
		function numberField(defaultValue, min, max, step = 1) {
			return {
				default: defaultValue,
				min,
				max,
				step,
				normalize(value) {
					const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : Number.NaN;
					if (!Number.isFinite(number)) return defaultValue;
					return Math.min(max, Math.max(min, number));
				},
			};
		}

		/**
		 * 设置字段表 —— 唯一的字段清单：默认值、区间、步进、归一化规则，以及设置页那一行的
		 * 控件类型与文案键都写在这里。DEFAULTS / SETTINGS_FIELDS / normalizeSettings /
		 * sameSettings / 设置页各行全部由它派生，加字段只改这一处（不存在第二份会漂的清单）。
		 */
		const FIELDS = {
			enabled: { control: 'toggle', title: 'enableTitle', desc: 'enableDesc', default: true, normalize: (value) => value !== false },
			gradient: { control: 'toggle', title: 'gradientTitle', desc: 'gradientDesc', default: true, normalize: (value) => value !== false },
			thickness: { control: 'stepper', title: 'thicknessTitle', desc: 'thicknessDesc', ...numberField(2, 1, 8) },
			side: { control: 'segment', title: 'sideTitle', desc: 'sideDesc', default: 'right', normalize: (value) => (value === 'left' ? 'left' : 'right') },
			previewLines: { control: 'stepper', title: 'previewLinesTitle', desc: 'previewLinesDesc', ...numberField(3, 1, 6) },
			previewFontSize: { control: 'stepper', title: 'fontSizeTitle', desc: 'fontSizeDesc', ...numberField(12, 10, 18) },
			previewWidth: { control: 'stepper', title: 'widthTitle', desc: 'widthDesc', ...numberField(300, 200, 420, 20) },
		};
		/** 字段顺序即设置页顺序。「恢复默认」整份清空用户层，不依赖这个顺序。 */
		const SETTINGS_FIELDS = Object.keys(FIELDS);
		/** 出厂配置：缺省时的兜底，也是「恢复默认」的目标。 */
		const DEFAULTS = Object.freeze(Object.fromEntries(SETTINGS_FIELDS.map((field) => [field, FIELDS[field].default])));

		/** 把任意来源（本地存储的乐观写、损坏的存量数据）归一化成可用配置。 */
		function normalizeSettings(raw) {
			const source = raw !== null && typeof raw === 'object' ? raw : {};
			const settings = {};
			for (const field of SETTINGS_FIELDS) settings[field] = FIELDS[field].normalize(source[field]);
			return settings;
		}

		/** 配置等值判断，避免同一份设置反复触发重绘。 */
		function sameSettings(left, right) {
			for (const field of SETTINGS_FIELDS) {
				if (left[field] !== right[field]) return false;
			}
			return true;
		}

		const zh = {
			nav: '对话定位条',
			intro: '调整对话定位条：刻度横线粗细、轨道贴在左侧还是右侧、悬停预览的行数 / 字号 / 宽度。悬停时被指向的那根刻度最长，沿轨道向外按曲线依次收拢（32 / 21 / 14 / 12px）：紧挨着的那两格明显更短，之后缓缓收尾，是一条凸向轨道的弯钩，不是等差的直线；长度渐变也可以单独关掉。设置保存在此浏览器的本地存储里，重启浏览器后依然生效，但不会跨浏览器或跨设备同步；「恢复默认」可一键回到出厂值。',
			enableTitle: '显示对话定位条',
			enableDesc: '关闭后整条轨道隐藏；对话内容、轮次跳转与历史分页都不受影响。',
			gradientTitle: '长度渐变',
			gradientDesc: '悬停那根刻度沿曲线收拢的加长效果：悬停处 32px，向外 21 / 14，再往外回到内置的 12px。关掉后刻度回到内置宽度（悬停那根是内置的 18px，其余按状态 12 / 8 / 20px），不再按曲线加长；粗细、轨道侧与预览都不受影响。',
			thicknessTitle: '横线粗细',
			thicknessDesc: '每轮对话那根刻度的线宽，当前 {value}px。加粗只会让刻度更醒目，不会改变刻度间距。',
			sideTitle: '轨道位置',
			sideDesc: '轨道贴在对话区的哪一侧；悬停预览会自动改到另一侧展开，不遮住正文。',
			sideRight: '右侧',
			sideLeft: '左侧',
			previewLinesTitle: '预览正文行数',
			previewLinesDesc: '回复预览最多显示几行，当前 {value} 行；预览卡会跟着一起变高，只有超出的部分才被裁掉。',
			fontSizeTitle: '预览字号',
			fontSizeDesc: '预览卡里文字的字号，当前 {value}px；行高与卡片高度都按同一比例跟着算，放大后不会被裁掉。',
			widthTitle: '预览框宽度',
			widthDesc: '预览卡的宽度，当前 {value}px；对话区较窄时会自动收缩，不会顶出可视范围。',
			resetTitle: '恢复默认',
			resetDesc: '把上面各项恢复成出厂值：渐变开、粗细 2px、轨道在右侧、3 行、12px 字号、300px 宽。',
			resetDescDefault: '当前各项都已经是出厂值。',
			reset: '恢复默认',
			sampleTitle: '预览效果（示例）',
			sampleNote: '小样：悬停的那根最长（32px，明显比邻居突出），向外每格依次 21 / 14，再往外是普通刻度 12px。长度沿一条凸向轨道的幂曲线收拢：紧挨着的那格掉得最多，之后越来越缓。',
			sampleNoteOff: '小样：长度渐变已关闭 —— 刻度回到内置宽度：普通刻度 12px，悬停那根仍是内置的 18px，不再按曲线加长。',
			samplePrompt: '把这段说明改写成三条要点',
			sampleResponse: '已按要求整理：一、保留原意与语气；二、把重复表述合并到同一条；三、术语与原文保持一致，缩写首次出现时给全称。',
			decrease: '减小',
			increase: '增大',
		};
		const en = {
			nav: 'Conversation locator',
			intro: 'Tune the conversation locator: tick thickness, which side the track sits on, and the hover preview’s line count, font size, and width. While you hover, the pointed tick is the longest and the lengths step outward along a curve (32 / 21 / 14 / 12px): the two nearest ticks sit clearly lower, then it eases into the track — a hook bowing toward the track rather than a straight ramp; the length gradient can also be switched off on its own. Settings live in this browser’s local storage and survive a browser restart, but they do not sync across browsers or devices; Restore defaults puts everything back.',
			enableTitle: 'Show the conversation locator',
			enableDesc: 'Hides the whole track. Conversation content, turn jumps, and history paging are unaffected.',
			gradientTitle: 'Length gradient',
			gradientDesc: 'The curved taper that lengthens the hovered tick and its neighbours: 32px at the pointer, then 21 / 14 stepping outward, back to the built-in 12px beyond. With it off the ticks return to their built-in widths (18px on the hovered one, 12 / 8 / 20px by state) instead of the curve; thickness, side, and the preview are unaffected.',
			thicknessTitle: 'Tick thickness',
			thicknessDesc: 'Line height of one turn tick, currently {value}px. Thicker ticks only read stronger; tick spacing is unchanged.',
			sideTitle: 'Track side',
			sideDesc: 'Which side of the conversation the track hugs; the hover preview always opens on the other side.',
			sideRight: 'Right',
			sideLeft: 'Left',
			previewLinesTitle: 'Preview body lines',
			previewLinesDesc: 'How many lines the reply preview may show, currently {value}; the card grows with it and only the overflow is clipped.',
			fontSizeTitle: 'Preview font size',
			fontSizeDesc: 'Text size inside the preview card, currently {value}px; line height and card height scale with it, so larger text is not clipped.',
			widthTitle: 'Preview card width',
			widthDesc: 'Width of the preview card, currently {value}px; it shrinks automatically inside a narrow conversation column.',
			resetTitle: 'Restore defaults',
			resetDesc: 'Puts everything above back to factory values: gradient on, 2px thickness, right side, 3 lines, 12px text, 300px wide.',
			resetDescDefault: 'Everything is already at its factory value.',
			reset: 'Restore defaults',
			sampleTitle: 'Preview (sample)',
			sampleNote: 'Sample: the hovered tick is longest (32px, clearly ahead of its neighbours), then 21 / 14 stepping outward, and the regular 12px tick beyond. The falloff follows a power curve bowing toward the track: the first step drops the most, then it eases out.',
			sampleNoteOff: 'Sample: the length gradient is off — ticks fall back to their built-in widths: 12px normally, and the hovered tick keeps the built-in 18px instead of the curved ramp.',
			samplePrompt: 'Rewrite this note as three bullet points',
			sampleResponse: 'Done: keep the original intent and tone; merge repeated statements into one point; keep terminology consistent and spell out abbreviations on first use.',
			decrease: 'Decrease',
			increase: 'Increase',
		};

		//#region 本地设置存储
		/** 极简快照 store：getSnapshot + subscribe，可直接喂给 useSyncExternalStore。 */
		function createStore(initial, equals) {
			let value = initial;
			const listeners = new Set();
			return {
				getSnapshot: () => value,
				subscribe(listener) {
					listeners.add(listener);
					return () => {
						listeners.delete(listener);
					};
				},
				set(next) {
					if (equals(next, value)) return;
					value = next;
					for (const listener of [...listeners]) {
						try {
							listener();
						} catch (error) {
							console.error('[chat-locator]', error);
						}
					}
				},
			};
		}

		/**
		 * 配置策略：本地持久化的原始值 -> 归一化快照 -> 设置页。
		 *
		 * 持久化走 createSnapshotStore 的 persist（键 `dsh.chat-locator.settings`），写入同步
		 * 落本地；归一化快照是另一个 store，只在值真的变化时换新对象，于是 React 的
		 * useSyncExternalStore 与覆盖样式都按对象身份判断，不会空转。
		 */
		function createSettingsPolicy() {
			const raw = createSnapshotStore({}, { persist: { name: 'dsh.' + NAMESPACE + '.settings' } });
			const settings = createStore(normalizeSettings(raw.getSnapshot()), sameSettings);
			const adopt = () => settings.set(normalizeSettings(raw.getSnapshot()));
			const unsubscribe = raw.subscribe(adopt);
			/** 存量的原始值只当普通对象读：损坏成数组 / 基本类型时按空对象处理。 */
			const readRecord = () => {
				const value = raw.getSnapshot();
				return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
			};
			/**
			 * 写一笔用户层：把「当前记录的一份副本」交给调用方改，再整体写回。
			 *
			 * 这里必须复制，不能让调用方在 store 的 state 上就地改：createSnapshotStore 的
			 * set() 会深冻结入参并按引用 setState（zustand 用 Object.is 判等），把同一个
			 * 引用再 set 回去既不通知也不落盘 —— 设置看着生效、刷新就回滚（1.5.0 收尾
			 * 时踩过这个坑）。失败只告警，不打断界面（配额满、存储被禁用等）。
			 */
			const write = (mutate, action) => {
				try {
					raw.set(mutate({ ...readRecord() }));
				} catch (error) {
					console.warn('[chat-locator] 设置写入失败（' + action + '）', error);
				}
			};
			return {
				getSnapshot: settings.getSnapshot,
				subscribe: settings.subscribe,
				/**
				 * 发布并持久化一次显式选择：先更新界面快照，再写回本地。
				 *
				 * 用户层只存「与出厂值不同」的字段：把某项调回出厂值时顺手删掉那个键，
				 * 于是「按钮在全部字段等于出厂值时置灰」与「本地没有可清的用户层」始终等价 ——
				 * 否则显式存过一个等于出厂值的键之后，按钮会永远点不动，那个键也永远清不掉。
				 */
				update(field, value) {
					const next = normalizeSettings({ ...settings.getSnapshot(), [field]: value });
					settings.set(next);
					// write() 先复制再改：绝不能拿 store 的 state 原地增删字段再 set 回去 ——
					// createSnapshotStore 的 set 会深冻结入参并按引用 setState（zustand 用
					// Object.is 判等），同一引用既不通知也不落盘，设置看着生效、刷新就回滚
					// （1.5.0 收尾时踩过这个坑）。
					write((record) => {
						if (next[field] === FIELDS[field].default) delete record[field];
						else record[field] = next[field];
						return record;
					}, field);
				},
				/**
				 * 恢复默认：整份清空用户层，字段于是退回出厂值。不把默认值「再写一遍」，
				 * 也不留下历史版本或未知字段的残渣。
				 */
				reset() {
					settings.set(normalizeSettings(undefined));
					write(() => ({}), 'reset');
				},
				dispose: unsubscribe,
			};
		}
		//#endregion

		//#region 定位条样式覆盖
		/** 找到内置定位条的框架元素并返回类名前缀；轨道未渲染时返回 null。 */
		function discoverRail(scope) {
			const root = scope ?? (typeof document === 'undefined' ? null : document);
			if (root === null) return null;
			for (const candidate of root.querySelectorAll('[class*="_frame"]')) {
				const classAttribute = candidate.getAttribute('class');
				if (classAttribute === null) continue;
				for (const className of classAttribute.split(/\s+/)) {
					if (className === '' || !className.endsWith('_frame')) continue;
					const prefix = className.slice(0, -'_frame'.length);
					// 前缀会被直接拼进选择器，所以必须是合法的 CSS 标识符开头。
					// 数字开头（如 "1abc"）必须以转义形式书写，这里不做转义，直接跳过 ——
					// 只有它意味着上游换了命名方案，渐变安静失效，不会产生无效选择器。
					if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(prefix)) continue;
					// 框架里必须有刻度，才认得出是定位条而不是别的 _frame。
					if (candidate.querySelector('[class~="' + prefix + '_mark"]') === null) continue;
					return { prefix, frame: candidate };
				}
			}
			return null;
		}

		/**
		 * 刻度长度渐变的宽度表：索引就是「距悬停处第几格」，第 0 项是悬停那根。
		 *
		 * 曲线用幂曲线 (1 - d/N)^exponent 把 12→32 的差值摊开，于是紧挨悬停的那格
		 * 掉得最多（32 → 21），之后越来越少（14），最后贴着内置的 12px 收尾 ——
		 * 轮廓是凸向轨道的弯钩。超出表长的刻度保持内置宽度。
		 */
		function buildGradientWidths() {
			const widths = [];
			for (let distance = 0; distance < GRADIENT_REACH; distance += 1) {
				const u = 1 - distance / GRADIENT_REACH;
				const eased = Math.pow(u, GRADIENT_CURVE_EXPONENT);
				widths.push(Math.round(GRADIENT_BASE_PX + (GRADIENT_PEAK_PX - GRADIENT_BASE_PX) * eased));
			}
			return widths;
		}
		const GRADIENT_WIDTHS = Object.freeze(buildGradientWidths());

		/** 距悬停处 `distance` 格的宽度；超出渐变范围就是内置的普通刻度宽度。 */
		function gradientWidthAt(distance) {
			return GRADIENT_WIDTHS[distance] ?? GRADIENT_BASE_PX;
		}

		/** 刻度两端的圆角：与内置 2px 圆角在 2px 高度上的实际渲染一致。 */
		function tickRadius(thickness) {
			return Math.max(1, Math.min(4, Math.round(thickness / 2)));
		}

		/** 由配置算出预览卡的字号、行高与需要的高度。 */
		function previewMetrics(config) {
			const lineHeight = Math.round(config.previewFontSize * PREVIEW_LINE_RATIO);
			const promptSize = config.previewFontSize + 1;
			const promptLineHeight = Math.round(promptSize * PREVIEW_LINE_RATIO);
			return {
				lineHeight,
				promptSize,
				promptLineHeight,
				// 卡片高度 = 内边距与间距 + 提示词一行 + 正文行数 × 行高。
				// 提示词行高会跟着字号一起变，所以这里不能按固定 20px 算 ——
				// 否则把字号放大后，max-height 会裁掉正文最后一两行。
				height: PREVIEW_CHROME_PX + promptLineHeight + lineHeight * config.previewLines,
			};
		}

		/**
		 * 生成「距悬停处以曲线收拢」的选择器对：下方第 d 格与上方第 d 格。
		 *
		 * 内置刻度是 _marks 容器下互为相邻兄弟的 button._mark：悬停那根在非活跃轮上
		 * 带 _markPreview 类；活跃轮则只会带 _markActive（内置用 if/else 二选一），
		 * 所以锚点同时接受 :hover —— 否则「悬停当前轮」时整段渐变都不出现。
		 * 「下方第 d 格」是从锚点起链 d 个相邻兄弟；「上方第 d 格」用 :has() 从候选
		 * 刻度反向指向锚点。链尾都落在 ::before 上（宽度与 transform 都写在它上面）。
		 * 不支持 :has() 的浏览器只是这些规则不生效（长度回到内置值），不会出错。
		 *
		 * 邻居选择器都带 :not(.P_markActive)：活跃轮的刻度有内置的 20px 宽度，若它
		 * 恰好落在悬停处 1–2 格内，纯兄弟链会把它一起改短 —— 那既不是用户要的，
		 * 也违背「活跃轮不被改写」的约定。锚点自身不受此限：指针指着它，它就加长。
		 */
		function gradientSelectorPair(prefix, distance, anchor) {
			const mark = '.' + prefix + '_mark';
			const neighbor = mark + ':not(.' + prefix + '_markActive)';
			const below = [anchor, ...Array.from({ length: distance }, () => '+ ' + neighbor)].join(' ') + '::before';
			const aboveChain = [...Array.from({ length: distance - 1 }, () => '+ ' + neighbor), '+ ' + anchor].join(' ');
			const above = neighbor + ':has(' + aboveChain + ')::before';
			return below + ',' + above;
		}

		/** 由配置生成覆盖样式：刻度粗细、轨道侧、悬停曲线渐变、预览字号/宽度/行数。 */
		function railStyleText(prefix, config) {
			const classOf = (suffix) => '.' + prefix + '_' + suffix;
			const rules = [];
			if (!config.enabled) {
				rules.push(classOf('slot') + '{display:none !important}');
				return rules.join('');
			}
			rules.push(classOf('mark') + '::before{height:' + config.thickness + 'px !important;border-radius:' + tickRadius(config.thickness) + 'px !important}');
			if (config.side === 'left') {
				// 轨道镜像到左侧。frame 的定位祖先是覆盖整个对话区的定位条槽（padding box
				// 就是整个对话区），所以内置的 right:12px 对应 left:12px；不要再减
				// composer-side-clearance —— 那是正文列的留白，减掉会越过对话区左边缘被裁掉。
				rules.push(classOf('frame') + '{right:auto !important;left:' + RAIL_INSET_PX + 'px !important}');
				// 刻度改为左对齐。按钮本身仍是整行宽的悬停/点击面，只改 ::before 的贴边；
				// 内置 ::before 的 transform-origin 是 100%（向右缩放），镜像后必须改成
				// 左侧 —— 否则普通刻度会从左边缩进 8px（未加载刻度 12px），只剩活跃/悬停
				// 那根贴边，左侧轨道的刻度就会参差不齐。
				rules.push(classOf('mark') + '::before{right:auto !important;left:0 !important;transform-origin:0 50% !important}');
				// 键盘焦点环同样要从右端镜像到左端。
				rules.push(classOf('mark') + ':focus-visible::after{inset:0 auto 0 0 !important}');
				rules.push(classOf('preview') + '{right:auto !important;left:calc(100% + 10px) !important}');
				// 进场动画镜像。这里不用「重声明内置 @keyframes」的做法：同名 keyframes 以
				// 文档顺序后者为准，而覆盖样式与内置样式的注入先后没有保证；改成自有名字并
				// 直接改写 animation，顺序就与结论无关。reduced-motion 再单独兜一层。
				const enter = prefix + '_dsh-chat-locator-preview-enter';
				rules.push('@keyframes ' + enter + '{0%{opacity:0;transform:translate(-4px)}to{opacity:1;transform:translate(0)}}');
				rules.push(classOf('preview') + '{animation:.12s ease-out ' + enter + ' !important}');
				rules.push('@media (prefers-reduced-motion:reduce){' + classOf('preview') + '{animation:none !important}}');
			}
			if (config.gradient) {
				// 裁剪盒：框架是刻度的 overflow 容器，加宽它才画得出比 28px 更长的悬停刻度。
				// 渐变关掉时不加宽 —— 没有 32px 尖端要画，多出来的宽度只是白添一条隐形交互带。
				rules.push(classOf('frame') + '{width:' + RAIL_FRAME_WIDTH_PX + 'px !important}');
				// 悬停处的曲线长度渐变：锚点 32px，向外 21 / 14，再往外是内置的 12px。
				// 每条宽度规则同时把 transform 压回 translateY(-50%)：内置刻度是
				// width:20px 加 scaleX(.6/.9/1) 量出来的，只改 width 会被内置的缩放再乘一次；
				// 同时去掉 scaleX 后宽度才是字面值。锚点用 :is() 把「预览类」与「:hover」
				// 并在一起，活跃轮的刻度因此也能成为悬停锚点。
				const anchor = ':is(' + classOf('markPreview') + ',' + classOf('mark') + ':hover)';
				rules.push(anchor + '::before{width:' + GRADIENT_WIDTHS[0] + 'px !important;transform:translateY(-50%) !important}');
				for (let distance = 1; distance < GRADIENT_WIDTHS.length; distance += 1) {
					rules.push(gradientSelectorPair(prefix, distance, anchor) + '{width:' + GRADIENT_WIDTHS[distance] + 'px !important;transform:translateY(-50%) !important}');
				}
			}
			const metrics = previewMetrics(config);
			// 预览卡高度跟着行数与字号走：内置把它钉死在 100px，行数调到 4 以上、
			// 或把字放大，多出来的部分就只会被裁掉 —— 让 --turn-preview-height 按同一
			// 套行高算出来，卡片的 max-height 与 top 夹取都引用它。
			rules.push(classOf('frame') + '{--turn-preview-height:' + metrics.height + 'px !important}');
			// 宽度沿用内置的容器夹取写法（100cqw - 120px），所以窄窗口不会顶出可视范围。
			rules.push(classOf('preview') + '{width:min(' + config.previewWidth + 'px, 100cqw - 120px) !important}');
			// 纯文本呈现：先归一空白（杜绝空白行），再按配置行数截断。
			rules.push(classOf('previewPrompt') + ',' + classOf('previewResponse') + '{white-space:normal !important;overflow-wrap:anywhere !important}');
			// 字号与行高成对改写：只改字号会让行高与卡片高度对不上。
			rules.push(classOf('previewPrompt') + '{font-size:' + metrics.promptSize + 'px !important;line-height:' + metrics.promptLineHeight + 'px !important}');
			rules.push(classOf('previewResponse') + '{font-size:' + config.previewFontSize + 'px !important;line-height:' + metrics.lineHeight + 'px !important;-webkit-line-clamp:' + config.previewLines + ' !important}');
			return rules.join('');
		}

		/**
		 * 挂载覆盖样式：写入一个自有 style 标签，并在配置或轨道实例变化时重算。
		 * @param policy - 配置策略（提供 getSnapshot / subscribe）。
		 */
		function mountRailOverrides(policy) {
			// 重新挂载时替换上一份样式表，避免同一份覆盖样式叠加两份
			// （内置样式表也是按 data-plugin-css 去重的同款做法）。
			for (const stale of document.querySelectorAll('style[data-plugin-css="' + STYLE_TAG_ID + '"]')) stale.remove();
			const tag = document.createElement('style');
			tag.dataset.plugin = 'dsh-chat-locator';
			tag.dataset.pluginCss = STYLE_TAG_ID;
			document.head.appendChild(tag);
			let prefix = null;
			let frame = null;
			let lastScan = 0;
			let text = '';
			let timer = null;
			let cachedPrefix = null;
			let cachedConfig = null;
			let cachedText = '';
			// 规则文本只在「前缀或配置」真的变化时重算：MutationObserver 每个变更批次都会
			// 回调一次，每次重拼整段 CSS 是白烧 CPU（流式渲染期间尤甚）；createStore 只在
			// 配置确实不同时才换新的快照对象，所以按对象身份比较即可。
			const styleTextFor = (discovered, config) => {
				if (discovered === null) return '';
				if (discovered === cachedPrefix && config === cachedConfig) return cachedText;
				cachedPrefix = discovered;
				cachedConfig = config;
				cachedText = railStyleText(discovered, config);
				return cachedText;
			};
			const scheduleRescan = () => {
				if (timer !== null) return;
				timer = setTimeout(() => {
					timer = null;
					render();
				}, RESCAN_INTERVAL_MS);
			};
			const render = () => {
				// 标签被第三方移除（另一份实例/页面清理逻辑）时自愈：否则本实例会静默失去
				// 覆盖样式，而 render() 只在文本变化时写 textContent，不会自己发现。
				if (tag.isConnected === false) document.head.appendChild(tag);
				const detached = prefix === null || frame === null || !frame.isConnected;
				if (detached) {
					const now = Date.now();
					if (now - lastScan < RESCAN_INTERVAL_MS) {
						// 门限挡下本批次：补扫一次，避免「轨道恰好在这 400ms 内挂上、之后
						// DOM 不再变更」时覆盖样式永远不会生效。
						scheduleRescan();
					} else {
						lastScan = now;
						const found = discoverRail();
						if (found !== null) {
							prefix = found.prefix;
							frame = found.frame;
						}
					}
				}
				const next = styleTextFor(prefix, policy.getSnapshot());
				if (next === text) return;
				text = next;
				tag.textContent = next;
			};
			render();
			const unsubscribe = policy.subscribe(render);
			const observer = typeof MutationObserver === 'function' ? new MutationObserver(render) : null;
			if (observer !== null) observer.observe(document.documentElement, { childList: true, subtree: true });
			return {
				dispose: () => {
					unsubscribe();
					if (timer !== null) {
						clearTimeout(timer);
						timer = null;
					}
					if (observer !== null) observer.disconnect();
					tag.remove();
				},
				// railFound 为假时也把前缀报成 null：轨道已卸载（切走对话、视图重建）后
				// 别让排障钩子还举着上一次的类名前缀，README 的排障表依赖这个语义。
				state: () => {
					const found = frame !== null && frame.isConnected;
					return {
						railPrefix: found ? prefix : null,
						railFound: found,
						rules: text,
						config: policy.getSnapshot(),
					};
				},
			};
		}
		//#endregion

		//#region 设置页界面
		const SECTION = {
			display: 'flex',
			flexDirection: 'column',
			width: '100%',
			maxWidth: '760px',
			color: 'var(--dsw-alias-label-primary)',
		};
		const INTRO = {
			margin: '0 0 8px',
			color: 'var(--dsw-alias-label-secondary)',
			fontSize: '13px',
			lineHeight: '20px',
		};
		const ROW = {
			display: 'flex',
			alignItems: 'center',
			gap: '8px',
			padding: '16px 0',
			borderBottom: '0.5px solid var(--dsw-alias-border-l2)',
		};
		const ROW_TEXT = {
			display: 'flex',
			flexDirection: 'column',
			flex: '1',
			gap: '4px',
			minWidth: '0',
			paddingRight: '24px',
		};
		const ROW_TITLE = {
			color: 'var(--dsw-alias-label-primary)',
			fontSize: '14px',
			fontWeight: 400,
			lineHeight: '22px',
		};
		const ROW_DESC = {
			color: 'var(--dsw-alias-label-secondary)',
			fontSize: '12px',
			fontWeight: 400,
			lineHeight: '18px',
		};
		const ROW_CONTROL = {
			display: 'flex',
			alignItems: 'center',
			flex: 'none',
		};
		const PILL = {
			display: 'inline-flex',
			alignItems: 'center',
			height: '36px',
			padding: '0 4px',
			gap: '2px',
			borderRadius: '18px',
			background: 'var(--dsw-alias-bg-layer-2)',
		};
		const STEP_BUTTON = {
			width: '28px',
			height: '28px',
			border: 'none',
			borderRadius: '50%',
			background: 'transparent',
			color: 'var(--dsw-alias-label-primary)',
			fontSize: '16px',
			lineHeight: '1',
			cursor: 'pointer',
			padding: '0',
		};
		const STEP_VALUE = {
			minWidth: '34px',
			textAlign: 'center',
			fontSize: '14px',
			lineHeight: '22px',
			fontVariantNumeric: 'tabular-nums',
		};
		const SEGMENT_BUTTON = {
			height: '30px',
			padding: '0 14px',
			border: 'none',
			borderRadius: '15px',
			background: 'transparent',
			color: 'var(--dsw-alias-label-secondary)',
			fontSize: '13px',
			lineHeight: '20px',
			cursor: 'pointer',
		};
		const SEGMENT_ACTIVE = {
			background: 'var(--dsw-alias-bg-layer-1)',
			color: 'var(--dsw-alias-label-primary)',
			boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
		};
		const RESET_BUTTON = {
			height: '32px',
			padding: '0 14px',
			border: '1px solid var(--dsw-alias-border-l2)',
			borderRadius: '16px',
			background: 'transparent',
			color: 'var(--dsw-alias-label-primary)',
			fontSize: '13px',
			lineHeight: '20px',
			cursor: 'pointer',
			whiteSpace: 'nowrap',
		};
		/** 开关（44×24 胶囊 + 滑块）。 */
		function Toggle({ on, label, onToggle }) {
			return React.createElement('button', {
				type: 'button',
				role: 'switch',
				'aria-checked': on,
				'aria-label': label,
				onClick: () => onToggle(!on),
				style: {
					position: 'relative',
					width: '44px',
					height: '24px',
					flex: 'none',
					padding: '0',
					border: 'none',
					borderRadius: '12px',
					cursor: 'pointer',
					background: on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l2)',
					transition: 'background 0.15s ease',
				},
			}, React.createElement('span', {
				key: 'knob',
				style: {
					position: 'absolute',
					top: '2px',
					left: on ? '22px' : '2px',
					width: '20px',
					height: '20px',
					borderRadius: '50%',
					background: '#fff',
					boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
					transition: 'left 0.15s ease',
				},
			}));
		}

		/** 数字步进器；步进量来自 FIELDS（宽度是 20px，其余是 1）。 */
		function Stepper({ value, min, max, stepSize, label, onChange, t }) {
			const step = (delta) => {
				const next = Math.min(max, Math.max(min, value + delta * stepSize));
				if (next !== value) onChange(next);
			};
			const button = (key, text, delta, disabled, hint) => React.createElement('button', {
				key,
				type: 'button',
				disabled,
				'aria-label': hint,
				onClick: () => step(delta),
				style: { ...STEP_BUTTON, opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer' },
			}, text);
			return React.createElement('div', { style: PILL, role: 'group', 'aria-label': label }, [
				button('dec', '−', -1, value <= min, label + ' ' + t('decrease')),
				React.createElement('span', { key: 'value', style: STEP_VALUE }, String(value)),
				button('inc', '+', 1, value >= max, label + ' ' + t('increase')),
			]);
		}

		/** 二选一分段控件。 */
		function Segmented({ value, options, label, onChange }) {
			return React.createElement('div', { style: PILL, role: 'group', 'aria-label': label }, options.map((option) => React.createElement('button', {
				key: option.id,
				type: 'button',
				'aria-pressed': value === option.id,
				onClick: () => onChange(option.id),
				style: value === option.id ? { ...SEGMENT_BUTTON, ...SEGMENT_ACTIVE } : SEGMENT_BUTTON,
			}, option.label)));
		}

		/** 「恢复默认」按钮；已是默认值时置灰。 */
		function ResetButton({ disabled, label, onReset }) {
			return React.createElement('button', {
				type: 'button',
				disabled,
				'aria-label': label,
				onClick: () => {
					if (!disabled) onReset();
				},
				style: { ...RESET_BUTTON, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer' },
			}, label);
		}

		/**
		 * 设置页里的小样：用当前配置画一条缩微轨道与一张示例预览卡。
		 * 轨道画的是「悬停状态」：中间那根是悬停（预览）刻度；渐变开着时向外按曲线
		 * 收拢，关掉时所有刻度一律内置宽度（与真实轨道的两种状态一致）。
		 */
		function Sample({ config, t }) {
			const side = config.side === 'left' ? 'left' : 'right';
			const tickCount = 2 * GRADIENT_REACH + 1;
			const hoveredIndex = GRADIENT_REACH;
			const metrics = previewMetrics(config);
			// 渐变关掉时悬停那根回到「内置的悬停宽度」（18px，来自内置 scaleX(.9)），
			// 普通刻度 12px；卡片贴边量跟着最宽那根走，小样几何才自洽。
			const peak = config.gradient ? GRADIENT_PEAK_PX : BUILTIN_HOVER_PX;
			const ticks = [];
			for (let index = 0; index < tickCount; index += 1) {
				// 与真实轨道同一套长度规则：渐变开着时悬停那根 32、向外 21 / 14、再往外 12；
				// 关掉后悬停那根是内置的 18px、其余是内置的 12px。
				const distance = Math.abs(index - hoveredIndex);
				const hovered = distance === 0;
				const width = config.gradient
					? gradientWidthAt(distance)
					: (hovered ? BUILTIN_HOVER_PX : GRADIENT_BASE_PX);
				ticks.push(React.createElement('span', {
					key: index,
					style: {
						position: 'absolute',
						// 与内置轨道同一个 10px 行距（TURN_SPACING_PX），小样与真机同构。
						top: (10 + index * 10) + 'px',
						[side]: '10px',
						width: width + 'px',
						height: config.thickness + 'px',
						borderRadius: tickRadius(config.thickness) + 'px',
						background: hovered ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-border-l2)',
					},
				}));
			}
			const card = React.createElement('div', {
				key: 'card',
				style: {
					position: 'absolute',
					top: SAMPLE_CARD_TOP_PX + 'px',
					[side]: (peak + SAMPLE_CARD_PEAK_MARGIN_PX) + 'px',
					width: config.previewWidth + 'px',
					boxSizing: 'border-box',
					padding: '10px 12px',
					borderRadius: '10px',
					background: 'var(--dsw-alias-bg-layer-2)',
					boxShadow: 'var(--dsw-elevation-panel, 0 4px 16px rgba(0, 0, 0, 0.18))',
				},
			}, [
				React.createElement('div', {
					key: 'prompt',
					style: {
						fontSize: metrics.promptSize + 'px',
						lineHeight: metrics.promptLineHeight + 'px',
						whiteSpace: 'nowrap',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
					},
				}, t('samplePrompt')),
				React.createElement('div', {
					key: 'response',
					style: {
						marginTop: '4px',
						color: 'var(--dsw-alias-label-secondary)',
						fontSize: config.previewFontSize + 'px',
						lineHeight: metrics.lineHeight + 'px',
						display: '-webkit-box',
						WebkitBoxOrient: 'vertical',
						WebkitLineClamp: config.previewLines,
						overflow: 'hidden',
						overflowWrap: 'anywhere',
					},
				}, t('sampleResponse')),
			]);
			// 小样框自己也跟着字号与行数长高，否则调大之后只是把小样裁掉，
			// 看不出「预览卡跟着变高」这件事（真实轨道同理，见 railStyleText 的高度变量）。
			const sampleHeight = Math.max(132, metrics.height + SAMPLE_CARD_TOP_PX + 12);
			return React.createElement('div', {
				style: {
					position: 'relative',
					width: '100%',
					height: sampleHeight + 'px',
					borderRadius: '10px',
					background: 'var(--dsw-alias-bg-layer-1)',
					overflow: 'hidden',
				},
			}, [...ticks, card]);
		}

		/** 「对话定位条」设置页。 */
		function LocatorSection({ store, update, reset, t }) {
			const config = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
			const row = (key, title, desc, control) => React.createElement('div', { style: ROW, key }, [
				React.createElement('div', { style: ROW_TEXT, key: 'text' }, [
					React.createElement('div', { style: ROW_TITLE, key: 'title' }, title),
					React.createElement('div', { style: ROW_DESC, key: 'desc' }, desc),
				]),
				React.createElement('div', { style: ROW_CONTROL, key: 'control' }, control),
			]);
			// 每一行的控件由 FIELDS 的 control 字段决定：同一张表既管数据也管界面。
			const controlOf = (field) => {
				const spec = FIELDS[field];
				const value = config[field];
				if (spec.control === 'toggle') {
					return React.createElement(Toggle, { on: value, label: t(spec.title), onToggle: (next) => update(field, next) });
				}
				if (spec.control === 'segment') {
					return React.createElement(Segmented, {
						value,
						label: t(spec.title),
						options: [
							{ id: 'right', label: t('sideRight') },
							{ id: 'left', label: t('sideLeft') },
						],
						onChange: (next) => update(field, next),
					});
				}
				return React.createElement(Stepper, {
					value,
					min: spec.min,
					max: spec.max,
					stepSize: spec.step,
					label: t(spec.title),
					onChange: (next) => update(field, next),
					t,
				});
			};
			const isDefault = sameSettings(config, DEFAULTS);
			const children = [React.createElement('p', { style: INTRO, key: 'intro' }, t('intro'))];
			for (const field of SETTINGS_FIELDS) {
				const spec = FIELDS[field];
				children.push(row(field, t(spec.title), t(spec.desc, { value: config[field] }), controlOf(field)));
			}
			children.push(row(
				'reset',
				t('resetTitle'),
				isDefault ? t('resetDescDefault') : t('resetDesc'),
				React.createElement(ResetButton, { disabled: isDefault, label: t('reset'), onReset: () => reset() }),
			));
			// 小样放在最后：它同时演示刻度粗细、轨道侧、长度渐变与预览卡，改任何一项都能立刻看到。
			children.push(React.createElement('div', {
				key: 'sample',
				style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 0 4px' },
			}, [
				React.createElement('div', { key: 'title', style: ROW_TITLE }, t('sampleTitle')),
				React.createElement(Sample, { key: 'body', config, t }),
				React.createElement('div', { key: 'note', style: ROW_DESC }, config.gradient ? t('sampleNote') : t('sampleNoteOff')),
			]));
			return React.createElement('div', { style: SECTION }, children);
		}
		//#endregion

		/**
		 * 挂载插件：字典、设置策略、样式覆盖、设置页。
		 * @param ctx - 客户端根上下文。
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NAMESPACE, { zh, en }), 'dsh-chat-locator: dictionaries');
			const t = ctx.locale.bind(NAMESPACE);
			const policy = createSettingsPolicy();
			ctx.effect(() => policy.dispose, 'dsh-chat-locator: settings');
			const presentation = mountRailOverrides(policy);
			ctx.effect(() => presentation.dispose, 'dsh-chat-locator: rail overrides');
			// 排障钩子：控制台执行 __dshChatLocator.state() 可看到发现的类名前缀、当前覆盖规则与生效配置。
			const debug = {
				version: PLUGIN_VERSION,
				state: presentation.state,
			};
			window.__dshChatLocator = debug;
			ctx.effect(() => () => {
				if (window.__dshChatLocator === debug) delete window.__dshChatLocator;
			}, 'dsh-chat-locator: debug hook');
			ctx.slots.inject('settings.section', () => ctx.slots.register({
				name: 'settings.section',
				id: 'chat-locator',
				order: 41,
				label: () => t('nav'),
				inject: () => ({
					store: policy,
					update: (field, value) => policy.update(field, value),
					reset: () => policy.reset(),
					t,
				}),
			}, LocatorSection));
		}

		return {
			name: 'chat-locator',
			inject: ['slots', 'locale'],
			apply,
			// 纯函数出口：自检直接消费这些键。加新键时请一并给出读者，否则就是不出声的死出口。
			diagnostics: {
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
			},
		};
	},
});
