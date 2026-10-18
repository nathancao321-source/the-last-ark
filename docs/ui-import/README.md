# GitHub UI 本地交付 · 2026-10-18

已从 nathancao321-source/the-last-ark 下载 feature/cinematic-menu 分支的 a381dda56346e3fd82ff9c7d8a286f73e6138b44，并合并到 D:/小游戏。首次交付仅保存本地；随后按用户追加要求加入全屏模式，再提交并推送到 codex/gravity-visual-demo 分支。

## 本地位置

- 可继续开发的项目：D:/小游戏
- 可部署的生产构建：D:/小游戏/dist
- GitHub 原始下载包：D:/小游戏/.local/github-ui-a381dda/source.zip
- GitHub 原始源码：D:/小游戏/.local/github-ui-a381dda/source/the-last-ark-a381dda56346e3fd82ff9c7d8a286f73e6138b44
- 合并前备份：D:/小游戏/.local/before-github-ui-20261018（src、tests、index.html、README.md）
- 下载包 SHA-256：50ee08ff5cdf2f02b6d9682849b744a550ce1a87a26ab140488db21f4c5e54b3

## 运行

在 D:/小游戏 打开终端执行 npm run dev，访问终端显示的本机地址。已有本机预览运行于 http://127.0.0.1:5176/；关闭该服务后可执行 npm run preview -- --port 5176 重新启动。不要直接双击 dist/index.html，模块与资源需要 HTTP 服务。

## 已接入

- 动态星空封面、启程入口、章节目录、故事航线与自由回溯。
- 章节解锁与进度保存、操作设置弹窗、暂停与返回按钮。
- BGM 保持同一音频实例跨菜单/场景播放，右上角保留音乐开关。
- 右上角四角图标进入/退出全屏，封面、目录和游戏内均可使用。游戏全屏时画布占满剩余高度，保留设置和航行按钮；Esc 先退出全屏，不同时离开当前关卡。设置弹窗打开时先处理弹窗。
- 现有黑洞吸积盘、危险机制、太阳波、虫洞渲染与双人控制代码保留。118 个备份文件逐个文本比对相同；其余变化仅为 UI 合并和测试兼容修复。详见 source-and-preservation.json。

## 验证

- npm run check：31 个测试文件、473 项测试通过，TypeScript 与 Vite 生产构建通过。
- Edge 浏览器实测：封面、章节锁、教程入口、设置窗口、Escape 关闭、弹窗键盘隔离、音乐跨场景连续播放、循环与开关、390px 窄屏无横向溢出。15 项断言通过，运行时错误 0。
- 生产构建另行验证，详见 production-verification.json。测试时的临时进度数据已恢复。
- 全屏浏览器验收：13 项断言通过，包含原生全屏进入/退出、画布分辨率、低高度横屏、设置弹窗、音乐实例保持和请求失败提示。详见 fullscreen-verification.json 与 fullscreen-game.png。
- 旧特效关闭基线：太阳系/黑洞冷缓存与热缓存均为 0 个字节差异；两端喷流在三档缩放下均可见；虫洞轨迹仍可辨。
- 截图：cover.png、chapters.png、settings.png、tutorial.png、cover-mobile.png、chapters-mobile.png、black-hole-game.png。

此前吸积盘专项的连续帧、视频、中心对齐保存在 ../vfx-repair/，详见该目录 ACCRETION-REVIEW.md。用户提供的参考图、含 P1 原图的并排对照和原始提示文本仅保留本地，不随本次代码发布。
