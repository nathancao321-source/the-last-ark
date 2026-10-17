# 引力场视觉化 · 技术核心

这是本 Skill 最重要的文件。引力场是这款游戏的玩法主体，**如果视觉把它画错了，就是把玩家教错了**。

先记住一条：

> **正式画面里，引力不画成曲线、箭头、网格或磁场线。**
> 引力由 **星空形变 + 低对比度明暗褶皱 + 交互驱动的短暂空间扰动** 来表达；节点光晕与拖尾辅助定位。
> **§3–7 和 §10.4 为 Deprecated / Rejected Experiment**，仅保留技术记录，不是正式实现路径。
> 线条与箭头属于**开发调试可视化**，默认关闭。

---

## 1. 真实的场律（先读这一段，再写任何代码）

`src/physics/fields.ts` 是唯一的真相来源：

```ts
export function fieldAcceleration(target: Vec2, source: Vec2, field: Field): Vec2 {
  const delta = sub(source, target);
  const distance = length(delta);
  if (distance < 1e-8 || distance >= field.radius) return { x: 0, y: 0 };
  const taper = (1 - (distance / field.radius) ** 2) ** 2;
  const magnitude = Math.min(field.maxAcceleration, field.strength / (distance ** 2 + field.softening ** 2) * taper);
  return scale(delta, field.polarity * magnitude / distance);
}
```

从这七行里能读出三条**直接决定视觉设计**的事实：

1. **`magnitude` 只依赖 `distance`，方向是 `delta` 归一化。**
   所以对单个场源，任意点的场向量**精确地是径向的**。既然流线处处与场同向，单源流线必然是一条**笔直的射线**。
   → 这就是为什么**不用场线**：用数值积分去复现直线，既难看又附带积分误差。曲率只在**两个场重叠**处才出现。

2. **`field.radius` 是硬截断。** 超出就是 `{x:0, y:0}`，一点力都没有。
   → 基础形变继承该范围并在边缘平滑归零；历史粒子实验也要求场外不受力。短暂视觉扰动可在单独标定的软包络内衰减，它不表示范围外存在真实力。

3. **`polarity` 已经写进了返回值。** `+1` 吸引、`-1` 排斥，方向自动指向正确的一侧。
   → **粒子不需要知道自己是蓝的还是金的，也能得到正确方向。** 颜色只是身份标签，不是方向来源。

### 已经做好的三圈等高线（现属 debug）

`src/render/field-visuals.ts` 的 `RING_FRACTIONS = [0.87, 0.64, 0.37]` 是从 `taper = (1-(d/R)²)²` 反解出来的（令 `d/R = √(1-√t)`，取剩余强度 t = 6% / 35% / 75%）。疏密不均**是信息，不是随意**——等距环会谎称场强线性衰减。

按 `art-direction.md` §6.2，这三圈环连同合力箭头**降级为 `?dev=1` 的调试叠层**；正式档改由**明暗染 + 星空位移**表达（本文件的粒子那一版做出来又被删了，理由见本文 §4 的警告框与 `SKILL.md` 第 8 节）。**不要删掉它们**，调试时还需要。

---

## 2. 只读接口：唯一允许的取样方式

### 规则

1. **有 `fieldAccelerationInto` 就复用它。** 原作者记录的该接口是非分配版本，当前分支需先核对，与本仓库 `capabilitiesInto` / `bodyGravityInto` / `queryInto` 同一套约定。
2. **物理层没有取样接口时，写一个只读适配器，不要重写引力公式。**
3. 渲染层**永远不允许**出现第二份 `1/(d²+s²)`。当前分支只有分配版 `fieldAcceleration` 时，先用只读适配器调用它并测成本；不要改物理接口来迎合本规范，也不要把示例 import 当成已存在。

### 非分配取样

星点 / 控制点循环里每点每帧都要取样，**绝不能用分配版**——`sub` / `scale`（`src/physics/vector.ts`）每次都返回新 `Vec2`，500 粒子 × 2 源 × 60 帧 = 每秒 6 万个垃圾对象。

```ts
// 模块级 scratch，全流程复用
const sampleScratch = { x: 0, y: 0 };
```

### 合力适配器（从既有代码提取）

`src/render/field-visuals.ts` 的 `drawNetForceArrow` 里已经有**一份正确的合力求和**：先遍历 `active` 的玩家场，再遍历所有 `caps.gravity && strength > 0` 且 `body !== ship` 的天体。这个顺序精确对应 `src/physics/world.ts` 的 `accelerations()`。

在这些接口已存在的分支，把它提取成可复用的只读函数，箭头与视觉采样共用同一份，**保证两者永不打架**：

```ts
// src/render/vfx/field-sampler.ts —— 新增，只读
import { fieldAccelerationInto } from '../../physics/fields';
import { bodyGravityInto, emptyField } from '../../physics/gravity';
import { capabilitiesInto, emptyCapabilities } from '../../game/entities';

const caps = emptyCapabilities();
const gravity = emptyField();
const out = { x: 0, y: 0 };
const target = { x: 0, y: 0 }; // scratch，避免热循环分配

/** 与 world.ts accelerations() 同序的合力：先激活玩家场，再非自身的引力天体。
 *  返回模块级 out（同一实例），调用方不得持有。 */
export function sampleNetAcceleration(game: GameState, x: number, y: number): Vec2 {
  let ax = 0, ay = 0;
  target.x = x; target.y = y;
  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    if (!player.active) continue;
    fieldAccelerationInto(sampleScratch, target, player.position, player.field);
    ax += sampleScratch.x; ay += sampleScratch.y;
  }
  for (let i = 0; i < game.bodies.length; i++) {
    const body = game.bodies[i];
    if (body.kind === 'ship') continue;          // world.ts:114 —— 天体不受自身引力
    capabilitiesInto(caps, body);
    if (!caps.gravity) continue;
    bodyGravityInto(gravity, body);
    if (gravity.strength <= 0) continue;
    fieldAccelerationInto(sampleScratch, target, body.position, gravity);
    ax += sampleScratch.x; ay += sampleScratch.y;
  }
  out.x = ax; out.y = ay;
  return out;
}
```

> 注意：这里返回的是**原始加速度**，没有乘 `body.response`、也没有乘全局 `MAX_ACCELERATION` 上限。粒子要的是**场的方向与相对强弱**，不是某个特定物体的净加速度。如果你要表达"这个天体实际被推多少"，那才需要乘 `response` 并做上限钳制——两者概念不同，见 §7。

---

## 3. 粒子系统设计（Deprecated / Rejected Experiment）

> **§3–7 整体归档**：下列生成速率、粒子算法、环形脉冲、调参建议和命令式表述仅说明当时实验，均不授权恢复为正式引力视觉。通用池化 / 批处理知识仍可供天体特效复用。正式路径从 §8–10 继续。

### 3.1 结构（SoA，定容，零分配）

