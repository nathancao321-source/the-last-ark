import { createGame, retryGame, stepGame, togglePause } from '../game/game';
import type { Controls, GameState } from '../game/types';
import type { SceneId, SceneRegistry } from './types';
import { scenes } from './registry';
import type { CampaignProgress } from '../game/progress';
/** Scene identity and simulation phase are independent; planned scenes cannot run. */
export class SceneController {
  scene: SceneId = 'title';
  game?: GameState;
  revision = 0;
  notice = '';
  arrival?: { from: SceneId; seconds: number; distance: number };
  constructor(readonly registry: SceneRegistry = scenes, readonly progress: CampaignProgress = {level0Complete:false}) {}
  enter(id: SceneId): boolean {
    const scene = this.registry[id];
    if (!scene || scene.status === 'planned' || (id !== 'title' && !scene.level)) {
      this.notice = '该场景尚在规划中'; return false;
    }
    this.game = scene.level ? createGame(scene.level) : undefined;
    this.arrival = undefined;
    this.scene = id; this.notice = ''; this.revision++; return true;
  }
  toggle(): void { if (this.scene === 'title') this.enter('tutorial_part_1'); else if (this.game) togglePause(this.game); }
  retry(fromStart = false): void {
    if (!this.game) return;
    this.game = fromStart ? createGame(this.game.level) : retryGame(this.game); this.revision++;
  }
  step(input: Controls): void {
    if (!this.game) return;
    stepGame(this.game, input);
    if (this.scene === 'tutorial_part_2' && this.game.phase === 'completed') {
      this.progress.level0Complete = true;
      this.game.message = 'Level 0 Complete · 下一章已解锁：Solar Exodus';
    }
    if(this.scene==='solar_system' && this.game.phase==='completed')this.game.message='Level 1 Complete · 已离开太阳系';
    const next = this.game.pendingScene;
    if (next) {
      const arrival = { from: this.scene, seconds: this.game.elapsed, distance: this.game.distance };
      delete this.game.pendingScene;
      if (!this.enter(next)) this.game!.message = this.notice;
      else this.arrival = arrival;
    }
  }
}
