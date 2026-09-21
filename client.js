/**
 * dsh-chat-locator —— 浏览器半侧（DSH Web）。
 *
 * 目标：把对话页右侧那条「对话定位条」（每轮一枚刻度的轮次轨道）变成可配置、
 * 可持久化的插件能力，并在设置面板里给出「对话定位条」配置页：
 * 横线粗细、轨道左右侧、悬停预览的开关 / 行数 / 字号 / 宽度、悬停处沿轨道收拢的
 * 刻度长度渐变，以及一键「恢复默认」。
 *
 * 三条实现约束，决定了这里的做法：
 *
 * 1. 定位条不在任何 Slot 里。它由 `@deepseek-ai/dsh-client-ui-chat` 的 ChatView
 *    直接渲染在对话滚动容器内（`TurnNavigator`），Slot 系统没有给它留座位，
 *    也没有对外暴露「刻度粗细 / 轨道侧」这类配置项。因此本插件不重画一条轨道
 *    （那会丢掉内置的跳转、分页、活跃轮跟随），而是**在运行时认领它的样式**：
 *    从活动 DOM 上发现 CSS Module 的真实类名前缀（`<hash>_frame` / `<hash>_mark`），
 *    再按用户配置生成一层覆盖样式。前缀是运行时发现的，所以打包哈希变化、
 *    插件升级后依然成立。
 * 2. 配置走宿主设置文档：宿主半侧注册 `chat-locator` 命名空间，这里用
 *    `ctx.settingsScope.bind({ namespace })` 读写，重启浏览器/会话后仍在；
 *    「恢复默认」用作用域的 `unset(field)` 逐项清掉用户层，让字段退回 schema 默认，
 *    而不是把默认值再写一遍。
 * 3. 悬停预览保持**纯文本**：预览正文来自内置的轮次大纲（`turnOutline` 投影与
 *    已加载窗口的导航项），只取文本块、折叠空白、并按预算截断 —— 不含思考内容、
 *    没有空白行、超长自动省略。本插件不引入任何其它文本来源，只决定它的
 *    开关、行数、字号、宽度与展开方向。
 *
 * @module dsh-chat-locator/client
 */
