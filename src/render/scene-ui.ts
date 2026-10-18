import type { SceneController } from '../scenes/controller';
import type { SceneId, SceneRegistry } from '../scenes/types';
import { currentLesson, tutorialInstruction } from '../game/tutorial';
import type { CampaignProgress } from '../game/progress';
import { campaignComplete, completedChapters, isSceneUnlocked, recommendedScene } from '../scenes/campaign';

const CHAPTERS: SceneId[] = ['tutorial_part_1', 'prototype', 'tutorial_part_2', 'solar_system', 'black_hole', 'endless', 'coop_test'];
export function chapterChoices(registry: SceneRegistry, progress: CampaignProgress = {level0Complete:false}, debug = false) {
  return CHAPTERS.filter(id => id !== 'coop_test' || (debug && registry[id].status === 'available')).map(id => {
    const scene = registry[id];
    return { id, name: scene.name, playable: scene.status === 'available' && !!scene.level && (debug || isSceneUnlocked(id, progress)),
      description: scene.description ?? '后续内容，尚未制作。' };
  });
}

const CHAPTER_ART: {id: SceneId; number: string; title: string; description: string; locked: string}[] = [
  {id:'tutorial_part_1', number:'00', title:'初次接触', description:'掌握吸引与排斥，完成第一次合作跃迁。', locked:''},
  {id:'solar_system', number:'01', title:'逃离太阳系', description:'告别蓝色故乡，穿越太阳与小行星带。', locked:'完成「初次接触」后解锁'},
  {id:'black_hole', number:'02', title:'银河深渊', description:'绕过黑洞的视界，为方舟找到前行的路。', locked:'完成「逃离太阳系」后解锁'},
  {id:'endless', number:'∞', title:'群星之间', description:'驶入无尽宇宙，自由发现新的星域。', locked:'完成全部主线后解锁'},
];
const LOCK = '<svg viewBox="0 0 16 20" fill="none" stroke-width="1.2" aria-hidden="true"><rect x="2" y="8" width="12" height="10" rx="2"/><path d="M4 8V5a4 4 0 0 1 8 0v3"/><path d="M8 12v3"/></svg>';

