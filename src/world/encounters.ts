import type { GameState } from '../game/types';
import { createBody } from '../game/entities';
import { contains } from './geometry';
import { seededRandom } from './sectors';
import { sub, scale, length } from '../physics/vector';
import type { Rect } from './geometry';
/** The host supplies the actual rendered world rectangle. Birth alone depends on
 * presentation; existing bodies and their fixed-step dynamics never do. A repeat
 * with the same seed and view produces the same encounter. Forecasts omit unspawned waves. */
export function updateEncounters(game: GameState, view: Rect): void {
  if(game.phase!=='running')return;
  const ship=game.bodies.find(b=>b.kind==='ship')!;
  for(const wave of game.level.waves ?? []) {
    if(game.encounters?.includes(wave.id)||!contains(wave.bounds,ship.position))continue;
    (game.encounters??=[]).push(wave.id);
    const random=seededRandom(wave.seed);
    for(let i=0;i<Math.min(4,wave.count);i++) {
      const radius=13+random()*5;
      const margin=Math.max(180,(view.maxX-view.minX)*0.15);
      // Entire circle starts beyond the right edge of the exact final render view.
      // This remains true when players have expanded the camera far beyond the belt.
      const position={x:view.maxX+margin+radius+random()*70,
        y:ship.position.y+(i%2?1:-1)*(170+random()*70)};
      const delta=sub(ship.position,position);
      game.bodies.push(createBody({id:`${wave.id}-${i}`,kind:'asteroid',radius,position,
        velocity:scale(delta,55/length(delta)),emitsGravity:false,gravityRadius:0,stabilization:{halfLife:1},appearance:{name:'接近中的碎石',color:'#9aa3ad'}}));
    }
  }
}
