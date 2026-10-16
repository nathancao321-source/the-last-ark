import type { Body, Player } from '../game/types';
import type { PlayerControlIntent } from '../input/intent';
import { applyPlayerIntent, type NodeEnvironment } from './player';
import { add, sub, scale, length, limit } from './vector';
import { bodyGravity } from './gravity';
import { fieldAcceleration } from './fields';
import { sweptOverlap } from './collision';

/** Opt-in projection coupling. Ordinary planets/stars still cannot move nodes.
 * The SUM is capped, even with overlapping holes or altered development controls. */
export function nodeEnvironment(player: Player, bodies: Body[]): NodeEnvironment | undefined {
  let acceleration={x:0,y:0},ratio=0.9,steeringSeconds=0;
  for (const source of bodies) {
    const config=source.nodeInfluence;
    if (!config || source.layer==='hidden' || source.emitsGravity===false) continue;
    const force=scale(fieldAcceleration(player.position,source.position,bodyGravity(source)),Math.max(0,config.gravityMultiplier));
    if(length(force)<1e-8)continue;
    acceleration=add(acceleration,force);
    ratio=Math.min(ratio,Math.max(0,config.maxAccelerationRatio));
    steeringSeconds=Math.max(steeringSeconds,config.steeringSeconds);
  }
  if(length(acceleration)<1e-8)return;
  return {acceleration:limit(acceleration,Math.max(0,player.acceleration)*ratio),steeringSeconds};
}

/** Shared simulation clock: jets start at period, 2*period, ... even with no cargo. */
export function gammaJetProgress(time: number, period: number, duration: number): number | undefined {
  if(time+1e-9<period)return;
  const age=time-Math.floor((time+1e-9)/period)*period;
  return age < duration ? Math.max(0,age)/duration : undefined;
}

/** Captured projections lose their field, wait for the next periodic pulse, then travel
 * along a scripted gamma jet before reforming. This fiction affects nodes ONLY:
 * the ship and ordinary matter still die inside the event horizon. */
export function stepNode(player: Player, intent: PlayerControlIntent, bodies: Body[], dt: number, running: boolean, time=0): void {
  if(!Number.isFinite(dt)||dt<=0)return;
  if(player.capture) {
    const state=player.capture,source=bodies.find(b=>b.id===state.sourceId),config=source?.nodeInfluence;
    state.abilityActive=intent.abilityActive;
    player.active=false;player.velocity={x:0,y:0};
    if(!source || !config || source.layer==='hidden') {delete player.capture;return;}
    if(!running)return; // Pause/ready freezes countdown AND jet; free nodes remain deployable.
    state.elapsed+=dt;
    if(state.phase==='captured') {
      player.position={...source.position};
      if(time+dt+1e-9<state.releaseAt)return;
      state.elapsed=Math.max(0,time+dt-state.releaseAt);state.phase='jet';
      state.origin={...source.position};
      const distance=Math.max(config.ejectionDistance,(source.damageZone?.radius??source.captureRadius??source.radius)+player.radius+50);
      state.destination={x:source.position.x+(player.id==='attractor'?-24:24),y:source.position.y-distance};
    }
    if(state.phase==='jet') {
      const t=Math.min(1,state.elapsed/Math.max(dt,config.jetSeconds));
      player.position=add(state.origin,scale(sub(state.destination,state.origin),t));
      if(t<1-1e-9)return;
      state.phase='reforming';state.elapsed=Math.max(0,state.elapsed-config.jetSeconds);
    }
    player.position={...state.destination};
    if(state.elapsed+1e-9>=config.reformSeconds)delete player.capture;
    return;
  }
  const previous={...player.position};
  applyPlayerIntent(player,intent,dt,running?nodeEnvironment(player,bodies):undefined);
  for(const source of bodies) {
    if(!source.nodeInfluence || source.layer==='hidden' || source.collision!=='capture')continue;
    if(!sweptOverlap(previous,player.position,source.position,source.position,(source.captureRadius??source.radius)+player.radius))continue;
    const period=source.nodeInfluence.jetPeriod;
    // Crossing on a pulse boundary misses that pulse; no per-player countdown resets the source.
    const capturedAt=time+(running?dt:0);
    player.capture={sourceId:source.id,phase:'captured',elapsed:0,releaseAt:(Math.floor((capturedAt+1e-9)/period)+1)*period,
      abilityActive:intent.abilityActive,origin:{...player.position},destination:{...source.position}};
    player.position={...source.position};player.velocity={x:0,y:0};player.active=false;
    break;
  }
}