```ts
// src/render/vfx/particles.ts
export interface ParticlePool {
  x: Float32Array; y: Float32Array;        // 世界坐标
  vx: Float32Array; vy: Float32Array;      // 世界单位/秒
  age: Float32Array;
  life: Float32Array;                      // 0.45–1.30 s
  size: Float32Array;                      // 世界单位，0.7–2.6
  jitter: Float32Array;                    // 每粒子固定相位，来自 seededRandom
  bucket: Uint8Array;                      // 亮度档位 0..3
  alive: Uint8Array;
  capacity: number;
  live: number;                            // 高水位，仅用于循环上界
  emitAccum: number;
  cursor: number;                          // 找空槽的轮转起点
}
export function createPool(capacity: number): ParticlePool;
export function killAll(pool: ParticlePool): void;
```

**为什么用 `Float32Array` 而不是对象数组**：定容、无 GC 压力、缓存友好。这是本仓库 `Trail`（`src/render/trail.ts`）已经在用的模式，保持一致。

### 3.2 生命周期

```
生成:  age = 0, life = lerp(minLife, maxLife, rnd())
每帧:  age += dt
       若 age >= life → 死亡（alive[i] = 0）
       t = age / life
       bucket = min(3, floor(t * 4))
       alpha 由 bucket 决定（见 art-direction §2.2）
```

- **淡入**：`t < 0.15` 时 `alpha *= t / 0.15`。
- **淡出**：`t > 0.65` 时 `alpha *= (1 - t) / 0.35`。
- 两端都要有，**不能硬切**。
- 吸引粒子寿命 **0.45–0.90 s**；排斥粒子 **0.60–1.30 s**（更长，读出"喷散"）。

### 3.3 对象池

- **定容，永不增长。** 容量由 `QualitySpec` 决定。
- 死亡只标记 `alive = 0`，槽位可被复用。
- 复用顺序：从 `cursor` 起轮转扫描找空槽（`while (pool.alive[cursor]) cursor = (cursor+1) % capacity`）。若一圈都满，则**放弃本次生成**——绝不扩容。
- **重置**：`scenes.revision` 变化时 `killAll`。挂在既有的 `resetVisuals(state)` 里（`src/render/scene-visuals.ts`），不要新开一个重置路径。

### 3.4 生成速率控制（帧率无关）

```ts
pool.emitAccum += rate * dt;          // rate 单位：个/秒
while (pool.emitAccum >= 1) { spawnOne(pool); pool.emitAccum -= 1; }
```

`emitAccum` 必须**跨帧保留**——每帧清零会让生成数被帧率量化。

起始速率：吸引 **90/s**、排斥 **120/s**（medium 档）。high 档 ×2，low 档 ×0.5，off 档 0。

---

## 4. 实现案例一：蓝球吸引粒子（Deprecated / Rejected Experiment）

### 表现目标

粒子从场的外围各处出现，**向中心汇聚**，越靠近越慢、越亮、越密，最终消失在节点上。

### 生成

```ts
// 从场的外围环带生成，不是在节点上生成
const R = player.field.radius;
const angle = rnd() * Math.PI * 2;
const radial = R * (0.45 + 0.47 * rnd());          // 0.45R – 0.92R
p.x = player.position.x + Math.cos(angle) * radial;
p.y = player.position.y + Math.sin(angle) * radial;
// 初速度：小的切向分量 + 轻微向内，绝不纯径向、绝不逐粒子相同
const tangent = angle + Math.PI / 2;
const tangSpeed = 18 + 26 * rnd();                  // 世界单位/秒
const inSpeed   = 10 + 20 * rnd();
p.vx = Math.cos(tangent) * tangSpeed - Math.cos(angle) * inSpeed;
p.vy = Math.sin(tangent) * tangSpeed - Math.sin(angle) * inSpeed;
```

> **不要**在节点位置生成然后"吸进去"——那看起来像喷泉倒放，不像场。
> **不要**所有粒子同速同轨迹——那会变成一组同心圆动画，正是要避免的"硬编码圆圈"。

### 更新

```ts
const a = sampleNetAcceleration(game, p.x, p.y);     // 真实合力，含极性
const mag = Math.hypot(a.x, a.y);
if (mag < 1e-6) { /* 场外或场心：见下方陷阱 */ driftOutward(p, dt); continue; }
const dx = a.x / mag, dy = a.y / mag;                // 单位方向（吸引时指向节点）

// 目标速度：越靠近越慢，形成"汇聚后减速"的观感
const t = p.age / p.life;
const speedTarget = (140 - 60 * t) * speedScale;

// 帧率无关的趋近（不是 v *= 0.98）
const k = 1 - Math.exp(-4.0 * dt);
p.vx += (dx * speedTarget - p.vx) * k;
p.vy += (dy * speedTarget - p.vy) * k;

// 艺术化扰动：切向摆动，相位由 jitter 固定
const wob = Math.sin(p.jitter * 6.283 + t * 7.0) * 12 * (1 - t);
p.vx += -dy * wob * dt;
p.vy +=  dx * wob * dt;

p.x += p.vx * dt;
p.y += p.vy * dt;

// 被吸收：寿命提前结束
if (Math.hypot(p.x - player.position.x, p.y - player.position.y) < player.radius * 0.9) kill(p);
```

> ### ⚠️ 上面这份样例代码有两个已实测的 bug（2026-10-16 补记）
>
> THE LAST ARK 按本节实现了一版蓝球/金球粒子，然后**被玩家整个否掉**。否掉的第一原因是"**这种东西不能在开始之后持续一直地朝着中心动**"——即下面第 3 条的判据问题，**它是设计层面的，改代码救不回来**。但在删之前，实测还抓出样例代码本身的两个实现 bug。**照抄本节会同时踩中两个**，下述修法仅为实验查错记录，**不恢复该方案**：
>
> **bug 1 —— 切向取自力向量，导致吸引场与排斥场手性相反。** `const dx = a.x/mag, dy = a.y/mag` 是**加速度**方向；`-dy, dx` 是把它转 90°。而场的极性是 `field.polarity` 乘进 `magnitude` 的（`fields.ts:5-12`），所以吸引者处的 `a` 指向内、排斥者处指向外，**同一个旋转得到相反的手性**。实测结果：**吸引场只有 8.9% 的粒子与自己的流向一致**——91% 的云在逆流，唯一同向的是"够年轻、还没被掰过来"的那批。
>
> 修法是让切向绕**池自己的节点**转，而不是绕力向量转：`(-ry, rx)/r`，其中 `r` 是粒子到**节点**的偏移。`/r` 之后该项以 `speed·SWIRL_FRACTION` 为上界，粒子贴着节点也不会炸。节点位置每帧重新盖章（节点会被驾驶），写死在构造时会整池滞后于它。修完四个池的手性**精确等于 1.0**。
>
> **bug 2 —— 逐粒子的切向符号/相位会把云的旋转结构平均掉。** `Math.sin(p.jitter * 6.283 + …)` 的相位逐粒子不同，于是半边往左倾、半边往右倾，两组尾迹互相穿插，**整个云没有任何旋转结构**——每颗粒子依然在向内落，画面却读成四散的星芒，而不是"下落"。符号要**逐池固定**（`direction: 1 | -1`）。
>
> 注意这与上面"**绝不逐粒子相同**"那句不矛盾：那句说的是**出生时刻**不能所有粒子同速同轨迹（否则退化成同心圆动画），**不是**说旋转方向要逐粒子掷硬币。
>
> 唯一可能的反对理由"逐池固定会让云像刚体一样整体旋转"是**错的**：角速度 `speed·SWIRL_FRACTION/r` 跟着场自身的衰减走，实测 0.5R 处 0.145 rad/s 对 0.95R 处 0.0056 rad/s，**差 26 倍**——那是差动旋转（对数螺线），正是下落的形状。
>
> **bug 3（不是代码，是判据）** —— 即使上面两条都修对、手性全是 1.0、径向速度 −28.2 也测出来了，玩家仍然否掉了整个效果。原稿曾将其归因为“持续动画本身不携带信息”，这一绝对判断现已修订：允许安静的连续氛围变化，但本实验的持续径向流动不符合玩家目标，仍然弃用。详见 `SKILL.md` §8。

