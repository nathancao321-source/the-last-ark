# 引力视觉实验

独立入口 `/vfx-demo.html`，通过 `npm run dev` 启动。主游戏入口保持不变。

本目录的初始版本是技术基线：复用 Keyboard、FixedClock、applyPlayerIntent、Camera 和 fieldAcceleration，验证只读 VFX、双场矢量叠加、开启/关闭渐变、有限交互事件池、参数调试和 A/B 门控。

`iteration-1.png` 记录早期外观，作为后续比较，不代表美术验收通过。当前转向用户给定 P1–P5 的电影化二维视觉；阶段 A 背景、阶段 B 节点优先，黑洞和中子星仅规划。

控制：WASD / F、方向键 / Enter；技能按一下切换。Space 暂停，R 重置；全屏后 V 对比、B 记录 10 秒性能、Esc 退出。

参考规范来自仓库 `skill/space-vfx-2d` 分支的 `.agents/skills/space-vfx-2d/SKILL.md`。最新用户要求允许预计算二维纹理及局部节点粒子；物理隔离、确定性和缓存预算继续适用。
