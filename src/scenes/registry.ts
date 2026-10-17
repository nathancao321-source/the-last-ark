import { firstLevel } from '../levels/first';
import { firstContact } from '../levels/first-contact';
import { movingWorld } from '../levels/moving-world';
import { solarSystem } from '../levels/solar-system';
import { blackHoleLevel, galacticRest } from '../levels/black-hole';
import type { SceneRegistry } from './types';
import { endlessLevel } from '../levels/endless';
export const scenes: SceneRegistry = {
  title: { id: 'title', name: 'THE LAST ARK', status: 'available' },
  coop_test: { id: 'coop_test', name: '开发合作测试', status: 'planned' },
  prototype: { id: 'prototype', name: '原试玩 / 绕行与制动', description: '自由练习：绕过可移动行星，低速抵达空间港。', status: 'available', level: firstLevel },
  tutorial_part_1: { id: 'tutorial_part_1', name: 'Level 0 · First Contact', description: '从这里开始：学习吸引与排斥，将方舟送入虫洞。', status: 'available', level: firstContact },
  tutorial_part_2: { id: 'tutorial_part_2', name: 'Level 0 · The Moving World', description: '行星也会回应力场：合作避障，低速入港，完成序章。', status: 'available', level: movingWorld,
    completion:{message:'Level 0 Complete · 下一章已解锁：Solar Exodus',nextScene:'solar_system',nextLabel:'继续 · Solar Exodus'} },
  solar_system: { id: 'solar_system', name: 'Level 1 · SOLAR EXODUS', description:'地球起航、太阳绕行、小行星带，越过冥王星进入星际转移区。M 查看全局星图。',status: 'available',level:solarSystem,
    completion:{message:'Level 1 Complete · 准备远距跃迁至银河深渊',nextScene:'black_hole',nextLabel:'远距跃迁 · Beyond the Horizon'} },
  black_hole: { id: 'black_hole', name: 'Level 2 · BEYOND THE HORIZON / 银河深渊',status: 'available',level:blackHoleLevel,
    description:'抵达银河中心附近。合作绕过不可移动的黑洞、潮汐危险区和漂流残骸，经独立出口跃迁至银河边缘。',
    completion:{message:'Level 2 Complete · 方舟越过银河深渊，群星之间的航程开始',nextScene:'endless',nextLabel:'继续 · Beyond the Stars'} },
  galactic_rest: {id:'galactic_rest',name:'银河边缘 · 航程休整',status:'available',level:galacticRest,description:'保留的安全休整场景。可返回章节选择进入群星之间。'},
  endless: { id: 'endless', name: 'BEYOND THE STARS / 群星之间', description:'自由探索程序化宇宙，寻找三日系统与遥远星云。H/J召回节点；K保存，L恢复。',status: 'available',level:endlessLevel },
};
