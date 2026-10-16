# 引力场视觉化 · 技术核心

这是本 Skill 最重要的文件。引力场是这款游戏的玩法主体，**如果视觉把它画错了，就是把玩家教错了**。

先记住一条：

> **正式画面里，引力不画成曲线、箭头、网格或磁场线。**
> 引力由 **粒子运动 + 明暗层次 + 局部空间压缩/扩张 + 运动拖尾 + 短暂脉冲** 来表达。
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
   → 粒子也必须继承这个硬边界。在场外还"被吸引"的粒子是在说谎。

3. **`polarity` 已经写进了返回值。** `+1` 吸引、`-1` 排斥，方向自动指向正确的一侧。
   → **粒子不需要知道自己是蓝的还是金的，也能得到正确方向。** 颜色只是身份标签，不是方向来源。

### 已经做好的三圈等高线（现属 debug）

`src/render/field-visuals.ts` 的 `RING_FRACTIONS = [0.87, 0.64, 0.37]` 是从 `taper = (1-(d/R)²)²` 反解出来的（令 `d/R = √(1-√t)`，取剩余强度 t = 6% / 35% / 75%）。疏密不均**是信息，不是随意**——等距环会谎称场强线性衰减。

按 `art-direction.md` §6.2，这三圈环连同合力箭头**降级为 `?dev=1` 的调试叠层**；正式档改由**明暗染 + 星空位移**表达（本文件的粒子那一版做出来又被删了，理由见本文 §4 的警告框与 `SKILL.md` 第 8 节）。**不要删掉它们**，调试时还需要。

---

## 2. 只读接口：唯一允许的取样方式

### 规则

1. **有 `fieldAccelerationInto` 就复用它。** 它已经存在（`src/physics/fields.ts`），是非分配版本，与本仓库 `capabilitiesInto` / `bodyGravityInto` / `queryInto` 同一套约定。
2. **物理层没有取样接口时，写一个只读适配器，不要重写引力公式。**
3. 渲染层**永远不允许**出现第二份 `1/(d²+s²)`。

### 非分配取样

粒子循环里每个粒子每帧都要取样，**绝不能用分配版**——`sub` / `scale`（`src/physics/vector.ts`）每次都返回新 `Vec2`，500 粒子 × 2 源 × 60 帧 = 每秒 6 万个垃圾对象。

```ts
// 模块级 scratch，全流程复用
const sampleScratch = { x: 0, y: 0 };
```

### 合力适配器（从既有代码提取）

`src/render/field-visuals.ts` 的 `drawNetForceArrow` 里已经有**一份正确的合力求和**：先遍历 `active` 的玩家场，再遍历所有 `caps.gravity && strength > 0` 且 `body !== ship` 的天体。这个顺序精确对应 `src/physics/world.ts` 的 `accelerations()`。

把它提取成一个可复用的只读函数，箭头与粒子共用同一份，**保证两者永不打架**：

