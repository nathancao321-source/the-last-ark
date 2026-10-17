import type { Body } from './types';
import { capabilities } from './entities';
import { collisionMass } from '../physics/collision-policy';
import type { DetectedContact } from '../physics/collision-detection';
import { limit } from '../physics/vector';
import { speedLimit } from '../physics/world';
export interface CollisionOutcome { removed:string[]; failure?:string; notice?:string }
/** Destructive/mission events are intentionally distinct from elastic resolution. */
export function applyCollisionEvent(contact:DetectedContact):CollisionOutcome {
  const {a,b,policy}=contact;
  if(policy==='ship-fail') {
    const hazard=a.kind==='ship'?b:a;
    return {removed:[],failure:capabilities(hazard).collision==='capture'?hazard.captureMessage??'飞船被吞噬':`飞船撞击危险天体：${hazard.appearance?.name??hazard.kind}`};
  }
  if(policy==='large-fail')return {removed:[],failure:'大型天体碰撞：任务失败'};
  if(policy==='absorb-a'||policy==='absorb-b')return {removed:[policy==='absorb-a'?a.id:b.id],notice:'天体碰撞 · 较小天体被吸收 / 摧毁'};
  if(policy==='merge') {
    const ma=collisionMass(a),mb=collisionMass(b),keep:Body=ma>=mb?a:b,drop=keep===a?b:a;
    const fixed=capabilities(keep).motion==='static';
    if(!fixed){keep.position={x:(a.position.x*ma+b.position.x*mb)/(ma+mb),y:(a.position.y*ma+b.position.y*mb)/(ma+mb)};
      keep.velocity=limit({x:(a.velocity.x*ma+b.velocity.x*mb)/(ma+mb),y:(a.velocity.y*ma+b.velocity.y*mb)/(ma+mb)},speedLimit(keep));keep.motion='dynamic';}
    keep.radius=Math.cbrt(a.radius**3+b.radius**3);keep.contact={...keep.contact,mass:ma+mb};
    delete keep.orbit;delete keep.orbitTime;delete keep.displacementLimit;delete keep.stabilizationState;
    return {removed:[drop.id],notice:'大型天体碰撞 · 已合并，原轨道基线解除'};
  }
  return {removed:[]};
}
