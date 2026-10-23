import { describe,it,expect } from 'vitest';
import { generateChunk,landmarks,migrateLegacyChunkGravity } from './fixtures/endless-v2';
import { firstLevel } from '../src/levels/first';
import { integrate } from '../src/physics/world';
import { integrateContacts } from '../src/physics/contact-world';
import { fieldAcceleration } from '../src/physics/fields';
import { bodyGravity } from '../src/physics/gravity';
import { length,sub } from '../src/physics/vector';
import { createBody } from '../src/game/entities';
import { createGame } from '../src/game/game';
import { endlessLevel } from './fixtures/endless-v2';
import { storeExploration,loadExploration } from '../src/game/exploration-save';
const seed=endlessLevel.seed!;
function ordinary() {
  for(let x=1;x<100;x++) {
    const bodies=generateChunk(seed,{x,y:1}).bodies;
    if(bodies.some(b=>b.kind==='planet'))return bodies;
  }
  throw Error('Missing seeded planetary system');
}
describe('endless local mutual gravity',()=>{
  it.each([0,1])('P%s field changes generated star, planet and asteroid motion in its own direction',index=>{
    const templates=[ordinary().find(b=>b.kind==='star')!,ordinary().find(b=>b.kind==='planet')!,
      generateChunk(seed,landmarks(seed).triple).bodies[0],
      Array.from({length:20},(_,x)=>generateChunk(seed,{x,y:1}).bodies).flat().find(b=>b.kind==='asteroid')!];
    for(const template of templates) {
      const body=structuredClone(template);body.velocity={x:0,y:0};
      const initial={...body.position},player=structuredClone(firstLevel.players[index]);player.active=true;
      player.position={x:body.position.x+80,y:body.position.y};
      expect(body.affectedByFields).toBe(true);
      // A free asteroid can cross the attractor or leave a fixed repulsor's range
      // after several seconds; measure its initial response before that happens.
      for(let n=0;n<(body.kind==='asteroid'?60:300);n++)integrate([body],[player],1/60);
      const direction=index?-1:1;
      expect((body.position.x-initial.x)*direction).toBeGreaterThan(3);
      expect(body.stabilizationState!.idleTime).toBe(0);
      if(body.kind==='star')expect(Math.abs(body.position.x-initial.x)).toBeLessThan(35);
    }
  });
  it('both node fields add on the same generated planet without changing natural gravity response',()=>{
    const template=ordinary().find(b=>b.kind==='planet')!,forces=[[],[0],[1],[0,1]].map(indices=>{
      const b=structuredClone(template);b.velocity={x:0,y:0};
      const players=indices.map(i=>{const p=structuredClone(firstLevel.players[i]);p.active=true;p.position={x:b.position.x+(i?-80:80),y:b.position.y};return p;});
      integrate([b],players,1e-5);expect(b.gravityResponse).toBe(1);return b.velocity.x;
    });
    expect(forces[0]).toBe(0);expect(forces[1]).toBeGreaterThan(0);expect(forces[2]).toBeGreaterThan(0);
    expect(forces[3]).toBeCloseTo(forces[1]+forces[2],9);
  });
  it('a node perturbs a complete moving triple system while all natural fields remain enabled',()=>{
    const bodies=generateChunk(seed,landmarks(seed).triple).bodies,baseline=structuredClone(bodies);
    const p=structuredClone(firstLevel.players[0]);p.active=true;p.position={x:bodies[0].position.x+80,y:bodies[0].position.y};
    for(let i=0;i<300;i++){integrate(bodies,[p],1/60);integrate(baseline,[],1/60);}
    expect(length(sub(bodies[0].position,baseline[0].position))).toBeGreaterThan(1);
    expect(bodies.every(b=>b.receivesGravity&&b.gravityResponse===1)).toBe(true);
  });
  it('updates weak saved node response without altering stored movement',()=>{
    const b=ordinary().find(b=>b.kind==='star')!,before=structuredClone(b);
    b.response=0.0005;b.affectedByFields=false;migrateLegacyChunkGravity(b);
    expect(b.response).toBeGreaterThanOrEqual(0.004);expect(b.affectedByFields).toBe(true);
    expect(b.position).toEqual(before.position);expect(b.velocity).toEqual(before.velocity);
  });
  it('enables environmental gravity independently of node coupling for every generated physical body',()=>{
    for(let x=-10;x<=10;x++)for(const b of generateChunk(seed,{x,y:1}).bodies) {
      expect(b.receivesGravity).toBe(true);expect(b.gravityResponse??b.response).toBe(1);expect(b.orbit).toBeUndefined();
      if(b.kind==='star'||b.kind==='planet')expect(b.response).toBeLessThan(0.1);
    }
  });
  it.each(['ship','asteroid','planet','star'] as const)('%s both attracts and is attracted by a generated star without player fields',kind=>{
    const star=ordinary().find(b=>b.kind==='star')!;
    const body=kind==='planet'?ordinary().find(b=>b.kind==='planet')!:kind==='star'?structuredClone(star):createBody({id:'probe',kind,radius:15,position:{x:0,y:0}});
    body.id='probe';body.position={x:star.position.x+80,y:star.position.y};body.velocity={x:0,y:0};
    const expectedStar=fieldAcceleration(star.position,body.position,bodyGravity(body,star)).x;
    const expectedBody=fieldAcceleration(body.position,star.position,bodyGravity(star,body)).x;
    integrate([star,body],[],1/6000);
    expect(star.velocity.x).toBeCloseTo(expectedStar/6000,6);
    expect(body.velocity.x).toBeCloseTo(expectedBody/6000,6);
    expect(star.velocity.x).toBeGreaterThan(0);expect(body.velocity.x).toBeLessThan(0);
  });
  it('two generated planets interact nearby and cease interacting outside their finite fields',()=>{
    const planets=ordinary().filter(b=>b.kind==='planet');
    planets[0].position={x:0,y:0};planets[1].position={x:180,y:0};planets.forEach(b=>b.velocity={x:0,y:0});
    integrate(planets,[],1/60);expect(planets[0].velocity.x).toBeGreaterThan(0);expect(planets[1].velocity.x).toBeLessThan(0);
    planets[1].position.x=1000;planets.forEach(b=>b.velocity={x:0,y:0});integrate(planets,[],1/60);
    expect(planets.every(b=>length(b.velocity)===0)).toBe(true);
  });
  it('does not continue a scripted orbit if its source disappears',()=>{
    const planet=ordinary().find(b=>b.kind==='planet')!,initial=structuredClone(planet);
    for(let i=0;i<600;i++)integrate([planet],[],1/60);
    expect(planet.position.x).toBeCloseTo(initial.position.x+initial.velocity.x*10,6);
    expect(planet.position.y).toBeCloseTo(initial.position.y+initial.velocity.y*10,6);
  });
  it.each(['ordinary','triple'] as const)('keeps isolated %s systems finite, orbiting and collision-free for 120 seconds',kind=>{
    const bodies=kind==='triple'?generateChunk(seed,landmarks(seed).triple).bodies:ordinary().filter(b=>b.kind!=='asteroid');
    const original=structuredClone(bodies);let contacts=0;
    for(let i=0;i<7200;i++) {
      const result=integrateContacts(bodies,[],1/60);contacts+=result.events.length;
      for(const b of bodies){expect(Number.isFinite(length(b.position))).toBe(true);expect(length(b.velocity)).toBeLessThan(240);}
    }
    expect(contacts).toBe(0);expect(bodies.length).toBe(original.length);
    for(const b of bodies.filter(b=>kind==='triple'||b.kind==='planet')) {
      const center=kind==='triple'?{x:original.reduce((s,b)=>s+b.position.x,0)/3,y:original.reduce((s,b)=>s+b.position.y,0)/3}:bodies.find(b=>b.kind==='star')!.position;
      const initialCenter=kind==='triple'?center:original.find(b=>b.kind==='star')!.position;
      const initial=length(sub(original.find(a=>a.id===b.id)!.position,initialCenter)),radius=length(sub(b.position,center));
      if(kind==='triple')expect(Math.abs(radius-initial)).toBeLessThan(3);
      else {expect(radius).toBeGreaterThan(initial*.7);expect(radius).toBeLessThan(initial*1.3);}
      expect(length(b.velocity)).toBeGreaterThan(10);
    }
  });
  it('migrates legacy active and cached analytic bodies without teleporting or resetting velocity',()=>{
    const game=createGame(endlessLevel),body=game.bodies.find(b=>b.kind==='planet')!;
    body.receivesGravity=false;delete body.gravityResponse;body.orbit={center:{x:100,y:200},radius:430,phase:0,angularSpeed:0.028};body.orbitTime=16;
    const cached=structuredClone(body);cached.chunk={x:90,y:90};cached.id='90,90/planet0';game.universe!.cache.push({key:cached.chunk,bodies:[cached]});
    let saved='';const storage={getItem:()=>saved,setItem:(_k:string,v:string)=>{saved=v;}};
    expect(storeExploration(storage,game)).toBe(true);const restored=loadExploration(storage)!;
    for(const b of [restored.bodies.find(b=>b.id===body.id)!,restored.universe!.cache[0].bodies[0]]) {
      expect(b.receivesGravity).toBe(true);expect(b.gravityResponse).toBe(1);expect(b.orbit).toBeUndefined();expect(b.orbitTime).toBeUndefined();
      expect(b.position).toEqual(body.position);expect(b.velocity).toEqual(body.velocity);
    }
  });
});