```ts
// src/render/vfx/field-sampler.ts —— 新增，只读
import { fieldAccelerationInto } from '../../physics/fields';
import { bodyGravityInto, emptyField } from '../../physics/gravity';
import { capabilitiesInto, emptyCapabilities } from '../../game/entities';

const caps = emptyCapabilities();
const gravity = emptyField();
const out = { x: 0, y: 0 };

/** 与 world.ts accelerations() 同序的合力：先激活玩家场，再非自身的引力天体。
 *  返回模块级 out（同一实例），调用方不得持有。 */
export function sampleNetAcceleration(game: GameState, x: number, y: number): Vec2 {
  let ax = 0, ay = 0;
  const target = { x, y };
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

## 3. 粒子系统设计

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

## 4. 实现案例一：蓝球吸引粒子

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
> THE LAST ARK 按本节实现了一版蓝球/金球粒子，然后**被玩家整个否掉**。否掉的第一原因是"**这种东西不能在开始之后持续一直地朝着中心动**"——即下面第 3 条的判据问题，**它是设计层面的，改代码救不回来**。但在删之前，实测还抓出样例代码本身的两个实现 bug。**照抄本节会同时踩中两个**，所以先改代码再谈别的：
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
> **bug 3（不是代码，是判据）** —— 即使上面两条都修对、手性全是 1.0、径向速度 −28.2 也测出来了，玩家仍然否掉了整个效果。理由见 `SKILL.md` 第 8 节与 `performance-and-qa.md`：**持续动画本身不携带信息**。在动手写粒子之前先回答"它在相邻两帧之间携带新信息吗"，答不上来就不要写。

### 绘制

吸引粒子画成**点**（`ctx.rect(p.x - s, p.y - s, 2s, 2s)`，`s` = 世界半径，**永远不用 `arc()`**）。它们汇聚并减速，点是正确的语汇。

---

## 5. 实现案例二：金球排斥粒子

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

## 6. 实现案例四：双场叠加时的方向来源（本节是重点）

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

## 7. 两个必须分开的量

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

## 9. 空间明暗效果

两个机制，都**必须柔和**，不得产生明显的画面扭曲故障。

### 9.1 星空位移（推荐，性价比最高）

背景星点是**屏幕空间**画出来的（`src/render/starfield.ts` 的 `drawStarfield`，每个星一个 `ctx.rect`）。在 `ctx.rect` 之前对每颗星做一次径向位移，就能得到"星点向内压缩 / 向外推开"的印象：

```ts
// 对每个激活的玩家节点求和
let sx = starScreenX, sy = starScreenY;
for (const node of activeNodes) {
  const dx = starScreenX - node.screenX, dy = starScreenY - node.screenY;
  const d = Math.hypot(dx, dy);
  const reach = node.field.radius * camera.zoom;
  if (d >= reach || d < 1e-3) continue;
  const k = (1 - d / reach) ** 2;                       // 边缘平滑，无硬边
  const pull = (node.polarity === 1 ? -1 : 1) * k * MAX_DISPLACE;
  sx += (dx / d) * pull;
  sy += (dy / d) * pull;
}
ctx.rect(sx, sy, layer.size, layer.size);
```

- `MAX_DISPLACE` 起始值：吸引 **14 CSS px**，排斥 **10 CSS px**。
- 两个节点叠加后总量**钳制在 24 px** 以内。
- **只在 `medium` / `high` 档开启**，`low` / `off` 跳过（在 `drawStarfield` 上加一个参数控制）。
- 成本：每星每节点约 8 次浮点运算。500 星 × 2 节点 = 8000 次/帧，可忽略。

> 这**只作用于背景星点**，绝不作用于任何世界实体、碰撞半径或天体位置。

### 9.2 节点下方的明暗盘

一个缓存的径向渐变盘，半径 = `field.radius`：

- **吸引**：`WARP_DARKEN`，峰值 alpha ≤ 0.22，`source-over` 画在粒子**之下**。
- **排斥**：`WARP_LIGHTEN`，峰值 alpha ≤ 0.14，`lighter`。

**必须渐变到 0 alpha**，不能有可见的边缘——有边就变成了"一个圆盘"，正是要避免的观感。渐变同样**必须缓存**（按 `polarity + 量化 radius` 作 key，坐标建在原点，绘制前 `translate`）。

### 9.3 明确不做

**不做屏幕空间扭曲、不做像素级位移、不用 `ctx.filter`。** Canvas 2D 没有便宜的画面扭曲手段；用 `drawImage` 做位移采样会直接吃掉帧预算，且与"克制"取向冲突。上面两条已经足够表达"局部空间被影响"。

---

## 10. Canvas 2D 实现伪代码（完整更新循环）

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
4. **数值读数** —— 复用 `src/debug/telemetry.ts` 的既有面板，不要新建面板。

Debug 叠层画在**所有正式画面之上**，可以牺牲美观，但不得改变任何模拟状态。

---

## 12. 常见错误与避免方法

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

- [ ] 渲染层里没有第二份引力公式。
- [ ] 粒子更新循环里没有对象分配（无 `{x,y}` 字面量、无 `.filter`、无展开）。
- [ ] `fx=off` 的粒子数为 0，画面与改动前逐像素一致。
- [ ] 暂停时粒子冻结、`ready` 时为空、结束后不再增长。
- [ ] 双场重叠区的粒子方向与 `?dev=1` 的合力箭头一致。
- [ ] 用 `seededRandom` 后，同一 seed 两次运行画面完全一致。
- [ ] 有测试断言"跑 N 帧 `updateVisuals` 后 `GameState` 未变"。
