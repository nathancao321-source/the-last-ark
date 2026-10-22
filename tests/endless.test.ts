import { describe,it,expect } from 'vitest';
import { createGame,stepGame,togglePause,retryGame } from '../src/game/game';
import { endlessLevel } from '../src/levels/endless';
import { NO_CONTROLS } from '../src/game/types';
import { chunkSeed,generateChunk,landmarks,chunkId,LAYOUT } from '../src/world/generator';
import { MAX_CACHED_CHUNKS,MAX_LOADED_CHUNKS,MAX_UNIVERSE_BODIES,streamUniverse,rebaseUniverse,recallNode,worldChunk } from '../src/world/universe';
import { SECTOR_SIZE } from '../src/world/sectors';
import { storeExploration,loadExploration } from '../src/game/exploration-save';
import { createCamera,worldToScreen,screenToWorld } from '../src/camera/camera';
import { length,sub,add,scale,limit } from '../src/physics/vector';
import { integrate } from '../src/physics/world';
import { predictTrajectory } from '../src/game/trajectory';
import { Keyboard } from '../src/input/keyboard';
import { developmentRegistry } from '../src/debug/config';
import { scenes } from '../src/scenes/registry';
import { capabilities } from '../src/game/entities';
import { createControls } from '../src/input/intent';
import { bodyGravity } from '../src/physics/gravity';
import { fieldAcceleration } from '../src/physics/fields';
const seed=endlessLevel.seed!;
function memory(){let value:string|null=null;return {getItem:()=>value,setItem:(_key:string,v:string)=>{value=v;}};}
function legacyWorld(){return createGame({...endlessLevel,generatorVersion:1});}
function bounded(g:ReturnType<typeof createGame>){
  expect(g.universe!.loaded.length).toBeLessThanOrEqual(MAX_LOADED_CHUNKS);
  expect(g.universe!.cache.length).toBeLessThanOrEqual(MAX_CACHED_CHUNKS);
  expect(g.bodies.length).toBeLessThanOrEqual(MAX_UNIVERSE_BODIES);
  expect(g.level.decorations!.length).toBeLessThanOrEqual(MAX_LOADED_CHUNKS*11);
}
describe('deterministic bounded universe',()=>{
  it('repeats templates independent of load order and distinguishes high chunk bits',()=>{
    const key={x:-19,y:42},a=generateChunk(seed,key);generateChunk(seed,{x:900,y:-800});
    expect(generateChunk(seed,key)).toEqual(a);expect(chunkSeed(seed,key)).not.toBe(chunkSeed(seed,{x:key.x+2**32,y:key.y}));
    expect(generateChunk(seed+1,key)).not.toEqual(a);
  });
  it('generates separated celestial bodies, bounded counts and safe chunk seams for many seeds',()=>{
    for(let n=0;n<500;n++) {
      const {bodies}=generateChunk(seed+n,{x:n%19-9,y:n%27-13});expect(bodies.length).toBeLessThanOrEqual(6);
      for(const b of bodies){expect(b.position.x-b.radius).toBeGreaterThanOrEqual(LAYOUT.edgeClearance);expect(b.position.y-b.radius).toBeGreaterThanOrEqual(LAYOUT.edgeClearance);expect(b.position.x+b.radius).toBeLessThanOrEqual(SECTOR_SIZE-LAYOUT.edgeClearance);expect(b.position.y+b.radius).toBeLessThanOrEqual(SECTOR_SIZE-LAYOUT.edgeClearance);}
      for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++)expect(length(sub(bodies[i].position,bodies[j].position))).toBeGreaterThan(bodies[i].radius+bodies[j].radius+25);
    }
  });
  it('streams 1000 different neighborhoods without growing active bodies, cache, or saves',()=>{
    const game=createGame(endlessLevel),storage=memory();
    for(let n=0;n<1000;n++) {
      // Demand stress only: direct fixture relocation is NOT a playable autopilot.
      game.bodies[0].position={x:n*SECTOR_SIZE*3,y:0};game.players[0].position={x:-n*SECTOR_SIZE*2,y:800};game.players[1].position={x:0,y:n*SECTOR_SIZE*2};
      rebaseUniverse(game);streamUniverse(game,true);bounded(game);
    }
    expect(storeExploration(storage,game)).toBe(true);expect(storage.getItem()!.length).toBeLessThan(2_000_000);
    expect(game.universe!.loaded).toContainEqual(worldChunk(game,game.players[0].position));
  },20000);
  it('preserves cached disturbances and restores evicted static templates deterministically',()=>{
    const game=createGame(endlessLevel),key={x:1,y:1};
    const rock=game.bodies.find(b=>b.chunk&&chunkId(b.chunk)==='1,1')!;expect(rock).toBeDefined();rock.position.x+=13;
    const before={...rock.position};const id=rock.id;
    game.bodies[0].position={x:20000,y:20000};game.players.forEach(p=>{p.position={x:20000,y:20000};});streamUniverse(game);
    expect(game.bodies.some(b=>b.id===id)).toBe(false);
    game.bodies[0].position={x:0,y:0};game.players.forEach(p=>{p.position={x:0,y:0};});streamUniverse(game);
    expect(game.bodies.find(b=>b.id===id)!.position).toEqual(before);
    for(let n=1;n<12;n++) {
      game.bodies[0].position={x:n*30000,y:0};game.players.forEach(p=>{p.position={...game.bodies[0].position};});streamUniverse(game);
    }
    expect(game.universe!.cache.some(c=>chunkId(c.key)===chunkId(key))).toBe(false);
    game.bodies[0].position={x:0,y:0};game.players.forEach(p=>{p.position={x:0,y:0};});streamUniverse(game);
    const template=generateChunk(seed,key).bodies.find(b=>b.id===id)!;
    expect(game.bodies.find(b=>b.id===id)!.position).toEqual({x:template.position.x+SECTOR_SIZE,y:template.position.y+SECTOR_SIZE});
  });
  it('keeps a displaced nearby body loaded even when its home chunk leaves demand',()=>{
    const game=createGame(endlessLevel),body=game.bodies.find(b=>b.chunk)!;
    game.bodies[0].position={x:15000,y:0};body.position={x:15100,y:50};game.players.forEach(p=>{p.position={x:15000,y:0};});
    streamUniverse(game);expect(game.bodies).toContain(body);bounded(game);
  });
  it('does not activate an unloaded displaced hazard directly on the returning ship',()=>{
    const game=createGame(endlessLevel),body=game.bodies.find(b=>b.chunk)!;
    const owner={...body.chunk!};body.position={x:22000,y:1000};const id=body.id;
    game.bodies[0].position={x:50000,y:0};game.players.forEach(p=>{p.position={x:50000,y:0};});streamUniverse(game);
    expect(game.bodies.some(b=>b.id===id)).toBe(false);
    // The node loads the original chunk while the ship happens to occupy the saved body's remote position.
    game.bodies[0].position={x:22000,y:1000};game.players[0].position={x:owner.x*SECTOR_SIZE+1000,y:owner.y*SECTOR_SIZE+1000};streamUniverse(game);
    const reloaded=game.bodies.find(b=>b.id===id)!;expect(reloaded.spawnPending).toBe(true);expect(capabilities(reloaded).collision).toBe('none');
    game.bodies[0].position.x+=500;streamUniverse(game);expect(reloaded.spawnPending).toBeUndefined();expect(capabilities(reloaded).collision).toBe('hazard');
  });
  it('keeps the original 30-chunk coast reproducible in a version-1 world',()=>{
    const game=legacyWorld();game.bodies[0].velocity={x:240,y:0};togglePause(game);
    const ship=game.bodies[0];let previous=0;
    for(let i=0;i<15360;i++) {
      stepGame(game,NO_CONTROLS);
      const absolute=game.universe!.origin.x*SECTOR_SIZE+ship.position.x;
      expect(absolute-previous).toBeCloseTo(4,6);previous=absolute;
      if(i%600===0){recallNode(game,0);recallNode(game,1);bounded(game);}
      if(game.phase!=='running')throw new Error(game.message);
    }
    expect(worldChunk(game,ship.position).x).toBe(30);expect(game.health!.current).toBe(100);expect(ship.velocity).toEqual({x:240,y:0});
    expect(game.distance).toBeCloseTo(61440,4);expect(game.phase).toBe('running');
  },30000);
});
describe('floating origin, exploration UI contracts and discovery',()=>{
  it('preserves the authored two-player discovery route in legacy worlds',()=>{
    const game=legacyWorld(),known=landmarks(seed,1),tx=known.triple.x*SECTOR_SIZE+300,nx=known.nebula.x*SECTOR_SIZE+400;
    const route=[{x:tx,y:0},{x:tx,y:1024},{x:tx,y:0},{x:nx-300,y:0},{x:nx-300,y:known.nebula.y*SECTOR_SIZE+1024},{x:nx,y:known.nebula.y*SECTOR_SIZE+1024}];
    let stage=0;const usage=[0,0];togglePause(game);
    for(let i=0;i<42000&&game.phase==='running';i++) {
      const ship=game.bodies[0],origin=game.universe!.origin;
      const target={x:route[stage].x-origin.x*SECTOR_SIZE,y:route[stage].y-origin.y*SECTOR_SIZE};
      if(length(sub(target,ship.position))<60&&stage<route.length-1){stage++;continue;}
      const delta=sub(target,ship.position),desired=scale(delta,130/Math.max(1,length(delta)));
      let environment={x:0,y:0};for(const b of game.bodies)if(b!==ship&&capabilities(b).gravity)environment=add(environment,fieldAcceleration(ship.position,b.position,bodyGravity(b,ship)));
      const acceleration=sub(limit(scale(sub(desired,ship.velocity),1.2),60),environment),power=length(acceleration),direction=scale(acceleration,1/Math.max(power,1e-9));
      const intents=game.players.map((p,index)=>{const actual=fieldAcceleration(ship.position,p.position,p.field),active=actual.x*direction.x+actual.y*direction.y>length(actual)*0.5&&power>(index?23:6);if(active)usage[index]++;return {targetWorldPosition:add(ship.position,scale(direction,index?-160:135)),abilityActive:active};});
      stepGame(game,createControls(intents[0],intents[1]));
      if(game.universe!.discoveries.some(d=>d.kind==='nebula'))break;
    }
    expect(game.phase,game.message+JSON.stringify({stage,position:game.bodies[0].position,origin:game.universe!.origin,events:game.collisionEvents})).toBe('running');expect(game.universe!.discoveries).toContainEqual({key:known.triple,kind:'triple'});
    expect(game.universe!.discoveries).toContainEqual({key:known.nebula,kind:'nebula'});expect(usage.every(n=>n>0)).toBe(true);expect(game.health!.current).toBe(100);
  },30000);
  it('preserves screen/world transforms, orbital offsets, velocities and chunk identity at huge coordinates',()=>{
    const game=createGame(endlessLevel);game.universe!.origin={x:2**35,y:-(2**35)};
    game.bodies[0].position={x:9000,y:-9000};const camera=createCamera({x:9050,y:-8900});
    const before=worldToScreen(camera,game.bodies[0].position),key=worldChunk(game,game.bodies[0].position),v={...game.bodies[0].velocity};
    const delta=rebaseUniverse(game);camera.position.x+=delta.x;camera.position.y+=delta.y;streamUniverse(game,true);
    expect(worldToScreen(camera,game.bodies[0].position)).toEqual(before);expect(worldChunk(game,game.bodies[0].position)).toEqual(key);
    expect(game.bodies[0].velocity).toEqual(v);expect(screenToWorld(camera,before)).toEqual(game.bodies[0].position);
  });
  it('predicts through rebasing in the original display frame and never changes live state',()=>{
    const game=createGame(endlessLevel);game.bodies[0].position={x:8190,y:0};game.players.forEach(p=>{p.position={x:8190,y:0};});
    const before=structuredClone(game),prediction=predictTrajectory(game);expect(game).toEqual(before);
    expect(prediction.seconds).toBe(3);expect(prediction.points.at(-1)!.x).toBeCloseTo(8460,4);
    for(let i=1;i<prediction.points.length;i++)expect(length(sub(prediction.points[i],prediction.points[i-1]))).toBeLessThan(10);
  });
  it('keeps swept collisions and a mouse world target correct during rebasing',()=>{
    const game=createGame(endlessLevel);game.bodies[0].position={x:8193,y:0};game.players.forEach(p=>{p.position={x:8193,y:-200};});
    togglePause(game);const input={players:[{moveX:0,moveY:0,abilityActive:true,targetWorldPosition:{x:8293,y:-200}},{moveX:0,moveY:0,abilityActive:false}] as const};
    stepGame(game,{players:[input.players[0],input.players[1]]});expect(game.players[0].velocity.x).toBeGreaterThan(0);expect(game.players[0].velocity.y).toBe(0);
    const hazard=game.bodies.find(b=>b.kind==='star')!;game.bodies[0].position={x:hazard.position.x-hazard.radius-9,y:hazard.position.y};game.bodies[0].velocity={x:240,y:0};
    stepGame(game,NO_CONTROLS);expect(game.phase).toBe('failed');
  });
  it('recalls each node independently without touching ship motion, time, or the other node',()=>{
    const game=createGame(endlessLevel),ship=structuredClone(game.bodies[0]),other=structuredClone(game.players[1]);game.players[0].position.x=1e7;
    expect(recallNode(game,0)).toBe(true);expect(game.bodies[0]).toEqual(ship);expect(game.players[1]).toEqual(other);expect(game.elapsed).toBe(0);
    const actions:string[]=[],keyboard=new Keyboard(a=>actions.push(a));for(const code of ['KeyH','KeyJ','KeyK','KeyL']){keyboard.keyDown(code);keyboard.keyDown(code,true);keyboard.keyUp(code);}
    expect(actions).toEqual(['recall-p1','recall-p2','save','load']);
  });
  it.each(['triple','nebula'] as const)('finds the seeded %s sector through ordinary discovery rules',kind=>{
    const registry=developmentRegistry(scenes,`?dev=1&section=${kind}`),game=createGame(registry.endless.level!);
    expect(game.universe!.discoveries.some(d=>d.kind===kind)).toBe(true);
    const key=landmarks(seed)[kind];expect(generateChunk(seed,key).feature).toBe(kind);
    if(kind==='nebula')expect(game.level.decorations!.some(d=>d.color==='#9f61c31c')).toBe(true);
    else {
      const stars=game.bodies.filter(b=>b.chunk&&chunkId(b.chunk)===chunkId(key)&&b.kind==='star');expect(stars).toHaveLength(3);
      const center={x:stars.reduce((sum,b)=>sum+b.position.x,0)/3,y:stars.reduce((sum,b)=>sum+b.position.y,0)/3};
      const before=stars.map(b=>({...b.position}));for(let i=0;i<3600;i++)integrate(stars,[],1/60);
      stars.forEach((b,i)=>{expect(length(sub(before[i],b.position))).toBeGreaterThan(10);expect(Number.isFinite(b.position.x)).toBe(true);expect(b.orbit).toBeUndefined();expect(Math.abs(length(sub(b.position,center))-180)).toBeLessThan(1);});
      const ship=game.bodies[0];ship.position={x:center.x,y:center.y+600};ship.velocity={x:0,y:0};integrate([ship,...stars],[],1/60);expect(length(ship.velocity)).toBeGreaterThan(0);
    }
  });
});
describe('bounded local exploration save',()=>{
  it('roundtrips clock, local frame, bodies, cache, discoveries and paused state',()=>{
    const game=createGame(endlessLevel),storage=memory();togglePause(game);for(let i=0;i<180;i++)stepGame(game,NO_CONTROLS);
    expect(storeExploration(storage,game)).toBe(true);const loaded=loadExploration(storage)!;
    expect(loaded.phase).toBe('paused');expect(loaded.bodies).toEqual(game.bodies);expect(loaded.elapsed).toBe(game.elapsed);expect(loaded.universe!.origin).toEqual(game.universe!.origin);
    const before=structuredClone(loaded.bodies);for(let i=0;i<60;i++)stepGame(loaded,NO_CONTROLS);expect(loaded.bodies).toEqual(before);
    loaded.phase='failed';expect(retryGame(loaded).bodies).toEqual(before);expect(createGame(loaded.level).elapsed).toBe(0);
  });
  it('rejects malformed, oversized and unsupported saves without breaking a game',()=>{
    for(const text of ['bad','null','{}','x'.repeat(2_000_001),JSON.stringify({version:2})])expect(loadExploration({getItem:()=>text,setItem:()=>{}})).toBeUndefined();
    const storage=memory(),game=createGame(endlessLevel);storeExploration(storage,game);const d=JSON.parse(storage.getItem()!);d.bodies[0].position.x=null;storage.setItem('',JSON.stringify(d));expect(loadExploration(storage)).toBeUndefined();
    expect(storeExploration({getItem:()=>null,setItem:()=>{throw Error('quota');}},game)).toBe(false);
  });
});
