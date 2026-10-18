/** Fullscreen belongs to presentation; simulation and camera scaling stay in main. */
export function mountFullscreen(canvas: HTMLCanvasElement, button: HTMLButtonElement, notice: HTMLElement, onChange: () => void) {
  const doc = canvas.ownerDocument;
  let pending = false, disposed = false, wasFullscreen = !!doc.fullscreenElement, exitedAt = -Infinity;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const supported = !!doc.fullscreenEnabled && typeof canvas.requestFullscreen === 'function';
  function sync() {
    const active = !!doc.fullscreenElement;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? '退出游戏画面全屏' : '游戏画面全屏');
    button.title = supported ? (active ? '退出游戏画面全屏 · Esc' : '游戏画面全屏 · Esc 退出') : '当前浏览器不支持全屏';
    button.disabled = !supported || pending;
  }
  function showFailure() {
    if (disposed) return;
    notice.textContent = '浏览器未允许切换全屏，请再次点击全屏按钮。';
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.textContent = ''; }, 5000);
  }
  async function toggle() {
    if (pending || !supported || disposed) return;
    pending = true; notice.textContent = ''; sync();
    try {
      if (doc.fullscreenElement) await doc.exitFullscreen();
      else if (!canvas.hidden) await canvas.requestFullscreen();
    } catch { showFailure(); }
    finally { pending = false; if (!disposed) sync(); }
  }
  const click = () => { void toggle(); };
  const changed = () => {
    const active = !!doc.fullscreenElement;
    if (wasFullscreen && !active) exitedAt = performance.now();
    wasFullscreen = active; sync(); onChange();
  };
  const key = (event: KeyboardEvent) => {
    if (event.code !== 'Escape' || doc.querySelector('dialog[open]')) return;
    // Some browsers dispatch Escape after leaving fullscreen. Consume that same
    // key so it cannot also navigate away from the current flight.
    if (doc.fullscreenElement || performance.now() - exitedAt < 300) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (doc.fullscreenElement) void toggle();
    }
  };
  button.addEventListener('click', click);
  doc.addEventListener('fullscreenchange', changed);
  doc.defaultView!.addEventListener('keydown', key, true);
  sync();
  return { dispose() { disposed = true; clearTimeout(noticeTimer); button.removeEventListener('click', click); doc.removeEventListener('fullscreenchange', changed); doc.defaultView!.removeEventListener('keydown', key, true); } };
}