export function mountSceneUI(controller: SceneController, enter: (id: SceneId) => void, skip: () => void, debug: boolean, formatInstruction = (text: string) => text, onSettingsOpen = () => {}): { update(): void; dispose(): void; activate(): void; goBack(): void; settingsOpen(): boolean } {
  const element = <T extends HTMLElement>(id: string) => document.querySelector<T>('#' + id)!;
  const cover = element('cover'), menu = element('level-menu'), cards = element('level-cards'), replayCards = element('replay-cards');
  const shell = element('game-shell'), name = element('scene-name'), back = element<HTMLButtonElement>('back-menu');
  const next = element<HTMLButtonElement>('next-chapter');
  const lesson = element('lesson'), progress = element('lesson-progress'), instruction = element('lesson-text');
  const skipButton = element<HTMLButtonElement>('skip-lesson'), canvas = element('game');
  const controls = element('controls'), help = element('help'), dialog = element<HTMLDialogElement>('settings-dialog');
  const campaignTab = element<HTMLButtonElement>('campaign-tab'), replayTab = element<HTMLButtonElement>('replay-tab');
  let home: 'cover' | 'menu' = 'cover', mode: 'campaign' | 'replay' = 'campaign';
  let lastKey = '', wasInGame = false;
  const listeners: (() => void)[] = [];
  const listen = (node: EventTarget, event: string, fn: EventListener) => { node.addEventListener(event, fn); listeners.push(() => node.removeEventListener(event, fn)); };
  const click = (button: HTMLElement, fn: () => void) => listen(button, 'click', fn);
  const text = (node: HTMLElement, value: string) => { if (node.textContent !== value) node.textContent = value; };
  const showHome = (destination: 'cover' | 'menu') => { if (controller.scene !== 'title') enter('title'); home = destination; update(); element(destination === 'cover' ? 'begin-journey' : 'campaign-tab').focus(); };
  const launch = (id: SceneId) => { enter(id); update(); };
  const complete = (id: SceneId) => id === 'tutorial_part_1' ? controller.progress.level0Complete : id === 'solar_system' ? !!controller.progress.level1Complete : id === 'black_hole' ? !!controller.progress.level2Complete : false;
  function createCard(id: SceneId, number: string, title: string, description: string, playable: boolean, state: string, recommended: boolean, destination = id): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'level-card' + (recommended ? ' recommended' : ''); button.dataset.scene = id; button.dataset.destination = destination;
    button.disabled = !playable;
    button.innerHTML = '<span class="chapter-number"></span><span class="chapter-copy"><span class="chapter-topline"><strong></strong><span class="chapter-state"></span></span><span class="chapter-description"></span></span><span class="chapter-icon" aria-hidden="true"></span>';
    button.querySelector('.chapter-number')!.textContent = number;
    button.querySelector('strong')!.textContent = title;
    button.querySelector('.chapter-state')!.textContent = state;
    button.querySelector('.chapter-description')!.textContent = description;
    button.querySelector('.chapter-icon')!.innerHTML = playable ? (complete(id) ? '✓' : '↗') : LOCK;
    return button;
  }
  function rebuildCards() {
    const p = controller.progress, recommended = recommendedScene(p);
    cards.replaceChildren(...CHAPTER_ART.map(chapter => {
      const destination = chapter.id === 'tutorial_part_1' && !p.level0Complete && p.tutorialPart1Complete ? 'tutorial_part_2' : chapter.id;
      const playable = (debug || isSceneUnlocked(destination, p)) && controller.registry[destination].status === 'available';
      const current = destination === recommended;
      const state = !playable ? '未解锁' : complete(chapter.id) ? '已完成' : chapter.id === 'endless' ? '自由探索' : current ? (chapter.id === 'tutorial_part_1' ? '必修教程' : '下一航程') : '已解锁';
      const description = !playable ? chapter.locked : destination === 'tutorial_part_2' ? '接续教程第二部分 · 行星也会回应你的引力。' : chapter.description;
      return createCard(chapter.id, chapter.number, chapter.title, description, playable, state, current, destination);
    }));
    const replayIds: SceneId[] = ['tutorial_part_1','tutorial_part_2','solar_system','black_hole','prototype','galactic_rest'];
    if (debug && controller.registry.coop_test.status === 'available') replayIds.push('coop_test');
    replayCards.replaceChildren(...replayIds.map((id, index) => createCard(id, String(index + 1).padStart(2,'0'),
      ({tutorial_part_1:'初次接触',tutorial_part_2:'移动的世界',solar_system:'逃离太阳系',black_hole:'银河深渊',prototype:'绕行与制动',galactic_rest:'银河边缘',coop_test:'开发合作测试'} as Partial<Record<SceneId,string>>)[id]!,
      controller.registry[id].description ?? '开发场景',
      (debug || campaignComplete(p)) && controller.registry[id].status === 'available', '回溯航程', false)));
  }
  const chooseCard: EventListener = event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-destination]');
    if (button && !button.disabled) launch(button.dataset.destination as SceneId);
  };
  listen(cards, 'click', chooseCard); listen(replayCards, 'click', chooseCard);
  const activate = () => { if (dialog.open) return; if (controller.scene === 'title') launch(recommendedScene(controller.progress)); };
  click(element('begin-journey'), activate);
  click(element('open-chapters'), () => showHome('menu'));
  click(element('menu-cover'), () => showHome('cover'));
  click(element('brand-home'), () => showHome('cover'));
  click(back, () => showHome('menu')); click(skipButton, skip);
  click(next, () => { const destination = controller.nextScene(); if (destination) launch(destination); });
  click(campaignTab, () => { mode = 'campaign'; update(); });
  click(replayTab, () => { if (debug || campaignComplete(controller.progress)) { mode = 'replay'; update(); } });
  click(element('open-settings'), () => { onSettingsOpen(); dialog.showModal(); });
  click(element('close-settings'), () => dialog.close());
  click(element('settings-done'), () => dialog.close());
  listen(dialog, 'close', () => { if (controller.game) canvas.focus(); });
  function update() {
    const game = controller.game, step = game && currentLesson(game);
    const inGame = !!game;
    if (wasInGame && !inGame) home = 'menu';
    wasInGame = inGame;
    const key = JSON.stringify(controller.progress);
    if (key !== lastKey) { lastKey = key; rebuildCards(); }
    const finished = campaignComplete(controller.progress), count = completedChapters(controller.progress);
    const screen = inGame ? 'game' : home;
    if (document.body.dataset.screen !== screen) document.body.dataset.screen = screen;
    cover.hidden = screen !== 'cover'; menu.hidden = screen !== 'menu'; shell.hidden = !inGame;
    text(name, controller.registry[controller.scene].name);
    back.hidden = !inGame; next.hidden = !controller.nextScene();
    text(next, controller.registry[controller.scene].completion?.nextLabel ?? '继续航程');
    canvas.hidden = !game; controls.hidden = !game; help.hidden = !game; lesson.hidden = !step;
    replayTab.disabled = !finished && !debug;
    if (replayTab.disabled) mode = 'campaign';
    campaignTab.classList.toggle('active', mode === 'campaign'); replayTab.classList.toggle('active', mode === 'replay');
    campaignTab.setAttribute('aria-pressed', String(mode === 'campaign')); replayTab.setAttribute('aria-pressed', String(mode === 'replay'));
    cards.hidden = mode !== 'campaign'; replayCards.hidden = mode !== 'replay';
    const countNode = element('journey-count');
    if (countNode.dataset.count !== String(count)) { countNode.innerHTML = `0${count} <span>/ 03</span>`; countNode.dataset.count = String(count); }
    element('journey-progress-fill').style.width = `${count / 3 * 100}%`;
    text(element('begin-label'), count || controller.progress.tutorialPart1Complete ? '继续航行' : '启程');
    text(element('cover-hint'), finished ? '主线已完成 · 自由回溯与无限探索已开放' : controller.progress.level0Complete ? '继续下一段已解锁的航程' : controller.progress.tutorialPart1Complete ? '继续新手教程 · 移动的世界' : '首次航行将从新手教程开始');
    text(element('unlock-note'), finished ? '主线已完成。自由回溯与群星之间现已开放。' : '完成前一章节，解锁下一段航程。全部完成后可自由回溯。');
    skipButton.hidden = !debug || !step || step.condition.type === 'exit' || game?.phase === 'failed' || game?.phase === 'completed';
    if (game && step) {
      const phase = { ready:'准备中', paused:'已暂停，可调整节点', running:'飞行中', failed:'可重试', completed:'完成' }[game.phase];
      text(progress, `${game.tutorial!.step + 1} / ${game.level.tutorial!.steps.length} · ${step.title} · ${phase}`);
      text(instruction, formatInstruction(tutorialInstruction(game)!));
    }
  }
  update();
  return { update, activate, settingsOpen: () => dialog.open,
    goBack() { if (dialog.open) { dialog.close(); return; } showHome(controller.game ? 'menu' : home === 'menu' ? 'cover' : 'menu'); },
    dispose() { listeners.forEach(remove => remove()); dialog.close(); cards.replaceChildren(); replayCards.replaceChildren(); },
  };
}
