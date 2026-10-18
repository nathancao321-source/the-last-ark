import type { Level } from '../game/types';
import { createBody } from '../game/entities';
import { firstLevel } from './first';
import { bodyGravity } from '../physics/gravity';
import { fieldAcceleration } from '../physics/fields';
import { length, sub } from '../physics/vector';

const sagittarius = createBody({id:'sagittarius-a',kind:'black_hole',position:{x:1300,y:0},radius:100,
  motion:'static',affectedByFields:false,response:0,receivesGravity:false,
  gravityStrength:5_000_000,gravityRadius:1600,gravitySoftening:130,
  collision:'capture',captureRadius:100,captureMessage:'越过事件视界：方舟被撕碎',
  nodeInfluence:{gravityMultiplier:8,maxAccelerationRatio:0.85,steeringSeconds:0.4,jetPeriod:5,jetSeconds:0.8,reformSeconds:0.45,ejectionDistance:620},
  damageZone:{radius:360,damagePerSecond:45,message:'潮汐撕裂 · 正在损伤船体，远离红圈',failureMessage:'方舟被潮汐力撕碎'},
  appearance:{name:'Sagittarius A* · 事件视界',color:'#b08fe4',ring:true}});

function debris(x:number,y:number,radius:number,index:number) {
  const position={x,y},delta=sub(position,sagittarius.position),distance=length(delta);
  // Initial circular speed only. After spawning these rocks use the common
  // integrator, can be pushed away, and are removed if they cross the horizon.
  const speed=Math.sqrt(length(fieldAcceleration(position,sagittarius.position,bodyGravity(sagittarius)))*distance);
  return createBody({id:`deep-rock-${index}`,kind:'asteroid',position,radius,
    velocity:{x:-delta.y/distance*speed,y:delta.x/distance*speed},gravityResponse:1,
    stabilization:{halfLife:1},appearance:{name:'漂流残骸',color:'#9298a8'}});
}

/** Compressed Sagittarius A* encounter. Softened Newtonian force + HP zones,
 * not GR. All parameters are world-space and independent of the camera. */
export const blackHoleLevel: Level = {
  id: 'beyond-the-horizon', name: 'Level 2 · BEYOND THE HORIZON / 银河深渊',
  width: 1100, height: 620, seed: 20261016, shipHealth: 100,
  blackHoleJets:{sourceId:'sagittarius-a',length:1100,coreRadius:24,plumeRadius:65,idle:2,warning:2,firing:2.5,dissipating:.75,cooldown:5,invulnerability:1},
  mapBounds: {minX:-400,maxX:3500,minY:-1100,maxY:1100},
  players: structuredClone(firstLevel.players).map((p,i)=>({...p,position:i?{x:-80,y:150}:{x:130,y:-160}})) as Level['players'],
  bodies: [
    createBody({id:'ark',kind:'ship',radius:8,position:{x:0,y:0},velocity:{x:85,y:0}}),
    sagittarius,
    debris(870,-500,22,0),debris(1420,-680,18,1),debris(1800,470,25,2),
    createBody({id:'galactic-exit',kind:'wormhole',radius:130,position:{x:3100,y:0},appearance:{name:'银河边缘跃迁出口 · ≤ 65',color:'#94e9dc'}}),
  ],
  mission: {objectives:[
    {id:'approach',label:'远距跃迁完成 · 黑洞不可推动；提前向上/下绕行，Space 可暂停部署',target:{position:{x:500,y:-560}},
      condition:{type:'inside_region',entityId:'ark',region:{shape:'rect',bounds:{minX:450,maxX:1e9,minY:-1e9,maxY:1e9}}}},
    {id:'bypass',requires:['approach'],label:'双场护航 · 避开红色潮汐圈与漂流残骸；黑洞不是出口',target:{position:{x:2050,y:-560}},
      condition:{type:'inside_region',entityId:'ark',region:{shape:'rect',bounds:{minX:2050,maxX:1e9,minY:-1e9,maxY:1e9}}}},
    {id:'escape',requires:['bypass'],label:'前往独立跃迁出口 · 减速至 ≤ 65，抵达银河边缘',target:{entityId:'galactic-exit'},
      condition:{type:'near_entity',entityId:'ark',targetId:'galactic-exit',maxSpeed:65}},
  ],triggers:[{id:'clear-horizon',condition:{type:'objective_complete',objectiveId:'bypass'},actions:[{type:'checkpoint',id:'beyond-horizon'}]}]},
};

/** Post-chapter arrival only. No generator, enemies, scoring or endless universe. */
export const galacticRest: Level = {
  id:'galactic-rest',name:'银河边缘 · 航程休整',width:1100,height:620,mode:'exploration',shipHealth:100,
  mapBounds:{minX:-600,maxX:800,minY:-500,maxY:500},
  players:structuredClone(firstLevel.players).map((p,i)=>({...p,position:i?{x:-100,y:140}:{x:100,y:-140}})) as Level['players'],
  bodies:[createBody({id:'ark',kind:'ship',radius:8,position:{x:0,y:0}}),
    createBody({id:'arrival-beacon',kind:'wormhole',radius:65,position:{x:300,y:0},appearance:{name:'银河边缘信标 · 前往章节选择进入无限探索',color:'#94e9dc'}})],
  mission:{objectives:[],triggers:[],completeOnObjectives:false},
};

/** Explicit development spawn presets; never used by normal chapter transitions. */
export const blackHoleSections = {
  horizon: {position:{x:900,y:-550},velocity:{x:85,y:0},completed:['approach']},
  escape: {position:{x:2850,y:0},velocity:{x:45,y:0},completed:['approach','bypass']},
  capture: {position:{x:0,y:-900},velocity:{x:0,y:0},completed:[],
    nodePositions:[{x:1300,y:0},{x:1320,y:0}]},
};