window.__ModuleLoader__.load({
	id: 'dsh-chat-locator',
	factory(require) {
		const React = require('react');

		/** 本地化命名空间（同时用作设置页的文案键空间）。 */
		const NS = 'chat-locator';
		/** 宿主半侧注册的设置命名空间。 */
		const SETTINGS_NAMESPACE = 'chat-locator';
		/** 覆盖样式标签的标识，便于排障与幂等更新。 */
		const STYLE_TAG_ID = 'chat-locator/rail.css';
		/** 版本，随排障钩子一起暴露。 */
		const PLUGIN_VERSION = '1.3.0';

		/** 刻度行高固定 10px，8px 是横线粗细的实际上限（见宿主侧的 schema）。 */
		const THICKNESS_MIN = 1;
		const THICKNESS_MAX = 8;
		const PREVIEW_LINES_MIN = 1;
		const PREVIEW_LINES_MAX = 6;

		/** 预览正文字号区间与步进（px）。内置正文是 12px、提示词是 13px。 */
		const PREVIEW_FONT_MIN = 10;
		const PREVIEW_FONT_MAX = 18;
		/** 预览卡宽度区间与步进（px）；300px 就是内置的宽度。 */
		const PREVIEW_WIDTH_MIN = 200;
		const PREVIEW_WIDTH_MAX = 420;
		const PREVIEW_WIDTH_STEP = 20;

		/** 轨道未出现时的重扫间隔（毫秒）；避免在流式渲染期间反复遍历 DOM。 */
		const RESCAN_INTERVAL_MS = 400;

		/** 与宿主 schema 默认值一致的兜底配置。 */
		const DEFAULTS = Object.freeze({
			enabled: true,
			thickness: 2,
			side: 'right',
			previewLines: 3,
			previewFontSize: 12,
			previewWidth: 300,
		});

		/** 可持久化字段清单；「恢复默认」按这个顺序逐项清空用户层。 */
		const SETTINGS_FIELDS = Object.freeze(Object.keys(DEFAULTS));

		const zh = {
			nav: '对话定位条',
			intro: '调整对话定位条：刻度横线粗细、轨道贴在左侧还是右侧、悬停预览的行数 / 字号 / 宽度。悬停时被指向的那根刻度最长，沿轨道向外按曲线依次收拢（32 / 21 / 14 / 12px）：紧挨着的那两格明显更短，之后缓缓收尾，是一条凸向轨道的弯钩，不是等差的直线。设置写入 DSH 设置文档，重启后依然生效；「恢复默认」可一键回到出厂值。',
			enableTitle: '显示对话定位条',
			enableDesc: '关闭后整条轨道隐藏；对话内容、轮次跳转与历史分页都不受影响。',
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
			resetDesc: '把上面各项恢复成出厂值：粗细 2px、轨道在右侧、3 行、12px 字号、300px 宽。',
			resetDescDefault: '当前各项都已经是出厂值。',
			reset: '恢复默认',
			sampleTitle: '预览效果（示例）',
			sampleNote: '小样：悬停的那根最长（32px，明显比邻居突出），向外每格依次 21 / 14，再往外是普通刻度 12px。长度沿一条凸向轨道的幂曲线收拢：紧挨着的那格掉得最多，之后越来越缓。',
			samplePrompt: '把这段说明改写成三条要点',
			sampleResponse: '已按要求整理：一、保留原意与语气；二、把重复表述合并到同一条；三、术语与原文保持一致，缩写首次出现时给全称。',
			decrease: '减小',
			increase: '增大',
			unavailable: '宿主设置文档当前不可用，改动只在本次会话生效。',
			readOnly: '宿主设置文档为只读，改动只在本次会话生效。',
			hostLegacy: '宿主半侧还是旧版设置结构，{fields} 目前只在这次会话生效；重启一次 DSH 宿主（dsh web）后会自动写进设置文档并长期保留。',
		};
		const en = {
			nav: 'Conversation locator',
			intro: 'Tune the conversation locator: tick thickness, which side the track sits on, and the hover preview’s line count, font size, and width. While you hover, the pointed tick is the longest and the lengths step outward along a curve (32 / 21 / 14 / 12px): the two nearest ticks sit clearly lower, then it eases into the track — a hook bowing toward the track rather than a straight ramp. Settings are stored in the DSH settings document and survive restarts; Restore defaults puts everything back.',
			enableTitle: 'Show the conversation locator',
			enableDesc: 'Hides the whole track. Conversation content, turn jumps, and history paging are unaffected.',
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
			resetDesc: 'Puts everything above back to factory values: 2px thickness, right side, 3 lines, 12px text, 300px wide.',
			resetDescDefault: 'Everything is already at its factory value.',
			reset: 'Restore defaults',
			sampleTitle: 'Preview (sample)',
			sampleNote: 'Sample: the hovered tick is longest (32px, clearly ahead of its neighbours), then 21 / 14 stepping outward, and the regular 12px tick beyond. The falloff follows a power curve bowing toward the track: the first step drops the most, then it eases out.',
			samplePrompt: 'Rewrite this note as three bullet points',
			sampleResponse: 'Done: keep the original intent and tone; merge repeated statements into one point; keep terminology consistent and spell out abbreviations on first use.',
			decrease: 'Decrease',
			increase: 'Increase',
			unavailable: 'The host settings document is unavailable; changes apply to this session only.',
			readOnly: 'The host settings document is read-only; changes apply to this session only.',
			hostLegacy: 'The host half still runs the previous settings schema, so {fields} applies to this session only; restart the DSH host (dsh web) once and the choice is written to the settings document automatically.',
		};

		//#region 配置存储
		/** 取整数并夹到区间内；非法值退回兜底。 */
		function clampInteger(value, min, max, fallback) {
			const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : Number.NaN;
			if (!Number.isFinite(number)) return fallback;
			return Math.min(max, Math.max(min, number));
		}

		/** 把任意来源（宿主文档、本地乐观写）的配置归一化成可用配置。 */
		function normalizeSettings(raw) {
			const source = raw !== null && typeof raw === 'object' ? raw : {};
			return {
				enabled: source.enabled !== false,
				thickness: clampInteger(source.thickness, THICKNESS_MIN, THICKNESS_MAX, DEFAULTS.thickness),
				side: source.side === 'left' ? 'left' : 'right',
				previewLines: clampInteger(source.previewLines, PREVIEW_LINES_MIN, PREVIEW_LINES_MAX, DEFAULTS.previewLines),
				previewFontSize: clampInteger(source.previewFontSize, PREVIEW_FONT_MIN, PREVIEW_FONT_MAX, DEFAULTS.previewFontSize),
				previewWidth: clampInteger(source.previewWidth, PREVIEW_WIDTH_MIN, PREVIEW_WIDTH_MAX, DEFAULTS.previewWidth),
			};
		}

		/** 配置等值判断，避免同一份设置反复触发重绘。 */
		function sameSettings(left, right) {
			return left.enabled === right.enabled
				&& left.thickness === right.thickness
				&& left.side === right.side
				&& left.previewLines === right.previewLines
				&& left.previewFontSize === right.previewFontSize
				&& left.previewWidth === right.previewWidth;
		}

		/** 极简快照 store：getSnapshot + subscribe，直接喂给 useSyncExternalStore。 */
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
		 * 对话定位条配置策略：跟随宿主设置作用域，并把显式修改写回去。
		 * 界面永远先读本地快照（乐观更新），宿主回执再由 adopt() 校正。
		 */
		class LocatorPolicy {
			constructor(scope) {
				this.scope = scope;
				/**
				 * 宿主半侧还没注册出来的字段 → 用户在本次会话里选的值。
				 * 宿主 schema 是随插件代码走的，而宿主进程的模块缓存不会因为改文件就更新；
				 * 于是「新加的配置项 + 旧版宿主半侧」会短暂共存。这里不让界面把这些选择悄悄丢掉：
				 * 先留在会话里，等宿主重新注册出字段（重启一次）再自动补写。
				 */
				this.pending = new Map();
				this.settings = createStore(normalizeSettings(undefined), sameSettings);
				this.status = createStore(
					{ status: 'loading', writable: false, unsupported: [] },
					(left, right) => left.status === right.status && left.writable === right.writable && left.unsupported.join() === right.unsupported.join(),
				);
				this.stop = scope.subscribe(() => {
					this.adopt();
				});
				this.adopt();
			}

			/** 把一次写入交给宿主作用域；失败只告警，不打断界面。 */
			publish(field, value) {
				try {
					const settlement = this.scope.set(field, value);
					if (settlement !== undefined && typeof settlement.catch === 'function') {
						settlement.catch((error) => {
							console.warn('[chat-locator] 设置写入失败', error);
						});
					}
				} catch (error) {
					console.warn('[chat-locator] 设置写入失败', error);
				}
			}

			/** 采纳宿主最新一段设置，不回写（攒下的会话选择除外）。 */
			adopt() {
				const snapshot = this.scope.getSnapshot();
				const raw = snapshot.value !== null && typeof snapshot.value === 'object' ? snapshot.value : {};
				const resolved = normalizeSettings(raw);
				for (const [field, value] of [...this.pending]) {
					// 界面先按会话里的选择渲染，避免宿主回执到达前后闪回默认值。
					resolved[field] = value;
					if (this.pending.has(field) && Object.prototype.hasOwnProperty.call(raw, field)) {
						// 宿主已经认得这个字段（通常是重启之后）：把会话里攒的选择补写进去。
						this.pending.delete(field);
						this.publish(field, value);
					}
				}
				this.settings.set(resolved);
				this.status.set({
					status: typeof snapshot.status === 'string' ? snapshot.status : 'ready',
					writable: snapshot.writable === true,
					unsupported: [...this.pending.keys()],
				});
			}

			/** 发布并持久化一次显式选择；宿主还不认的字段先留在会话里。 */
			update(field, value) {
				const next = normalizeSettings({ ...this.settings.getSnapshot(), [field]: value });
				this.settings.set(next);
				const raw = this.scope.getSnapshot().value;
				if (raw === null || typeof raw !== 'object' || !Object.prototype.hasOwnProperty.call(raw, field)) {
					this.pending.set(field, next[field]);
					this.status.set({ ...this.status.getSnapshot(), unsupported: [...this.pending.keys()] });
					return;
				}
				this.pending.delete(field);
				this.publish(field, next[field]);
			}

			/**
			 * 恢复默认：逐项清空用户层（`unset`），字段于是退回宿主 schema 的默认值。
			 * 不把默认值「再写一遍」—— 那会在设置文档里留下与默认值相同的显式覆盖，
			 * 之后内置改默认值时这些字段不会跟着动。
			 */
			reset() {
				this.pending.clear();
				this.settings.set(normalizeSettings(undefined));
				this.status.set({ ...this.status.getSnapshot(), unsupported: [] });
				for (const field of SETTINGS_FIELDS) {
					try {
						const settlement = this.scope.unset(field);
						if (settlement !== undefined && typeof settlement.catch === 'function') {
							settlement.catch((error) => {
								console.warn('[chat-locator] 恢复默认失败', error);
							});
						}
					} catch (error) {
						console.warn('[chat-locator] 恢复默认失败', error);
					}
				}
			}
		}
		//#endregion

		//#region 定位条样式覆盖
		/**
		 * CSS Module 的局部类名形如 `<hash>_frame`：哈希由构建器生成、随版本变化，
		 * 所以不写死，而是在活动 DOM 上按模式发现前缀。
		 */
		const FRAME_CLASS = /(?:^|\s)([A-Za-z0-9_-]+)_frame(?:\s|$)/;

		/** 找到内置定位条的框架元素并返回它的类名前缀；轨道未渲染时返回 null。 */
		function discoverRail(scope) {
			const root = scope ?? (typeof document === 'undefined' ? null : document);
			if (root === null) return null;
			for (const candidate of root.querySelectorAll('[class*="_frame"]')) {
				const frameClass = candidate.getAttribute('class');
				if (frameClass === null) continue;
				const match = FRAME_CLASS.exec(frameClass);
				if (match === null) continue;
				const prefix = match[1];
				// 框架里必须有刻度，才认得出是定位条而不是别的 _frame。
				if (candidate.querySelector('.' + prefix + '_mark') === null) continue;
				return { prefix, frame: candidate };
			}
			return null;
		}

		/** 渐变档数：悬停那根 + 每侧 2 格。 */
		const GRADIENT_REACH = 3;
		/** 悬停（预览）那根的宽度。 */
		const GRADIENT_PEAK_PX = 32;
		/** 内置普通刻度的宽度，也是渐变的落点。 */
		const GRADIENT_BASE_PX = 12;
		/**
		 * 曲线幂次。1 = 直线；越大越「先陡后平」。调参过程就记在这里：
		 * 2.5 的首格掉 15px，观感陡得像断崖；1.5 平缓但邻居偏长（23 / 16），0 位不够跳；
		 * 2.0 是折中：邻居收到 21 / 14，首格 11px —— 仍远低于 2.5 那一版的断崖。
		 */
		const GRADIENT_CURVE_EXPONENT = 2;
		/**
		 * 轨道框架的宽度：比最长刻度多留 4px，由峰值直接推出来。
		 *
		 * 内置是 28px，而框架里的滚动容器带 `overflow-y:auto`，于是横轴的 `visible` 按规范
		 * 折算成 `auto` —— **框架就是刻度的裁剪盒**：画到框架宽度以上，多出来的尖端会被直接裁掉
		 * （这正是"0 不够突出"的根源）。刻度仍是右对齐，所以普通刻度的位置一点没动，
		 * 多出来的空间只是左侧的裁剪余量。
		 * 代价：框架本身就是轨道的悬停/点击面，加宽意味着右侧多出十几像素的隐形交互带，
		 * 所以这里跟着峰值走 —— 峰值降下来，交互带也一起收窄。
		 */
		const RAIL_FRAME_WIDTH_PX = GRADIENT_PEAK_PX + 4;

		/**
		 * 刻度长度渐变的宽度表：索引就是「距悬停处第几格」，第 0 项是悬停那根。
		 *
		 * 曲线不是直线：用幂曲线 `(1 - d/N)^GRADIENT_CURVE_EXPONENT` 把 12→32 的差值摊开，
		 * 于是紧挨悬停的那格掉得最多（32 → 21），之后越来越少（14），
		 * 最后贴着内置的 12px 收尾 —— 轮廓是**凸向轨道的弯钩**，不是斜线、也不是先缓后陡的 S 形。
		 * 档数由 GRADIENT_REACH 决定：它同时是幂曲线的分母，所以少一档会让中间几档一起重算。
		 * 超出表长的刻度保持内置宽度。
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

		/** 正文行高倍数：内置是 12px 正文配 18px 行高。 */
		const PREVIEW_LINE_RATIO = 1.5;
		/**
		 * 预览卡正文以外的固定高度：上下内边距 20 + 提示词一行 20 + 与正文的间距 4
		 * + 2px 余量。于是「12px 字号 3 行」正好等于内置的 100px，默认外观不变。
		 */
		const PREVIEW_CHROME_PX = 46;
		/** 小样里预览卡离容器顶部的距离（px）。 */
		const SAMPLE_CARD_TOP_PX = 32;
		/** 小样里预览卡离容器侧边的距离：比最长刻度再外推 16px（真实轨道里卡片开在轨道外侧）。 */
		const SAMPLE_CARD_OFFSET_PX = GRADIENT_PEAK_PX + 16;

		/** 由配置算出预览卡的字号、行高与需要的高度。 */
		function previewMetrics(config) {
			const lineHeight = Math.round(config.previewFontSize * PREVIEW_LINE_RATIO);
			return {
				lineHeight,
				promptSize: config.previewFontSize + 1,
				promptLineHeight: Math.round((config.previewFontSize + 1) * PREVIEW_LINE_RATIO),
				height: PREVIEW_CHROME_PX + lineHeight * config.previewLines,
			};
		}

		/**
		 * 生成「距悬停处以曲线收拢」的选择器对：上方第 d 格与下方第 d 格。
		 *
		 * 「距悬停处第几格」用 :has() 加相邻兄弟选择器表达 ——
		 * `:has(.P_markPreview) + .P_markPosition` 是悬停处下面一格，
		 * `:has(+ .P_markPosition .P_markPreview)` 是上面一格，链上几个 `+` 就是第几格。
		 * 不支持 :has() 的浏览器只是这些规则不生效（长度回到内置值），不会出错。
		 */
		function gradientSelectorPair(prefix, distance) {
			const position = '.' + prefix + '_markPosition';
			const tick = ' .' + prefix + '_mark::before';
			const anchor = '.' + prefix + '_markPreview';
			const below = position + ':has(' + anchor + ')' + (' + ' + position).repeat(distance) + tick;
			const above = position + ':has(' + ('+ ' + position + ' ').repeat(distance) + anchor + ')' + tick;
			return below + ',' + above;
		}

		/** 由配置生成覆盖样式：刻度粗细、悬停处的曲线渐变、轨道侧、预览字号/宽度/行数。 */
		function railStyleText(prefix, config) {
			const rules = [];
			if (!config.enabled) {
				rules.push('.' + prefix + '_slot{display:none !important}');
				return rules.join('');
			}
			const radius = Math.max(1, Math.min(4, Math.round(config.thickness / 2)));
			rules.push('.' + prefix + '_mark::before{height:' + config.thickness + 'px !important;border-radius:' + radius + 'px !important}');
			// 裁剪盒：框架是刻度的 overflow 容器，加宽它才画得出比 28px 更长的悬停刻度
			// （刻度右对齐，位置不变，多出来的宽度只是左侧余量）。
			rules.push('.' + prefix + '_frame{width:' + RAIL_FRAME_WIDTH_PX + 'px !important}');
			if (config.side === 'left') {
				// 轨道镜像到左侧：框架贴左，刻度改为左对齐，预览改到轨道右边展开。
				rules.push('.' + prefix + '_frame{right:auto !important;left:calc(12px - (var(--dsh-composer-side-clearance) + 16px)) !important}');
				rules.push('.' + prefix + '_mark{inset:0 auto 0 0 !important}');
				rules.push('.' + prefix + '_mark::before{right:auto !important;left:0 !important}');
				rules.push('.' + prefix + '_preview{right:auto !important;left:calc(100% + 10px) !important}');
				rules.push('@keyframes ' + prefix + '_dsh-turn-preview-enter{0%{opacity:0;transform:translate(-4px)}to{opacity:1;transform:translate(0)}}');
			}
			// 悬停处的曲线长度渐变：悬停那根 32px，向外 21 / 14，再往外是内置的 12px。
			// 预览恒定生效 —— 定位条的存在意义就是浏览，没有理由把它关掉，所以这里不再有条件分支。
			rules.push('.' + prefix + '_markPreview::before{width:' + GRADIENT_WIDTHS[0] + 'px !important}');
			for (let distance = 1; distance < GRADIENT_WIDTHS.length; distance += 1) {
				rules.push(gradientSelectorPair(prefix, distance) + '{width:' + GRADIENT_WIDTHS[distance] + 'px !important}');
			}
			const metrics = previewMetrics(config);
			// 预览卡高度跟着行数与字号走：内置把它钉死在 100px（`overflow:hidden` 再裁一刀），
			// 行数调到 4 以上、或把字放大，多出来的部分就只会被裁掉 ——
			// 这里让 `--turn-preview-height` 按同一套行高算出来，卡片的
			// max-height 与 top 夹取都引用它，于是行数与字号真的生效。
			rules.push('.' + prefix + '_frame{--turn-preview-height:' + metrics.height + 'px !important}');
			// 宽度沿用内置的容器夹取写法（`100cqw - 120px`），所以窄窗口不会顶出可视范围。
			rules.push('.' + prefix + '_preview{width:min(' + config.previewWidth + 'px, 100cqw - 120px) !important}');
			// 纯文本呈现：先归一空白（杜绝空白行），再按配置行数截断。
			rules.push('.' + prefix + '_previewPrompt,.' + prefix + '_previewResponse{white-space:normal !important;overflow-wrap:anywhere !important}');
			// 字号与行高成对改写：只改字号会让行高与卡片高度对不上（内置的行高是 px，不会自己缩放）。
			rules.push('.' + prefix + '_previewPrompt{font-size:' + metrics.promptSize + 'px !important;line-height:' + metrics.promptLineHeight + 'px !important}');
			rules.push('.' + prefix + '_previewResponse{font-size:' + config.previewFontSize + 'px !important;line-height:' + metrics.lineHeight + 'px !important;-webkit-line-clamp:' + config.previewLines + ' !important}');
			return rules.join('');
		}

		/**
		 * 挂载覆盖样式：写入一个自有 <style>，并在配置或轨道实例变化时重算。
		 * @param policy - 配置策略。
		 * @returns `dispose`（Cordis effect 的清理函数）与 `state`（排障快照）。
		 */
		function mountRailOverrides(policy) {
			const tag = document.createElement('style');
			tag.dataset.plugin = 'dsh-chat-locator';
			tag.dataset.pluginCss = STYLE_TAG_ID;
			document.head.appendChild(tag);
			let prefix = null;
			let frame = null;
			let lastScan = 0;
			let text = '';
			const render = () => {
				const detached = prefix === null || frame === null || !frame.isConnected;
				if (detached) {
					const now = Date.now();
					if (now - lastScan >= RESCAN_INTERVAL_MS) {
						lastScan = now;
						const found = discoverRail();
						if (found !== null) {
							prefix = found.prefix;
							frame = found.frame;
						}
					}
				}
				const next = prefix === null ? '' : railStyleText(prefix, policy.settings.getSnapshot());
				if (next === text) return;
				text = next;
				tag.textContent = next;
			};
			render();
			const unsubscribe = policy.settings.subscribe(render);
			const observer = typeof MutationObserver === 'function' ? new MutationObserver(render) : null;
			if (observer !== null) observer.observe(document.documentElement, { childList: true, subtree: true });
			return {
				dispose: () => {
					unsubscribe();
					if (observer !== null) observer.disconnect();
					tag.remove();
				},
				state: () => ({
					railPrefix: prefix,
					railFound: frame !== null && frame.isConnected,
					rules: text,
					config: policy.settings.getSnapshot(),
				}),
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
		const NOTICE = {
			margin: '0 0 8px',
			color: 'var(--dsw-alias-state-warn-primary)',
			fontSize: '12px',
			lineHeight: '18px',
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
		/** 提示文案里用哪条本地化标题称呼某个字段。 */
		const FIELD_LABELS = Object.freeze({
			previewFontSize: 'fontSizeTitle',
			previewWidth: 'widthTitle',
		});

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

		/** 数字步进器；`stepSize` 用于宽度这类成十进位的量。 */
		function Stepper({ value, min, max, stepSize = 1, label, onChange, t }) {
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
				button('dec', '−', -1, value <= min, t('decrease')),
				React.createElement('span', { key: 'value', style: STEP_VALUE }, String(value)),
				button('inc', '+', 1, value >= max, t('increase')),
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
		 * 轨道画的是「悬停状态」：中间那根是悬停（预览）刻度，向外按曲线收拢。
		 */
		function Sample({ config, t }) {
			const side = config.side === 'left' ? 'left' : 'right';
			const tickCount = 2 * GRADIENT_REACH + 1;
			const hoveredIndex = GRADIENT_REACH;
			const metrics = previewMetrics(config);
			const ticks = [];
			for (let index = 0; index < tickCount; index += 1) {
				// 与真实轨道同一套长度规则：悬停那根 32，向外 21 / 14，再往外 12。
				const distance = Math.abs(index - hoveredIndex);
				const hovered = distance === 0;
				const width = gradientWidthAt(distance);
				ticks.push(React.createElement('span', {
					key: index,
					style: {
						position: 'absolute',
						top: (10 + index * 9) + 'px',
						[side]: '10px',
						width: width + 'px',
						height: config.thickness + 'px',
						borderRadius: Math.max(1, Math.min(4, Math.round(config.thickness / 2))) + 'px',
						background: hovered ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-border-l2)',
					},
				}));
			}
			const card = React.createElement('div', {
				key: 'card',
				style: {
					position: 'absolute',
					top: SAMPLE_CARD_TOP_PX + 'px',
					[side]: SAMPLE_CARD_OFFSET_PX + 'px',
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
		function LocatorSection({ store, statusStore, update, reset, t }) {
			const config = React.useSyncExternalStore(store.subscribe, store.getSnapshot);
			const status = React.useSyncExternalStore(statusStore.subscribe, statusStore.getSnapshot);
			const row = (key, title, desc, control) => React.createElement('div', { style: ROW, key }, [
				React.createElement('div', { style: ROW_TEXT, key: 'text' }, [
					React.createElement('div', { style: ROW_TITLE, key: 'title' }, title),
					React.createElement('div', { style: ROW_DESC, key: 'desc' }, desc),
				]),
				React.createElement('div', { style: ROW_CONTROL, key: 'control' }, control),
			]);
			const isDefault = sameSettings(config, DEFAULTS);
			const children = [
				React.createElement('p', { style: INTRO, key: 'intro' }, t('intro')),
			];
			if (status.status === 'unavailable' || (status.status === 'ready' && status.writable === false)) {
				children.push(React.createElement('p', {
					style: NOTICE,
					key: 'notice',
				}, status.status === 'unavailable' ? t('unavailable') : t('readOnly')));
			}
			if (Array.isArray(status.unsupported) && status.unsupported.length > 0) {
				// 宿主半侧还没注册这些字段：本次会话照常生效，但不谎称已经存住。
				children.push(React.createElement('p', {
					style: NOTICE,
					key: 'legacy-notice',
				}, t('hostLegacy', { fields: status.unsupported.map((field) => t(FIELD_LABELS[field] ?? field)).join(' / ') })));
			}
			children.push(row(
				'enable',
				t('enableTitle'),
				t('enableDesc'),
				React.createElement(Toggle, { on: config.enabled, label: t('enableTitle'), onToggle: (value) => update('enabled', value) }),
			));
			children.push(row(
				'thickness',
				t('thicknessTitle'),
				t('thicknessDesc', { value: config.thickness }),
				React.createElement(Stepper, {
					value: config.thickness,
					min: THICKNESS_MIN,
					max: THICKNESS_MAX,
					label: t('thicknessTitle'),
					onChange: (value) => update('thickness', value),
					t,
				}),
			));
			children.push(row(
				'side',
				t('sideTitle'),
				t('sideDesc'),
				React.createElement(Segmented, {
					value: config.side,
					label: t('sideTitle'),
					options: [
						{ id: 'right', label: t('sideRight') },
						{ id: 'left', label: t('sideLeft') },
					],
					onChange: (value) => update('side', value),
				}),
			));
			children.push(row(
				'previewLines',
				t('previewLinesTitle'),
				t('previewLinesDesc', { value: config.previewLines }),
				React.createElement(Stepper, {
					value: config.previewLines,
					min: PREVIEW_LINES_MIN,
					max: PREVIEW_LINES_MAX,
					label: t('previewLinesTitle'),
					onChange: (value) => update('previewLines', value),
					t,
				}),
			));
			children.push(row(
				'previewFontSize',
				t('fontSizeTitle'),
				t('fontSizeDesc', { value: config.previewFontSize }),
				React.createElement(Stepper, {
					value: config.previewFontSize,
					min: PREVIEW_FONT_MIN,
					max: PREVIEW_FONT_MAX,
					label: t('fontSizeTitle'),
					onChange: (value) => update('previewFontSize', value),
					t,
				}),
			));
			children.push(row(
				'previewWidth',
				t('widthTitle'),
				t('widthDesc', { value: config.previewWidth }),
				React.createElement(Stepper, {
					value: config.previewWidth,
					min: PREVIEW_WIDTH_MIN,
					max: PREVIEW_WIDTH_MAX,
					stepSize: PREVIEW_WIDTH_STEP,
					label: t('widthTitle'),
					onChange: (value) => update('previewWidth', value),
					t,
				}),
			));
			children.push(row(
				'reset',
				t('resetTitle'),
				isDefault ? t('resetDescDefault') : t('resetDesc'),
				React.createElement(ResetButton, {
					disabled: isDefault,
					label: t('reset'),
					onReset: () => reset(),
				}),
			));
			children.push(React.createElement('div', {
				key: 'sample',
				style: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 0 4px' },
			}, [
				React.createElement('div', { key: 'title', style: ROW_TITLE }, t('sampleTitle')),
				React.createElement(Sample, { key: 'body', config, t }),
				React.createElement('div', { key: 'note', style: ROW_DESC }, t('sampleNote')),
			]));
			return React.createElement('div', { style: SECTION }, children);
		}
		//#endregion

		/**
		 * 挂载插件：字典、配置作用域、样式覆盖、设置页。
		 * @param ctx - 客户端根上下文。
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-chat-locator: dictionaries');
			const t = ctx.locale.bind(NS);
			const policy = new LocatorPolicy(ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE }));
			ctx.effect(() => () => policy.stop(), 'dsh-chat-locator: settings scope');
			const presentation = mountRailOverrides(policy);
			ctx.effect(() => presentation.dispose, 'dsh-chat-locator: rail overrides');
			// 排障钩子：控制台执行 __dshChatLocator.state() 可看到发现的类名前缀与当前覆盖规则。
			const debug = {
				version: PLUGIN_VERSION,
				state: () => ({ ...presentation.state(), settingsStatus: policy.status.getSnapshot() }),
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
					store: policy.settings,
					statusStore: policy.status,
					update: (field, value) => policy.update(field, value),
					reset: () => policy.reset(),
					t,
				}),
			}, LocatorSection));
		}

		return {
			name: 'chat-locator',
			inject: ['slots', 'locale', 'settingsScope'],
			apply,
			// 纯函数出口：宿主/测试可直接校验「类名前缀发现」与「覆盖样式生成」，
			// 不参与运行时行为，也不改变上面的插件形状。
			diagnostics: {
				DEFAULTS,
				GRADIENT_BASE_PX,
				GRADIENT_PEAK_PX,
				GRADIENT_REACH,
				GRADIENT_WIDTHS,
				NS,
				PLUGIN_VERSION,
				PREVIEW_CHROME_PX,
				PREVIEW_FONT_MAX,
				PREVIEW_FONT_MIN,
				PREVIEW_LINES_MAX,
				PREVIEW_LINES_MIN,
				PREVIEW_LINE_RATIO,
				PREVIEW_WIDTH_MAX,
				PREVIEW_WIDTH_MIN,
				PREVIEW_WIDTH_STEP,
				RAIL_FRAME_WIDTH_PX,
				SETTINGS_FIELDS,
				SETTINGS_NAMESPACE,
				STYLE_TAG_ID,
				THICKNESS_MAX,
				THICKNESS_MIN,
				discoverRail,
				gradientWidthAt,
				normalizeSettings,
				previewMetrics,
				railStyleText,
				sameSettings,
			},
		};
	},
});
