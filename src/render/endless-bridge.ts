import type {GameState} from '../game/types';
import type {SceneId} from '../scenes/types';
import type {VisualState} from './spacetime/model';
import {SECTOR_SIZE} from '../world/sectors';
export const enhancedScene=(id:SceneId):boolean=>['tutorial_part_1','tutorial_part_2','solar_system','black_hole','endless'].includes(id);
/** Re-express retained local anchors once when physics rebases. Simulation and
 * camera remain read-only; absolute material coordinates never change. */
export function syncUniverseVisuals(state:VisualState,game:GameState):void {
  if(!game.universe)return;
  const origin={x:game.universe.origin.x*SECTOR_SIZE,y:game.universe.origin.y*SECTOR_SIZE};
  const old=state.worldOrigin;state.worldOrigin=origin;
  if(!old)return;
  const dx=old.x-origin.x,dy=old.y-origin.y;if(!dx&&!dy)return;
  for(const s of state.sources){s.position.x+=dx;s.position.y+=dy;for(let i=0;i<s.history.length;i+=2){s.history[i]+=dx;s.history[i+1]+=dy;}}
  for(const e of state.events){e.origin.x+=dx;e.origin.y+=dy;}
  for(const p of state.portals??[]){p.origin.x+=dx;p.origin.y+=dy;}
  if(state.hazardWave){state.hazardWave.origin.x+=dx;state.hazardWave.origin.y+=dy;}
  if(state.celestial){
    for(const star of Object.values(state.celestial.stars)){star.origin.x+=dx;star.origin.y+=dy;}
    for(const event of [state.celestial.eruption,state.celestial.entry])if(event){event.origin.x+=dx;event.origin.y+=dy;}
  }
}