### 绘制

吸引粒子画成**点**（`ctx.rect(p.x - s, p.y - s, 2s, 2s)`，`s` = 世界半径，**永远不用 `arc()`**）。它们汇聚并减速，点是正确的语汇。

---

## 5. 实现案例二：金球排斥粒子（Deprecated / Rejected Experiment）

### 与蓝球的三处刻意差异

**不要单纯把吸引粒子的轨迹倒放。** 排斥的物理与观感都不同：

| | 吸引 | 排斥 |
| --- | --- | --- |
| 生成位置 | 外围环带 `0.45R–0.92R` | 中心区 `0.1r–0.4r` |
| 初速度 | 切向为主 + 轻微向内 | 径向外向 `speedBase * (0.6–1.0)` |
| 加速度方向 | 场已给出，指向内 | 场已给出，指向外 |
| 绘制语汇 | **点**（汇聚、减速） | **短线**（加速、运动模糊） |
| 寿命 | 0.45–0.90 s | 0.60–1.30 s（更长） |

排斥粒子随 `1/(d²+s²)` 迅速减速，所以它**出生时最快**——用"短线段"表现这个瞬间速度是有依据的，不是纯装饰。

### 绘制排斥粒子的短线

```ts
const streak = 0.045;                       // 秒；线段代表这一小段时间走过的距离
const bx = p.x - p.vx * streak, by = p.y - p.vy * streak;
ctx.moveTo(bx, by); ctx.lineTo(p.x, p.y);
```

线段长度**由真实速度决定**，不是固定美术长度——速度越快越糊，这是诚实的运动模糊。

### 波纹（开启瞬间）

在 `player.active` 由 `0 → 1` 的**那一帧**触发一次，不循环：

```ts
// 吸引：向内收缩；排斥：向外传播
pulse.direction = attract ? -1 : +1;
pulse.life = attract ? 0.42 : 0.51;
pulse.peakAlpha = 0.30;
```

```ts
const t = pulse.age / pulse.life;
const radius = attract
  ? R * (0.90 - 0.75 * t)          // 0.90R → 0.15R
  : R * (0.20 + 0.75 * t);         // 0.20R → 0.95R
ctx.globalAlpha = 1;                // alpha 写进颜色常量，不用 globalAlpha
ctx.strokeStyle = attract ? ATTRACT_PULSE : REPEL_PULSE;
ctx.lineWidth = (2.4 - 1.6 * t) / camera.zoom;
ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
```

**同时存活的脉冲上限 4 个。** 规范明确禁止"多个巨大的实心光环长期占据画面"。超限则丢弃最旧的。

---

## 6. 实验中的双场方向来源（Deprecated / Rejected Experiment）

当蓝金同时开启、两个场重叠时：

### 七条硬规定

1. **有只读取样函数就复用。** 用 `sampleNetAcceleration`。
2. **物理层没有取样接口时，先设计只读适配器，而不是重写引力公式。**
3. **粒子轨迹允许艺术化扰动，但不能系统性地表达错误的受力方向。**
4. 蓝金叠加区可以产生复杂的粒子运动和颜色混合。
5. **不要因为两个场颜色混合，就以为实际合力一定增强。** 相加是**矢量和**，在重叠区两场方向相反时合力**可能互相抵消**——这恰恰是玩法核心，视觉必须说真话。
6. **必须区分**"实际作用于物体的加速度"与"仅用于视觉表现的粒子速度"（见 §7 表）。
7. **VFX 绝不允许反向影响物理。**

### 实现方式：粒子不属于颜色，属于区域

关键设计决定：**每个粒子都采样真实合力，而不是只采样"自己那个球"的场。**

- **生成**时按节点归属颜色——蓝球附近生成蓝色粒子，金球附近生成金色粒子（身份清晰）。
- **更新**时一律用 `sampleNetAcceleration(game, p.x, p.y)`——于是蓝粒子飞进金场时会被真实地推开，金粒子飞进蓝场时会被真实地拉住。

这正是规则 3 与规则 5 要求的：在透镜区，粒子跟随的是**真实的合向量**，包括"互相抵消"的情形。

### 颜色混合

叠加区允许出现混合色，但：

> **混合色只表示"这里同时受两个场作用"，绝不表示"力更大"。**

实现上：按局部主导极性选择亮度桶颜色，混合区可以取两组 token 的中间色（在 `palette.ts` 里作为常量写好，不要在绘制路径里插值）。**不要**用混合色的亮度去编码合力大小——那是另一套信息，混在一起会误导。

---

## 7. 实验中的两个量（Deprecated / Rejected Experiment）

| | 真实加速度 | 视觉粒子速度 |
| --- | --- | --- |
| 来源 | `sampleNetAcceleration` | 由前者推导 + 艺术化扰动 |
| 单位 | 世界单位/秒² | 世界单位/秒 |
| 是否乘 `body.response` | 是（表达某物体实际受力时） | **否**（粒子不是物体） |
| 是否受 `MAX_ACCELERATION = 170` 钳制 | 是 | **否** |
| 是否影响模拟 | **它是模拟本身** | **绝不** |
| 可否自由调参 | 否 | 是（但要保持方向诚实） |

把这两者混为一谈，是"视觉看起来对但物理被教错"的根源。

---

## 8. 运动拖尾

### 8.1 玩家节点拖尾

**直接复用既有的 `Trail`**（`src/render/trail.ts`）与 `playerTrailStyle(polarity, spec)`。它在 `updateVisuals` 里已经接好了。不要另写一套。

要点回顾：`spacing = 8 u`、`capacity = min(32, spec.trailPoints)`、`blend: 'source-over'`（**不是 lighter**——否则 P1/P2 交叉处身份色被冲淡）、5 个 alpha 桶 = 5 次 `stroke()`。

### 8.2 飞船拖尾（实现案例三）

既有配置：`shipTrailStyle` → `spacing = 6 u`、`capacity = spec.trailPoints`（medium 64）→ 尾长 384 u，在 240 u/s 上限下约 **1.6 s**。`blend: 'lighter'`。

#### 摄像机跟随的正确性（最容易错的一点）

> **尾迹必须记录世界坐标，绝不能记录屏幕坐标。**

这就是"飞船高速运动时拖尾不能因摄像机追踪产生反向错觉"的完整答案。若把屏幕坐标推进缓冲，摄像机自身的移动会混进尾迹，飞船加速时尾巴会向后甩——看起来像在倒着飞。

`updateVisuals` 已经在 `appendTrailSample(slot.trail, ship.position.x, ship.position.y, style)` 里用世界坐标了。**保持这一点**，不要在渲染时"补偿摄像机"。

