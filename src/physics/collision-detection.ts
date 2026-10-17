import type { Body } from '../game/types';
import type { Vec2 } from './vector';
import { sweptCircle,type CircleContact } from './collision';
import { contactPolicy,contactRadius,hasCollider,type ContactPolicy } from './collision-policy';
import { SpatialIndex } from '../world/spatial-index';
import { sweptBounds } from '../world/geometry';
export interface DetectedContact extends CircleContact { a:Body; b:Body; policy:ContactPolicy }
export function firstContact(bodies:Body[],ends:Map<string,Vec2>,ignored:Set<string>):DetectedContact|undefined {
  const index=new SpatialIndex<number>();
  bodies.forEach((b,i)=>{if(hasCollider(b))index.insert(i,sweptBounds(b.position,ends.get(b.id)!,contactRadius(b)));});
  let first:DetectedContact|undefined;
  bodies.forEach((a,i)=>{
    if(!hasCollider(a))return;
    for(const j of index.query(sweptBounds(a.position,ends.get(a.id)!,contactRadius(a)))) {
      if(j<=i)continue;
      const b=bodies[j],pair=[a.id,b.id].sort().join('|');if(ignored.has(pair))continue;
      const policy=contactPolicy(a,b);if(policy==='ignore')continue;
      const contact=sweptCircle(a.position,ends.get(a.id)!,b.position,ends.get(b.id)!,contactRadius(a)+contactRadius(b));
      if(!contact)continue;
      if(policy==='bounce'&&contact.time===0&&contact.penetration<1e-5) {
        const ae=ends.get(a.id)!,be=ends.get(b.id)!;
        if(((be.x-b.position.x)-(ae.x-a.position.x))*contact.normal.x+((be.y-b.position.y)-(ae.y-a.position.y))*contact.normal.y>=-1e-9)continue;
      }
      if(!first||contact.time<first.time-1e-9)first={...contact,a,b,policy};
    }
  });
  return first;
}
