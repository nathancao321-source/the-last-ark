import type { Level } from '../game/types';
import { firstLevel } from './first';

/** Uses the original movable planet's capabilities and ordinary docking rule. */
export const movingWorld: Level = {
  ...structuredClone(firstLevel), id: 'moving-world', name: 'Level 0 · The Moving World', scoring: undefined,
  bodies: structuredClone(firstLevel.bodies.filter(body => body.kind !== 'asteroid')),
  missionBounds: {minX:-1200,minY:-1200,maxX:2400,maxY:1600},
  tutorial: {shipId:'ark',steps:[
    {id:'arrival',title:'The Moving World',text:'虫洞另一端，一颗行星挡在航线附近。两人的力场也能推动它；合力避开行星，再低速进入出口虫洞。',condition:{type:'acknowledge'}},
    {id:'planet',title:'移动的世界',text:'把蓝色节点放在飞船前上方吸引绕行；金色节点可以推开行星，或在终点前协助制动。',condition:{type:'body_perturbed',bodyId:'planet',minSpeed:2}},
    {id:'caution',title:'CAUTION',text:'CAUTION: Celestial bodies respond to your gravity, too.\n当心，行星也会被你吸引！',condition:{type:'acknowledge'},pauseOnEnter:true},
    {id:'dock',title:'合作跃迁',text:'留意行星的移动。让飞船完整进入绿色虫洞，速度须 ≤48；过快会直接穿过，可以减速返回再试。',condition:{type:'exit'},pauseOnEnter:true},
  ]},
};
