---
name: space-vfx-2d
license: MIT
description: 在 THE LAST ARK 这类 TypeScript + Vite + Canvas 2D 的二维物理游戏上做视觉升级时使用。把粒子、辉光、明暗、拖尾、脉冲和程序化天体细节加到已有玩法之上，同时保证物理、碰撞与场景状态机零改动。触发场景：实现或调优引力场特效、吸引/排斥节点表现、飞船尾迹、太阳/行星/黑洞/虫洞/星云表现、深空背景、质量档位、帧率与性能验收；也用于回答「画面太丑/太空/太花」「特效挡视线」「粒子看不清」这类问题。触发词：VFX、特效、粒子、particle、辉光、glow、光晕、拖尾、trail、脉冲、pulse、星云、nebula、日冕、吸积盘、程序化星空、Canvas 特效、视觉升级、画面优化。
---

# space-vfx-2d · 二维深空视觉开发

把二维 Canvas 物理游戏升级成**电影化二维深空**，而不是做成一张布满引力线的物理教学演示图。

本 Skill 假设仓库是 THE LAST ARK（`the-last-ark`）。文中所有文件路径、函数签名、常量值都取自该仓库的**真实代码**；如果目标仓库不同，先按
[§4 接口核对清单](#4-接口核对清单先做这一步) 逐条确认再动手，**不要假设，也不要编造 API**。

---

## 1. 什么时候用 / 什么时候不用

**用**：给已有玩法加视觉层；画面氛围与可读性调优；特效性能优化；新增天体表现。

**不用**：

- 玩法、关卡、物理规则本身要改 → 那是另一件事，本 Skill 的硬契约不允许。
- 要迁移到 3D / WebGL 重写 → 见 [§3 禁止事项](#3-禁止事项)。
- 只是问"该配什么颜色"这种一句话问题 → 直接读 `references/art-direction.md` 即可，不必走完整流程。

---

## 2. 一句话原则

> **视觉只能读取物理状态，绝不能反向写入。**
> 粒子可以简化、可以艺术化，但它表达的方向必须来自真实场，不能自己编一套引力公式。

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
| C6 | **无外部美术资源。** 全部代码绘制，程序化细节用确定性 PRNG。 | 同上。随机源只用既有的 `seededRandom`（`src/world/sectors.ts`，mulberry32）。 |
| C7 | **`fx=off` 必须永远保持"加特效之前"的逐像素画面。** 每个新效果都必须有一个 spec 开关把它关掉，且**关掉的方式必须能被测试观测到**——判据用 `fx=off` 一帧里不出现 `globalCompositeOperation === 'lighter'`，不要用"绘制了哪几种形状"。 | 它是性能 A/B 基线，也是出问题时二分定位的工具。只有它不动，对照才成立。**这条被真实破坏过一次**：节点辉光不在任何门控之内，`fx=off` 悄悄多了发光节点，而当时的形状清单断言（`['arc','fill','stroke']`）对它免疫，因为新效果画的也是这三种形状。**形状清单对新增同形状绘制天然无效**；加色混合才是这批效果的共同签名。**但它是必要不充分的**：场的明暗染走 `source-over`（`lighter` 压不暗东西，而压缩感必须是真的减亮度），所以一个非加色混合、又忘了加 spec 门控的新效果仍能溜过去。若某个新效果不用 `lighter`，必须为它补一条同等强度的门控断言，不能默认它没问题。 |
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

下面是本仓库**已经存在**的东西。动手前先逐条确认它们还在、签名没变。任何一条对不上就停下来问，不要猜。

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
// setZoom 会把 zoom 钳在 [0.3, 2]
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
| 定颜色 / 光晕层级 / 动画节奏 / 看禁忌 | `references/art-direction.md` |
| **引力场粒子、节点拖尾、合力表现、波纹、对象池** ← 技术重点 | `references/gravity-field-vfx.md` |
| 太阳、行星、黑洞、虫洞、星云、星空、LOD | `references/celestial-effects.md` |
| 性能预算、质量档位、浏览器验收、截图、评分表 | `references/performance-and-qa.md` |

最典型的任务是"给蓝球金球加粒子" → 先 `art-direction.md` 定 token，再 `gravity-field-vfx.md` 实现，最后 `performance-and-qa.md` 验收。

---

## 6. 标准工作流

按顺序做，**每一步都要留下可验证的证据**。

1. **核对接口。** 走 [§4 清单](#4-接口核对清单先做这一步)。对不上的停下来报告，不要猜。
2. **建基线。** 改任何东西之前，先记录当前 `?fx=off` 与 `?fx=medium` 的帧时间、绘制调用数、截图。没有基线，"无回归"就是不可证伪的说法。
3. **定 token。** 新增颜色一律进 `src/render/palette.ts`，用 8 位十六进制含 alpha 的常量。**绘制路径里不拼字符串**（每帧拼 rgba 会分配）。
4. **先写纯函数。** 粒子的更新逻辑、采样、生命周期尽量写成不依赖 canvas 的纯函数，这样能在 node 下测。
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
- [ ] `fx=off` 画面与改动前逐像素一致（这是二分定位工具，不能坏）。**判据**：`fx=off` 一帧里没有任何 `globalCompositeOperation === 'lighter'`。**不要用形状清单**——它对新增的同形状绘制免疫，这条契约就是这么被破坏过一次的（见 C7）。
- [ ] 有测试断言"渲染不改 `GameState`"（形如 `expect(a).toEqual(b)` 或 `structuredClone` 快照对比）。
- [ ] 粒子/特效在暂停时冻结、在 `ready` 时为空、在 `completed`/`failed` 时停止增长。
- [ ] **真实浏览器实测过**：给了帧时间/绘制调用数，看了 Console，有截图。
  本环境可以零依赖做到，`package.json` 不需要加任何东西：`msedge.exe --headless=new --remote-debugging-port=<port> --user-data-dir=<临时目录>`，用 node 内置的 `WebSocket` 直连 CDP，`Page.addScriptToEvaluateOnNewDocument` 在应用加载前挂钩 `CanvasRenderingContext2D` 原型来逐次计数绘制调用，`Page.captureScreenshot` 取图。**两条实测过的坑**：①`Runtime.evaluate` 要 `awaitPromise: true` 才能取回 Promise 的值；②**一个进程只测一个 URL**——同一 CDP 会话里第二次 `Page.navigate` 会让 rAF 被节流，测量直接挂住。
- [ ] README 里写清**已验证 / 未验证**的划分，不把"应该没问题"写成"已验证"。

> **最后一条是本 Skill 最容易违反的一条，而且违反的方式很隐蔽**：光晕在放大缩小、场环几何全对，测试也全绿，于是可以写出一份"已实现"的报告——而玩家看到的是"几圈光晕，没有特别的"。**几何正确不等于表达有效。** 报告视觉效果之前，先问一句"我看过它吗"；没看过就写"没看过"，别写"应该没问题"。

---

## 8. 优先开发的三个效果

**当前状态（2026-10-16）：第 2、3 条已实现并留用；第 1 条做出来了、被玩家否掉、已删除。**

> ### 给第 1 条加一条前置判断，这条比实现细节重要得多
>
> 蓝球吸引粒子 + 金球排斥粒子是本 Skill 排第一的推荐，照着做了：方向取自 `fieldAcceleration`，逐池手性、绕节点求切向、径向速度实测 −28.2（零场对照 +0.01）、四个池手性全是 1.0、测试全绿。**玩家的判定是"不需要这种场粒子，实际视觉效果很差"，于是整套删掉。**
>
> 原因不是实现错了，是**判据选错了**。以上每一条量的都是"粒子有没有忠实表达这个场"，而决定成败的是另一个问题：**这个效果在相邻两帧之间携带新信息吗？**
>
> 一套持续向内流动的粒子是**时间的函数**——不管场有没有变化、飞船在哪、玩家做没做操作，屏幕上的运动量恒定。它没有状态，因此不携带信息，读起来像一段循环播放的动画，而不是"这里正在发生一件事"。玩家两次反馈说的是同一件事："几圈光晕在**放大缩小**"、"不能在开始之后**持续一直地**朝着中心动"。
>
> **所以推荐改成条件式的**：只在"场正在发生变化"时才让它动（开关瞬间、极性强弱变化、粒子穿过边界），或者干脆用**不随时间变化**的表达——星空位移就是这样（`starfield.ts`，无时间项，只取决于星点到场源的距离），它读起来是"这片空间被压成什么形状"，是留用的那条。
>
> **动手写任何持续动画之前，先回答"它两帧之间携带什么新信息"。答不上来就别写。** 这条现在是本 Skill 的最高优先级检查项。
>
> 第 1 条本身的实现细节（含样例代码里的两个实测 bug：切向取自力向量导致吸引/排斥手性相反、逐粒子符号把旋转结构平均掉）记在 `references/gravity-field-vfx.md` 的"⚠️ 样例代码有两个已实测的 bug"一节——**照抄那节代码会同时踩中两个**。

下面是原始优先级排序，保留它的理由不是待办清单，而是**它排对了**——按这个顺序做确实是对的（第 1 条"排第一"是对**技术难度与诚实度**的排序，不是对留存率的保证）。

如果时间有限，按这个顺序做：

1. **蓝球吸引粒子 + 金球排斥粒子**（`references/gravity-field-vfx.md`）。**先读上面那段前置判断**——本项目的实测结论是这个效果会被否掉，理由与实现无关。
   当前画面里引力完全靠几何线条表达；换成粒子后，玩家第一次能"看见"力。方向取自 `fieldAcceleration`，所以它同时是最好看和最诚实的。
2. **飞船基于真实世界速度的连续拖尾，且正确处理摄像机跟随**（`references/gravity-field-vfx.md` 的拖尾一节）。
   飞船是全画面最需要可读性的对象，一条读得懂速度的尾巴直接提升操作手感。
3. **深空背景的层次：程序化星空视差 + 低对比度星云**（`references/celestial-effects.md`）。
   它不改变任何玩法信息，但把"空白的黑板"变成"宇宙"，是氛围的地基。

---

## 9. 参考文件

- `references/art-direction.md`
- `references/gravity-field-vfx.md`
- `references/celestial-effects.md`
- `references/performance-and-qa.md`
