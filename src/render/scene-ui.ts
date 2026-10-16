import type { SceneController } from '../scenes/controller';
import type { SceneId, SceneRegistry } from '../scenes/types';
import { currentLesson, tutorialInstruction } from '../game/tutorial';
import type { CampaignProgress } from '../game/progress';

const CHAPTERS: SceneId[] = ['tutorial_part_1', 'prototype', 'tutorial_part_2', 'solar_system', 'black_hole', 'endless', 'coop_test'];
/** Future chapters stay disabled even after their narrative unlock is recorded. */
export function chapterChoices(registry: SceneRegistry, progress: CampaignProgress = {level0Complete:false}) {
  return CHAPTERS.filter(id => id !== 'coop_test' || registry[id].status === 'available').map(id => {
    const scene = registry[id];
    return { id, name: scene.name, playable: scene.status === 'available' && !!scene.level,
      description: (id === 'solar_system' && progress.level0Complete) || (id === 'black_hole' && progress.level1Complete) ? '已解锁 · '+scene.description : scene.description ?? '后续内容，尚未制作。' };
  });
}

export function mountSceneUI(controller: SceneController, enter: (id: SceneId) => void, skip: () => void, debug: boolean, formatInstruction = (text: string) => text): { update(): void; dispose(): void } {
  const element = <T extends HTMLElement>(id: string) => document.querySelector<T>('#' + id)!;
  const menu = element('level-menu'), cards = element('level-cards');
  const name = element('scene-name'), back = element<HTMLButtonElement>('back-menu');
  const next=element<HTMLButtonElement>('next-chapter');
  const lesson = element('lesson'), progress = element('lesson-progress'), instruction = element('lesson-text');
  const skipButton = element<HTMLButtonElement>('skip-lesson'), canvas = element('game');
  const controls = element('controls'), help = element('help');
  const listeners: (() => void)[] = [];
  const click = (button: HTMLElement, fn: () => void) => { button.addEventListener('click', fn); listeners.push(() => button.removeEventListener('click', fn)); };
  cards.replaceChildren();
  for (const choice of chapterChoices(controller.registry, controller.progress)) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'level-card';
    button.disabled = !choice.playable; button.dataset.scene = choice.id;
    const title = document.createElement('strong'); title.textContent = choice.name;
    const description = document.createElement('span'); description.textContent = choice.playable ? choice.description : '尚未开放 · ' + choice.description;
    button.append(title, description); cards.append(button);
    click(button, () => enter(choice.id));
  }
  click(back, () => enter('title')); click(skipButton, skip);
  click(next,()=>{const destination=controller.nextScene();if(destination)enter(destination);});
  const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
  return {
    update() {
      const game = controller.game, step = game && currentLesson(game);
      const solar = cards.querySelector('[data-scene="solar_system"] span');
      if (solar && controller.progress.level0Complete) text(solar as HTMLElement,'已解锁 · '+controller.registry.solar_system.description);
      const abyss = cards.querySelector('[data-scene="black_hole"] span');
      if (abyss && controller.progress.level1Complete) text(abyss as HTMLElement,'已解锁 · '+controller.registry.black_hole.description);
      text(name, controller.registry[controller.scene].name);
      menu.hidden = controller.scene !== 'title'; back.hidden = controller.scene === 'title';
      next.hidden=!controller.nextScene();
      text(next,controller.registry[controller.scene].completion?.nextLabel??'继续');
      canvas.hidden = !game; controls.hidden = !game; help.hidden = !game;
      lesson.hidden = !step;
      skipButton.hidden = !debug || !step || step.condition.type === 'exit' || game?.phase === 'failed' || game?.phase === 'completed';
      if (game && step) {
        const phase = { ready: '准备中', paused: '已暂停，可调整节点', running: '飞行中', failed: '可重试', completed: '完成' }[game.phase];
        text(progress, `${game.tutorial!.step + 1} / ${game.level.tutorial!.steps.length} · ${step.title} · ${phase}`);
        text(instruction, formatInstruction(tutorialInstruction(game)!));
      }
    },
    dispose() { listeners.forEach(remove => remove()); cards.replaceChildren(); },
  };
}
