import {describe,it,expect} from 'vitest';
import {generateChunk,landmarks} from '../src/world/generator';
import {describeLocalStructures,instantiateStructure,V3_CONFIG,type StructureFamily} from '../src/world/structures';
import {sampleRegionWeights} from '../src/world/regions';
import {integrateContacts} from '../src/physics/contact-world';
import {length,sub} from '../src/physics/vector';
import {createGame} from '../src/game/game';
import {endlessLevel} from '../src/levels/endless';
import {integrate} from '../src/physics/world';
import {createBody} from '../src/game/entities';
import {bodyGravity} from '../src/physics/gravity';
import {fieldAcceleration} from '../src/physics/fields';

describe('v3 composition and physical initial states',()=>{
 it('covers all admitted families and counts across 8192 deterministic chunks',()=>{
  const families=new Set<string>(),counts=new Set<string>();let rejected=0;
  for(let seed=0;seed<32;seed++)for(let x=-8;x<8;x++)for(let y=-8;y<8;y++){
    const key={x,y},a=generateChunk(seed,key,3),d=a.structure!;families.add(d.family);counts.add(`${d.family}:${a.bodies.filter(b=>b.kind==='planet').length}:${a.bodies.length}`);
    if(d.rejection)rejected++;
    expect(a.bodies.length).toBeLessThanOrEqual(6);
    for(const b of a.bodies){expect(Math.min(b.position.x-b.radius,b.position.y-b.radius,2048-b.position.x-b.radius,2048-b.position.y-b.radius)).toBeGreaterThanOrEqual(80);}
    for(let i=0;i<a.bodies.length;i++)for(let j=0;j<i;j++)expect(length(sub(a.bodies[i].position,a.bodies[j].position))-a.bodies[i].radius-a.bodies[j].radius).toBeGreaterThanOrEqual(40);
  }
  expect([...families].sort()).toEqual(Object.keys(V3_CONFIG.weights).sort());
  for(const n of [1,2])expect(counts.has(`small-system:${n}:${n+1}`)).toBe(true);
  for(const n of [3,4])expect(counts.has(`multi-system:${n}:${n+1}`)).toBe(true);
  for(const n of [2,3,4,5])expect(counts.has(`rocks:0:${n}`)).toBe(true);
  expect(rejected/8192).toBeLessThan(.05);
 });
 it('is independent of order at signed/high coordinates and keeps shared landmarks',()=>{
  for(const seed of [7,424242,20261017])for(const key of [{x:-2,y:4},{x:2**40-2,y:-(2**40)+2}]){
   const a=generateChunk(seed,key,3);generateChunk(seed,{x:4,y:-9},3);expect(generateChunk(seed,key,3)).toEqual(a);expect(instantiateStructure(a.structure!)).toEqual(a.bodies);
   expect(generateChunk(seed,{x:key.x-2**32,y:key.y},3)).not.toEqual(a);
  }
  for(const key of Object.values(landmarks(7,3)))expect(generateChunk(7,key,3).center).toBeDefined();
  expect(generateChunk(7,{x:0,y:0},3).bodies).toHaveLength(0);
  const a=sampleRegionWeights(7,{x:5.999999,y:-2}),b=sampleRegionWeights(7,{x:6.000001,y:-2});expect(Math.abs(a.density-b.density)).toBeLessThan(.00001);
  for(let seed=0;seed<32;seed++)for(let x=-1;x<=0;x++)for(let y=-1;y<=0;y++)for(const b of generateChunk(seed,{x,y},3).bodies)expect(Math.hypot(x*2048+b.position.x,y*2048+b.position.y)-b.radius).toBeGreaterThanOrEqual(600);
 });
 it('keeps both node polarities effective on every family and real mutual/environmental gravity',()=>{
  const players=createGame({...endlessLevel,generatorVersion:2}).players;
  for(const family of ['rogue','star','small-system','multi-system','binary','rocks','triple'] as StructureFamily[]){
   const d=describeLocalStructures(7,{x:2,y:2},family);
   for(const original of d.members)for(const p of players){const b=structuredClone(original);b.velocity={x:0,y:0};const player=structuredClone(p);player.active=true;player.position={x:b.position.x+55,y:b.position.y};integrate([b],[player],1/60);expect(b.velocity.x*player.field.polarity).toBeGreaterThan(0);}
   const source=d.members[0],ship=createBody({id:'probe',kind:'ship',radius:8,position:{x:source.position.x+100,y:source.position.y}});integrate([source,ship],[],1/60);expect(length(ship.velocity)).toBeGreaterThan(0);
  }
  const binary=describeLocalStructures(7,{x:2,y:2},'binary').members;
  expect(length(fieldAcceleration(binary[0].position,binary[1].position,bodyGravity(binary[1],binary[0])))).toBeGreaterThan(0);
  expect(length(fieldAcceleration(binary[1].position,binary[0].position,bodyGravity(binary[0],binary[1])))).toBeGreaterThan(0);
 });
 it('keeps every adjacent edge and corner safe, independent of query order',()=>{
  for(let seed=0;seed<32;seed++)for(const [x,y] of [[-3,2],[5,-4],[2**35,-(2**35)]] as const){
   const a=generateChunk(seed,{x,y},3);
   for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]){const b=generateChunk(seed,{x:x+dx,y:y+dy},3);for(const p of a.bodies)for(const q of b.bodies)expect(Math.hypot(q.position.x+dx*2048-p.position.x,q.position.y+dy*2048-p.position.y)-p.radius-q.radius).toBeGreaterThanOrEqual(160);}
   expect(generateChunk(seed,{x,y},3)).toEqual(a);
  }
 });
 it('integrates every family for 120s and binaries/multi-planets for 600s with real CCD',()=>{
  for(const family of ['rogue','star','small-system','multi-system','binary','rocks','triple'] as StructureFamily[])for(const seed of [7,424242,20261017])for(const count of family==='small-system'?[1,2]:family==='multi-system'?[3,4]:[undefined]){
   const d=describeLocalStructures(seed,{x:2,y:2},family,count);let bodies=instantiateStructure(d);const initial=structuredClone(bodies),seconds=['multi-system','binary'].includes(family)?600:120;let events=0,budget=0,maxSpeed=0,maxRatio=0,minRatio=Infinity;
   for(let tick=0;tick<seconds*60;tick++){
    const result=integrateContacts(bodies,[],1/60);bodies=result.bodies;events+=result.events.length;budget+=Number(result.budgetExhausted);
    if(tick%60===0)for(const b of bodies){maxSpeed=Math.max(maxSpeed,length(b.velocity));expect(Number.isFinite(b.position.x)&&Number.isFinite(b.velocity.y)).toBe(true);if(b.kind==='planet'&&family.endsWith('system')){const r=length(sub(b.position,bodies[0].position))/length(sub(initial.find(a=>a.id===b.id)!.position,initial[0].position));maxRatio=Math.max(r,maxRatio);minRatio=Math.min(r,minRatio);}}
    if(family==='binary'&&tick%60===0){const ratio=length(sub(bodies[0].position,bodies[1].position))/length(sub(initial[0].position,initial[1].position));expect(ratio).toBeGreaterThan(.999);expect(ratio).toBeLessThan(1.001);}
   }
   expect({family,seed,count,events,budget,maxSpeed,maxRatio,minRatio},`${family} ${seed}/${count}`).toMatchObject({events:0,budget:0});
   expect(maxSpeed).toBeLessThan(230);expect(bodies.length).toBe(initial.length);
   if(family.endsWith('system')){expect(minRatio,`${family} ${seed}/${count}`).toBeGreaterThan(.98);expect(maxRatio,`${family} ${seed}/${count}`).toBeLessThan(1.02);}
  }
 },120000);
});
