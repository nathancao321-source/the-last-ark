import type { Body,Player } from '../game/types';
import type { Vec2 } from './vector';
import { integrate,MAX_ACCELERATION } from './world';
import { firstContact } from './collision-detection';
import { inverseMass,resolveContact } from './collision-resolution';
import { applyCollisionEvent } from '../game/collision-events';
import { hasCollider } from './collision-policy';
export interface ContactStep {
  bodies:Body[]; events:{type:string;a:string;b:string}[]; failure?:string; notice?:string;
  substeps:number; budgetExhausted:boolean; shipDistance:number;
}
/** Curvature error bound a*dt²/8 relative to the smallest physical radius.
 * Includes analytic orbital acceleration; capped work budget for pathological configs. */
export function collisionSubsteps(bodies:Body[],dt:number):number {
  const colliders=bodies.filter(hasCollider);
  const tolerance=Math.max(0.01,Math.min(8,...colliders.map(b=>b.radius))*0.05);
  const acceleration=Math.max(MAX_ACCELERATION,...bodies.map(b=>b.orbit?b.orbit.radius*b.orbit.angularSpeed**2:0));
  return Math.min(16,Math.max(1,Math.ceil(Math.sqrt(acceleration*dt*dt/(8*tolerance)))));
}
/** Gravity stays in the existing Verlet integrator. For each short chord, resolve
 * contacts in earliest-time order, advance all paths to contact, then recompute
 * remaining motion after impulses. This catches secondary collisions in the same step. */
export function integrateContacts(bodies:Body[],players:Player[],dt:number,stabilization=true):ContactStep {
  const result:ContactStep={bodies,events:[],substeps:collisionSubsteps(bodies,dt),budgetExhausted:false,shipDistance:0};
  if(!Number.isFinite(dt)||dt<=0)return result;
  const h=dt/result.substeps;
  for(let s=0;s<result.substeps;s++) {
    const starts=new Map(result.bodies.map(b=>[b.id,{...b.position}]));
    integrate(result.bodies,players,h,stabilization);
    const ends=new Map<string,Vec2>(result.bodies.map(b=>[b.id,{...b.position}]));
    for(const b of result.bodies)b.position={...starts.get(b.id)!};
    let remaining=h,done=false;
    const ignored=new Set<string>();
    const advance=(fraction:number)=>{
      for(const body of result.bodies){
        const end=ends.get(body.id)!,dx=(end.x-body.position.x)*fraction,dy=(end.y-body.position.y)*fraction;
        if(body.kind==='ship')result.shipDistance+=Math.hypot(dx,dy);
        body.position={x:body.position.x+dx,y:body.position.y+dy};
      }
    };
    for(let iteration=0;iteration<32;iteration++) {
      const contact=firstContact(result.bodies,ends,ignored);
      if(!contact){advance(1);done=true;break;}
      const {a,b,time,policy}=contact;
      advance(time);
      remaining*=1-time;
      if(result.events.length<64)result.events.push({type:policy,a:a.id,b:b.id});
      const event=applyCollisionEvent(contact);
      if(event.failure){result.failure=event.failure;return result;}
      if(event.notice)result.notice=event.notice;
      result.bodies=result.bodies.filter(body=>!event.removed.includes(body.id));
      if(policy==='bounce') {
        resolveContact(a,b,contact.normal,contact.penetration);
        if(inverseMass(a)+inverseMass(b)===0)ignored.add([a.id,b.id].sort().join('|'));
      }
      if(policy==='bounce'||policy==='merge')for(const body of [a,b]) {
        if(result.bodies.includes(body)&&inverseMass(body)>0)ends.set(body.id,{x:body.position.x+body.velocity.x*remaining,y:body.position.y+body.velocity.y*remaining});
      }
    }
    // Dense pathological piles stop at the last safe contact for this substep.
    // Keep velocity for the next step; never blindly advance through unresolved bodies.
    if(!done)result.budgetExhausted=true;
  }
  return result;
}
