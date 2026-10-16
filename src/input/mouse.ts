import type { PlayerInputSource } from './sources';
import type { PlayerControlIntent } from './intent';
import type { Camera } from '../camera/camera';
import { WorldTarget } from './world-target';

/** One physical pointer, assignable to either player. Motion events latch WORLD targets. */
export class MouseInput implements PlayerInputSource {
  private target = new WorldTarget();
  private lastClient?: { x: number; y: number };
  private active = false;
  private selected = false;
  setSelected(selected: boolean): void { if (selected !== this.selected) { this.selected = selected; this.reset(); } }
  read(): PlayerControlIntent { return { moveX: 0, moveY: 0, abilityActive: this.active, targetWorldPosition: this.target.read() }; }
  releaseMovement(): void { this.target.clear(); this.lastClient = undefined; }
  reset(): void { this.releaseMovement(); this.active = false; }
  attach(canvas: HTMLCanvasElement, camera: Camera): () => void {
    const move = (event: PointerEvent) => {
      if (!this.selected || event.pointerType !== 'mouse' || !document.hasFocus()) return;
      const client = { x: event.clientX, y: event.clientY };
      if (this.lastClient?.x === client.x && this.lastClient?.y === client.y) return;
      this.lastClient = client;
      this.target.capture(client, canvas.getBoundingClientRect(), camera);
    };
    const down = (event: PointerEvent) => {
      if (!this.selected || event.pointerType !== 'mouse' || event.button !== 0) return;
      canvas.focus(); move(event); this.active = !this.active; event.preventDefault();
    };
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerdown', down);
    return () => { canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerdown', down); this.reset(); };
  }
}
