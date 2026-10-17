---
name: space-vfx-2d
license: MIT
description: 在 THE LAST ARK 这类 TypeScript + Vite + Canvas 2D 的二维物理游戏上做视觉升级时使用。把星光形变、时空明暗褶皱、交互扰动、辉光、拖尾和程序化天体细节加到已有玩法之上，同时保证物理、碰撞与场景状态机零改动。触发场景：实现或调优引力场特效、吸引/排斥节点表现、飞船尾迹、太阳/行星/黑洞/虫洞/星云表现、深空背景、质量档位、帧率与性能验收；也用于回答「画面太丑/太空/太花」「特效挡视线」「粒子看不清」这类问题。触发词：VFX、特效、粒子、particle、辉光、glow、光晕、拖尾、trail、脉冲、pulse、星云、nebula、日冕、吸积盘、程序化星空、Canvas 特效、视觉升级、画面优化。
---

# space-vfx-2d · 二维深空视觉开发

把二维 Canvas 物理游戏升级成**电影化二维深空**，而不是做成一张布满引力线的物理教学演示图。

本 Skill 假设仓库是 THE LAST ARK（`the-last-ark`）。文中保留原作者视觉开发记录中的路径、签名与常量。**本 Skill 分支不一定包含当时的全部实现**：2026-10-17 核对时，`scene-visuals.ts`、`starfield.ts`、`field-visuals.ts` 及 `fieldAccelerationInto` 在此分支尚不存在；§4 中相关内容属于接入前待核对的契约记录，不是已存在 API 的保证。本文新增的扰动类型、参数和伪代码均为实现规范，尚未实装或试玩验收。接入任何分支前，先按
[§4 接口核对清单](#4-接口核对清单先做这一步) 逐条确认再动手，**不要假设，也不要编造 API**。

---

## 1. 什么时候用 / 什么时候不用

**用**：给已有玩法加视觉层；画面氛围与可读性调优；特效性能优化；新增天体表现。

**不用**：

- 玩法、关卡、物理规则本身要改 → 那是另一件事，本 Skill 的硬契约不允许。
- 要迁移到 3D / WebGL 重写 → 见 [§3 禁止事项](#禁止事项)。
- 只是问"该配什么颜色"这种一句话问题 → 直接读 `references/art-direction.md` 即可，不必走完整流程。

---

## 2. 一句话原则

> **视觉只能读取物理状态，绝不能反向写入。**
> 视觉可以简化、可以艺术化，但基础星光形变的方向必须来自真实场的矢量和，不能自己编一套引力公式。

这条是本 Skill 存在的前提。任何与它冲突的建议都作废。

---

## 3. 不可协商的契约

每一条都有具体出处，改代码前先读一遍。违反任何一条都会让改动被回滚。

| # | 契约 | 为什么 |
| --- | --- | --- |
| C1 | **VFX 只读 `GameState` / `Camera` / `Trajectory`，永不写入。** | `docs/GAME_DESIGN.md` 的架构契约。所有特效状态活在 `VisualState` 里，键控于实体 id，在 `scenes.revision` 变化时重置。 |
| C2 | **不得为了特效修改运动方程、速度、力、质量或碰撞判定。** | 物理是玩法本身。想"让爆炸推动飞船"这种效果，只能做纯视觉的，不参与模拟。 |
| C3 | **帧率无关。** 不用固定每帧增量；粒子按经过时间更新。 | `tests/game.test.ts` 与 `tests/camera.test.ts` 断言 30/60/144 FPS 下模拟状态逐位相同。 |
| C4 | **`src/render/*` 必须能在 node 下被 import。** 模块顶层禁止触碰 `document` / `window` / `getContext`。 | `vitest.config.ts` 未设 `environment`（默认 node），任何模块顶层 DOM 访问会让整个测试文件在 import 时炸掉。**import 本身就是这条的测试。** |
| C5 | **零运行时依赖。** 不引入 PixiJS / Three.js / 任何 npm 包。 | 项目既有的零依赖承诺。 |
| C6 | **当前版本优先程序化绘制，不主动新增外部美术素材。** 未来仅在用户明确批准时允许二维 Sprite、贴图和背景插画；仍使用 Canvas 2D，零新增依赖，不得未经授权迁移到三维框架。 | 程序化细节继续用既有 `seededRandom`（`src/world/sectors.ts`，mulberry32），保持确定性；批准二维素材不等于批准更换框架。 |
| C7 | **`fx=off` 必须保持“加特效之前”的逐像素画面。** 每项新增效果必须有可观测的 spec 门控测试，覆盖 `source-over` 暗化、星点位移、明暗印章、光晕及余效；并在同一运行环境、相同初始状态与确定性 seed 下对比改动前 / 后的 off 基线图像，见 `references/performance-and-qa.md` §7.6。 | 保留失败记录：节点辉光曾漏门控，形状清单断言（`arc/fill/stroke`）未发现，因为新增效果画的是同类形状。“没有 `globalCompositeOperation === 'lighter'`”只能作为辅助断言，不能证明全部特效已关闭；`source-over` 暗化也必须彻底旁路。 |
| C8 | **TS 5.9 strict**：`noUnusedLocals` / `noUnusedParameters` / `verbatimModuleSyntax`（类型导入必须 `import type`）。 | `npm run build` 会直接失败。 |

### 禁止事项

- ❌ 迁移到 Three.js / React Three Fiber。
- ❌ 改成 3D 或 2.5D；引入三维模型、三维场景、三维物理。
- ❌ 为了做特效重写物理引擎。
- ❌ 用新建项目脚手架覆盖当前游戏。
- ❌ 在没有明确收益和用户授权时迁移渲染架构。
- ❌ 用 `shadowBlur` 做辉光（昂贵且偏霓虹）——只用径向渐变与加法混合。
- ❌ 逐粒子 `fillStyle` 赋值或逐粒子 `ctx.arc()` 调用（见 `references/performance-and-qa.md`）。

> 二维 WebGL / PixiJS 未来可以作为评估项，但**不是使用本 Skill 的先决条件**，当前任务不得以它为前提。

---

## 4. 接口核对清单（先做这一步）

下面保留原稿的接口清单；动手前逐条核对当前 checkout。缺失时报告差异，在渲染侧设计最小只读适配，不为满足文档去改物理、碰撞、场景或相机。不得把示意类型宣称为已经存在的接口。

### 物理层（只读，不要改）

```ts
// src/physics/fields.ts
export function fieldAcceleration(target: Vec2, source: Vec2, field: Field): Vec2;
export function fieldAccelerationInto(out: Vec2, target: Vec2, source: Vec2, field: Field): Vec2; // 非分配版，优先用它

// src/physics/gravity.ts
export function bodyGravity(body: Body): Field;
export function bodyGravityInto(field: Field, body: Body): Field;

// src/game/entities.ts
export function capabilities(body: Body): Capabilities;
export function capabilitiesInto(out: Capabilities, body: Body): Capabilities;

// src/physics/world.ts
export function integrate(bodies: Body[], players: Player[], dt: number, stabilizationEnabled?: boolean, precomputed?: BodyFields): { candidatePairs: number };
export const MAX_ACCELERATION = 170;
export const MAX_SPEED = 240;
export function speedLimit(body: Body): number;
```

`Field` 的形状（`src/game/types.ts`）：

```ts
export interface Field { radius: number; strength: number; softening: number; maxAcceleration: number; polarity: 1 | -1 }
```

### 状态与相机

```ts
// src/game/types.ts
export interface GameState {
  level: Level; bodies: Body[]; players: [Player, Player]; phase: Phase;
  elapsed: number; message: string; mission: MissionState; distance: number;
  pendingScene?: SceneId;
  checkpoint?: { id: string; snapshot: Omit<GameState, 'checkpoint'> };
}
export type Phase = 'ready' | 'running' | 'paused' | 'completed' | 'failed';
export type EntityKind = 'ship' | 'player' | 'asteroid' | 'planet' | 'star' | 'black_hole' | 'station' | 'wormhole';

// src/camera/camera.ts
export interface Camera { position: Vec2; zoom: number; width: number; height: number }
export function worldToScreen(camera: Camera, world: Vec2): Vec2;
export function screenToWorld(camera: Camera, screen: Vec2): Vec2;
export function viewBounds(camera: Camera): Rect;
export function isVisible(camera: Camera, p: Vec2, radius?: number): boolean;
// zoom 下限以当前 camera.ts 为准；此分支可低于 0.3，视觉不得假设固定下限
```

### 渲染层（特效挂在这里）

```ts
// src/render/canvas.ts —— 两个入口
export function render(ctx: CanvasRenderingContext2D, game: GameState, trajectory: Trajectory, camera: Camera, visuals: VisualState): void;
export function renderTitle(ctx: CanvasRenderingContext2D, camera: Camera, visuals: VisualState): void;

// src/render/scene-visuals.ts —— 特效状态与质量档位
export interface QualitySpec { stars: number; trailPoints: number; fieldRings: number; streamlines: boolean }
export type QualityLevel = 'off' | 'low' | 'medium' | 'high';
export const QUALITY: Record<QualityLevel, QualitySpec>;
export function createVisualState(quality?: QualityLevel): VisualState;
export function updateVisuals(state: VisualState, game: GameState | undefined, revision: number, frameSeconds: number): void;
export function resetVisuals(state: VisualState): void;
export function parseQuality(search: string): QualityLevel;

// src/render/trail.ts —— 轨迹尾迹
export interface Trail { xs: Float32Array; ys: Float32Array; head: number; count: number; lastX: number; lastY: number; carried: number; fresh: boolean }
export function appendTrailSample(trail: Trail, x: number, y: number, style: TrailStyle): void;
export function drawTrail(ctx: CanvasRenderingContext2D, trail: Trail, camera: Camera, style: TrailStyle): void;

// src/render/starfield.ts
export function drawStarfield(ctx: CanvasRenderingContext2D, camera: Camera, field: Starfield, drift: number): void;

// src/render/celestial.ts
export function drawBody(ctx: CanvasRenderingContext2D, body: Body, camera: Camera): void;
export function rockShape(id: string): RockShape;

// src/render/field-visuals.ts
export function collectFields(game: GameState, out: FieldSource[]): FieldSource[];
export function drawFields(ctx: CanvasRenderingContext2D, fields: FieldSource[], camera: Camera, spec: QualitySpec, phase: Phase): void;
export function drawNetForceArrow(ctx: CanvasRenderingContext2D, game: GameState, camera: Camera, spec: QualitySpec): void;

// src/render/palette.ts —— 所有进 fillStyle 的字符串都是模块常量，绘制路径里不拼 rgba 模板
```

### 世界变换（照抄，别自己发明）

`canvas.ts` 里的世界空间是这样的，所有世界坐标特效必须用同一套：

```ts
ctx.save();
ctx.translate(width / 2, height / 2);
ctx.scale(camera.zoom, camera.zoom);
ctx.translate(-camera.position.x, -camera.position.y);
// 世界空间的绘制调用全部写在这里（顺序见 references/art-direction.md §6.1）
ctx.restore();
```

屏幕空间（HUD、边缘箭头、合力箭头）在 `restore()` **之后**画。

---

## 5. 渐进式加载：读哪一份

**不要一次读完所有 reference。** 按任务取用：

| 你要做的事 | 读这份 |
| --- | --- |
| 定颜色 / 光晕层级 / 动画节奏 / 看禁忌 | `references/art-direction.md` §1–3、§4、§6–9 |
| **星空形变、明暗褶皱、统一扰动、节点拖尾** | `references/gravity-field-vfx.md` §1–2、§8–9、§10.1–10.3、§11；§3–7 / §10.4 仅为弃用档案 |
| 太阳、行星、黑洞、虫洞、星云、星空、LOD | `references/celestial-effects.md` §1–7、§8（相机适配）、§9（LOD 汇总） |
| 性能预算、质量档位、浏览器验收、截图、评分表 | `references/performance-and-qa.md` §1–6、§7.1–7.6、§9；off 门控 / 图像基线专见 §7.6 |

典型任务是“让蓝球金球改变空间质感” → 先读 `art-direction.md`，再读 `gravity-field-vfx.md` §1–2、§8–9、§10.1–10.3、§11，最后按 `performance-and-qa.md` 验收。§3–7 与 §10.4 仅为 Deprecated / Rejected Experiment，不得照做为正式引力效果。

---

## 6. 标准工作流

按顺序做，**每一步都要留下可验证的证据**。

1. **核对接口。** 走 [§4 清单](#4-接口核对清单先做这一步)。对不上的停下来报告，不要猜。
2. **建基线。** 改任何东西之前，先记录当前 `?fx=off` 与 `?fx=medium` 的帧时间、绘制调用数、截图。没有基线，"无回归"就是不可证伪的说法。
3. **定 token。** 新增颜色一律进 `src/render/palette.ts`，用 8 位十六进制含 alpha 的常量。**绘制路径里不拼字符串**（每帧拼 rgba 会分配）。
4. **先写纯函数。** 场采样、扰动包络、事件检测、生命周期尽量写成不依赖 canvas 的纯函数，这样能在 node 下测。
5. **接进 `VisualState`。** 新状态加进 `VisualState`，在 `updateVisuals` 里更新；**不要**加进 `GameState`。重置走 `scenes.revision`。
6. **挂上画质档位。** 每一种新特效都要能按 `QualitySpec` 增减或关闭，并确认 `fx=off` 逐像素不变。
7. **验收。** 按 `references/performance-and-qa.md` 跑；跑不了的**如实说明跑不了**，不许编造数据或截图。

### 强制要求

- 每个阶段结束跑通 `npm run check`（= `vitest run` + `tsc --noEmit` + `vite build`）。
- **不得虚构截图、测试结果与性能数字。** 拿不到就说拿不到。
- 新增的纯逻辑要配测试。测试文件里**不要写静态扫源码的测试**——直接 import 就是 node 安全性的测试。

---

## 7. 验收与交付

一次改动算完成，需要同时满足：

- [ ] `npm run check` 全绿。
- [ ] `fx=off` 画面与改动前逐像素一致（这是二分定位工具，不能坏）。**判据**：逐项特效门控测试 + 同一运行环境、相同初始状态与确定性 seed 的改动前 / 后 off 图像对比（`performance-and-qa.md` §7.6）。没有 `lighter` 仅为辅助断言；`source-over` 暗化及缓存余效也必须关闭，不能用形状清单代替门控证明（见 C7）。
- [ ] 有测试断言"渲染不改 `GameState`"（形如 `expect(a).toEqual(b)` 或 `structuredClone` 快照对比）。
- [ ] 粒子/特效在暂停时冻结、在 `ready` 时为空、在 `completed`/`failed` 时停止增长。
- [ ] **真实浏览器实测过**：给了帧时间/绘制调用数，看了 Console，有截图。
  本环境可以零依赖做到，`package.json` 不需要加任何东西：`msedge.exe --headless=new --remote-debugging-port=<port> --user-data-dir=<临时目录>`，用 node 内置的 `WebSocket` 直连 CDP，`Page.addScriptToEvaluateOnNewDocument` 在应用加载前挂钩 `CanvasRenderingContext2D` 原型来逐次计数绘制调用，`Page.captureScreenshot` 取图。**两条实测过的坑**：①`Runtime.evaluate` 要 `awaitPromise: true` 才能取回 Promise 的值；②**一个进程只测一个 URL**——同一 CDP 会话里第二次 `Page.navigate` 会让 rAF 被节流，测量直接挂住。
- [ ] README 里写清**已验证 / 未验证**的划分，不把"应该没问题"写成"已验证"。

> **最后一条是本 Skill 最容易违反的一条，而且违反的方式很隐蔽**：光晕在放大缩小、场环几何全对，测试也全绿，于是可以写出一份"已实现"的报告——而玩家看到的是"几圈光晕，没有特别的"。**几何正确不等于表达有效。** 报告视觉效果之前，先问一句"我看过它吗"；没看过就写"没看过"，别写"应该没问题"。

---

## 8. 正式引力视觉优先级与动画判断

最终方向：**高等文明改变空间本身；星光偏移，深色半透明织物般的明暗结构柔和起伏、拉伸与恢复。** 不以引力线、持续流动的场粒子、静态染色盘或呼吸光圈作为主体。

正式优先级固定为：

1. **星空的空间形变**：真实场矢量和决定基础方向和相对强弱，稳定连续且有最大位移限制。
2. **柔和的局部明暗褶皱**：低对比度、不规则、边界消隐；蓝色主要压暗收缩，金色主要微亮扩张。
3. **交互驱动的短暂空间波动**：开启、强度变化与快速移动触发；同一扰动同时驱动星点与明暗，平滑衰减。
4. **节点本体光晕与运动拖尾**：保持身份与定位锚点，复用既有 Trail 和世界坐标逻辑。
5. **粒子仅用于适合的天体特效**：太阳、虫洞、黑洞等，见 `celestial-effects.md`。不恢复持续汇聚/扩散的引力场粒子。

玩法信息与视觉氛围是两个目标。**允许低幅度连续变化塑造空间质感**，无需每两帧都携带新玩法信息；但稳态应安静，强烈变化应响应真实交互或场状态，不能把启动动画循环播放。禁止以“没有新信息”为由一概删除氛围动画，也不能以氛围为理由遮蔽飞船、危险轮廓或操作提示。

**Deprecated / Rejected Experiment（2026-10-16，保留技术记录）**：持续蓝球吸引粒子 / 金球排斥粒子已实现后被玩家否决并删除。原稿记录径向速度 −28.2（零场 +0.01）、四池手性 1.0，说明方向测试通过仍不代表美术成功；这些为历史记录，本次未重测。切向取自力向量导致极性手性翻转、逐粒子符号冲淡旋转结构两个 bug 仍保留在 `gravity-field-vfx.md` §4，供查错，不再是待办或推荐路线。

新规范的公式、Canvas 近似与验收场景见 `gravity-field-vfx.md` §9、§10.1–10.3 及 `performance-and-qa.md` §5.1、§7.3、§7.6。实现正确、截图合格和玩家实际试玩认可是三种证据，不能互相替代。

---

## 9. 参考文件

- `references/art-direction.md`
- `references/gravity-field-vfx.md`
- `references/celestial-effects.md`
- `references/performance-and-qa.md`
