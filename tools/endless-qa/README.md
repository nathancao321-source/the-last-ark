# Endless Mode 浏览器验收脚本

2026-10-23：彩蛋地址与天体ID前缀从版本化生成器读取，不再固定为 `(3,0)` / `(13,-3)`。本轮多Seed布局及40秒连续飞行入口为 `tools/endless-layout-qa.mjs`，证据与兼容策略见 `docs/endless-layout/README.md`。下列阶段报告保留其原始日期与验证范围。

这些脚本复现本次无尽视觉改造的 C / D / E 阶段证据，使用项目现有 Canvas 2D 渲染、真实 stepGame 和世界生成模块。脚本不 commit、不 push，也不会调用旧的主线 baseline 分支。browser.mjs 只提取连接器与显式调用的 setup，导入时不打开浏览器、不截图、不改存档。

## 环境与隔离

- 项目安装依赖后使用 Node.js 22+（开发验收使用 Node 24，依赖内置 fetch / WebSocket）。
- 使用 Vite 开发服务，因为场景脚本通过 /src/*.ts 导入真实模块；这些脚本不支持直接指向 dist 的生产预览服务。
- 默认 ARK_URL=http://127.0.0.1:5175/，ARK_CDP_PORT=9335。两者均可由环境变量覆盖；连接始终指向本机指定 CDP 端口。
- **只连接单独启动的 headless QA 浏览器，绝不使用个人 Edge / Chrome profile。** endless-live-perf.mjs 会把三份测试存档写入测试 profile 的 localStorage，最后留下星云测试存档。
- 连接器使用指定浏览器的第一个 page target；测试期间只保留一个 about:blank / 游戏页面，顺序运行，禁止多个脚本同时使用同一 CDP 端口。
- 所有 PNG / JSON 写入当前仓库的 docs/endless-vfx/，与启动脚本时的工作目录无关；同名旧证据会被覆盖。需要保留旧测量时，请先复制证据目录。

在项目根目录打开第一个 PowerShell 窗口：

```powershell
npm run dev -- --port 5175 --strictPort
```

在第二个 PowerShell 窗口启动一次性专用浏览器：

```powershell
$env:ARK_URL = 'http://127.0.0.1:5175/'
$env:ARK_CDP_PORT = '9335'
$qaEdge = Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'
if (-not (Test-Path -LiteralPath $qaEdge)) {
  $qaEdge = Join-Path $env:ProgramFiles 'Microsoft/Edge/Application/msedge.exe'
}
if (-not (Test-Path -LiteralPath $qaEdge)) { throw '请将 $qaEdge 改为实际 Edge 或 Chrome 可执行文件路径' }
$qaProfile = Join-Path (Get-Location).Path ('.local/endless-qa-profile-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $qaProfile -Force | Out-Null
$qaArgs = @(
  '--headless=new',
  ('--remote-debugging-port=' + $env:ARK_CDP_PORT),
  ('--user-data-dir=' + [char]34 + $qaProfile + [char]34),
  '--window-size=1200,720',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  'about:blank'
)
$qaBrowser = Start-Process -FilePath $qaEdge -ArgumentList $qaArgs -WindowStyle Hidden -PassThru
```

保持这个 PowerShell 窗口，依次运行：

```powershell
node tools/endless-qa/endless-phase-c.mjs
node tools/endless-qa/endless-phase-d.mjs
node tools/endless-qa/endless-phase-e.mjs
node tools/endless-qa/endless-live-perf.mjs
```

每个命令输出 JSON，断言失败以非零状态退出。完成后只结束变量记录的专用浏览器进程，保留一次性 profile 供排错；不要按进程名批量关闭个人浏览器：

```powershell
Stop-Process -Id $qaBrowser.Id
```

改端口时同时修改 Vite --port、ARK_URL 与浏览器 CDP / ARK_CDP_PORT。如果浏览器启动尚未就绪导致连接失败，确认对应 /json/list 有 page target 后重新运行脚本。

## 各阶段验证内容

| 脚本 | 场景与检查 | 输出 |
| --- | --- | --- |
| endless-phase-c.mjs | 默认 seed 20261017 的真实三恒星区域，0 / 20 / 60 秒；真实位置改变、三种色温、只读渲染 | phase-c-triple-*.png、phase-c.json |
| endless-phase-d.mjs | 从真实生成器寻找岩石 / 气态 / 冰态 / 带环行星；主线黑洞与真实太阳坍缩后的中子星复用回归 | phase-d-*.png、phase-d.json |
| endless-phase-e.mjs | 回访逐像素一致、相机位移、浮动原点、星云与节点连续帧、HIGH→OFF 冷暖缓存一致、十分钟真实模拟、400 次渲染缓存压力、缩放与堆统计 | phase-e-nebula-*.png、phase-e-nodes-*.png、phase-e.json |
| endless-live-perf.mjs | 通过真实 UI 加载专用测试存档，进入游戏画面全屏并运行实际主循环；包含物理、预测、UI 与渲染 | phase-e-live-*.png、phase-e-performance.json |

三恒星性能场景保持 **fields=off,off**；深空和星云性能场景为 **fields=on,on**。脚本记录并断言这一状态，不能把三恒星无节点场测量表述成双节点场开启测量。

性能报告保留真实 #debug 的测量文本、设备像素比、Canvas 尺寸、浏览器版本、逻辑核数和运行状态。它是本机 headless 开发构建的实测，不是所有电脑或生产构建的 60 FPS 保证。十分钟飞行是固定时间步真实模拟，不是十分钟墙钟运行；400 次跳跃是故意移动测试相机的压力测试，不是玩家实际飞行路线。

## 场景边界

当前生成器支持单恒星和真实三恒星系统，没有双星、黑洞或中子星生成模板。因此 D 阶段黑洞 / 中子星截图明确标注为**主线复用回归**，不能作为无尽世界自然生成这些天体的证据。脚本没有添加实体生成规则、终点、伤害机制或假的恒星轨道。

辅助文件 endless-fixture.mjs 只创建测试画布与读写测试场景，browser.mjs 只提供显式调用的 CDP / 路径 / setup 工具。截图、JSON 与浏览器异常列表都来自实际运行；语法检查或构建成功不能代替浏览器检查。
