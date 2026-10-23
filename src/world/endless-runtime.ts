import type {GameState,Body} from '../game/types';
import {generateChunk,chunkId,chunkFeatureCenter} from './generator';
import {planSectors} from './sectors';
import {chunkOffset,translateBody,MAX_LOADED_CHUNKS,MAX_CACHED_CHUNKS} from './universe';
import {defaultExpeditionStore,newWorld,type ExpeditionStore,type ChunkSnapshot,type WorldIdentity} from './cold-store';

interface Runtime {store:ExpeditionStore;pending?:Promise<void>;error?:string;fresh:boolean;cancelled:boolean;demand?:string;ticket:number}
const runtimes=new WeakMap<GameState,Runtime>(),previews=new WeakSet<GameState>();
export function attachExpeditionStore(game:GameState,store=defaultExpeditionStore(),fresh=false):void {runtimes.set(game,{store,fresh,cancelled:false,ticket:0});}
export function cancelExpedition(game:GameState|undefined):void {if(!game)return;const rt=runtimes.get(game);if(rt)rt.cancelled=true;}
export function markExpeditionPreview(game:GameState):void {previews.add(game);}
export function expeditionRuntime(game:GameState):Runtime {
 let rt=runtimes.get(game);if(!rt){attachExpeditionStore(game,undefined,!game.universe!.cold);rt=runtimes.get(game)!;}return rt;
}
export async function settleExpedition(game:GameState):Promise<void>{const rt=expeditionRuntime(game);while(rt.pending)await rt.pending;if(rt.error)throw Error(rt.error);}
export function expeditionBlocked(game:GameState):boolean {const rt=runtimes.get(game);return !!rt&&(!!rt.pending||!!rt.error||rt.cancelled);}
export function expeditionError(game:GameState,error:unknown):void {
 const rt=expeditionRuntime(game);rt.error=error instanceof Error?error.message:String(error);game.phase='paused';game.message=game.universe!.notice=`探索已暂停：${rt.error} · L 恢复上次保存；R 开始同 Seed 新远征`;
}
export function activeSnapshots(game:GameState):ChunkSnapshot[]{
 const u=game.universe!;return u.loaded.map(key=>{const offset=chunkOffset(key,u.origin),bodies=structuredClone(game.bodies.filter(b=>b.chunk&&chunkId(b.chunk)===chunkId(key)));bodies.forEach(b=>translateBody(b,{x:-offset.x,y:-offset.y}));return {key:{...key},bodies};});
}
function decorations(game:GameState):void {
 const u=game.universe!,ship=game.bodies[0];game.level.decorations=u.loaded.flatMap(key=>{const offset=chunkOffset(key,u.origin);return generateChunk(u.seed,key,3).decorations.map(d=>({...d,position:{x:d.position.x+offset.x,y:d.position.y+offset.y}}));});
 game.level.mapBounds={minX:ship.position.x-3500,maxX:ship.position.x+3500,minY:ship.position.y-3500,maxY:ship.position.y+3500};
 for(const key of u.loaded){const c=generateChunk(u.seed,key,3);if(!c.feature||u.discoveries.some(d=>chunkId(d.key)===chunkId(key)))continue;const center=chunkFeatureCenter(u.seed,key,3),offset=chunkOffset(key,u.origin);if(![ship,...game.players].some(b=>Math.hypot(b.position.x-offset.x-center.x,b.position.y-offset.y-center.y)<750))continue;u.discoveries.push({key:{...key},kind:c.feature});u.discoveries=u.discoveries.slice(-64);u.notice=c.feature==='triple'?'发现：三日凌空 · 三颗恒星真实共舞':'发现：遥远的紫色星云';}
}
function localBodies(game:GameState,snapshot:ChunkSnapshot):Body[]{
 const u=game.universe!,offset=chunkOffset(snapshot.key,u.origin),ship=game.bodies[0],bodies=structuredClone(snapshot.bodies);
 for(const b of bodies){translateBody(b,offset);if(Math.hypot(b.position.x-ship.position.x,b.position.y-ship.position.y)<b.radius+ship.radius+120)b.spawnPending=true;}return bodies;
}
/** Freeze simulation at a fixed-step boundary during disk reads/writes. Objects
 * are neither removed before commit nor temporarily regenerated while reading. */
