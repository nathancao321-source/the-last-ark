import fs from 'node:fs/promises';
import path from 'node:path';
import {connect} from './endless-qa/browser.mjs';
const folder='docs/endless-v3',read=async name=>JSON.parse(await fs.readFile(path.join(folder,name),'utf8'));
const inputs=await read('input-checks.json'),checks=await read('browser-checks.json'),cases=await read('interaction-cases.json'),flight=await read('flight-v3-20261017.json'),stability=await read('stability.json');
const perf=[];for(const seed of [20261017,7,424242])for(const version of [2,3]){const d=await read(`perf-v${version}-${seed}.json`);perf.push({seed,version,work:d.work,frameInterval:d.frameInterval,bodies:d.maxBodies,loaded:d.maxLoaded,cache:d.maxCache,wall:d.wall,elapsed:d.elapsed,errors:d.errors.length});}
const quantiles=values=>{const a=[...values].sort((a,b)=>a-b);return {count:a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],p99:a[Math.floor(a.length*.99)],max:a.at(-1)};};
const summary={baseline:{files:43,tests:585},current:{files:45,tests:602},perf,flight:{...flight,rawWork:undefined,rawFrames:undefined},native:{...cases.native,times:Object.fromEntries(Object.entries(cases.native.times).map(([k,v])=>[k,quantiles(v)]))},stability:{cases:stability.rows.length,events:stability.rows.reduce((n,r)=>n+r.events,0),budget:stability.rows.reduce((n,r)=>n+r.budget,0)},inputs,checks:checks.native,errors:checks.errors};
await fs.writeFile(path.join(folder,'summary.json'),JSON.stringify(summary,null,2));
const f=n=>Number(n).toFixed(2),table=perf.map(r=>`| ${r.seed} | v${r.version} | ${f(r.work.p50)} | ${f(r.work.p95)} | ${f(r.work.p99)} | ${f(r.work.max)} | ${r.bodies}/${r.loaded}/${r.cache} |`).join('\n');
const md=`# 第一阶段验证记录 · 2026-10-24

基线：43 文件 / 585 项。最终完整检查：45 文件 / **602 项通过**，类型检查、生产构建通过。Node 24.20.0、TypeScript 5.9.3、Vitest 5.0.4、Vite 8.3.4。没有修改主线物理、输入或镜头模块；旧 v1/v2 断言保留在明确版本的 fixture 上。

## 组合与稳定性

[8,192 块分布](distribution.json)包含所有启用家族和 1/2/3/4 行星、2～5 碎石；正负/高位坐标、乱序、起点与四边/对角间距均有测试。没有通过每隔 N 块强放指定家族满足统计。

[33 组稳定性原始记录](stability.json)：代表家族 120 秒，双星与多行星 600 秒。碰撞事件、碰撞预算耗尽、非有限数值均为零；v3 最高速度 71.31，未长期触及 240 限速。v2 行星半径比值 1.000000～1.000175，v3 为 0.996852～1.003565，最终回归阈值为 ±2%。没有由此推断无限期稳定或任意邻星/玩家扰动后仍稳定。

## 浏览器性能

同一台 ${flight.environment.cpu}、Windows ${flight.environment.os}、Edge 155.0.4283.62；视口 1280×800，游戏 Canvas ${flight.environment.width}×${flight.environment.height}，DPR 1，medium 质量。每个短样本从正常起点用同一测试控制器连续运行约 30 秒，含原固定步、预测、UI 与渲染。v2/v3 的实体数量本就不同，因此比较的是实际模式成本，不是相同实体数的渲染微基准。

下表为主线程帧工作耗时（毫秒），不是单纯绘制时间；RAF 间隔与所有帧原始数组另保存在 perf-v*.json。独立 headless 浏览器可运行高于 60 Hz，不能直接把其平均频率当普通显示器体验。

| Seed | 版本 | p50 | p95 | p99 | 最大 | 实体/加载块/热快照峰值 |
|---|---|---:|---:|---:|---:|---|
${table}

三组均无页面异常。60 FPS 是目标；偶发帧峰值仍超过 16.67 ms，不能宣称全程稳定 60 FPS。性能数据不等于浏览器堆内存分析。

## 连续航行

[未剪接录屏](flight-v3-20261017.webm)、[时间接触表](flight-v3-20261017.png)、[逐帧原始记录](flight-v3-20261017.json)。Seed 20261017，从正常 (0,0)、初速 90 出发，游戏内 ${f(flight.elapsed)} 秒，录制及收尾 ${f(flight.wall)} 秒；到 x=${f(flight.position.x)}，横向完整跨越 12 块，沿边界小幅转向共查询 ${flight.keys.length} 个不同坐标。HP 100，加载峰值 ${flight.maxLoaded}、实体 ${flight.maxBodies}、热快照 ${flight.maxCache}。原始 phase=paused 是旧版录制器在结束时主动暂停，运行样本均为 running。最终发现修复只改变发现元数据，不改变此路线的初态或受力。

使用 tools/endless-v3-controller.ts，通过现有目标输入驱动两个节点；没有更改飞船位置、速度或引力。离散仿真另对 Seed 7、424242、20261017 各走完整 12 块，检查每固定步位移≤4、速度变化不超原加速度上限、无非预期暂停、重定位与血量。浏览器记录中的 maxJump 是两个 RAF 之间的距离，慢帧可包含多个固定步，不是单步瞬移。长录像的 loads 数组不是 I/O 延迟依据；使用下方原生事务计时。

## 持久化与实际交互

[浏览器检查](browser-checks.json)、[鼠标/星图/重试](input-checks.json)、[原生回访和交互案例](interaction-cases.json)。真实 IndexedDB 访问 ${cases.native.stats.records} 条冷记录，热缓存曾满 32 后，确实卸载的移动行星从新位置恢复，速度及稳定化状态一致；删除成员没有重生。该 fixture 直接选择测试地点，单独标注，未冒充连续航线。

46 次原生读 / 46 次写，最终记录的 read p50/p95/p99=${f(summary.native.times.read.p50)}/${f(summary.native.times.read.p95)}/${f(summary.native.times.read.p99)} ms，write=${f(summary.native.times.write.p50)}/${f(summary.native.times.write.p95)}/${f(summary.native.times.write.p99)} ms。约 ${cases.native.stats.bytes} 字节编码记录；这些是当前负载的测量，不是填满 64 MiB 或浏览器最低配额的保证。原生事务 abort、缩小预算拒绝、恢复代次与旧写入租期失效均已验证。自动测试另覆盖损坏、保存中断、晚到回复、10 秒超时、世界切换和三焦点预算。

三条独立交互 fixture 的精确初态与节点控制在 tools/endless-v3-cases.mjs 和 case-*.json：

- 双星：Seed 20261017、区块 (-7,-8)，从系统左下外围接近，两场启用，约 4 秒仍安全；其中一星相对关闭技能对照偏移约 0.0069。它仍是微弱节点耦合，没有夸大成快速搬动恒星。
- 流浪行星：同 Seed、区块 (-8,-8)，从左下接近并转向；行星偏移约 0.708，船的速度方向也不同于关闭技能对照。
- 碎石：同 Seed、区块 (-5,-8)，金场部署在碎石下侧，把成员推离下方航道，蓝场带船从外围通过；两个碎石偏移约 54.46/9.41，船未碰撞。允许外围绕过，没有检测两人必须按键的隐藏条件。

双键盘同时移动和 F/Enter、Space、H/J、K/L、R、Shift+R、M，以及实际鼠标追踪、左键技能和右键制动通过。手柄设备入口在未接设备时正常提示，适配器自动测试通过；**没有真人合作或实体手柄验收**。截图是明确的开发初态/真实积分结果，不等同于玩家通关。

## 仍待完善

真人两人体验、长留白节奏、实体手柄、其他机器性能、偶发帧峰值，以及普通玩家的导出/清理界面。磁盘策略和普通恢复路径见 [范围说明](README.md)。大星域、跨块碎石河、异常天体、遗迹和虫洞不在本轮。

![同坐标三 Seed 对照](comparison-seeds.png)

![双星接近](case-binary.png)

![流浪行星](case-rogue.png)

![碎石清障](case-rocks.png)
`;
await fs.writeFile(path.join(folder,'validation.md'),md);
const pictures=[];for(const seed of [20261017,7,424242])for(const version of [2,3])pictures.push({seed,version,data:(await fs.readFile(path.join(folder,`layout-v${version}-${seed}.png`))).toString('base64')});
const c=await connect();try{
 const png=await c.eval(`(async()=>{const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=1320;const ctx=canvas.getContext('2d');ctx.fillStyle='#060910';ctx.fillRect(0,0,1280,1320);let n=0;for(const p of ${JSON.stringify(pictures)}){const im=new Image();im.src='data:image/png;base64,'+p.data;await im.decode();const x=n%2*640,y=Math.floor(n/2)*440;ctx.drawImage(im,x,y+35,640,400);ctx.fillStyle='#fff';ctx.font='18px monospace';ctx.fillText('Seed '+p.seed+' | v'+p.version,x+15,y+25);n++;}return canvas.toDataURL('image/png').split(',')[1];})()`);
 await fs.writeFile(path.join(folder,'comparison-seeds.png'),Buffer.from(png,'base64'));
}finally{c.close();}
console.log(JSON.stringify({perf,native:summary.native,stability:summary.stability}));
