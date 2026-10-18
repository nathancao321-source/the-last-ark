import type { GameState } from '../game/types';
import { createControls } from '../input/intent';
import { add,sub,scale,length,limit } from '../physics/vector';
import { fieldAcceleration } from '../physics/fields';
import { bodyGravity } from '../physics/gravity';

/** DEV-only reproducible controller. Emits exactly the ordinary mouse-target /
 * finite-acceleration intents; never edits the ship, health, clock or celestial bodies. */
export function escortPilot(kind:'solar'|'black-hole') {
  const route=kind==='solar'?[{x:450,y:-600},{x:1000,y:-620},{x:1450,y:-580},{x:2100,y:-620},{x:3000,y:-620},{x:4170,y:-620},{x:4900,y:0},{x:5480,y:0}]:
    [{x:450,y:-580},{x:1050,y:-620},{x:1700,y:-620},{x:2200,y:-520},{x:2630,y:-150},{x:3100,y:0}];
  let stage=0;
  return (game:GameState)=>{
    const ship=game.bodies.find(b=>b.kind==='ship')!;
    if(length(sub(route[stage],ship.position))<(kind==='solar'?120:100)&&stage<route.length-1)stage++;
    const delta=sub(route[stage],ship.position),speed=stage===route.length-1?45:kind==='solar'?120:75;
    const desired=scale(delta,speed/Math.max(1,length(delta)));
    let environment={x:0,y:0};
    for(const body of game.bodies)if(body!==ship&&body.emitsGravity!==false)environment=add(environment,fieldAcceleration(ship.position,body.position,bodyGravity(body,ship)));
    const acceleration=limit(scale(sub(desired,ship.velocity),1.2),60),power=length(sub(acceleration,environment));
    const direction=scale(sub(acceleration,environment),1/Math.max(power,1e-9));
    const intents=game.players.map((p,i)=>{
      const actual=fieldAcceleration(ship.position,p.position,p.field);
      return {targetWorldPosition:add(ship.position,scale(direction,i?-160:135)),abilityActive:actual.x*direction.x+actual.y*direction.y>length(actual)*.5&&power>(i?23:6)};
    });
    return createControls(intents[0],intents[1]);
  };
}
