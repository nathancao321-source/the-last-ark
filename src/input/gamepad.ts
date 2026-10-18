import type { PlayerInputSource } from './sources';
import type { PlayerControlIntent } from './intent';

export interface PadState { connected: boolean; mapping: string; axes: readonly number[]; buttons: readonly { pressed: boolean; value: number }[] }
/** Browsers leave gaps in the gamepad list and order it by connection time, so
 * a single controller can sit in slot 2 while "手柄 1" polls slot 0. Compact
 * the connected reports into the two player-facing slots. */
export function connectedPads(pads: ArrayLike<PadState | null | undefined>): (PadState | null)[] {
  const list: PadState[] = [];
  for (let i = 0; i < pads.length && list.length < 2; i++) {
    const pad = pads[i];
    if (pad?.connected) list.push(pad);
  }
  return [list[0] ?? null, list[1] ?? null];
}
export function stickIntent(x: number, y: number, deadzone = 0.25): { moveX: number; moveY: number } {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { moveX: 0, moveY: 0 };
  const magnitude = Math.hypot(x,y);
  if (magnitude <= deadzone) return { moveX: 0, moveY: 0 };
  const amount = (Math.min(1,magnitude) - deadzone) / (1 - deadzone);
  return { moveX: x / magnitude * amount, moveY: y / magnitude * amount };
}

/** Xbox controllers through the browser's standard Gamepad mapping; no physical state access. */
export class XboxInput implements PlayerInputSource {
  private active = false;
  private previousA = false;
  private previousMenu = false;
  private needsNeutral = true;
  private moving = false;
  private present = false;
  status = '未检测到手柄：连接后请按任意键唤醒';
  constructor(readonly slot: number, private poll: () => ArrayLike<PadState | null>, private focused: () => boolean, private menu: () => void) {}
  /** True when the browser reports a physical pad in this player-facing slot. */
  get detected(): boolean { return this.present; }
  releaseMovement(): void { this.needsNeutral = true; this.moving = false; }
  reset(): void { this.active = false; this.previousA = false; this.previousMenu = false; this.releaseMovement(); }
  read(): PlayerControlIntent {
    let pad: PadState | null | undefined;
    try { pad = this.poll()[this.slot]; } catch { this.present = false; this.reset(); this.status = '浏览器无法读取手柄'; return {moveX:0,moveY:0,abilityActive:false}; }
    this.present = !!pad?.connected;
    if (!pad?.connected) { this.reset(); this.status = '未检测到手柄：连接后请按任意键唤醒'; return {moveX:0,moveY:0,abilityActive:false}; }
    // Some drivers, especially third-party pads on Windows, expose a usable
    // left stick and A button without the browser's "standard" label. Accept
    // those reports instead of leaving the controller permanently offline.
    if (pad.axes.length < 2 || pad.buttons.length < 1) { this.reset(); this.status = '此手柄没有可用的摇杆或按键'; return {moveX:0,moveY:0,abilityActive:false}; }
    const compatible = pad.mapping !== 'standard';
    const rawX=pad.axes[0] ?? 0, rawY=pad.axes[1] ?? 0;
    const magnitude=Number.isFinite(rawX)&&Number.isFinite(rawY) ? Math.hypot(rawX,rawY) : 0;
    // Hysteresis rejects a noisy resting stick; zero intent invokes finite assisted braking.
    this.moving = magnitude > (this.moving ? 0.25 : 0.30);
    const axes = this.moving ? stickIntent(rawX,rawY) : {moveX:0,moveY:0};
    const pressed = (i: number) => !!pad!.buttons[i]?.pressed || (pad!.buttons[i]?.value ?? 0) > 0.5;
    const a = pressed(0), menu = pressed(9);
    if (!this.focused()) { this.releaseMovement(); this.status = '已暂停输入：返回游戏后松开摇杆与按钮'; return {moveX:0,moveY:0,abilityActive:this.active}; }
    if (this.needsNeutral) {
      this.status = '已识别手柄 · 请松开摇杆、A 与 Menu';
      // Ignore a small resting drift instead of demanding a mathematically
      // exact zero, which some worn sticks never report.
      if (magnitude <= 0.35 && !a && !menu) this.needsNeutral = false;
      this.previousA = a; this.previousMenu = menu;
      return {moveX:0,moveY:0,abilityActive:this.active};
    }
    this.status = `已连接${compatible ? '（兼容映射）' : ''} · 左摇杆 / A 技能 / Menu 暂停 · 摇杆 ${magnitude.toFixed(2)}${this.moving ? '' : '（回中制动）'}`;
    if (a && !this.previousA) this.active = !this.active;
    if (menu && !this.previousMenu) this.menu();
    this.previousA = a; this.previousMenu = menu;
    return { ...axes, abilityActive: this.active };
  }
}
