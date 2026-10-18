import { describe, expect, it } from 'vitest';
import { campaignComplete, isSceneUnlocked, recommendedScene } from '../src/scenes/campaign';
import { SceneController } from '../src/scenes/controller';
import { scenes } from '../src/scenes/registry';
import { loadProgress, storeProgress, type CampaignProgress } from '../src/game/progress';
import { chapterChoices } from '../src/render/scene-ui';
import { NO_CONTROLS } from '../src/game/types';

describe('player campaign navigation', () => {
  it('requires the tutorial for a new player and rejects locked navigation without altering the current game', () => {
    const controller = new SceneController();
    expect(chapterChoices(scenes).filter(choice => choice.playable).map(choice => choice.id)).toEqual(['tutorial_part_1']);
    expect(controller.enterPlayable('tutorial_part_1')).toBe(true);
    const game = controller.game;
    for (const id of ['tutorial_part_2','solar_system','black_hole','endless','prototype','galactic_rest','coop_test'] as const) {
      expect(controller.enterPlayable(id)).toBe(false);
      expect(controller.game).toBe(game);
      expect(controller.scene).toBe('tutorial_part_1');
    }
    expect(controller.enterPlayable('title')).toBe(true);
  });
  it('persists the real tutorial transition and resumes the second half after reload', () => {
    const controller = new SceneController();
    controller.enterPlayable('tutorial_part_1');
    controller.game!.pendingScene = 'tutorial_part_2';
    controller.step(NO_CONTROLS);
    expect(controller.scene).toBe('tutorial_part_2');
    expect(controller.progress.tutorialPart1Complete).toBe(true);
    let value = '';
    const storage = {getItem: () => value, setItem: (_key:string, next:string) => { value = next; }};
    storeProgress(storage, controller.progress);
    const restored = loadProgress(storage);
    expect(recommendedScene(restored)).toBe('tutorial_part_2');
    expect(isSceneUnlocked('solar_system',restored)).toBe(false);
  });
  it('unlocks one chapter at a time after actual scene completion and opens replay at the end', () => {
    const controller = new SceneController(scenes,{level0Complete:false,tutorialPart1Complete:true});
    for (const [current,next] of [['tutorial_part_2','solar_system'],['solar_system','black_hole'],['black_hole','endless']] as const) {
      expect(controller.enterPlayable(current)).toBe(true);
      expect(isSceneUnlocked(next,controller.progress)).toBe(false);
      controller.game!.phase = 'completed'; controller.step(NO_CONTROLS);
      expect(controller.nextScene()).toBe(next);
      expect(recommendedScene(controller.progress)).toBe(next);
      expect(isSceneUnlocked(next,controller.progress)).toBe(true);
    }
    expect(campaignComplete(controller.progress)).toBe(true);
    for (const id of ['tutorial_part_1','tutorial_part_2','prototype','galactic_rest','endless'] as const) expect(controller.enterPlayable(id)).toBe(true);
  });
  it('does not unlock later chapters from incomplete prerequisite progress', () => {
    const p: CampaignProgress = {level0Complete:false,level1Complete:true,level2Complete:true};
    expect(isSceneUnlocked('black_hole',p)).toBe(false);
    expect(isSceneUnlocked('endless',p)).toBe(false);
    expect(campaignComplete(p)).toBe(false);
    expect(recommendedScene(p)).toBe('tutorial_part_1');
  });
  it('retains old valid saves, ignores malformed data and reports denied storage', () => {
    const p=loadProgress({getItem:()=>JSON.stringify({version:1,level0Complete:true}),setItem(){}});
    expect(p.tutorialPart1Complete).toBe(true);
    expect(recommendedScene(p)).toBe('solar_system');
    for(const data of ['broken','null','[]','{"version":1,"level0Complete":"true"}']) {
      expect(loadProgress({getItem:()=>data,setItem(){}}).level0Complete).toBe(false);
    }
    expect(storeProgress({getItem:()=>null,setItem(){throw new Error('denied');}},p)).toBe(false);
    expect(chapterChoices(scenes,{level0Complete:false},true).find(c=>c.id==='endless')!.playable).toBe(true);
  });
});
