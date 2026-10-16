import type { PlayerInputSource } from './sources';
import type { PlayerControlIntent } from './intent';

export interface PadState { connected: boolean; mapping: string; axes: readonly number[]; buttons: readonly { pressed: boolean; value: number }[] }
export function stickIntent(x: number, y: number, deadzone = 0.18): { moveX: number; moveY: number } {
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
  status = '等待连接：连接手柄后按任意键';
  constructor(readonly slot: number, private poll: () => ArrayLike<PadState | null>, private focused: () => boolean, private menu: () => void) {}
  releaseMovement(): void { this.needsNeutral = true; }
  reset(): void { this.active = false; this.previousA = false; this.previousMenu = false; this.needsNeutral = true; }
  read(): PlayerControlIntent {
    let pad: PadState | null | undefined;
    try { pad = this.poll()[this.slot]; } catch { this.reset(); this.status = '浏览器无法读取手柄'; return {moveX:0,moveY:0,abilityActive:false}; }
    if (!pad?.connected) { this.reset(); this.status = '等待连接：连接手柄后按任意键'; return {moveX:0,moveY:0,abilityActive:false}; }
    if (pad.mapping !== 'standard') { this.reset(); this.status = '此手柄未提供标准 Xbox 映射'; return {moveX:0,moveY:0,abilityActive:false}; }
    const axes = stickIntent(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const pressed = (i: number) => !!pad!.buttons[i]?.pressed || (pad!.buttons[i]?.value ?? 0) > 0.5;
    const a = pressed(0), menu = pressed(9);
    if (!this.focused()) { this.releaseMovement(); this.status = '已暂停输入：返回游戏后松开摇杆与按钮'; return {moveX:0,moveY:0,abilityActive:this.active}; }
    if (this.needsNeutral) {
      this.status = '请松开摇杆、A 与 Menu 后开始';
      if (axes.moveX === 0 && axes.moveY === 0 && !a && !menu) this.needsNeutral = false;
      this.previousA = a; this.previousMenu = menu;
      return {moveX:0,moveY:0,abilityActive:this.active};
    }
    this.status = '已连接 · 左摇杆移动 / A 技能 / Menu 继续或暂停';
    if (a && !this.previousA) this.active = !this.active;
    if (menu && !this.previousMenu) this.menu();
    this.previousA = a; this.previousMenu = menu;
    return { ...axes, abilityActive: this.active };
  }
}
