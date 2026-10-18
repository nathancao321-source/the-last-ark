# 全屏模式

封面、章节目录及游戏右上角的四角按钮切换浏览器原生全屏。进入全屏后，游戏会缩短顶部栏，将剩余高度分配给画布；画布像素尺寸继续由 ResizeObserver 与 devicePixelRatio 更新，不拉伸旧截图。低高度横屏自动隐藏次要说明。

再次点击按钮或按 Esc 退出。退出全屏的同一次 Esc 不会触发返回目录；设置弹窗打开时先处理弹窗。全屏切换不会重建关卡、改变碰撞或创建新的音乐实例。游戏焦点恢复到画布，移动按键释放以防卡键。浏览器不支持时禁用按钮；请求被拒绝时显示提示并允许重试。

浏览器验收 13 项通过，见 fullscreen-verification.json。已检查 fullscreen-game.png、fullscreen-landscape.png 和 fullscreen-mobile-header.png。完整测试仍为 31 个测试文件 / 473 项通过，TypeScript 检查与生产构建通过。