export function streamExpedition(game:GameState,force=false):boolean {
 const u=game.universe!,rt=expeditionRuntime(game);if(rt.cancelled||rt.error||rt.pending)return false;
 const foci=[game.bodies[0].position,...game.players.map(p=>p.position)];
 const wanted=planSectors(foci).map(k=>({x:k.x+u.origin.x,y:k.y+u.origin.y})),ids=new Set(wanted.map(chunkId));
 for(const b of game.bodies){
  if(b.spawnPending&&Math.hypot(b.position.x-foci[0].x,b.position.y-foci[0].y)>b.radius+game.bodies[0].radius+120)delete b.spawnPending;
  if(b.chunk&&!ids.has(chunkId(b.chunk))&&foci.some(p=>Math.hypot(p.x-b.position.x,p.y-b.position.y)<(b.gravityRadius??120)+400)){wanted.push({...b.chunk});ids.add(chunkId(b.chunk));}
 }
 if(wanted.length>MAX_LOADED_CHUNKS){expeditionError(game,Error('附近动态天体超过加载预算，请恢复或开始新远征'));return false;}
 const demand=wanted.map(chunkId).sort().join(';');
 const previous=new Set(u.loaded.map(chunkId)),changed=force||rt.demand!==demand;
 if(previews.has(game))return wanted.every(k=>previous.has(chunkId(k)));
 if(!changed){decorationsDiscovery(game);return true;}
 if(!u.cold)u.cold=newWorld(u.seed);
 if(rt.fresh&&u.loaded.length===0){
  u.loaded=wanted;for(const key of wanted)game.bodies.push(...localBodies(game,{key,bodies:generateChunk(u.seed,key,3).bodies}));rt.fresh=false;rt.demand=demand;decorations(game);return true;
 }
 const world:WorldIdentity={...u.cold},before=activeSnapshots(game),notice=u.notice;
 u.notice='正在读取远征区域…';
 const ticket=++rt.ticket;let timer:ReturnType<typeof setTimeout>;
 const work=(async()=>{
  const records=await rt.store.read(world,wanted),byId=new Map(records.map(r=>[chunkId(r.key),r]));
  const final=[...wanted];for(const r of records)if(!ids.has(chunkId(r.key))){ids.add(chunkId(r.key));final.push(r.key);}
  if(final.length>MAX_LOADED_CHUNKS)throw Error('移动天体索引超过 54 块预算，已保留当前世界');
  const unloaded=before.filter(s=>!ids.has(chunkId(s.key)));
  // Successful disk commit is the release barrier for the only live snapshot.
  const stats=await rt.store.write(world,unloaded);
  if(rt.cancelled||rt.ticket!==ticket||u.cold?.id!==world.id||u.cold.epoch!==world.epoch)return;
  const retained=game.bodies.filter(b=>!b.chunk||ids.has(chunkId(b.chunk)));
  for(const key of final)if(!previous.has(chunkId(key))){const snapshot=byId.get(chunkId(key))??u.cache.find(c=>chunkId(c.key)===chunkId(key))??{key,bodies:generateChunk(u.seed,key,3).bodies};retained.push(...localBodies(game,snapshot));}
  if(retained.length>325)throw Error('活跃实体超过 325 体预算');
  game.bodies=retained;u.loaded=final;u.cache=[...u.cache.filter(c=>!ids.has(chunkId(c.key))&&!unloaded.some(s=>chunkId(s.key)===chunkId(c.key))),...unloaded].slice(-MAX_CACHED_CHUNKS);
  rt.demand=demand;u.coldStats=stats;u.notice=notice;decorations(game);
 })();
 rt.pending=Promise.race([work,new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>{rt.ticket++;reject(Error('区域存储响应超过 10 秒，已保留现场'));},10000);})]).catch(error=>{if(!rt.cancelled)expeditionError(game,error);}).finally(()=>{clearTimeout(timer);rt.pending=undefined;});
 return false;
}
/** Discovery is cheap and independent of texture generation. */
function decorationsDiscovery(game:GameState):void {
 const u=game.universe!,ship=game.bodies[0];game.level.mapBounds={minX:ship.position.x-3500,maxX:ship.position.x+3500,minY:ship.position.y-3500,maxY:ship.position.y+3500};
 for(const key of u.loaded){if(u.discoveries.some(d=>chunkId(d.key)===chunkId(key)))continue;const o=chunkOffset(key,u.origin),center=chunkFeatureCenter(u.seed,key,3);if(![ship,...game.players].some(b=>Math.hypot(b.position.x-o.x-center.x,b.position.y-o.y-center.y)<750))continue;const feature=generateChunk(u.seed,key,3).feature;if(feature){u.discoveries.push({key:{...key},kind:feature});u.discoveries=u.discoveries.slice(-64);u.notice=feature==='triple'?'发现：三日凌空 · 三颗恒星真实共舞':'发现：遥远的紫色星云';}}
}