补充事实：`camera.ts` 的 `follow()` 让摄像机领先飞船 `limit(velocity * 0.65, 140)`，所以高速时飞船并不在屏幕正中。这是**有意的**，拖尾在世界空间里依然正确，不需要任何补偿。

#### 用速度调制什么

要让尾迹读出速度，调制**宽度和透明度**，**不要调制长度或间距**：

```ts
const speedT = Math.min(1, Math.hypot(ship.velocity.x, ship.velocity.y) / 240);
// 在 drawTrail 的 style 上乘：
width    *= 0.6 + 0.8 * speedT;      // 0.6× → 1.4×
// 颜色桶 alpha 按 speedT 整体缩放：0.5× → 1.0×
```

**为什么不能改 `spacing`**：`spacing` 决定尾迹长度，而长度必须只依赖**走过的距离**。改成随速度变化会让"帧率无关"的断言（`tests/render-trail` 一类）失效，也会让尾巴在不同机器上不一样长。

#### 瞬移保护

`appendTrailSample` 已有：`segment > spacing * 8` 视为瞬移并 `resetTrail`。恢复检查点会瞬移，**保留这个保护**。

---

## 9. 空间形变与 Spacetime Luminance Ripple（正式规范）

这是对原 §9.1 星空位移及 §9.2 静态明暗盘的定向升级。下述参数是**待试玩调优的起始值**；公式与伪代码是规范，不代表当前分支已实现。不改变 `render`、`updateVisuals`、相机或物理接口；新状态仅放入渲染侧 `VisualState`，通过已有更新 / 重置入口接入。

**统一数据约定**：每个视觉更新步只产生一份二维扰动帧数据：只读场快照、定容事件池、同一 `visualTime`、固定 seed 与共享空间尺度。星点位移和局部明暗都调用 §10.2 的同一采样器，读取该帧数据的 `dxCss/dyCss/luminance`；不得分别创建事件、推进时钟、生成随机相位或另写一套波形。星点可逐点采样、明暗可稀疏采样重建，二者是同一扰动的不同输出通道。

基础形变来自当前真实场的只读采样；短暂事件只由技能开启、节点快速运动或场强变化触发。静止且场强稳定时不重复发波，只保留静态形变和可选的缓慢、低幅度质感变化（§9.2），不能持续播放显眼循环波纹。

**物理开关独立**：真实力场严格沿用现有即时开启 / 关闭逻辑。§9.1 的快照淡出、关闭余效与 §9.3 的事件冷却都只约束视觉副本，不得延迟、插值或重写 `player.active` / `Field`、真实力的采样及物理时间步。

### 9.1 星空位移：真实强弱、先合成、后限幅

所有采样都基于**未变形**星点，不将上一帧输出反馈为下一帧输入，也不逐场改写采样位置。

取样源清单与既有 `collectFields` / §2 合力适配器的约定保持一致，不因节点身份色遗漏叠加源，不把真实天体位置改为视觉快照位置；玩家开启 / 关闭的余效仅在渲染副本中存在。若当前分支缺少这些接口，按 SKILL.md §4 核对后适配，不改变源收集的玩法语义。

记世界点为 `x`，源位置为 `p_i`，半径为 `R_i`，极性 `s_i=+1` 为蓝色吸引、`-1` 为金色排斥。只读调用 §2 的真实场采样器得到 `a_i(x)`；不要在渲染层复制逆平方律。

```text
r_i = |x-p_i|
W_i(x) = max(0, 1-(r_i/R_i)^2)^2           // 紧支撑，边界值和一阶导数都为零
A(x) = Σ a_i(x)                          // 原始场矢量和，不先逐源归一化 / 限幅
Phi(v; v0) = v / sqrt(v0^2 + |v|^2)      // 各向同性压缩，零点无需归一化
C(x) = Π [1-W_i(x)*(1-r_i/sqrt(r_i^2+core_i^2))]
D_base_css(x) = baseDisplacePx * C(x) * Phi(A(x); accelerationRef)
```

- 同一 `accelerationRef > 0` 用于所有源；**不能**每个场除以自己的最大场强，不能先把每个非零场单位化，否则弱场会与强场等权。真实接口已包含距离衰减、软化、范围 taper 与单源加速度上限；不要重复套一份距离衰减到 `a_i`。
- 在合成后才用 `Phi`，蓝球附近星点向内，金球向外；等大反向场相消，改变遍历顺序只允许浮点舍入差。不要按源分别钳位再累加。
- `C` 是**共同的视觉中心软化因子**，不改合向量方向：真实采样器在 `r≈0` 有零点特判，邻近方向却可能骤转；该因子让视觉中心连续趋零。`core_i=max(0.04R_i, 1 world unit)` 起步，最终合成再限幅。不要逐源软化后声称方向仍精确等于真实合力。
- `R_i<=0` 或无效数据跳过并记调试计数；对正常已激活场，实际边界仍是 `field.radius`。`C` 只防视觉中心奇点，不引入真实软化参数。
- 最终位移含 §9.3 的事件扰动，并作一次连续软限幅：`D=D_raw/sqrt(1+|D_raw|²/maxStarDisplacementPx²)`；长度严格小于配置上限，近零斜率为 1，不按 x/y 分别截断。上限为 0 时直接关闭位移，避免除零。
- 不移动 `Body.position`、节点、轨迹、碰撞轮廓或预测终点。它是背景透镜近似，不是物体受力积分。

**关闭与强度突变**：`VisualState` 保存只读复制的场快照（id、位置、Field 值）与可见权重。物理场关闭后快照不立刻删除，权重目标变 0；重开复用同 id 状态，目标变 1。采用 `w += (target-w)*(1-exp(-dt/tau))`，强度、范围等渲染副本也平滑趋近新值。极性翻转用旧 / 新快照交叉淡变，不在某帧突然改符号。权重在采样后乘入 `a_i`；用于 `C` 的 `W_i` 同乘该权重，消退源不留下中心孔。**过渡期间的中心保护**：当 `0<w_i<1`，该源的原始采样额外乘 `r_i/sqrt(r_i²+((1-w_i)*core_i)²)` 再乘权重；`w_i=1` 时此额外因子定义为 1，`w_i=0` 时跳过。这样权重渐变时也不会把真实场的中心特判变成星点跳跃；这一过渡修饰不保证即时合力方向，稳态公式仍是先求真实矢量和再作共同软化。权重低于阈值时继续到残差小于 0.01 CSS px / 0.0001 alpha 才回收。**这是视觉余效，不能宣称消退期间等于即时物理合力**；调试合力箭头始终采样实时 GameState。场稳定后才要求基础形变与真实合力同向。

**相机、视差与 DPR**：

```ts
// 概念步骤；热路径使用复用的 Vec2 / Into 适配，不为每颗星创建对象。
const s0 = unwarpedStarScreenPosition; // 已按既有 tile / 视差层计算，CSS px
const x = screenToWorld(camera, s0);   // 同一帧相机，得到视觉取样平面上的世界点
sampleDisturbanceInto(sample, x, vfx); // vfx 只读引用本帧场快照、事件与 visualTime
const sx = s0.x + sample.dxCss;
const sy = s0.y + sample.dyCss;
// 在既有亮度桶路径内 ctx.rect(sx, sy, layer.size, layer.size)
```

