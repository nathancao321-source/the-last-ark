import type { Level } from '../game/types';
import { firstLevel } from './first';

/** No hazards or new celestial mechanics: a short, forgiving real-physics first lesson. */
export const firstContact: Level = {
  id: 'first-contact', name: 'Level 0 · First Contact', width: 1100, height: 620,
  mapBounds: { minX: -180, minY: -250, maxX: 1100, maxY: 700 },
  missionBounds: { minX: -1000, minY: -1200, maxX: 2400, maxY: 1800 },
  players: [
    { ...structuredClone(firstLevel.players[0]), position: { x: 260, y: 230 } },
    { ...structuredClone(firstLevel.players[1]), position: { x: 80, y: 460 } },
  ],
  bodies: [
    { id: 'ark', kind: 'ship', position: { x: 120, y: 360 }, velocity: { x: 45, y: 0 }, radius: 8, affectedByFields: true, response: 1 },
    { id: 'first-gate', kind: 'wormhole', position: { x: 760, y: 80 }, velocity: { x: 0, y: 0 }, radius: 150,
      affectedByFields: false, response: 0, motion: 'static', emitsGravity: false, collision: 'none' },
  ],
  tutorial: { shipId: 'ark', steps: [
    { id: 'intro', title: 'First Contact', text: '人类最后的飞船已经启航。而你们，是它未曾察觉的守护者。', condition: { type: 'acknowledge' } },
    { id: 'move-p1', title: '移动蓝色节点', text: 'P1：轻按 WASD 移动蓝色节点，把它留在飞船右上方。', condition: { type: 'moved', player: 0, distance: 8 }, pauseOnEnter: true },
    { id: 'enable-p1', title: '开启吸引', text: 'P1：点按 F 开启蓝色吸引力；松开仍保持，再按关闭。', condition: { type: 'enabled', player: 0 } },
    { id: 'observe-p1', title: '观察引力', text: '保持蓝场开启并靠近飞船，观察航迹向蓝色节点弯曲。', condition: { type: 'influence', players: [0], seconds: 0.65, minAcceleration: 1 }, pauseOnEnter: true },
    { id: 'move-p2', title: '移动金色节点', text: 'P2：轻按方向键移动金色节点，把它留在飞船左下方。', condition: { type: 'moved', player: 1, distance: 8 }, pauseOnEnter: true },
    { id: 'enable-p2', title: '开启排斥', text: 'P2：点按 Enter 开启金色斥力；它会把飞船推离自己。', condition: { type: 'enabled', player: 1 } },
    { id: 'combine', title: '两场叠加', text: '保持蓝场和金场都开启、覆盖飞船，观察两股力共同改变航迹。', condition: { type: 'influence', players: [0, 1], seconds: 0.65, minAcceleration: 1 }, pauseOnEnter: true },
    { id: 'exit', title: '共同护送', text: '关闭仍开启的力场，让飞船惯性滑入绿环；偏航时可再开场修正，无需低速入洞。', condition: { type: 'exit' }, pauseOnEnter: true },
  ] },
  mission: {
    completeOnObjectives: false,
    objectives: [{ id: 'reach-gate', label: '进入虫洞 · 不限入洞速度', target: { entityId: 'first-gate' },
      condition: { type: 'near_entity', entityId: 'ark', targetId: 'first-gate' } }],
    // Teaching is guidance, not a hidden gate. Early genuine arrival is always accepted.
    triggers: [{ id: 'first-contact-exit', condition: { type: 'objective_complete', objectiveId: 'reach-gate' },
      actions: [{ type: 'transition', scene: 'tutorial_part_2' }] }],
  },
};
