import {describe,it,expect} from 'vitest';
import {generateChunk,landmarks,landmarkPosition,chunkId,chunkFeatureCenter,LAYOUT} from './fixtures/endless-v2';
import {layoutSample} from '../tools/layout-sample';
import {createGame,retryGame,stepGame,togglePause} from '../src/game/game';
import {endlessLevel} from './fixtures/endless-v2';
import {streamUniverse,chunkOffset,rebaseUniverse,worldChunk,explorationText,MAX_UNIVERSE_BODIES,MAX_CACHED_CHUNKS} from '../src/world/universe';
import {storeExploration,loadExploration} from '../src/game/exploration-save';
import {developmentRegistry} from '../src/debug/config';
import {scenes} from '../src/scenes/registry';
import {integrateContacts} from '../src/physics/contact-world';
import {length,sub} from '../src/physics/vector';
import {NO_CONTROLS} from '../src/input/intent';

describe('versioned spatial layouts',()=>{
 it('preserves content rolls, all physical parameters and counts outside relocated landmarks',()=>{
  for(let seed=1;seed<=32;seed++)for(let x=-5;x<=5;x++)for(let y=-5;y<=5;y++){
   const key={x,y},old=generateChunk(seed,key,1),fresh=generateChunk(seed,key,2);
   const special=[...Object.values(landmarks(seed,1)),...Object.values(landmarks(seed,2))].some(k=>chunkId(k)===chunkId(key));
   if(special)continue;
   const parameters=(g:typeof old)=>g.bodies.map(({position:_p,velocity:_v,...b})=>b);
   expect(parameters(fresh)).toEqual(parameters(old));expect(fresh.feature).toBe(old.feature);
   expect(fresh.decorations.map(({position:_p,...d})=>d)).toEqual(old.decorations.map(({position:_p,...d})=>d));
   expect(fresh.bodies.length).toBeLessThanOrEqual(6);
  }
 });
 it('covers broad centre regions, every heading and asteroid quadrant without common fallbacks',()=>{
  const old=layoutSample(1),m=layoutSample(2);
  expect(old.regions.filter(n=>n>0)).toHaveLength(1);expect(old.headings.filter(n=>n>0)).toHaveLength(1);
  expect(m.regions.every(n=>n>30)).toBe(true);expect(m.headings.every(n=>n>100)).toBe(true);expect(m.rockRegions.every(n=>n>100)).toBe(true);
  expect(m.centerRange[1]-m.centerRange[0]).toBeGreaterThan(1000);expect(m.centerRange[3]-m.centerRange[2]).toBeGreaterThan(1000);
  expect(m.phases).toEqual([60,180]);expect(m.orbitRadius[1]-m.orbitRadius[0]).toBeGreaterThan(49);
  expect(m.minGap).toBeGreaterThan(LAYOUT.minGap);expect(m.minEdge).toBeGreaterThanOrEqual(LAYOUT.edgeClearance);
  expect(m.maxAttempts).toBeLessThanOrEqual(LAYOUT.maxAttempts);expect(m.fallbacks/m.chunks).toBeLessThan(.001);
  expect(m.landmarkDirections.every(n=>n>0)).toBe(true);
 });
 it('repeats v1/v2 independently of intervening loads and keeps the origin protected',()=>{
  for(const version of [1,2] as const)for(const seed of [0,7,20261017,4294967295]){
   const key={x:-18,y:2**35},a=generateChunk(seed,key,version);generateChunk(seed,{x:99,y:-17},version);expect(generateChunk(seed,key,version)).toEqual(a);
   for(const b of generateChunk(seed,{x:0,y:0},version).bodies)expect(length(b.position)-b.radius).toBeGreaterThan(600);
  }
 });
 it('checks all four edge/corner neighbors with mixed versions and load-order independence',()=>{
  for(let seed=0;seed<32;seed++)for(const version of [1,2] as const){
   const key={x:seed%7-3,y:seed%5-2},a=generateChunk(seed,key,version);
   for(const [dx,dy]of [[1,0],[0,1],[1,1],[-1,1]]){
    const other={x:key.x+dx,y:key.y+dy},b=generateChunk(seed,other,version===1?2:1);
    for(const p of a.bodies)for(const q of b.bodies){const point={x:q.position.x+dx*2048,y:q.position.y+dy*2048};expect(length(sub(p.position,point))-p.radius-q.radius).toBeGreaterThanOrEqual(160);}
    expect(generateChunk(seed,key,version)).toEqual(a);
   }
  }
 });
 it('keeps ordinary, triple and asteroid-containing chunks finite and collision-free for 120 seconds',()=>{
  for(const seed of [7,424242,20261017,1,19,99]){
   const keys=[landmarks(seed).triple];
   for(let x=1;x<80&&keys.length<3;x++){const c=generateChunk(seed,{x,y:1});if((keys.length===1&&c.bodies.some(b=>b.kind==='planet'))||(keys.length===2&&c.bodies.some(b=>b.kind==='asteroid')))keys.push({x,y:1});}
   expect(keys).toHaveLength(3);
   for(const key of keys){
    const c=generateChunk(seed,key),bodies=c.bodies,initial=structuredClone(bodies),star=bodies.find(b=>b.id.endsWith('/sun'));
    for(let tick=0;tick<7200;tick++){
     const result=integrateContacts(bodies,[],1/60);expect(result.events).toHaveLength(0);expect(result.budgetExhausted).toBe(false);
     if(tick%60===0)for(const b of bodies){expect(Number.isFinite(b.position.x)&&Number.isFinite(b.position.y)).toBe(true);expect(length(b.velocity)).toBeLessThan(240);}
    }
    expect(bodies).toHaveLength(initial.length);
    if(star)for(const b of bodies.filter(b=>b.kind==='planet')){
     const radius=length(sub(b.position,star.position)),old=length(sub(initial.find(a=>a.id===b.id)!.position,initial.find(a=>a.id===star.id)!.position));expect(radius/old).toBeGreaterThan(.98);expect(radius/old).toBeLessThan(1.02);
    }
   }
  }
 },20000);
 it('uses the same feature coordinates for generation, navigation, dev jump and discovery',()=>{
  for(const seed of [7,424242,20261017])for(const kind of ['triple','nebula'] as const){
   const key=landmarks(seed)[kind],position=landmarkPosition(seed,kind),c=generateChunk(seed,key),center=chunkFeatureCenter(seed,key);
   expect(c.center).toEqual(center);expect(position).toEqual({x:key.x*2048+center.x,y:key.y*2048+center.y});
   const g=createGame(developmentRegistry(scenes,`?dev=1&seed=${seed}&section=${kind}`).endless.level!);
   expect(g.universe!.discoveries).toContainEqual({key,kind});expect(explorationText(g)).toContain(`(${key.x},${key.y})`);
  }
 });
 it('preserves old saved disturbances and pins future generation, restart and retries to v1',()=>{
  const g=createGame({...endlessLevel,generatorVersion:1}),b=g.bodies.find(b=>b.chunk)!;b.position.x+=37;b.velocity.y-=2;
  let text='';const storage={getItem:()=>text,setItem:(_k:string,v:string)=>text=v};storeExploration(storage,g);
  const legacy=JSON.parse(text);delete legacy.universe.generatorVersion;text=JSON.stringify(legacy);const originalText=text;
  const restored=loadExploration(storage)!;expect(restored).toBeDefined();expect(text).toBe(originalText);expect(restored.bodies).toEqual(JSON.parse(originalText).bodies);expect(restored.universe!.generatorVersion).toBe(1);
  expect(createGame(restored.level).universe!.generatorVersion).toBe(1);expect(retryGame(restored).universe!.generatorVersion).toBe(1);
  const ship=restored.bodies[0];ship.position={x:7000,y:7000};restored.players.forEach(p=>p.position={...ship.position});streamUniverse(restored);
  const key={x:3,y:3},offset=chunkOffset(key,restored.universe!.origin);
  for(const template of generateChunk(g.universe!.seed,key,1).bodies)expect(restored.bodies.find(b=>b.id===template.id)!.position).toEqual({x:offset.x+template.position.x,y:offset.y+template.position.y});
 });
 it('roundtrips v2 bodies/cache and rejects unknown generator versions without writing storage',()=>{
  const g=createGame(endlessLevel);let text='',writes=0;const storage={getItem:()=>text,setItem:(_k:string,v:string)=>{text=v;writes++;}};
  const b=g.bodies.find(b=>b.chunk)!;b.position.x+=55;b.velocity.x+=3;storeExploration(storage,g);
  const restored=loadExploration(storage)!;expect(restored.bodies).toEqual(g.bodies);expect(restored.universe!.generatorVersion).toBe(2);expect(writes).toBe(1);
  const bad=JSON.parse(text);bad.universe.generatorVersion=99;text=JSON.stringify(bad);expect(loadExploration(storage)).toBeUndefined();expect(writes).toBe(1);
 });
 it.each([7,424242,20261017])('flies continuously in a new seed %s across chunk loads and rebasing',seed=>{
  const g=createGame({...endlessLevel,seed});g.bodies[0].velocity={x:240,y:0};togglePause(g);let previous={x:0,y:0},maxJump=0;
  for(let i=0;i<2400;i++){
   stepGame(g,NO_CONTROLS);const ship=g.bodies[0],u=g.universe!,p={x:ship.position.x+u.origin.x*2048,y:ship.position.y+u.origin.y*2048};
   maxJump=Math.max(maxJump,length(sub(p,previous)));previous=p;expect(g.phase,g.message).toBe('running');
   expect(g.bodies.length).toBeLessThanOrEqual(MAX_UNIVERSE_BODIES);expect(u.cache.length).toBeLessThanOrEqual(MAX_CACHED_CHUNKS);
  }
  expect(maxJump).toBeLessThanOrEqual(4.00001);expect(worldChunk(g,g.bodies[0].position).x).toBeGreaterThanOrEqual(3);expect(g.universe!.origin.x).toBeGreaterThan(0);expect(g.health!.current).toBe(100);
  const before=structuredClone(g.bodies),key=worldChunk(g,g.bodies[0].position);rebaseUniverse(g);expect(worldChunk(g,g.bodies[0].position)).toEqual(key);expect(g.bodies.map(b=>b.velocity)).toEqual(before.map(b=>b.velocity));
 });
});