节点和事件中心都经 `worldToScreen(camera,p)` 投影，`reachCss=R*camera.zoom`；也可如上统一在世界平面采样。**不要**把有视差星点的原始 tile 坐标直接当物理世界点，或对节点位置乘星层视差。不同深度层仅可乘固定 `layerWarpWeight∈[0,1]`，不能改变采样方向。

星点本底仍由固定 seed、tile 索引和当前相机推导；不可存储累计屏幕偏移、逐帧重新随机或在屏幕坐标上做时间平滑。只平滑渲染参数与事件强度。在最终 DPR 变换只应用一次的 CSS 坐标阶段绘制；世界变换中画明暗印章时，位移 CSS px 必须除以 `zoom` 才能当世界长度。不要再次乘 DPR。位移上限额外取 `min(configMax,0.08*referenceRadius*camera.zoom)`，`referenceRadius` 在场景建立时取固定的玩家场参考半径；不按星点是否进入某个场切换“最近范围”，避免叠加区限幅跳变。随极小 zoom 连续减弱，不假设 zoom≥0.3。此值仅在绘制阶段由当前相机派生，不用于事件触发。

视口剔除 / tile 枚举增加 `maxStarDisplacementPx + starSize` 的 CSS padding；保留既有连续 tile 身份，星点只在未变形坐标上枚举一次，避免跨 tile 边界重复或突现。

### 9.2 明暗褶皱：替代静态径向暗盘 / 亮盘

定义确定性、空间连续、低频的 `N(x,t)∈[-1,1]`，例如两三个不同方向的正弦 / 余弦的加权和（总权重≤1），相位由 `seededRandom(hash(id))` 预生成。空间频率约 `1/spatialScale`，静态基底的 `N(x,0)` 固定；不逐帧重随机、不画闭合等高线。

```text
m_i(x) = 1 + irregularity*N_i((x-p_i)/spatialScale, 0)
B_static(x) = C(x) * Σ [-s_i * beta_i * |a_i(x)|/sqrt(accelerationRef²+|a_i(x)|²)
                  * W_i(x) * m_i(x)]
```

这里的 `C` 也使明暗在源中心连续；`a_i` 包含可见权重；`beta_blue≈0.07`、`beta_gold≈0.035` 为起点。蓝色以压暗为主，金色以微亮为主；相反极性先在标量层合成，不能把两种彩色加法光晕各自画满后再“混色”。标量表示空间质感，**不是合力大小或方向**，抵消检验以 §9.1 的向量为准。

静止且稳定时，允许 `H_idle=idleAmplitude*visibleWeight*W*N_slow(x,t)`：用两种不成简单整数比的慢频率（约 23 s 与 37 s）及固定空间相位，明暗峰值约 0.002，星点幅度≤0.15 CSS px。不能把整个范围半径按正弦反复缩放；若能明显看出循环，降低幅度或关闭 idle。该项也同时进入 §9.3 的向量与明暗通道。

### 9.3 统一传播扰动：同一个 H 驱动两种输出

每次事件创建一个定容记录 `j`：源 id、**触发时的世界原点** `o_j`、移动方向 `u_j`、极性 `s_j`、幅度 `b_j`、范围 `R_j`、年龄 `t_j` 与固定 seed。事件发出后不把原点绑在移动节点上，否则已传播波会跟着节点滑动。蓝 / 金都可向外传递“状态变化的消息”；蓝色的主收缩感来自基础向内位移，不能误把传播速度设为负。

```text
r = |x-o_j|;   rSoft = sqrt(r²+core_j²)-core_j
q = (rSoft - propagationSpeed*t_j)/spatialScale + 0.18*N_j(x,0)
G(q) = (1-q²)*exp(-q²/2)                 // 宽的明暗褶皱，而非细圆环
S(z) = z²*(3-2z), z∈[0,1]
T(t) = S(clamp(t/attackSeconds,0,1))*exp(-t/decaySeconds)
       * [1-S(clamp((t-(life-tailSeconds))/tailSeconds,0,1))]
W_j(x) = max(0, 1-(r/R_j)²)^2
H_j(x,t) = b_j*T(t)*W_j(x)*(1+irregularity*N_j(x,0))*G(q)
e_j = (x-o_j)/sqrt(r²+core_j²)
D_event_css(x,t) = rippleDisplacePx * Σ H_j * (-s_j*e_j + dragGain*u_j)
B_event(x,t) = rippleLuminanceAmplitude * Σ (-s_j*H_j)
D_raw = D_base_css + D_event_css + D_idle_css
B_raw = B_static + B_event + B_idle
B(x,t) = brightnessCap*tanh(B_raw/brightnessCap)
```

`brightnessCap` 按正负分别选 `maxLightenAlpha` / `maxDarkenAlpha`，二者为 0 时对应通道输出 0。`D_idle_css`、`B_idle` 使用同一 `H_idle` 和上述软方向，而非各自独立的时钟。一个位置调用一次采样器可同时得到 `dxCss,dyCss,luminance`；星点和明暗控制点在同一 visualTime 采样同一组记录。`G` 的符号变化允许极轻的亮 / 暗肩部，不能用白线勾出波峰。

`spatialScale≈0.25R` 的宽波包、固定低频不规则形状和缓慢时间包络共同消掉明显的同心圆边界。半径 `R_j` 默认取事件时 `field.radius`；可选最多 `1.15R` 的余波范围，**仅视觉**，不改物理截断。`life=4*decaySeconds`，最后 `tailSeconds=0.25*decaySeconds` 用平滑窗精确归零后回收；只靠指数到期硬删除会跳变。

**触发规则**（只读 GameState / 既有输入结果，不接管输入）：

- `active: false→true`：触发一次；持续按住不重播。
- 场强、半径、软化、上限或极性变化：比较渲染副本在 `0.25R / 0.5R / 0.75R` 的真实采样幅值（不要在 `R` 上采样，那里恒为零）；取上述三个探针相对上次已消费基准的最大加速度差，除以公共 `accelerationRef` 得到无量纲 `fieldDelta`；起步阈值 `fieldDeltaOn=0.08`，回落到 `fieldDeltaOff=0.04` 以下才重新武装。触发后消费当前基准，避免同一次跳变每帧重复发波。极性单独检测，避免等幅翻转漏报；也受同一冷却与并发上限约束。
- 移动：用节点**世界位移 / dt**（若已有可靠世界速度可复用），低通后计算速度超过阈值的部分。`motionEnergy += max(0,speed-speedThreshold)*dt/motionDistance`；达到 `>=1` 且冷却结束时消耗并触发一次，能量累积设上限 1，不补发排队事件。速度高、变化大时幅度增加并钳至 `maxEventAmplitude`。慢移动可微调稳定褶皱的剪切朝向，不连续发波。
- 幅度示例 `b=clamp(kOn*activation + kField*fieldDelta + kMove*speedExcess,0,maxEventAmplitude)`；各项均先归一化。停下后不立即清事件，按 `T` 自然衰减。
- 关闭：基础形变 / 明暗权重平滑趋零；可发一次较弱的恢复事件（约开启幅度的 0.25），默认禁用强反向闪光。淡出快照不能发移动事件。
- 所有触发类型共用每源冷却约 0.18 s，全局最多 4 个事件；每个更新步每源最多接纳一次，持续按键或逐帧运动不绕过阈值 / 冷却。槽满时丢弃本次事件，**不硬删仍可见旧事件**；不扩容、不重置旧事件年龄，丢弃事件也消费基准 / 运动能量并应用冷却，不排队补发。每个事件生命周期沿用 `life=4*decaySeconds`（默认 3.4 s），到期平滑归零再回收。瞬移 / checkpoint 与 `scenes.revision` 走既有重置，不将跨场景位移当速度。

