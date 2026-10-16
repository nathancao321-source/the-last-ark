import { firstLevel } from '../levels/first';
import { firstContact } from '../levels/first-contact';
import { movingWorld } from '../levels/moving-world';
import { solarSystem } from '../levels/solar-system';
import type { SceneRegistry } from './types';
export const scenes: SceneRegistry = {
  title: { id: 'title', name: 'THE LAST ARK', status: 'available' },
  coop_test: { id: 'coop_test', name: '开发合作测试', status: 'planned' },
  prototype: { id: 'prototype', name: '原试玩 / 绕行与制动', description: '自由练习：绕过可移动行星，低速抵达空间港。', status: 'available', level: firstLevel },
  tutorial_part_1: { id: 'tutorial_part_1', name: 'Level 0 · First Contact', description: '从这里开始：学习吸引与排斥，将方舟送入虫洞。', status: 'available', level: firstContact },
  tutorial_part_2: { id: 'tutorial_part_2', name: 'Level 0 · The Moving World', description: '行星也会回应力场：合作避障，低速入港，完成序章。', status: 'available', level: movingWorld },
  solar_system: { id: 'solar_system', name: 'Level 1 · SOLAR EXODUS', description:'地球起航、太阳绕行、小行星带，越过冥王星进入星际转移区。M 查看全局星图。',status: 'available',level:solarSystem },
  black_hole: { id: 'black_hole', name: 'Level 2 · Beyond the Horizon', status: 'planned' },
  endless: { id: 'endless', name: 'Endless Mode', status: 'planned' },
};
