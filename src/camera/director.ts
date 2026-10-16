import type { GameState } from '../game/types';
import type { CameraFocus } from './camera';
import { length, sub } from '../physics/vector';

/** Nearby chapter landmarks bias composition, never steering or teleporting entities. */
export function cameraFocus(game: GameState): CameraFocus | undefined {
  const ship=game.bodies.find(body=>body.kind==='ship');
  if(!ship)return;
  let selected: CameraFocus | undefined;
  for(const entry of game.level.cameraLandmarks??[]) {
    const body=game.bodies.find(body=>body.id===entry.entityId&&body.layer!=='hidden');
    if(!body)continue;
    const proximity=1-length(sub(ship.position,body.position))/entry.range;
    if(proximity<=0)continue;
    // Full focus in the inner 60% of the activation radius, smoothly fading outside.
    const t=Math.min(1,proximity/0.4),weight=t*t*(3-2*t);
    if(!selected||weight>selected.weight)selected={position:{...body.position},radius:body.stellar?.burnRadius??body.radius,weight,showDeadZone:entry.showDeadZone};
  }
  return selected;
}