这些是**艺术化传播扰动，不是真正的广义相对论引力波**；不引入真实力的传播延迟、额外加速度或新物理时间步。

### 9.4 Canvas 2D 的具体映射（无需整屏像素变形）

1. 保留星空亮度桶批绘，在每颗星 `rect` 前用 §9.1 算输出位置。只改绘制坐标，保留星点本底缓存。
2. 在背景 ROI 上布置**世界坐标锚定的稀疏控制网格**，覆盖场 / 余波的有界包络。每个控制点采样上述 `B`，取绝对值为 `globalAlpha`，负值用近黑 `WARP_DARKEN`、正值用低饱和 `WARP_LIGHTEN`，均 `source-over`。使用近乎中性的明暗，不用大块纯蓝 / 金填充。
3. 控制点绘制缓存的柔和印章。推荐可分离平滑核 `K(u,v)=h(u)h(v)`，`h(u)=1-S(|u|)`（`|u|<1`，否则 0）；相邻网格间距等于核半宽。无限网格的核权重和为 1，背景外圈零样本补边，因此低对比度纹理连续且不堆亮。可在首次绘制时将核烘成很小的固定 sprite（如 64×64，明 / 暗各一张）；不是每帧全屏像素处理。缓存只在绘制阶段懒建，模块 import 不访问 DOM。
4. 每点只画合成后的一个符号通道。先对所有场 / 事件求和、限幅，再绘制；`ΣK=1` 且每点 alpha≤统一上限，避免场越多越亮。`source-over` 只是亮度近似，不是 HDR 光学求解；正负值先合成，重叠处不要额外 `lighter`。缓存色用不透明固定 token，实际 alpha = 核 alpha × `globalAlpha`，不要把 8 位 token 的低 alpha 再乘一次当成上限。
5. 原有缓存径向渐变可继续用于节点光晕或极弱基底，但**不能**用 2–3 个缩放渐变盘冒充褶皱。若选择多个径向软印章替代网格核，需限制总 alpha 权重，并实测没有圆盘 / 扫描环；它只是较粗的美术近似，不能声称满足核的分区求和性质。
6. 绘制顺序为背景底 / 星云 → 已形变星点 → 明暗褶皱背景层 → 预测线 / 尾迹 / 天体 / 节点 / 飞船 → HUD；沿用既有屏幕 / 世界变换，局部 save/restore，不重写渲染架构。若当前星云在世界 pass 内，背景明暗也放在该 pass 的最后、预测线之前，不再重复覆盖一层。

网格间距起步约 `0.5R`，不规则细节波长不少于两倍间距。为免稀疏采样漏掉波包，取 `effectiveSpatialScale=max(configuredSpatialScale,2*gridSpacing)`，**两通道共同使用该尺度**；调整网格时在视觉状态中平滑该尺度，不能只把明暗变粗而让星点播放另一种波；最多 medium 64 / high 96 个可见控制点（两节点为主的目标预算）。按未变形 ROI 及印章半宽做剔除。容量不足时先降低空间频率、用更粗网格，不随机跳过点；网格原点与 seed 固定在世界上，不随相机平移重置。变更网格间距需迟滞与短暂交叉淡变，**两套网格合计仍不得超预算**，不能在缩放时瞬时换格。

每帧只更新控制点 alpha / 少量渲染参数。若预算仍不足，先关 idle，再减控制点密度 / 幅度或禁用明暗传播，保留基础星光形变。Canvas 2D 不能廉价扭曲整张星云 / 背景图；本方案用星点偏移和低频明暗重建产生相近空间感，不承诺真实透镜成像、逐像素折射或全背景位移。禁止实时 `getImageData/putImageData` 全屏循环、`ctx.filter`、昂贵模糊或以 WebGL Shader / Three.js 为前提。

### 9.5 独立开关与参数（仅渲染侧，起始值待测）

保留 `QualitySpec.warp` 总门控，新增项是视觉配置 / spec 的可选字段建议，不改变任何物理接口。缺失项按对应档位默认值；`fx=off` 无条件优先，不创建新缓存、不采样、不提交新绘制。

| 参数 | 起始值 / 单位 | 用途 |
| --- | --- | --- |
| `starWarp` | medium/high true | 星点通道总开关，含基底 / 事件 / idle；与明暗独立 |
| `luminanceRipple` | medium/high true | 明暗基底、idle、事件明暗的独立开关；不关星点形变 |
| `interactionRipple` | medium/high true | 共享事件通道；关闭时星点与明暗都去掉事件项 |
| `idleRipple` | false（试玩后可开） | 极低幅度稳态起伏，独立禁用 |
| `baseDisplacePx` | 14 CSS px | 静态形变系数；蓝 / 金差别首先来自真实强度 |
| `maxStarDisplacementPx` | 24 CSS px | 含事件的最终总位移上限 |
| `accelerationRef` | 60 world units/s² | 公共强度映射参考值，非物理上限 |
| `rippleDisplacePx` | 2 CSS px | 共享事件的星点幅度 |
| `rippleLuminanceAmplitude` | 0.025 alpha | 明暗事件波幅 |
| `maxDarkenAlpha / maxLightenAlpha` | 0.10 / 0.06 | 多场合成后的明暗上限 |
| `propagationSpeed` | 0.8R/s，事件创建时换算世界速度 | 波峰传播速度，不改真实场 |
| `decaySeconds / attackSeconds` | 0.85 / 0.09 s | 平滑衰减 / 起始建立 |
| `spatialScale` | 0.25R world units | 宽波包 / 不规则形状尺度；受网格 Nyquist 限制，必要时增大 |
| `irregularity / dragGain` | 0.18 / 0.15 | 非规则度 / 运动方向剪切 |
| `fieldSmoothSeconds / releaseSeconds` | 0.12 / 0.35 s | 建立与关闭恢复 |
| `speedThreshold / motionDistance` | 60 world units/s / 0.2R world units | 运动事件门槛 / 累积距离 |
| `fieldDeltaOn / fieldDeltaOff` | 0.08 / 0.04（无量纲） | 场变化触发 / 重新武装阈值，见 §9.3 |
| `eventCooldown / maxEvents` | 0.18 s / 4 | 限频 / 定容池 |
| `maxEventAmplitude` | 1（无量纲） | 单事件幅度钳制 |
| `maxLuminanceSamples` | medium 64 / high 96 | 网格 / drawImage 上限，交叉淡变含在内 |

建议 `?dev=1` 下提供 `vfxLuminance=0/1`、`vfxInteraction=0/1`、`vfxIdle=0/1`、`vfxStarWarp=0/1` 的独立调试覆盖；**这些是拟议调试项，当前未实现**。解析留在视觉配置层，质量总开关仍在生产可用的 `parseQuality` 路径；不改关卡配置。调试关闭明暗后，星点仍应播放共享事件；关闭 interaction 后两通道都只剩基底。所有数值先验有限性与合法范围，零幅度 / 零容量为安全旁路。

