import {describe,it,expect,vi} from 'vitest';
import {MemoryExpeditionStore,newWorld,payloadBytes,type WorldIdentity,type ChunkSnapshot} from '../src/world/cold-store';
import {createGame,stepGame,togglePause} from '../src/game/game';
import {endlessLevel} from '../src/levels/endless';
import {attachExpeditionStore,cancelExpedition,settleExpedition,expeditionRuntime,activeSnapshots} from '../src/world/endless-runtime';
import {streamUniverse,rebaseUniverse,worldChunk} from '../src/world/universe';
import {storeExplorationV3,loadExplorationV3} from '../src/game/exploration-v3';
import {storeExploration} from '../src/game/exploration-save';
import {NO_CONTROLS} from '../src/input/intent';
import {chunkId,generateChunk,chunkFeatureCenter} from '../src/world/generator';
import {cruiseControls} from '../tools/endless-v3-controller';
import {predictTrajectory} from '../src/game/trajectory';
function make(store=new MemoryExpeditionStore(),seed=20261017){const g=createGame({...endlessLevel,seed});attachExpeditionStore(g,store);return g;}
async function visit(g:ReturnType<typeof make>,x:number,y:number){g.bodies[0].position={x:(x-g.universe!.origin.x)*2048,y:(y-g.universe!.origin.y)*2048};g.players.forEach(p=>p.position={...g.bodies[0].position});rebaseUniverse(g);streamUniverse(g);await settleExpedition(g);}
describe('bounded persistent expeditions',()=>{
 it('discovers additional triples at their actual generated centre rather than the landmark sampler',async()=>{
  const seed=7,key={x:3,y:0},c=generateChunk(seed,key,3),old=chunkFeatureCenter(seed,key,3),dx=c.center.x-old.x,dy=c.center.y-old.y,d=Math.hypot(dx,dy);
  expect(c.feature).toBe('triple');expect(d).toBeGreaterThan(150);
  const g=make(undefined,seed),p={x:key.x*2048+c.center.x+dx/d*600,y:key.y*2048+c.center.y+dy/d*600};g.bodies[0].position=p;g.players.forEach(n=>n.position={...p});rebaseUniverse(g);streamUniverse(g);await settleExpedition(g);
  expect(g.universe!.discoveries).toContainEqual({key,kind:'triple'});
 });
 it('retains moved/destroyed bodies beyond 32 hot entries, including arrival at their new location',async()=>{
  const store=new MemoryExpeditionStore(),g=make(store),body=g.bodies.find(b=>b.kind==='planet')!,owner={...body.chunk!},id=body.id;
  expect(body).toBeDefined();body.position={x:500*2048+500,y:600*2048+700};body.velocity={x:17,y:-8};body.stabilizationState={playerVelocity:{x:1,y:2},idleTime:4};
  const deleted=g.bodies.find(b=>b.chunk&&chunkId(b.chunk)===chunkId(owner)&&b.id!==id);if(deleted)g.bodies=g.bodies.filter(b=>b!==deleted);
  const expected=structuredClone(body);
  for(let n=0;n<45;n++){await visit(g,20+n*4,-20);expect(g.bodies.length).toBeLessThanOrEqual(325);expect(g.universe!.cache.length).toBeLessThanOrEqual(32);}
  expect(g.universe!.cache.some(c=>chunkId(c.key)===chunkId(owner))).toBe(false);
  await visit(g,500,600);const restored=g.bodies.find(b=>b.id===id)!;
  expect(restored).toBeDefined();expect(worldChunk(g,restored.position)).toEqual({x:500,y:600});expect(restored.velocity).toEqual(expected.velocity);expect(restored.stabilizationState).toEqual(expected.stabilizationState);
  expect(restored.position).toEqual({x:500,y:700});
  if(deleted)expect(g.bodies.some(b=>b.id===deleted.id)).toBe(false);
  await visit(g,owner.x,owner.y);if(deleted)expect(g.bodies.some(b=>b.id===deleted.id)).toBe(false);
  expect(g.universe!.coldStats!.records).toBeGreaterThan(32);
 });
 it('atomically restores K bodies and cold history, pauses and fences late writers',async()=>{
  const store=new MemoryExpeditionStore(),g=make(store),body=g.bodies.find(b=>b.chunk)!;body.velocity.x+=3;const id=body.id;
  await visit(g,30,30);expect(await storeExplorationV3(g)).toBe(true);const world={...g.universe!.cold!},saved=structuredClone(g.bodies);
  await visit(g,60,60);const restored=(await loadExplorationV3(store))!;expect(restored.bodies).toEqual(saved);expect(restored.phase).toBe('paused');expect(restored.players.every(p=>!p.active)).toBe(true);
  expect(restored.universe!.cold!.epoch).toBe(world.epoch+1);await expect(store.write(world,[])).rejects.toThrow('过期');
  await visit(restored,0,0);expect(restored.bodies.find(b=>b.id===id)!.velocity.x).toBe(body.velocity.x);
  let legacyWrites=0;expect(storeExploration({getItem:()=>null,setItem:()=>legacyWrites++},restored)).toBe(false);expect(legacyWrites).toBe(0);
 });
 it('does not release live state on quota/read/write failures',async()=>{
  for(const fault of ['quota','read','write']){
   class FailingStore extends MemoryExpeditionStore {
    override async read(w:WorldIdentity,k:{x:number;y:number}[]){if(fault==='read')throw Error('拒读');return super.read(w,k);}
    override async write(w:WorldIdentity,s:ChunkSnapshot[]){if(fault==='write')throw Error('拒写');return super.write(w,s);}
   }
   const g=make(new FailingStore(fault==='quota'?1:64*1024*1024)),before=structuredClone(g.bodies),loaded=structuredClone(g.universe!.loaded);
   g.bodies[0].position={x:100000,y:0};g.players.forEach(p=>p.position={...g.bodies[0].position});streamUniverse(g);
   await expect(settleExpedition(g)).rejects.toThrow();expect(g.phase).toBe('paused');expect(g.universe!.loaded).toEqual(loaded);expect(g.bodies.slice(1)).toEqual(before.slice(1));togglePause(g);expect(g.phase).toBe('paused');
  }
 });
 it('freezes fixed steps while reads are delayed and ignores abandoned-world replies',async()=>{
  let release!:()=>void;const wait=new Promise<void>(r=>release=r);
  class Delayed extends MemoryExpeditionStore{override async read(w:WorldIdentity,k:{x:number;y:number}[]){await wait;return super.read(w,k);}}
  const old=make(new Delayed());old.phase='running';old.bodies[0].position.x=7000;old.players.forEach(p=>p.position={...old.bodies[0].position});streamUniverse(old);const before=structuredClone(old.bodies),t=old.elapsed;
  stepGame(old,NO_CONTROLS);expect(old.elapsed).toBe(t);expect(old.bodies).toEqual(before);cancelExpedition(old);
  const next=make(undefined,7),copy=structuredClone(next);release();await settleExpedition(old);expect(next).toEqual(copy);expect(old.bodies).toEqual(before);
 });
 it('keeps previous K after an interrupted or oversized save',async()=>{
  class Interrupt extends MemoryExpeditionStore{fail=false;override async save(w:WorldIdentity,s:ChunkSnapshot[],m:string){if(this.fail)throw Error('事务中断');return super.save(w,s,m);}}
  const store=new Interrupt(),g=make(store);expect(await storeExplorationV3(g)).toBe(true);const saved=structuredClone(g.bodies);g.bodies[0].velocity.x=123;store.fail=true;
  expect(await storeExplorationV3(g)).toBe(false);const loaded=(await loadExplorationV3(store))!;expect(loaded.bodies).toEqual(saved);
  const small=new MemoryExpeditionStore(100);const w=newWorld(7);await expect(small.save(w,[], 'x'.repeat(101))).rejects.toThrow('预算');expect(await small.restore()).toBeUndefined();
 });
 it('rejects corrupt records/unknown manifests without resetting records or overwriting saves',async()=>{
  class Corruptible extends MemoryExpeditionStore {breakManifest(){this.saved!.data.manifest='{"format":99}';}breakRecord(){this.saved!.records.find(r=>r.bodies.length)!.bodies[0].position.x=NaN;}dropMembers(){this.saved!.records.find(r=>r.bodies.length)!.bodies=[];}}
  const store=new Corruptible(),g=make(store);await storeExplorationV3(g);store.breakManifest();await expect(loadExplorationV3(store)).rejects.toThrow('版本未知');
  const store2=new Corruptible(),g2=make(store2);await storeExplorationV3(g2);store2.breakRecord();await expect(loadExplorationV3(store2)).rejects.toThrow('损坏');
  const store3=new Corruptible(),g3=make(store3);await storeExplorationV3(g3);store3.dropMembers();await expect(loadExplorationV3(store3)).rejects.toThrow('损坏');
 });
 it('isolates identical seeds in separate expeditions and never writes a trajectory preview',async()=>{
  const store=new MemoryExpeditionStore(),a=make(store),b=make(store);expect(a.universe!.cold!.id).not.toBe(b.universe!.cold!.id);
  a.bodies.find(p=>p.chunk)!.velocity.x=99;await visit(a,20,20);expect(await store.read(b.universe!.cold!,[{x:0,y:0}])).toHaveLength(0);
  const original=structuredClone(b);const preview=predictTrajectory(b,3);expect(preview.seconds).toBeGreaterThan(0);expect(preview.points.at(-1)!.x).toBeGreaterThan(0);expect(b).toEqual(original);expect(expeditionRuntime(b).pending).toBeUndefined();
  expect(payloadBytes('中文')).toBe(6);expect(activeSnapshots(b).length).toBe(b.universe!.loaded.length);
 });
 it('times out stalled reads, retains live state and ignores their later replies',async()=>{
  vi.useFakeTimers();try{
   let release!:()=>void;const delay=new Promise<void>(r=>release=r);
   class Stalled extends MemoryExpeditionStore {override async read(w:WorldIdentity,k:{x:number;y:number}[]){await delay;return super.read(w,k);}}
   const g=make(new Stalled()),before=structuredClone(g.bodies.slice(1));g.bodies[0].position.x=20000;g.players.forEach(p=>p.position={...g.bodies[0].position});streamUniverse(g);
   await vi.advanceTimersByTimeAsync(10001);await expect(settleExpedition(g)).rejects.toThrow('10 秒');expect(g.bodies.slice(1)).toEqual(before);expect(g.phase).toBe('paused');
   release();await vi.advanceTimersByTimeAsync(1);expect(g.bodies.slice(1)).toEqual(before);expect(g.phase).toBe('paused');
  }finally{vi.useRealTimers();}
 });
 it('serializes overlapping K operations and retains merge size/mass and total destruction tombstones',async()=>{
  const store=new MemoryExpeditionStore(),g=make(store),owner=g.bodies.find(b=>b.chunk)!.chunk!;
  const b=g.bodies.find(b=>b.chunk&&chunkId(b.chunk)===chunkId(owner))!;b.radius=110;b.contact={mass:123456,largeBody:'merge'};
  g.bodies=g.bodies.filter(p=>!p.chunk||chunkId(p.chunk)!==chunkId(owner)||p===b);
  expect(await Promise.all([storeExplorationV3(g),storeExplorationV3(g)])).toEqual([true,true]);const restored=(await loadExplorationV3(store))!;
  expect(restored.bodies.find(p=>p.id===b.id)!.radius).toBe(110);expect(restored.bodies.find(p=>p.id===b.id)!.contact?.mass).toBe(123456);
  restored.bodies=restored.bodies.filter(p=>p.id!==b.id);await visit(restored,20,20);for(let n=0;n<12;n++)await visit(restored,30+n*4,30);await visit(restored,owner.x,owner.y);
  expect(restored.bodies.some(p=>p.chunk&&chunkId(p.chunk)===chunkId(owner))).toBe(false);
 });
 it('keeps three separated foci within live/hot budgets after many visits',async()=>{
  const g=make();for(let n=0;n<100;n++){
   const u=g.universe!,p=(x:number,y:number)=>({x:(x-u.origin.x)*2048,y:(y-u.origin.y)*2048});g.bodies[0].position=p(n*4,0);g.players[0].position=p(-n*4,10);g.players[1].position=p(2,n*4);rebaseUniverse(g);streamUniverse(g);await settleExpedition(g);
   expect(g.universe!.loaded.length).toBeLessThanOrEqual(54);expect(g.universe!.cache.length).toBeLessThanOrEqual(32);expect(g.bodies.length).toBeLessThanOrEqual(325);
  }
 });
 it('continues for 12 chunks from the normal 90-speed spawn in three seeds with real fixed steps',async()=>{
  for(const seed of [7,424242,20261017]){
   const g=make(undefined,seed);togglePause(g);let distance=0,previous={x:0,y:0},maxStep=0,maxVelocityChange=0,velocity={...g.bodies[0].velocity};
   for(let tick=0;tick<24000;tick++){
    stepGame(g,cruiseControls(g));if(expeditionRuntime(g).pending)await settleExpedition(g);
    const ship=g.bodies[0],u=g.universe!,p={x:ship.position.x+u.origin.x*2048,y:ship.position.y+u.origin.y*2048};maxStep=Math.max(maxStep,Math.hypot(p.x-previous.x,p.y-previous.y));previous=p;maxVelocityChange=Math.max(maxVelocityChange,Math.hypot(ship.velocity.x-velocity.x,ship.velocity.y-velocity.y));velocity={...ship.velocity};
    expect(g.phase,g.message+JSON.stringify({seed,tick,position:p,elapsed:g.elapsed,ship:ship.velocity,players:g.players.map(p=>({position:p.position,active:p.active})),contacts:g.collisionEvents})).toBe('running');expect(g.collisionBudgetExhausted).not.toBe(true);expect(g.bodies.length).toBeLessThanOrEqual(325);distance=p.x;
    if(distance>=12*2048)break;
   }
   expect(distance).toBeGreaterThanOrEqual(12*2048);expect(maxStep).toBeLessThanOrEqual(4.0001);expect(maxVelocityChange).toBeLessThan(170/60+.001);expect(g.health!.current).toBe(100);
   const paused=g.elapsed;g.phase='paused';stepGame(g,NO_CONTROLS);expect(g.elapsed).toBe(paused);
  }
 },120000);
});
