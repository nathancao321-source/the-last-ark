import { describe, expect, it, vi } from 'vitest';
import { Keyboard } from '../src/input/keyboard';

describe('settings keyboard isolation', () => {
  it('leaves Escape to the dialog, prevents latent movement and field toggles, and restores normal controls after closing', () => {
    vi.stubGlobal('Element', class {});
    const target = Object.assign(new EventTarget(), { document: new EventTarget() }) as unknown as Window;
    const actions: string[] = [];
    const keyboard = new Keyboard(action => actions.push(action));
    let modalOpen = false;
    const detach = keyboard.attach(target, () => modalOpen);
    const press = (code: string, type = 'keydown') => {
      const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat: false, shiftKey: false });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    try {
      expect(press('KeyD')).toBe(true);
      expect(keyboard.read().players[0].moveX).toBe(1);
      modalOpen = true;
      for (const code of ['Escape', 'KeyF', 'Enter', 'ArrowRight', 'Space']) expect(press(code)).toBe(false);
      expect(press('KeyD', 'keyup')).toBe(false);
      expect(actions).toEqual([]);
      expect(keyboard.read().players.every(player => !player.abilityActive && !player.moveX && !player.moveY)).toBe(true);
      modalOpen = false;
      expect(press('KeyF')).toBe(true);
      expect(keyboard.read().players[0].abilityActive).toBe(true);
      expect(press('Escape')).toBe(true);
      expect(actions).toEqual(['title']);
    } finally { detach(); vi.unstubAllGlobals(); }
  });
});
