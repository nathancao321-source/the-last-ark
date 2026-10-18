# 全屏模式

进入关卡后，点击航行操作区的「画面全屏」。请求全屏的元素是游戏 canvas 本身：画面从 (0, 0) 延伸到屏幕右下角，保留游戏内 HUD，不显示网页标题、导航、音乐按钮、操作说明、页脚或外侧边框。封面与目录不提供网页全屏按钮。

按 Esc 退出画面全屏，并留在当前关卡；随后可使用普通窗口里的设置与航行按钮。Space 暂停、M 星图及双人控制在全屏内继续工作。画布像素尺寸通过 ResizeObserver 和 devicePixelRatio 更新，支持横屏、窗口尺寸变化与高 DPI。全屏切换不会重建关卡、改变碰撞或创建新的音乐实例；移动按键释放以防卡键。浏览器不支持时禁用按钮；请求被拒绝时显示提示并允许重试。

开发版与生产版分别通过 14 项浏览器断言，见 fullscreen-verification.json 和 canvas-fullscreen-production.json。验收要求画布 x/y 都为 0、宽高与视口相等、四个屏幕角均命中画布。实测 1440×1000 与 844×390 都完全填满；1200×800 / 2×DPI 的绘图缓冲为 2400×1600。已实际打开 fullscreen-game.png、fullscreen-landscape.png 及 production-fullscreen.png 检查。完整测试仍为 31 个测试文件 / 473 项通过，TypeScript 检查与生产构建通过。
