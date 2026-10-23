import type {GameState,Body} from './types';
import {createGame,saveCheckpoint} from './game';
import {endlessLevel} from '../levels/endless';
import {activeSnapshots,attachExpeditionStore,expeditionRuntime,expeditionError,settleExpedition} from '../world/endless-runtime';
import {defaultExpeditionStore,validKey,validSnapshot,payloadBytes,type ExpeditionStore,type SavedExpedition} from '../world/cold-store';
import {chunkId} from '../world/generator';
const point=(v:{x:number;y:number})=>!!v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Math.max(Math.abs(v.x),Math.abs(v.y))<1e14;
interface Manifest {format:3;universe:NonNullable<GameState['universe']>;bodies:Body[];players:GameState['players'];elapsed:number;distance:number;health:GameState['health']}
function decode(text:string):Manifest|undefined {
 try{
  if(payloadBytes(text)>2_000_000)return;const d=JSON.parse(text) as Manifest,u=d.universe;
  if(d.format!==3||!u||u.version!==1||u.generatorVersion!==3||!u.cold||u.cold.version!==3||typeof u.cold.id!=='string'||u.cold.id.length>100||u.cold.seed!==u.seed||!Number.isSafeInteger(u.cold.epoch)||u.cold.epoch<0||!Number.isSafeInteger(u.seed)||u.seed<0||u.seed>4294967295||!validKey(u.origin))return;
  if(!Array.isArray(u.loaded)||u.loaded.length>54||!u.loaded.every(validKey)||new Set(u.loaded.map(chunkId)).size!==u.loaded.length||!Array.isArray(u.cache)||u.cache.length>32||!u.cache.every(validSnapshot))return;
  if(!Array.isArray(u.discoveries)||u.discoveries.length>64||!u.discoveries.every(p=>validKey(p.key)&&['triple','nebula'].includes(p.kind)))return;
  if(!Array.isArray(d.bodies)||d.bodies.length>325||new Set(d.bodies.map(b=>b.id)).size!==d.bodies.length)return;
  const ship=d.bodies.filter(b=>b.kind==='ship');if(ship.length!==1||ship[0].id!=='ark'||ship[0].radius!==8||!point(ship[0].position)||!point(ship[0].velocity))return;
  if(!d.bodies.every(b=>b.kind==='ship'||(b.chunk&&u.loaded.some(k=>chunkId(k)===chunkId(b.chunk!)))))return;
  const fake={universe:u,bodies:d.bodies} as GameState;if(!activeSnapshots(fake).every(validSnapshot))return;
  if(!Array.isArray(d.players)||d.players.length!==2||!d.players.every(p=>point(p.position)&&point(p.velocity)))return;
  if(![d.elapsed,d.distance].every(n=>Number.isFinite(n)&&n>=0)||!d.health||!(d.health.current>0&&d.health.current<=100))return;
  return d;
 }catch{return;}
}
export async function storeExplorationV3(game:GameState):Promise<boolean>{
 if(game.universe?.generatorVersion!==3||game.phase==='failed'||game.phase==='completed')return false;
 const rt=expeditionRuntime(game);
 try{
  await settleExpedition(game);while(rt.pending)await settleExpedition(game);if(rt.cancelled)return false;
  const data:Manifest={format:3,universe:game.universe,bodies:game.bodies,players:game.players,elapsed:game.elapsed,distance:game.distance,health:game.health};
  const manifest=JSON.stringify(data);if(!decode(manifest))throw Error('当前远征状态未通过保存校验');
  rt.pending=rt.store.save({...game.universe.cold!},[...game.universe.cache,...activeSnapshots(game)],manifest);
  await rt.pending;if(rt.cancelled)return false;saveCheckpoint(game,'exploration-v3-save');return true;
 }catch(error){if(!rt.cancelled)expeditionError(game,error);return false;}finally{rt.pending=undefined;}
}
export async function loadExplorationV3(store:ExpeditionStore=defaultExpeditionStore()):Promise<GameState|undefined>{
 const saved=await store.restore((text,world)=>{const d=decode(text);return !!d&&d.universe.cold!.id===world.id&&d.universe.seed===world.seed&&world.version===3&&Number.isSafeInteger(world.epoch)&&world.epoch>=0;});if(!saved)return;return restoreManifest(saved,store);
}
function restoreManifest(saved:SavedExpedition,store:ExpeditionStore):GameState {
 const d=decode(saved.manifest)!;if(d.universe.cold!.id!==saved.world.id||d.universe.seed!==saved.world.seed)throw Error('保存身份不一致');
 const game=createGame({...endlessLevel,seed:saved.world.seed,generatorVersion:3});
 game.universe=d.universe;game.universe.cold=saved.world;game.bodies=d.bodies;game.elapsed=d.elapsed;game.distance=d.distance;game.health=d.health;
 game.players.forEach((p,i)=>{p.position={...d.players[i].position};p.velocity={...d.players[i].velocity};p.active=false;delete p.capture;});
 attachExpeditionStore(game,store);game.phase='paused';game.message=game.universe.notice='已恢复同一保存代次 · 离线天体冻结 · Space 继续；技能已关闭';saveCheckpoint(game,'exploration-v3-save');return game;
}
