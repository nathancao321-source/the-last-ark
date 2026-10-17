import type { Body, Level } from '../game/types';
import { createBody } from '../game/entities';
/** Deterministic development fixtures, not campaign levels or runtime teleports. */
export function collisionFixture(base:Level,section:string):Level|undefined {
  if(!['collision-bounce','collision-ccd','collision-dock','collision-dock-slow'].includes(section))return;
  const level=structuredClone(base);
  level.id=section;level.name='碰撞验收 / '+section;delete level.scoring;delete level.port;delete level.mission;
  const make=(id:string,kind:Body['kind'],x:number,y:number,radius:number,vx=0)=>createBody({id,kind,position:{x,y},radius,velocity:{x:vx,y:0},emitsGravity:false,receivesGravity:false});
  level.players.forEach((p,i)=>{p.position={x:i?700:400,y:180};});
  if(section==='collision-bounce') {
    level.bodies=[make('ark','ship',550,450,8),make('contact-a','asteroid',450,320,20,100),make('contact-b','asteroid',650,320,20,-100)];
  }else if(section==='collision-ccd') {
    level.bodies=[make('ark','ship',550,340,.5,240),make('contact-target','asteroid',552.2,340,.5)];
  }else {
    level.bodies=[make('ark','ship',section.endsWith('slow')?650:300,340,8,section.endsWith('slow')?30:240),make('station','station',750,340,68)];
    level.mission={objectives:[{id:'dock',label:'低速入港 ≤48；超速碰撞退开',condition:{type:'near_entity',entityId:'ark',targetId:'station',maxSpeed:48,fullContainment:true}}],triggers:[]};
  }
  return level;
}
