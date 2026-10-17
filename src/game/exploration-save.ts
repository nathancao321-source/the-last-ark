import type { Body, GameState } from './types';
import type { ProgressStorage } from './progress';
import { createGame, saveCheckpoint } from './game';
import { endlessLevel } from '../levels/endless';
import { MAX_CACHED_CHUNKS, MAX_DISCOVERIES, MAX_LOADED_CHUNKS, MAX_UNIVERSE_BODIES, streamUniverse, type UniverseState } from '../world/universe';
const KEY='the-last-ark.exploration.v1';
const MAX_SAVE_BYTES=2_000_000;
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1e14;
const point=(v:unknown):v is {x:number;y:number}=>!!v&&typeof v==='object'&&finite((v as {x:unknown}).x)&&finite((v as {y:unknown}).y);
const key=(v:unknown)=>point(v)&&Number.isSafeInteger(v.x)&&Number.isSafeInteger(v.y)&&Math.abs(v.x)<=2**40&&Math.abs(v.y)<=2**40;
function validBody(b:Body):boolean {
  return !!b&&typeof b.id==='string'&&b.id.length<100&&['ship','star','planet','asteroid'].includes(b.kind)
    &&point(b.position)&&point(b.velocity)&&finite(b.radius)&&b.radius>0&&b.radius<=100&&finite(b.response)
    &&typeof b.affectedByFields==='boolean'&&(b.kind==='ship'||key(b.chunk))
    &&(!b.orbit||(point(b.orbit.center)&&finite(b.orbit.radius)&&finite(b.orbit.phase)&&finite(b.orbit.angularSpeed)&&finite(b.orbitTime??0)))
    &&(!b.stabilization||(finite(b.stabilization.halfLife)&&b.stabilization.halfLife>0))
    &&(!b.stabilizationState||(point(b.stabilizationState.playerVelocity)&&finite(b.stabilizationState.idleTime)))
    &&['gravityRadius','gravityStrength','gravitySoftening','gravityResponse','maxSpeed','density'].every(k=>!(k in b)||finite(b[k as keyof Body]))
    &&!b.nodeInfluence&&!b.damageZone&&!b.stellar&&!b.displacementLimit;
}
/** One bounded browser-local slot; no account, cloud writes or unbounded travel log. */
export function storeExploration(storage:ProgressStorage,game:GameState):boolean {
  if(!game.universe||game.phase==='failed'||game.phase==='completed')return false;
  const data={version:1,universe:game.universe,bodies:game.bodies,players:game.players,elapsed:game.elapsed,distance:game.distance,health:game.health};
  try {const text=JSON.stringify(data);if(text.length>MAX_SAVE_BYTES)return false;storage.setItem(KEY,text);return true;}catch{return false;}
}
export function loadExploration(storage:ProgressStorage):GameState|undefined {
  try {
    const text=storage.getItem(KEY);if(!text||text.length>MAX_SAVE_BYTES)return;
    const d=JSON.parse(text),u=d.universe as UniverseState;
    if(d.version!==1||!u||u.version!==1||!key(u.origin)||!Number.isSafeInteger(u.seed)||u.seed<0||u.seed>4294967295||!finite(d.elapsed)||d.elapsed<0||!finite(d.distance)||d.distance<0)return;
    if(!Array.isArray(u.loaded)||u.loaded.length>MAX_LOADED_CHUNKS||!u.loaded.every(key)||!Array.isArray(u.cache)||u.cache.length>MAX_CACHED_CHUNKS)return;
    if(!u.cache.every(c=>key(c.key)&&Array.isArray(c.bodies)&&c.bodies.length<=6&&c.bodies.every(validBody)))return;
    if(!Array.isArray(u.discoveries)||u.discoveries.length>MAX_DISCOVERIES||!u.discoveries.every(v=>key(v.key)&&['triple','nebula'].includes(v.kind)))return;
    if(!Array.isArray(d.bodies)||d.bodies.length>MAX_UNIVERSE_BODIES||!d.bodies.every(validBody)||d.bodies.filter((b:Body)=>b.kind==='ship'&&b.id==='ark').length!==1)return;
    if(new Set(d.bodies.map((b:Body)=>b.id)).size!==d.bodies.length)return;
    if(new Set(u.loaded.map(k=>`${k.x},${k.y}`)).size!==u.loaded.length)return;
    if(!d.bodies.every((b:Body)=>b.kind==='ship'?b.id==='ark':u.loaded.some(k=>k.x===b.chunk!.x&&k.y===b.chunk!.y)))return;
    if(u.loaded.some(k=>d.bodies.filter((b:Body)=>b.chunk?.x===k.x&&b.chunk?.y===k.y).length>6))return;
    if(!Array.isArray(d.players)||d.players.length!==2||!d.players.every((p:{position:unknown;velocity:unknown})=>p&&point(p.position)&&point(p.velocity)))return;
    if(!d.health||!finite(d.health.current)||d.health.current<=0||d.health.current>100)return;
    const game=createGame({...endlessLevel,seed:u.seed});
    game.universe=u;game.bodies=d.bodies;game.elapsed=d.elapsed;game.distance=d.distance;game.health={current:d.health.current,max:100};
    game.players.forEach((p,i)=>{p.position={...d.players[i].position};p.velocity={...d.players[i].velocity};p.active=false;});
    game.phase='paused';u.notice='已恢复探索存档 · Space 继续；技能开关已关闭';game.message=u.notice;
    streamUniverse(game,true);saveCheckpoint(game,'exploration-save');return game;
  }catch{return;}
}