---

## 10. Canvas 2D 更新与绘制伪代码

### 10.1 正式更新循环（渲染侧，保持原入口）

以下 helper 均为概念名，接入时复用真实接口；不是向项目添加的已实现 API。读取物理状态，无 `Camera` 参数，摄像机不产生交互事件。

```ts
function updateSpacetime(vfx, game, revision, frameSeconds) {
  if (revision !== vfx.revision) {
    resetSpacetime(vfx); // 挂在既有 resetVisuals，不改场景控制器
    vfx.revision = revision;
    seedPreviousSourceSnapshots(vfx, game); // 首帧不把位置差当高速运动
  }
  if (!vfx.spec.warp || vfx.quality === 'off') return;
  if (!game || game.phase !== 'running') return; // pause / ready / ended 冻结
  const dt = clamp(frameSeconds, 0, 0.1); // 沿用视觉时钟，非新的物理步长
  if (dt === 0) return;
  vfx.time += dt;

  forEachSourceSlot(vfx, game, (slot, source) => {
    // 读取 active、世界位置与 Field；没有 source 的旧 slot 仍需 release。
    const event = compareWithPrevious(slot, source, dt);
    smoothVisualCopies(slot, source, dt); // exp smoothing；关闭保留残余快照
    if (vfx.spec.interactionRipple && event.aboveThreshold && slot.cooldown <= 0) {
      tryEmitIntoFreeSlot(vfx.events, event); // 定容；满则丢本次，不覆盖旧波
      slot.cooldown = vfx.config.eventCooldown;
    }
    slot.cooldown = Math.max(0, slot.cooldown - dt);
    copyPreviousInto(slot, source); // 即使关闭事件通道也更新，恢复时不积压
  });
  // 先处理新事件，再统一推进；每种帧率只允许阈值越界≤一个视觉步的时间误差。
  forEachLiveEvent(vfx.events, e => {
    e.age += dt;
    if (e.age >= e.life) e.alive = false; // T 在 life 处已经连续归零
  });
  retireInvisibleSourceSlots(vfx); // 只回收低于可见残差阈值的消退源
}
```

`forEach...` 仅为可读伪代码；实际热循环用固定数组 / 索引，不逐帧分配闭包、对象或数组。事件关闭时可让既有事件自然过期但不采样；`resetVisuals` 清池、相位、源快照、前值和 motionEnergy；缓存资源按既有生命周期清理。`ready` 无事件，首次进入 running 时只按真实激活沿发波。暂停冻结时间与输出，结束后不增长。

### 10.2 一次采样，同时得到位移和明暗

```ts
function sampleDisturbanceInto(out, x, vfx) {
  // 全部 scratch / 输出复用；先取真实场向量和，后映射，不在星点之间积分。
  sampleVisualFieldSumInto(base, x, vfx.sourceSlots); // §9.1；复用真实场采样
  let dx = base.dxCss, dy = base.dyCss, b = base.luminance;
  forEachLiveEvent(vfx.events, e => {
    if (!vfx.spec.interactionRipple) return;
    const h = sampleSharedPacket(e, x); // §9.3 的 H，星点和网格都调用同一公式
    samplePacketDirectionInto(directionScratch, e, x); // -s*e_j + dragGain*u_j
    dx += h * directionScratch.x * vfx.config.rippleDisplacePx;
    dy += h * directionScratch.y * vfx.config.rippleDisplacePx;
    b += -e.polarity * h * vfx.config.rippleLuminanceAmplitude;
    // directionScratch 是局部采样结果；不修改 event 的世界原点或方向。
  });
  addSharedIdleIntoIfEnabled(outScratch, x, vfx); // 关闭时必须覆盖输出为零
  dx += outScratch.dxCss; dy += outScratch.dyCss; b += outScratch.luminance;
  softLimitDisplacementInto(out, dx, dy, effectiveMaxPx(vfx));
  if (!vfx.spec.starWarp) { out.dxCss = 0; out.dyCss = 0; }
  out.luminance = vfx.spec.luminanceRipple ? signedSoftCap(b, vfx.config) : 0;
}
```

局部传播方向在每个采样点计算，不能在 event 上存一个固定径向量；若 `starWarp` 关闭，整个星点位移通道输出零，明暗可独立保留；`interactionRipple` 决定两通道是否含事件项。`warp=false / fx=off` 则整体旁路；调试菜单明确此关系。

### 10.3 绘制流程

```ts
// 屏幕阶段：对未变形星点，反投影 → sampleDisturbanceInto → CSS 偏移 → 原亮度桶 rect。
// 背景世界阶段：对固定网格控制点，调用同一采样器，只消费 luminance。
ctx.save();
ctx.globalCompositeOperation = 'source-over';
forEachVisibleLuminanceCell(vfx, camera, cell => {
  sampleDisturbanceInto(sample, cell.worldPosition, vfx);
  if (Math.abs(sample.luminance) < 0.0001) return;
  ctx.globalAlpha = Math.abs(sample.luminance);
  const stamp = sample.luminance < 0 ? cache.darkKernel : cache.lightKernel;
  ctx.drawImage(stamp, cell.x - cell.halfWidth, cell.y - cell.halfWidth,
                2 * cell.halfWidth, 2 * cell.halfWidth);
});
ctx.restore(); // alpha、composite、transform 不泄漏给实体 / HUD
```

控制点位于世界变换内，尺寸也是世界单位；不要又用 `worldToScreen` 转一次。静态、idle、event 共用标量 `B`，禁止各自重复绘制整场盘。medium 的额外调用上限由可见网格点数决定，不随历史事件数量无界增长。

### 10.4 原粒子更新与批绘记录（Deprecated / Rejected Experiment）

> 以下原代码仅归档。包含已弃用的常驻粒子与规则环，不可接入正式引力路径；`fieldIntensityAtEdge` 也不是可用强度指标（真实边界场强为零）。通用定容与批量绘制知识仅供天体特效借鉴。

```ts
export function updateFieldVfx(vfx: FieldVfx, game: GameState, visuals: VisualState, camera: Camera, dt: number): void {
  if (game.phase !== 'running') return;          // 与 updateVisuals 的既有门控一致

  // 1) 激活沿检测 → 触发一次脉冲（不是循环动画）
  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    const was = vfx.prevActive[i];
    if (p.active && !was) spawnPulse(vfx, p, /* attract = */ p.field.polarity === 1);
    vfx.prevActive[i] = p.active;
  }

  // 2) 生成
  for (let i = 0; i < game.players.length; i++) {
    const p = game.players[i];
    if (!p.active) continue;
    // 强度：节点边缘处的场强，归一到 [0.35, 1]
    const intensity = fieldIntensityAtEdge(p);
    const pool = p.field.polarity === 1 ? vfx.attract : vfx.repel;
    const rate = (p.field.polarity === 1 ? 90 : 120) * intensity * vfx.spec.particleScale;
    pool.emitAccum += rate * dt;
    while (pool.emitAccum >= 1 && aliveCount(pool) < pool.capacity) {
      spawn(pool, p);
      pool.emitAccum -= 1;
    }
    if (pool.emitAccum > 4) pool.emitAccum = 4;   // 防抖：长时间低帧率后别一次爆一堆
  }

  // 3) 更新 + 回收
  for (const pool of [vfx.attract, vfx.repel]) {
    for (let i = 0; i < pool.live; i++) {
      if (!pool.alive[i]) continue;
      pool.age[i] += dt;
      if (pool.age[i] >= pool.life[i]) { pool.alive[i] = 0; continue; }
      advanceOne(pool, i, game, dt);              // 内部用 sampleNetAcceleration
    }
  }

  // 4) 脉冲推进
  for (let i = vfx.pulses.length - 1; i >= 0; i--) {
    vfx.pulses[i].age += dt;
    if (vfx.pulses[i].age >= vfx.pulses[i].life) vfx.pulses.splice(i, 1);
  }
}
```

