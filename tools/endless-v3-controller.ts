import type {GameState,Controls} from '../src/game/types';
import {fieldAcceleration} from '../src/physics/fields';
import {bodyGravity} from '../src/physics/gravity';
import {capabilities} from '../src/game/entities';
import {add,sub,scale,limit,length} from '../src/physics/vector';
/** Reproducible test pilot through the same target intents used by mouse input.
 * It commands nodes, never edits a body position, velocity, force or speed cap.
 * Hold the horizontal seam, regulating speed against actual local gravity. */
export function cruiseControls(game:GameState):Controls {
 const ship=game.bodies[0],absoluteY=ship.position.y+game.universe!.origin.y*2048;
 let targetY=0,nearest=Infinity;
 // Predict a nearby moving collision disk and choose an exterior waypoint.
 // This is a test controller's observation, not a world generation condition.
 for(const b of game.bodies)if(b!==ship&&b.chunk){
  const dx=b.position.x-ship.position.x,t=Math.max(0,Math.min(7,dx/130)),predictedY=b.position.y+b.velocity.y*t+game.universe!.origin.y*2048;
  if(dx> -100&&dx<950&&Math.abs(predictedY-absoluteY)<b.radius+260&&dx<nearest){nearest=dx;targetY=predictedY+(absoluteY<predictedY?-1:1)*(b.radius+310);}
 }
 const desired={x:nearest<200?90:130,y:Math.max(-100,Math.min(100,(targetY-absoluteY)*.8))};
 let environment={x:0,y:0};for(const b of game.bodies)if(b!==ship&&capabilities(b).gravity)environment=add(environment,fieldAcceleration(ship.position,b.position,bodyGravity(b,ship)));
 const acceleration=sub(limit(scale(sub(desired,ship.velocity),1.2),60),environment),power=length(acceleration),direction=scale(acceleration,1/Math.max(power,1e-9));
 const players=game.players.map((p,i)=>{const actual=fieldAcceleration(ship.position,p.position,p.field),active=actual.x*direction.x+actual.y*direction.y>length(actual)*.5&&power>(i?23:6);return {moveX:0,moveY:0,targetWorldPosition:add(ship.position,scale(direction,i?-160:135)),abilityActive:active};});
 return {players:[players[0],players[1]]};
}
