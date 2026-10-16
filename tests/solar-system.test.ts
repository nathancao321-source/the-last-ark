import { describe, it, expect } from 'vitest';
import { createGame, stepGame, togglePause, pause, retryGame, saveCheckpoint } from '../src/game/game';
import { solarSystem } from '../src/levels/solar-system';
import { createControls } from '../src/input/intent';
import { bodyGravity } from '../src/physics/gravity';
import { fieldAcceleration } from '../src/physics/fields';
import { length, sub, add, scale, limit } from '../src/physics/vector';
import type { GameState } from '../src/game/types';
import { NO_CONTROLS } from '../src/game/types';
import { positionPlayer } from './helpers';
import { updateStellar } from '../src/game/stellar';
import { integrate } from '../src/physics/world';
import { sampleOrbit } from '../src/physics/orbits';
import { predictTrajectory } from '../src/game/trajectory';
import { updateEncounters } from '../src/world/encounters';
import { starMapPoints } from '../src/render/star-map';
import { developmentRegistry } from '../src/debug/config';
import { scenes } from '../src/scenes/registry';
import { createCamera, followGroup, viewBounds } from '../src/camera/camera';
import { intersects, circleBounds } from '../src/world/geometry';

/** Feedback pilot controls only the two normal player intents, never the ship or planets. */
function pilot(game:GameState, speed=100, clearance=320) {
  const waypoints=[{x:450,y:-clearance},{x:1000,y:-clearance-20},{x:1450,y:-clearance+20},{x:2100,y:-clearance-20},{x:3000,y:-clearance-20},{x:4170,y:-clearance-20},{x:4900,y:0},{x:5480,y:0}];
  const camera=createCamera(game.bodies[0].position);
  let stage=0;
  while(stage<waypoints.length-1 && waypoints[stage].x<game.bodies[0].position.x+80)stage++;
  if(game.phase!=='running')togglePause(game);
  for(let i=0;i<18000&&game.phase==='running';i++) {
    const ship=game.bodies[0],target=waypoints[stage];
    if(length(sub(target,ship.position))<120&&stage<waypoints.length-1)stage++;
    const delta=sub(waypoints[stage],ship.position),desired=scale(delta,speed/Math.max(1,length(delta)));
    let environment={x:0,y:0};
    for(const body of game.bodies)if(body!==ship&&body.emitsGravity!==false)environment=add(environment,fieldAcceleration(ship.position,body.position,bodyGravity(body)));
    const acceleration=sub(limit(scale(sub(desired,ship.velocity),1.2),60),environment);
    const power=length(acceleration),direction=scale(acceleration,1/Math.max(power,1e-9));
    const intents=game.players.map((p,index)=>{
      const aim=add(ship.position,scale(direction,index?-160:135));
      const actual=fieldAcceleration(ship.position,p.position,p.field);
      const aligned=(actual.x*direction.x+actual.y*direction.y)>length(actual)*0.5;
      return {targetWorldPosition:aim,abilityActive:aligned&&power>(index?23:6)};
    });
    stepGame(game,createControls(intents[0],intents[1]));
    followGroup(camera,[game.bodies[0],...game.players],1/60);
    updateEncounters(game,viewBounds(camera));
  }
  return {phase:game.phase,stage,seconds:game.elapsed,position:game.bodies[0].position,hp:game.health?.current,message:game.message,objectives:game.mission.completedObjectives};
}
describe('Solar Exodus physical routes',()=>{
  for(const speed of [90,100,110])it(`flies a real cooperative route from Earth to interstellar space at ${speed}`,()=>{
    const game=createGame(solarSystem);const result=pilot(game,speed);
    expect(result.phase,JSON.stringify(result)).toBe('completed');expect(result.seconds).toBeLessThan(90);
    expect(game.encounters).toContain('belt-approach');expect(game.mission.completedObjectives).toHaveLength(6);
  });
  for(const index of [0,1] as const)it(`can complete after ${index?'exploding':'collapsing'} the sun through real node travel and dwell`,()=>{
    const game=createGame(solarSystem),sun=game.bodies.find(b=>b.id==='sun')!;
    positionPlayer(game,index,sun.position);togglePause(game);
    for(let i=0;i<182;i++)stepGame(game,NO_CONTROLS);
    expect(sun.stellarState?.status).toBe(index?'exploded':'neutron');expect(game.phase).toBe('running');
    const result=pilot(game,100,index?320:520);expect(result.phase,JSON.stringify(result)).toBe('completed');
  });
  it('does not award an unassisted straight flight a free boost or safe bypass',()=>{
    const game=createGame(solarSystem);togglePause(game);for(let i=0;i<2400&&game.phase==='running';i++)stepGame(game,NO_CONTROLS);
    expect(game.phase).toBe('failed');expect(game.mission.completedObjectives).not.toContain('sun-pass');
  });
  for(const section of ['sun','belt','pluto'])it(`offers a completable ${section} development section`,()=>{
    const registry=developmentRegistry(scenes,'?dev=1&section='+section);const result=pilot(createGame(registry.solar_system.level!));
    expect(result.phase,JSON.stringify(result)).toBe('completed');
  });
});