### 批量绘制

**这是"粒子多但不掉帧"的关键。** 按亮度桶分组，每桶一次 `fillStyle` + 一次 `fill()`：

```ts
export function drawParticles(ctx: CanvasRenderingContext2D, pool: ParticlePool, colors: readonly string[]): void {
  if (pool.capacity === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let b = 0; b < colors.length; b++) {
    let began = false;
    ctx.fillStyle = colors[b];
    for (let i = 0; i < pool.live; i++) {
      if (!pool.alive[i] || pool.bucket[i] !== b) continue;
      if (!began) { ctx.beginPath(); began = true; }
      const s = pool.size[i];
      ctx.rect(pool.x[i] - s, pool.y[i] - s, s * 2, s * 2);   // 永远用 rect，不用 arc
    }
    if (began) ctx.fill();
  }
  ctx.restore();
}
```

代价：**4 个桶 = 4 次填充，与粒子数无关。** 这是本仓库 `starfield.ts`（9 次 fill）与 `trail.ts`（5 次 stroke）已经在用的同一招。

---

## 11. Debug 模式的受力可视化

仅在 `?dev=1` 且为 DEV 构建时开启（`src/debug/config.ts` 已有这个门控）。**对模拟仍然是只读的。**

包含：

1. **三圈等高线 + 边界环** —— 既有 `drawFields`（`field-visuals.ts`），按 `RING_FRACTIONS` 绘制。边界环必须精确落在 `field.radius` 上。
2. **合力箭头** —— 既有 `drawNetForceArrow`，屏幕空间，长度映射 16–64 px。
3. **逐天体加速度矢量** —— 对每个 `affectedByFields` 的 body，从其位置画一条线，长度 ∝ `|a| * body.response`（**这里要乘 response、要做上限钳制**，因为它表达的是那个物体真实受力），颜色用 `NET_FORCE`。
4. **空间扰动读数** —— 可见源 / 消退源数、事件数、最大星点位移、明暗正负峰值、网格点数、事件触发原因；显示 §9.5 的独立开关。不将这些标量称为真实力。
5. **数值读数** —— 复用 `src/debug/telemetry.ts` 的既有面板，不要新建面板。

Debug 叠层画在**所有正式画面之上**，可以牺牲美观，但不得改变任何模拟状态。

---

## 12. 常见错误与避免方法

> 粒子相关行仅适用于 §3–7 / §10.4 的历史实验与合适的天体粒子；不得据此恢复场粒子。正式场特效优先检查采样坐标、合成后限幅、共享 H、世界网格锚点及关闭余效。

| # | 错误 | 现象 | 正确做法 |
| --- | --- | --- | --- |
| 1 | 在渲染层重写引力公式 | 视觉与物理慢慢发散，玩家被教错 | 一律走 `fieldAccelerationInto` / `sampleNetAcceleration` |
| 2 | 每粒子每帧调分配版 `fieldAcceleration` | 每秒数万个 `Vec2` 垃圾，GC 抖动 | 用 `...Into` + 模块级 scratch |
| 3 | 对 `{x:0,y:0}` 直接归一化 | `NaN` 传染，整批粒子瞬移或消失 | 先判 `mag < 1e-6` 再决定漂移/回收 |
| 4 | 用 `v *= 0.98` 做阻尼 | 144 Hz 下粒子衰减明显更快 | `1 - Math.exp(-k * dt)` |
| 5 | 粒子存屏幕坐标 | 摄像机移动时粒子被拖走、拖尾反向 | 世界空间效果一律存世界坐标 |
| 6 | 逐粒子 `beginPath()+arc()+fill()` | 500 粒子 = 1500 次调用，掉帧 | 按亮度桶批处理，用 `rect` |
| 7 | 每帧 `createRadialGradient` | 每帧重新分配渐变对象 | 缓存（见 `celestial.ts` 的 `gradient()`） |
| 8 | `shadowBlur` 做辉光 | 掉帧 + 霓虹感 | 只用径向渐变与加法混合 |
| 9 | 粒子在场外仍被吸引 | 与"`field.radius` 外为零"的物理矛盾 | 粒子继承硬截断：`mag < 1e-6` 时就放弃 |
| 10 | 用 `Math.random()` | 不可复现，测试无法断言，画面每帧变 | 用 `seededRandom`（`src/world/sectors.ts`），字符串 id 先过 FNV-1a |
| 11 | 把启动波纹写成循环动画 | 违反"不要不停重播启动动画" | 只在 `0 → 1` 那一帧触发一次 |
| 12 | 双场叠加时只采样"自己那个场" | 透镜区方向错误，正好违反 §6 规则 3 | 一律采样真实合力 |
| 13 | 用粒子颜色亮度暗示合力大小 | 混合色被误读成"力更大" | 颜色只表示身份/在场，强弱用密度和亮度桶 |
| 14 | 粒子数量写死 | `fx=off` 不再逐像素一致 | 一律走 `QualitySpec` |

---

## 13. 完成前的自检

正式引力路径：

- [ ] 基础星光形变按真实矢量和映射，中心 / 边界连续，最终总位移有上限。
- [ ] 星点与明暗共享同一事件 seed、原点、时间及包络；没有独立循环圆环。
- [ ] 开关、快速移动、场强变化及关闭都按 §9 平滑过渡；静态帧不积累漂移。
- [ ] 明暗先合成再限幅，重叠不持续增亮，缓存与事件数均有界。
- [ ] 相机平移 / 缩放 / tile 跨界与 DPR=1/2 无突现；所有实际实体位置不变。
- [ ] 完成 `performance-and-qa.md` §5.1 / §7.3 的自动与试玩验收，未测项明确列出。

以下原粒子自检保留为 **Deprecated / Rejected Experiment**，不是正式交付条件：

- [ ] 渲染层里没有第二份引力公式。
- [ ] 粒子更新循环里没有对象分配（无 `{x,y}` 字面量、无 `.filter`、无展开）。
- [ ] `fx=off` 的粒子数为 0，画面与改动前逐像素一致。
- [ ] 暂停时粒子冻结、`ready` 时为空、结束后不再增长。
- [ ] 双场重叠区的粒子方向与 `?dev=1` 的合力箭头一致。
- [ ] 用 `seededRandom` 后，同一 seed 两次运行画面完全一致。
- [ ] 有测试断言"跑 N 帧 `updateVisuals` 后 `GameState` 未变"。
