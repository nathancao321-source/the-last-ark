import type { Body, GameState } from '../game/types';
import type { Vec2 } from '../physics/vector';
import { length, sub } from '../physics/vector';
import { planSectors, SECTOR_SIZE, sectorAt, type SectorKey } from './sectors';
import { chunkId, generateChunk, landmarks, type DiscoveryKind } from './generator';

export const MAX_LOADED_CHUNKS=54, MAX_CACHED_CHUNKS=32, MAX_DISCOVERIES=64;
export const MAX_UNIVERSE_BODIES=MAX_LOADED_CHUNKS*6+1;
interface ChunkSnapshot { key:SectorKey; bodies:Body[] }
export interface UniverseState {
  version:1; seed:number; origin:SectorKey; loaded:SectorKey[]; cache:ChunkSnapshot[];
  discoveries:{key:SectorKey;kind:DiscoveryKind}[]; notice:string;
}
export function worldChunk(game:GameState,position:Vec2):SectorKey {
  const local=sectorAt(position),origin=game.universe!.origin;
  return {x:origin.x+local.x,y:origin.y+local.y};
}
export function chunkOffset(key:SectorKey,origin:SectorKey):Vec2 {
  return {x:(key.x-origin.x)*SECTOR_SIZE,y:(key.y-origin.y)*SECTOR_SIZE};
}
export function translateBody(body:Body,delta:Vec2):void {
  body.position.x+=delta.x;body.position.y+=delta.y;
  if(body.orbit){body.orbit.center.x+=delta.x;body.orbit.center.y+=delta.y;}
  if(body.displacementLimit){body.displacementLimit.center.x+=delta.x;body.displacementLimit.center.y+=delta.y;}
}
/** Rebase in integer chunk increments. Velocities, distances, cached chunk-local
 * data and checkpoints never change. Caller shifts camera/input into the same frame. */
export function rebaseUniverse(game:GameState):Vec2 {
  const u=game.universe!,ship=game.bodies.find(b=>b.kind==='ship')!;
  if(Math.max(Math.abs(ship.position.x),Math.abs(ship.position.y))<SECTOR_SIZE*4)return {x:0,y:0};
  const key=sectorAt(ship.position),delta={x:-key.x*SECTOR_SIZE,y:-key.y*SECTOR_SIZE};
  u.origin.x+=key.x;u.origin.y+=key.y;
  for(const body of game.bodies)translateBody(body,delta);
  for(const p of game.players){p.position.x+=delta.x;p.position.y+=delta.y;}
  return delta;
}
export function initializeUniverse(game:GameState):void {
  game.universe={version:1,seed:game.level.seed??20261017,origin:{x:0,y:0},loaded:[],cache:[],discoveries:[],notice:'自由探索 · H / J 召回节点 · K 保存 · L 恢复 · M 附近星图'};
  streamUniverse(game,true);
}
/** Demand depends only on simulation positions. Three 3x3 neighborhoods; retain
 * home chunks of nearby displaced bodies up to a second bounded budget. */
