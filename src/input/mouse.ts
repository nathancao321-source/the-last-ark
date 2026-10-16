import type { PlayerInputSource } from './sources';
import type { PlayerControlIntent } from './intent';
import type { Camera } from '../camera/camera';
import { WorldTarget } from './world-target';

/** Screen-follow mouse mode. Each read snapshots the current camera's world target.
 * Right click toggles neutral intent so the shared dynamics brakes normally. */
export class MouseInput implements PlayerInputSource {
  private target = new WorldTarget();
  private lastClient?: { x: number; y: number };
  private active = false;
  private selected = false;
  private braking = false;
  private suspended = false;
  private project?: () => void;
  get isBraking(): boolean { return this.braking; }
  setSelected(selected: boolean): void { if (selected !== this.selected) { this.selected = selected; this.reset(); } }
  setSuspended(suspended:boolean):void { this.suspended=suspended;if(suspended)this.releaseMovement(); }
  read(): PlayerControlIntent {
    if (!this.braking && !this.suspended) this.project?.();
    return { moveX: 0, moveY: 0, abilityActive: this.active, targetWorldPosition: this.braking ? undefined : this.target.read() };
  }
  releaseMovement(): void { this.target.clear(); this.lastClient = undefined; this.braking=false; }
  reset(): void { this.releaseMovement(); this.active = false; }
  attach(canvas: HTMLCanvasElement, camera: Camera, outside: EventTarget = canvas.ownerDocument?.defaultView ?? canvas): () => void {
    this.project=()=> { if(this.selected && this.lastClient && document.hasFocus()) this.target.capture(this.lastClient,canvas.getBoundingClientRect(),camera); };
    const move = (event: PointerEvent) => {
      if (!this.selected || this.suspended || event.pointerType !== 'mouse' || !document.hasFocus()) return;
      const client = { x: event.clientX, y: event.clientY };
      this.lastClient = client;
      this.project?.();
    };
    const down = (event: PointerEvent) => {
      if (!this.selected || this.suspended || event.pointerType !== 'mouse') return;
      canvas.focus(); move(event);
      if(event.button===0)this.active=!this.active;
      if(event.button===2)this.braking=!this.braking;
      event.preventDefault();
    };
    const outsideMove=(event: Event)=> { if(this.lastClient)move(event as PointerEvent); };
    const context=(event: Event)=> { if(this.selected)event.preventDefault(); };
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerdown', down);
    outside.addEventListener('pointermove',outsideMove);canvas.addEventListener('contextmenu',context);
    return () => { canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerdown', down); outside.removeEventListener('pointermove',outsideMove);canvas.removeEventListener('contextmenu',context);this.project=undefined;this.reset(); };
  }
}