describe('solar bodies, hazards and deterministic checkpoints',()=>{
  it('contains every named planet and keeps background rubble outside physical lists',()=>{
    const game=createGame(solarSystem),names=starMapPoints(game).map(b=>b.appearance?.name);
    for(const name of ['太阳','水星','金星','地球','火星','木星','土星','天王星','海王星','冥王星'])expect(names).toContain(name);
    expect(game.level.decorations).toHaveLength(100);expect(game.bodies.length).toBeLessThan(20);
    expect(game.level.missionBounds).toBeUndefined();
  });
  it('retains analytical orbital baseline and actual player perturbations without planet N-body forces',()=>{
    const game=createGame(solarSystem),earth=game.bodies.find(b=>b.id==='earth')!;
    for(let i=0;i<600;i++)integrate(game.bodies,[],1/60);
    const expected=sampleOrbit(earth.orbit!,10);expect(earth.position.x).toBeCloseTo(expected.position.x,8);expect(earth.position.y).toBeCloseTo(expected.position.y,8);
    game.players[0].position=add(earth.position,{x:100,y:0});game.players[0].active=true;
    for(let i=0;i<60;i++)integrate(game.bodies,game.players,1/60);
    expect(length(earth.stabilizationState!.playerVelocity)).toBeGreaterThan(1);
    game.players[0].active=false;for(let i=0;i<600;i++)integrate(game.bodies,game.players,1/60);
    expect(length(earth.stabilizationState!.playerVelocity)).toBeLessThan(0.2);expect(length(earth.velocity)).toBeGreaterThan(1);
  });
  it('weakly moves the sun but enforces a configured maximum displacement',()=>{
    const game=createGame(solarSystem),sun=game.bodies.find(b=>b.id==='sun')!,initial={...sun.position};
    for(let i=0;i<7200;i++){
      game.players[0].position=add(sun.position,{x:120,y:0});game.players[0].active=true;
      integrate([sun],game.players,1/60);
    }
    expect(length(sub(sun.position,initial))).toBeGreaterThan(10);expect(length(sub(sun.position,initial))).toBeLessThanOrEqual(60.0001);
  });
  it('burns progressively, preserves pause, and restores health and dwell timers at checkpoints',()=>{
    const game=createGame(solarSystem),ship=game.bodies[0],sun=game.bodies.find(b=>b.id==='sun')!;
    ship.position={x:900,y:180};ship.velocity={x:0,y:0};sun.emitsGravity=false;
    saveCheckpoint(game,'heat');togglePause(game);for(let i=0;i<60;i++)stepGame(game,NO_CONTROLS);
    expect(game.health!.current).toBeGreaterThan(0);expect(game.health!.current).toBeLessThan(100);
    pause(game);const hp=game.health!.current;for(let i=0;i<300;i++)stepGame(game,NO_CONTROLS);expect(game.health!.current).toBe(hp);
    const retry=retryGame(game);expect(retry.health!.current).toBe(100);expect(retry.bodies[0].position).toEqual({x:900,y:180});
    togglePause(game);for(let i=0;i<1000&&game.phase==='running';i++)stepGame(game,NO_CONTROLS);
    expect(game.phase).toBe('failed');expect(game.health!.current).toBe(0);
  });
  it('allows unlimited detours and catches swept collision with a tiny fast-moving rock',()=>{
    const game=createGame(solarSystem);game.bodies[0].position={x:-1e6,y:1e6};togglePause(game);
    for(let i=0;i<60;i++)stepGame(game,NO_CONTROLS);expect(game.phase).toBe('running');
    const ship=game.bodies[0],rock=game.bodies.find(b=>b.kind==='asteroid')!;
    game.bodies=[ship,rock];ship.position={x:-100,y:0};ship.velocity={x:240,y:0};rock.position={x:0,y:0};rock.velocity={x:-10,y:0};rock.radius=2;
    stepGame(game,NO_CONTROLS,1);expect(game.phase).toBe('failed');
  });
  it('an explosion affects only the sun and fails the ship inside the configured blast radius',()=>{
    const game=createGame(solarSystem),sun=game.bodies.find(b=>b.id==='sun')!;
    game.players[1].position={...sun.position};game.bodies[0].position={x:900,y:400};
    const other=structuredClone(game.bodies.filter(b=>b!==sun));
    const failure=updateStellar(game,new Map(),3);expect(failure).toContain('爆炸');
    expect(game.bodies.filter(b=>b!==sun)).toEqual(other);expect(sun).toMatchObject({emitsGravity:false,collision:'none',layer:'hidden'});
  });
  it('cancels simultaneous projections and resets interrupted dwell; neutron stars lose heat but retain stronger gravity',()=>{
    const game=createGame(solarSystem),sun=game.bodies.find(b=>b.id==='sun')!,original=bodyGravity(sun).strength;
    game.players.forEach(p=>{p.position={...sun.position};});updateStellar(game,new Map(),4);expect(sun.stellarState!.status).toBe('star');
    game.players[1].position={x:0,y:500};updateStellar(game,new Map(),2);game.players[0].position={x:0,y:0};updateStellar(game,new Map(),1);expect(sun.stellarState!.blueSeconds).toBe(0);
    game.players[0].position={...sun.position};updateStellar(game,new Map(),3);
    expect(sun.stellarState!.status).toBe('neutron');expect(sun.response).toBeGreaterThan(0.18);expect(bodyGravity(sun).strength).toBeGreaterThan(original);
    game.bodies[0].position={x:900,y:100};updateStellar(game,new Map(),10);expect(game.health!.current).toBe(100);
  });
  it('uses one seeded bounded encounter, restores it on retry and predicts without mutating the world',()=>{
    const game=createGame(solarSystem);game.bodies[0].position={x:2200,y:0};
    togglePause(game);const view={minX:1600,maxX:2800,minY:-400,maxY:400};
    const copy=structuredClone(game);updateEncounters(game,view);updateEncounters(copy,view);expect(game.bodies).toEqual(copy.bodies);
    const count=game.bodies.length;for(let i=0;i<100;i++)updateEncounters(game,view);expect(game.bodies).toHaveLength(count);
    saveCheckpoint(game,'belt');const retry=retryGame(game);updateEncounters(retry,view);expect(retry.bodies).toHaveLength(count);
    const before=structuredClone(game);predictTrajectory(game,2);expect(game).toEqual(before);
  });
  it('lets sustained fields move an orbiting planet arbitrarily beyond its old 140-unit leash',()=>{
    const game=createGame(solarSystem),earth=game.bodies.find(b=>b.id==='earth')!;
    for(let i=0;i<7200;i++) {
      game.players[0].position=add(earth.position,{x:100,y:0});game.players[0].active=true;
      integrate([earth],game.players,1/60);
    }
    expect(earth.orbit?.maxDrift).toBeUndefined();
    const displaced=length(sub(earth.position,sampleOrbit(earth.orbit!,earth.orbitTime!).position));
    expect(displaced).toBeGreaterThan(5000);
    game.players[0].active=false;for(let i=0;i<1200;i++)integrate([earth],game.players,1/60);
    expect(length(sub(earth.position,sampleOrbit(earth.orbit!,earth.orbitTime!).position))).toBeGreaterThan(displaced);
    expect(length(earth.stabilizationState!.playerVelocity)).toBeLessThan(0.5);
  });
  it('keeps only interstellar transfer as the final goal beyond Pluto',()=>{
    const pluto=solarSystem.bodies.find(b=>b.id==='pluto')!,gate=solarSystem.bodies.find(b=>b.id==='interstellar')!;
    expect(solarSystem.bodies.filter(b=>b.kind==='wormhole').map(b=>b.id)).toEqual(['interstellar']);
    expect(solarSystem.mission!.objectives.at(-1)!.requires).toEqual(['outer-pass']);
    expect(JSON.stringify(solarSystem)).not.toContain('pluto-gate');
    expect(JSON.stringify(solarSystem)).not.toContain('pluto-exit');
    expect(gate.position.x-gate.radius-(pluto.orbit!.center.x+pluto.orbit!.radius+pluto.radius)).toBeGreaterThan(200);
  });
  it('keeps unforced Mercury at constant solar distance for ten minutes, including more than two orbits',()=>{
    const game=createGame(solarSystem),mercury=game.bodies.find(b=>b.id==='mercury')!,sun=game.bodies.find(b=>b.id==='sun')!;
    const radius=length(sub(mercury.position,sun.position));let maxError=0;
    for(let i=0;i<36000;i++) {
      integrate([mercury,sun],game.players,1/60);
      maxError=Math.max(maxError,Math.abs(length(sub(mercury.position,sun.position))-radius));
    }
    expect(maxError).toBeLessThan(1e-6);
    expect(mercury.receivesGravity).toBe(false);
    expect(mercury.orbitTime).toBeCloseTo(600,5);
  });
  it('makes Jupiter and the Sun much harder to move without freezing them or limiting Jupiter displacement',()=>{
    const perturb=(id:string)=>{
      const game=createGame(solarSystem),body=game.bodies.find(b=>b.id===id)!;
      const initial={...body.position};
      for(let i=0;i<600;i++) {
        game.players[0].position=add(body.position,{x:120,y:0});game.players[0].active=true;
        integrate([body],game.players,1/60);
      }
      const base=body.orbit?sampleOrbit(body.orbit,body.orbitTime!).position:initial;
      return {distance:length(sub(body.position,base)),body};
    };
    const earth=perturb('earth'),jupiter=perturb('jupiter'),sun=perturb('sun');
    expect(jupiter.distance).toBeGreaterThan(1);
    expect(jupiter.distance).toBeLessThan(earth.distance/8);
    expect(sun.distance).toBeGreaterThan(0.1);
    expect(sun.distance).toBeLessThan(jupiter.distance/5);
    expect(jupiter.body.displacementLimit).toBeUndefined();expect(jupiter.body.orbit!.maxDrift).toBeUndefined();
  });
  it('burns beyond the old boundary and depletes a stationary ship near the core within two seconds',()=>{
    const game=createGame(solarSystem),sun=game.bodies.find(b=>b.id==='sun')!,ship=game.bodies[0];
    ship.position=add(sun.position,{x:0,y:300});
    updateStellar(game,new Map(),1);expect(game.health!.current).toBeLessThan(90);
    game.health!.current=100;ship.position=add(sun.position,{x:0,y:180});
    expect(updateStellar(game,new Map(),2)).toContain('灼烧');expect(game.health!.current).toBe(0);
    game.health!.current=100;ship.position=add(sun.position,{x:0,y:350});
    updateStellar(game,new Map(),2);expect(game.health!.current).toBe(100);
  });
  it.each([600,6000,600000])('spawns the whole asteroid outside even a %s-unit-wide viewport and aims it inward',width=>{
    const game=createGame(solarSystem);game.bodies[0].position={x:2200,y:0};togglePause(game);
    const view={minX:2200-width/2,maxX:2200+width/2,minY:-width/3,maxY:width/3};
    updateEncounters(game,view);
    for(const rock of game.bodies.filter(b=>b.id.startsWith('belt-approach-'))) {
      expect(intersects(view,circleBounds(rock.position,rock.radius))).toBe(false);
      const toward=sub(game.bodies[0].position,rock.position);
      expect(toward.x*rock.velocity.x+toward.y*rock.velocity.y).toBeGreaterThan(0);
    }
    expect(game.encounters).toHaveLength(1);
  });
  it('restarts deterministically and supplies independent earth/sun/belt/pluto development sections',()=>{
    const a=createGame(solarSystem),b=createGame(solarSystem);togglePause(a);togglePause(b);
    for(let i=0;i<120;i++){stepGame(a,NO_CONTROLS);stepGame(b,NO_CONTROLS);}expect(a).toEqual(b);
    for(const section of ['earth','sun','belt','pluto']){
      const registry=developmentRegistry(scenes,'?dev=1&section='+section);const game=createGame(registry.solar_system.level!);
      expect(game.phase).toBe('ready');expect(game.health!.current).toBe(100);
    }
    expect(solarSystem.bodies[0].position).toEqual({x:-180,y:0});
  });
});