export function streamUniverse(game:GameState,force=false):void {
  const u=game.universe!;
  const ship=game.bodies.find(b=>b.kind==='ship')!,foci=[ship.position,...game.players.map(p=>p.position)];
  for(const b of game.bodies)if(b.spawnPending&&length(sub(b.position,ship.position))>b.radius+ship.radius+120)delete b.spawnPending;
  const wanted=planSectors(foci).map(k=>({x:k.x+u.origin.x,y:k.y+u.origin.y}));
  const wantedIds=new Set(wanted.map(chunkId));
  for(const b of game.bodies)if(b.chunk&&!wantedIds.has(chunkId(b.chunk))&&foci.some(p=>length(sub(p,b.position))<1000)&&wanted.length<MAX_LOADED_CHUNKS) {
    wanted.push({...b.chunk});wantedIds.add(chunkId(b.chunk));
  }
  const previous=new Set(u.loaded.map(chunkId));
  const changed=force||wanted.length!==u.loaded.length||wanted.some(k=>!previous.has(chunkId(k)));
  if(changed) {
    for(const key of u.loaded)if(!wantedIds.has(chunkId(key))) {
      const offset=chunkOffset(key,u.origin),bodies=structuredClone(game.bodies.filter(b=>b.chunk&&chunkId(b.chunk)===chunkId(key)));
      bodies.forEach(b=>translateBody(b,{x:-offset.x,y:-offset.y}));
      u.cache=u.cache.filter(c=>chunkId(c.key)!==chunkId(key));u.cache.push({key:{...key},bodies});
    }
    game.bodies=game.bodies.filter(b=>!b.chunk||wantedIds.has(chunkId(b.chunk)));
    for(const key of wanted)if(!previous.has(chunkId(key))) {
      const cached=u.cache.find(c=>chunkId(c.key)===chunkId(key));
      const bodies=cached?cached.bodies:generateChunk(u.seed,key).bodies;
      u.cache=u.cache.filter(c=>chunkId(c.key)!==chunkId(key));
      const offset=chunkOffset(key,u.origin);
      for(const b of bodies) {
        translateBody(b,offset);
        // Reloading a displaced cached body must not create a lethal object on top of the ship.
        // Keep its saved position; defer physics until safely separated, never move the ship.
        if(length(sub(b.position,ship.position))<b.radius+ship.radius+120)b.spawnPending=true;
        game.bodies.push(b);
      }
    }
    u.cache=u.cache.slice(-MAX_CACHED_CHUNKS);u.loaded=wanted;
    game.level.decorations=wanted.flatMap(key=>{const offset=chunkOffset(key,u.origin);return generateChunk(u.seed,key).decorations.map(d=>({...d,position:{x:d.position.x+offset.x,y:d.position.y+offset.y}}));});
  }
  // Navigation displays loaded neighborhoods only, never historical travel extents.
  game.level.mapBounds={minX:ship.position.x-3500,maxX:ship.position.x+3500,minY:ship.position.y-3500,maxY:ship.position.y+3500};
  for(const key of wanted) {
    const offset=chunkOffset(key,u.origin);
    if(!foci.some(p=>Math.hypot(p.x-offset.x-1024,p.y-offset.y-1024)<750))continue;
    if(u.discoveries.some(d=>chunkId(d.key)===chunkId(key)))continue;
    const feature=generateChunk(u.seed,key).feature;
    if(feature){u.discoveries.push({key:{...key},kind:feature});u.discoveries=u.discoveries.slice(-MAX_DISCOVERIES);u.notice=feature==='triple'?'发现：三日凌空 · 三颗恒星共舞；保持安全距离，观察引力变化':'发现：遥远的紫色星云 · 群星之间，仍有未见之境';game.message=u.notice;}
  }
}
export function recallNode(game:GameState,index:0|1):boolean {
  if(!game.universe||game.phase==='failed'||game.phase==='completed')return false;
  const p=game.players[index],ship=game.bodies.find(b=>b.kind==='ship')!;
  p.position={x:ship.position.x+(index?-110:110),y:ship.position.y+(index?100:-100)};
  p.velocity={...ship.velocity};p.active=false;delete p.capture;
  game.universe.notice=`P${index+1} 已回到方舟附近（方舟运动未改变）`;streamUniverse(game);return true;
}
export function explorationText(game:GameState):string {
  const u=game.universe!,key=worldChunk(game,game.bodies.find(b=>b.kind==='ship')!.position),known=landmarks(u.seed);
  return `Seed ${u.seed} · 区块 (${key.x},${key.y}) · 已载入 ${u.loaded.length}/${MAX_LOADED_CHUNKS} · 天体 ${game.bodies.length}/${MAX_UNIVERSE_BODIES} · 发现 ${u.discoveries.length}\n线索：三日系统 (${known.triple.x},${known.triple.y})；遥远星云 (${known.nebula.x},${known.nebula.y}) · 每区块 ${SECTOR_SIZE} 单位`;
}
