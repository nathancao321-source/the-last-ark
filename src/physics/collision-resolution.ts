import type { Body } from '../game/types';
import type { Vec2 } from './vector';
import { capabilities } from '../game/entities';
import { collisionMass } from './collision-policy';
import { speedLimit } from './world';
import { limit } from './vector';
export function inverseMass(b:Body):number {
  // Scripted orbits are contact-kinematic: an impulse must never fight their baseline.
  return capabilities(b).motion==='dynamic'&&!b.orbit?1/collisionMass(b):0;
}
/** Frictionless impulse plus mass-weighted separation. Never inject an impulse
 * for separating contacts; restitution is clamped and speed remains bounded. */
export function resolveContact(a:Body,b:Body,normal:Vec2,penetration:number,docking=false):void {
  const ia=inverseMass(a),ib=inverseMass(b),sum=ia+ib;if(sum===0)return;
  const av=capabilities(a).motion==='static'?{x:0,y:0}:a.velocity;
  const bv=capabilities(b).motion==='static'?{x:0,y:0}:b.velocity;
  const relative=(bv.x-av.x)*normal.x+(bv.y-av.y)*normal.y;
  if(relative<0) {
    const station=a.kind==='station'?a:b;
    const e=Math.min(1,Math.max(0,docking?(station.contact?.restitution??0.35):Math.min(a.contact?.restitution??0.45,b.contact?.restitution??0.45)));
    const impulse=-(1+e)*relative/sum;
    if(ia>0)a.velocity=limit({x:a.velocity.x-impulse*ia*normal.x,y:a.velocity.y-impulse*ia*normal.y},speedLimit(a));
    if(ib>0)b.velocity=limit({x:b.velocity.x+impulse*ib*normal.x,y:b.velocity.y+impulse*ib*normal.y},speedLimit(b));
  }
  const correction=Math.max(0,penetration)+1e-5;
  a.position.x-=normal.x*correction*ia/sum;a.position.y-=normal.y*correction*ia/sum;
  b.position.x+=normal.x*correction*ib/sum;b.position.y+=normal.y*correction*ib/sum;
  // Collision velocity is a new baseline; stale player-velocity decomposition
  // must not re-inject pre-impact energy through later damping.
  for(const body of [a,b])if(inverseMass(body)>0&&body.stabilizationState)body.stabilizationState.playerVelocity={x:0,y:0};
}
